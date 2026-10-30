import type OpenAI from "openai";
import { z } from "zod";
import {
  LookRecommendationSchema,
  type LookRecommendation,
  type SkinTuneProfile,
} from "@/lib/skintune-schemas";
import { RECOMMENDATION_MODEL } from "@/lib/openai-client";
import { logger } from "@/lib/logger";
import { getStylingContext } from "@/lib/styling-context";

// Prompt construction and generation for /api/recommendations. Kept outside the route file so
// it can be unit-tested (Next.js route modules may only export HTTP handlers).
//
// Nothing here maps occasions, themes or keywords to garments. The model interprets the whole
// profile (including the user's free-text request) into a style brief, generates looks from that
// brief, and a second model pass reviews the looks against the user's inputs.

export const SYSTEM_PROMPT = `You are LetStyle's styling engine. Given a user's appearance, persona, body, taste, occasion and their own free-text styling request, propose exactly 5 distinct complete-look recommendations.

STEP 1 — INTERPRET THE REQUEST (fill "styleBrief" before writing any look):
- Read the user's own styling request word by word. It is the most specific and most recent input: any occasion, theme, aesthetic, garment preference, fabric or comfort need, cultural preference, or exclusion stated there is a REQUIREMENT.
- Selected options (occasion, style worlds, impression) may be outdated leftovers from an earlier session. Use them where they are consistent with the request; where they conflict, the user's own request wins. Record each conflict and how you resolved it in "resolvedConflicts".
- Decide the effective occasion and the theme/aesthetic from everything the user provided. Never assume an occasion or theme the user did not express.
- Decide the style direction (traditional, western, fusion, mixed, or other) from the user's actual intent and the genuine cultural context of the effective occasion. Do not default to any tradition the user's intent does not support, and do not exclude one the user asked for or that the occasion genuinely calls for. Explain the choice in "styleDirectionReasoning".
- List in "mustInclude" and "mustAvoid" ONLY requirements and exclusions the user actually expressed (in their request, colours, restrictions, or non-conflicting selections) — e.g. a stated theme, fabric, comfort need, garment, colour, or exclusion. Never list your own styling ideas or specific garment choices there; those belong in the looks, where they can vary.

STEP 2 — GENERATE 5 LOOKS THAT FOLLOW THE BRIEF:
- Every look must satisfy every "mustInclude" item and none of the "mustAvoid" items, and genuinely express the brief's theme and style direction in its garments (silhouette, fabric, print, detailing) — not just in its title.
- Choose garments using your own fashion and cultural knowledge for this exact person, occasion and theme. Be culturally authentic whenever the brief's style direction is traditional or fusion.
- Vary the 5 looks within the brief (silhouette, textile, detailing, energy) — never by abandoning the brief.

AUDIENCE & DEMOGRAPHIC INTEGRITY (always applies):
- Dress the person strictly for the stated audience, gender and age group.
  * Children: age-appropriate kidswear only. Strictly NO adult or mature styling (no deep necks, adult formal tailoring, high heels, lingerie-style pieces), and NO cosmetics: makeup must be "None (child-friendly natural skin)".
  * Boys: boys' clothing only — never girls' or women's garments, skirts, dresses, cholis, lehengas, heels, or girls' hair accessories.
  * Girls: girls' clothing only — never boys' or men's garments.
  * Unisex children: comfortable, age-appropriate clothing without gender assumptions.
  * Men: set makeup to "Clean natural grooming" or "None" unless explicitly requested otherwise.
    - NEVER recommend potli bags, clutches, minaudières, or women's purses for men.
    - NEVER put a belt over a kurta, sherwani, or other traditional tunic (belts only go through belt loops of western bottoms).
    - Men's jewellery stays minimal and masculine (watch, kada/bracelet, signet ring, brooch); NEVER women's jewellery (no temple necklaces, dangling pendants, chokers, jhumkas, earrings, maang tikkas, anklets).
  * Women: complete head-to-toe curation; when jewellery is included, specify both ear and wrist jewellery that harmonise with the outfit's formality (minimal and sleek for formal looks).

FIELD RULES:
- 'outfit' contains ONLY the clothing garments (never footwear or bags), and must name EVERY clothing garment listed in pieces (e.g. both the top AND the bottom of a two-piece) — it drives the photo render.
- 'footwear' and 'accessories' (bags, belts, scarves, hats) belong in their own fields.
- INTERNAL CONSISTENCY: title, note, outfit, outfitColor and pieces must all describe the SAME outfit. Never name a garment in the title, note or pieces that is not in 'outfit'.
- Respect loved colours prominently and never use a colour the user avoids.
- applicableCategories: women ["outfit", "makeup", "jewellery", "footwear", "accessories"]; men ["outfit", "footwear", "accessories", "jewellery"]; children ["outfit", "footwear", "accessories"].
- The 5 "vibe" values must be 5 DIFFERENT single words; "personaEnergy" is 1-2 vivid sentences on how this person moves and feels in this specific look (a photo step uses these, so make them genuinely different).
- reasoning: 3-5 short, concrete, supportive bullet points explaining why THIS look suits THIS person and their request. Never use words like "flaws", "hide your body", "make you fairer", "dull", "unsuitable body", or "imperfections".
- confidence: integer 0-100 for how well the look matches the profile and request. palette: 3 hex colours.
- pieces: 3-6 {category, name, detail} objects. Clothing uses "Top", "Bottom", "Layer", or "Outfit" (one-piece garments); then "Footwear", "Jewellery", "Accessories".
- Output must be valid JSON matching the schema exactly, with look ids "look-01".."look-05".`;

/**
 * Presents the profile neutrally: the user's own request verbatim and first, selected options as
 * possibly-stale context. No occasion- or keyword-triggered garment directives are injected.
 */
export function buildUserPrompt(profile: SkinTuneProfile): string {
  const ctx = getStylingContext(profile);
  const audienceLabel = ctx.isBoy
    ? "Boy (child)"
    : ctx.isGirl
      ? "Girl (child)"
      : ctx.isKids
        ? "Child (unspecified gender)"
        : ctx.isMan
          ? "Adult man"
          : ctx.isWoman
            ? "Adult woman"
            : "Unspecified";
  const notes = (profile.customStyleNotes || "").trim();
  const list = (v: string[] | undefined, empty: string) => (v?.length ? v.join(", ") : empty);

  return `USER'S OWN STYLING REQUEST (verbatim — highest priority; every stated occasion, theme, garment, fabric or comfort need, and exclusion is a requirement):
${notes ? `"${notes}"` : "(none provided — rely on the selected options below)"}

WHO IS BEING STYLED (must be preserved in every look):
- Audience: ${ctx.audience.toUpperCase()} — ${audienceLabel}
- Age group: ${profile.ageGroup || (ctx.isKids ? "Child" : "Adult")}
- Appearance: skin tone ${profile.appearance.skinTone || "unspecified"}, ${profile.appearance.undertone || "unspecified"} undertone, contrast ${profile.appearance.contrast || "unspecified"}
- Body build: ${profile.bodyBuild || "not specified"}
- Fit preference: ${profile.fit || "no strong preference"}

SELECTED OPTIONS (may be left over from an earlier session; use where consistent with the request above):
- Occasion: ${profile.occasion || "not specified"}
- Style worlds: ${list(profile.style, "open to suggestion")}
- Desired impression: ${list(profile.impression, "not specified")}

PREFERENCES & LIMITS:
- Colours loved: ${list(profile.colorsLove, "no strong favourites stated")}
- Colours to avoid: ${list(profile.colorsAvoid, "none stated")}
- Restrictions: ${list(profile.restrictions, "none stated")}
- Budget: ${profile.budget || "not specified"}

Fill "styleBrief" first by interpreting all of the above, then return exactly 5 complete-look recommendations that follow it, as JSON.`;
}

const StyleBriefSchema = z.object({
  effectiveOccasion: z.string(),
  occasionReasoning: z.string(),
  themeOrAesthetic: z.string(),
  styleDirection: z.enum(["traditional", "western", "fusion", "mixed", "other"]),
  styleDirectionReasoning: z.string(),
  mustInclude: z.array(z.string()),
  mustAvoid: z.array(z.string()),
  resolvedConflicts: z.array(z.string()),
});
export type StyleBrief = z.infer<typeof StyleBriefSchema>;

const ModelOutputSchema = z.object({
  styleBrief: StyleBriefSchema,
  recommendations: z.array(LookRecommendationSchema.omit({ imageUrl: true })).length(5),
});

const STYLE_BRIEF_JSON_SCHEMA = {
  type: "object",
  properties: {
    effectiveOccasion: { type: "string" },
    occasionReasoning: { type: "string" },
    themeOrAesthetic: { type: "string" },
    styleDirection: { type: "string", enum: ["traditional", "western", "fusion", "mixed", "other"] },
    styleDirectionReasoning: { type: "string" },
    mustInclude: { type: "array", items: { type: "string" } },
    mustAvoid: { type: "array", items: { type: "string" } },
    resolvedConflicts: { type: "array", items: { type: "string" } },
  },
  required: [
    "effectiveOccasion", "occasionReasoning", "themeOrAesthetic", "styleDirection",
    "styleDirectionReasoning", "mustInclude", "mustAvoid", "resolvedConflicts",
  ],
  additionalProperties: false,
} as const;

const LOOK_PIECE_JSON_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string" },
    name: { type: "string" },
    detail: { type: "string" },
  },
  required: ["category", "name", "detail"],
  additionalProperties: false,
} as const;

const LOOK_JSON_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    note: { type: "string" },
    category: { type: "string" },
    vibe: { type: "string" },
    personaEnergy: { type: "string" },
    palette: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
    pieces: { type: "array", items: LOOK_PIECE_JSON_SCHEMA, minItems: 3, maxItems: 6 },
    outfit: { type: "string" },
    outfitColor: { type: "string" },
    jewellery: { type: "string" },
    hairstyle: { type: "string" },
    makeup: { type: "string" },
    accessories: { type: "string" },
    footwear: { type: "string" },
    reasoning: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
    confidence: { type: "integer" },
    applicableCategories: { type: "array", items: { type: "string" } },
  },
  required: [
    "id", "title", "note", "category", "vibe", "personaEnergy", "palette", "pieces", "outfit",
    "outfitColor", "jewellery", "hairstyle", "makeup", "accessories", "footwear", "reasoning", "confidence",
    "applicableCategories",
  ],
  additionalProperties: false,
} as const;

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    styleBrief: STYLE_BRIEF_JSON_SCHEMA,
    recommendations: { type: "array", items: LOOK_JSON_SCHEMA, minItems: 5, maxItems: 5 },
  },
  required: ["styleBrief", "recommendations"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------------------------
// Review: a second model pass judges the looks against the user's own inputs
// ---------------------------------------------------------------------------------------------

export const REVIEW_SYSTEM_PROMPT = `You are LetStyle's styling quality reviewer. You receive a user's profile (including their own free-text styling request), the style brief a stylist derived from it, and 5 proposed looks. Audit each look against an explicit checklist — be literal and evidence-based, not a matter of taste.

1. Build the checklist ONCE in "requirements": every explicit requirement or exclusion in the user's own request (split compound requests into separate items, e.g. "full sleeves", "ankle length", "no slits"), plus brief mustInclude/mustAvoid items ONLY if they are grounded in something the user actually provided (request, colours, restrictions, non-conflicting selections) — skip items that are merely the stylist's own garment or styling ideas — plus the effective occasion and the style direction. The user's own words outrank the brief; selected options that conflict with the user's request are NOT requirements. Do not invent requirements (no colour-matching or comfort preferences the user did not state).
2. For each look, check EVERY requirement against the garments actually named in the look's outfit and pieces: satisfied = true only if the look clearly meets it; quote the deciding words in "evidence". A different garment than requested (e.g. a length, cut or fabric other than the one specified) is NOT satisfied.
3. audienceAppropriate: every garment suits the stated audience, gender and age group.
4. titleGarmentsInOutfit: every garment named in the title or note also appears in the 'outfit' field.
5. outfitNamesAllClothingPieces: the 'outfit' field names every clothing piece (Top/Bottom/Layer/Outfit categories) listed in pieces.
Output JSON matching the schema.`;

const ReviewSchema = z.object({
  requirements: z.array(z.string()),
  reviews: z.array(
    z.object({
      lookId: z.string(),
      requirementChecks: z.array(z.object({ requirement: z.string(), satisfied: z.boolean(), evidence: z.string() })),
      audienceAppropriate: z.boolean(),
      titleGarmentsInOutfit: z.boolean(),
      outfitNamesAllClothingPieces: z.boolean(),
    }),
  ),
});

const REVIEW_JSON_SCHEMA = {
  type: "object",
  properties: {
    requirements: { type: "array", items: { type: "string" } },
    reviews: {
      type: "array",
      items: {
        type: "object",
        properties: {
          lookId: { type: "string" },
          requirementChecks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                requirement: { type: "string" },
                satisfied: { type: "boolean" },
                evidence: { type: "string" },
              },
              required: ["requirement", "satisfied", "evidence"],
              additionalProperties: false,
            },
          },
          audienceAppropriate: { type: "boolean" },
          titleGarmentsInOutfit: { type: "boolean" },
          outfitNamesAllClothingPieces: { type: "boolean" },
        },
        required: ["lookId", "requirementChecks", "audienceAppropriate", "titleGarmentsInOutfit", "outfitNamesAllClothingPieces"],
        additionalProperties: false,
      },
    },
  },
  required: ["requirements", "reviews"],
  additionalProperties: false,
} as const;

export type GeneratedLook = Omit<LookRecommendation, "imageUrl">;

export interface GenerationResult {
  looks: GeneratedLook[];
  styleBrief: StyleBrief;
  /** Issues the reviewer still reported for the returned looks (empty when all checks passed). */
  remainingIssues: string[];
  attempts: number;
}

function summarizeLooksForReview(looks: GeneratedLook[]) {
  return looks.map((l) => ({
    id: l.id,
    title: l.title,
    note: l.note,
    outfit: l.outfit,
    outfitColor: l.outfitColor,
    footwear: l.footwear,
    accessories: l.accessories,
    pieces: l.pieces,
  }));
}

/** Returns the reviewer's concrete issues for the looks (empty = all checks passed). */
export async function reviewLooks(
  openai: OpenAI,
  profile: SkinTuneProfile,
  styleBrief: StyleBrief,
  looks: GeneratedLook[],
): Promise<string[]> {
  const completion = await openai.chat.completions.create({
    model: RECOMMENDATION_MODEL,
    messages: [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      {
        role: "user",
        content: `${buildUserPrompt(profile)}\n\nSTYLE BRIEF:\n${JSON.stringify(styleBrief)}\n\nPROPOSED LOOKS:\n${JSON.stringify(summarizeLooksForReview(looks))}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "skintune_look_review", strict: true, schema: REVIEW_JSON_SCHEMA },
    },
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Reviewer returned no content");
  const { reviews } = ReviewSchema.parse(JSON.parse(raw));
  // Pass/fail is decided from the structured checks only, never from free-form remarks
  return reviews.flatMap((r) => {
    const issues = r.requirementChecks
      .filter((c) => !c.satisfied)
      .map((c) => `${r.lookId}: does not satisfy "${c.requirement}" (${c.evidence})`);
    if (!r.audienceAppropriate) issues.push(`${r.lookId}: contains garments unsuitable for the stated audience, gender or age group`);
    if (!r.titleGarmentsInOutfit) issues.push(`${r.lookId}: title/note names a garment missing from the outfit field`);
    if (!r.outfitNamesAllClothingPieces) issues.push(`${r.lookId}: outfit field does not name every clothing piece`);
    return issues;
  });
}

/**
 * Generates 5 looks (with the model's own interpretation of the request), has them reviewed
 * against the user's inputs, and — if the reviewer reports issues — requests one correction
 * that is reviewed again. The result with fewer issues is returned.
 */
export async function generateLookRecommendations(
  openai: OpenAI,
  profile: SkinTuneProfile,
): Promise<GenerationResult> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(profile) },
  ];

  const requestLooks = async () => {
    const completion = await openai.chat.completions.create({
      model: RECOMMENDATION_MODEL,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: { name: "skintune_recommendations", strict: true, schema: RESPONSE_JSON_SCHEMA },
      },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Model returned no content");
    const parsed = ModelOutputSchema.parse(JSON.parse(raw));
    return { raw, looks: parsed.recommendations, styleBrief: parsed.styleBrief };
  };

  const safeReview = async (brief: StyleBrief, looks: GeneratedLook[]) => {
    try {
      return await reviewLooks(openai, profile, brief, looks);
    } catch (err) {
      logger.warn({ err }, "Look review failed; accepting the generated looks unreviewed");
      return [];
    }
  };

  const first = await requestLooks();
  const firstIssues = await safeReview(first.styleBrief, first.looks);
  if (firstIssues.length === 0) {
    return { looks: first.looks, styleBrief: first.styleBrief, remainingIssues: [], attempts: 1 };
  }

  logger.warn({ issues: firstIssues }, "Reviewer found looks that do not follow the user's request; requesting a correction");
  messages.push(
    { role: "assistant", content: first.raw },
    {
      role: "user",
      content: `A reviewer found these problems with your looks:\n${firstIssues.map((i) => `- ${i}`).join("\n")}\nRe-read the user's own styling request, revise the styleBrief if it misread the request, and regenerate all 5 looks so every look follows it, fits the audience, and is internally consistent. Keep the same JSON schema.`,
    },
  );

  try {
    const second = await requestLooks();
    const secondIssues = await safeReview(second.styleBrief, second.looks);
    if (secondIssues.length) logger.warn({ issues: secondIssues }, "Corrected looks still have reviewer issues");
    return secondIssues.length <= firstIssues.length
      ? { looks: second.looks, styleBrief: second.styleBrief, remainingIssues: secondIssues, attempts: 2 }
      : { looks: first.looks, styleBrief: first.styleBrief, remainingIssues: firstIssues, attempts: 2 };
  } catch (err) {
    logger.warn({ err }, "Correction request failed; using the first generation");
    return { looks: first.looks, styleBrief: first.styleBrief, remainingIssues: firstIssues, attempts: 2 };
  }
}
