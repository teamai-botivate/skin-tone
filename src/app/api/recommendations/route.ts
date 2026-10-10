import { NextResponse } from "next/server";
import {
  RecommendationsRequestSchema,
  RecommendationsResponseSchema,
  LookRecommendationSchema,
  type LookRecommendation,
  type SkinTuneProfile,
} from "@/lib/skintune-schemas";
import { getOpenAIClient, RECOMMENDATION_MODEL } from "@/lib/openai-client";
import { logger } from "@/lib/logger";
import { z } from "zod";

const SYSTEM_PROMPT = `You are SkinTune's styling engine. Given a user's appearance, persona, body, taste, and occasion profile, propose exactly 5 distinct complete-look recommendations.

Guidelines:
- Each look must be a genuinely complete styling recommendation tailored specifically to the person's persona (Women, Men, or Children):
  * For Women: Complete outfit, colour direction, jewellery, hairstyle, makeup, footwear, and accessories. For makeup, provide concrete flattering direction based on their skin tone and undertone (e.g. foundation undertone and finish, lip shade, blush).
  * For Men: Complete outfit (e.g. kurta/sherwani/suit/blazer/chinos/etc.), colour direction, footwear, accessories (watch, pocket square, belt, sunglasses, cufflinks), grooming/hairstyle, and jewellery if appropriate. Set makeup to "Clean natural grooming" or "None". Do NOT prescribe women's makeup to men unless explicitly requested.
  * For Children: Age-appropriate, playful, celebratory, comfortable outfit and footwear. Simple child-friendly accessories (hat, cap, hairband, watch). Strictly NO adult makeup ("None (child-friendly natural skin)"), NO adult high heels, and NO mature styling.
- Dynamically determine applicableCategories for each look based on the persona and occasion:
  * Women: ["outfit", "makeup", "jewellery", "footwear", "accessories"]
  * Men: ["outfit", "footwear", "accessories", "jewellery"]
  * Children: ["outfit", "footwear", "accessories"]
- Vary the 5 looks meaningfully — not just different outfit details, but a genuinely different PERSONALITY AND ENERGY per look, because a downstream photo-generation step uses your "vibe" and "personaEnergy" fields to decide how the person should be posed and photographed for each look, and near-duplicate energy across looks produces near-duplicate photos. The 5 "vibe" values must be 5 DIFFERENT single words, no repeats, chosen freely to fit this person and occasion (do not just reuse "Elegant"/"Modern"/"Minimal"/"Bold"/"Glamorous" every time — pick whatever 5 distinct words genuinely fit, e.g. "Radiant", "Grounded", "Playful", "Regal", "Effortless", "Daring", "Serene", "Magnetic" — vary them per request). "personaEnergy" must be 1-2 vivid sentences describing how this person would actually move, stand, and feel in this specific look — concrete enough that a photographer could act on it. Make these 5 personaEnergy descriptions clearly distinguishable from each other.
- One look should be the closest overall match to their stated preferences; the other 4 should meaningfully diverge from it and from each other in vibe/energy, not just in colour or garment type.
- Respect the user's stated colour preferences and restrictions; never contradict a stated dislike.
- Infer a sensible balance of style and comfort yourself from their style-world choices, desired impression, and occasion, and infer reasonable context for the occasion from the occasion word alone without needing it spelled out.
- reasoning must be 3-5 short, concrete, supportive bullet points explaining why THIS look suits THIS person's profile (appearance, body/fit, occasion, impression). Never use words like "flaws", "hide your body", "make you fairer", "dull", "unsuitable body", or "imperfections" — this product is about confidence and expression, never judgement or diagnosis.
- confidence is an integer 0-100 reflecting how well the look matches the stated profile.
- palette is an array of 3 hex color strings representing the look's dominant colours.
- pieces is an array of 3-5 {category, name, detail} objects breaking the outfit into its key items.
- Output must be valid JSON matching the provided schema exactly, with an "id" like "look-01".."look-05".`;

function buildUserPrompt(profile: SkinTuneProfile): string {
  return `User profile:
- Persona & pronouns: ${profile.pronouns || "not specified"}
- Age group: ${profile.ageGroup || "not specified"}
- Height: ${profile.height || "not specified"}
- Appearance: skin tone ${profile.appearance.skinTone || "unspecified"}, ${profile.appearance.undertone || "unspecified"} undertone, contrast ${profile.appearance.contrast || "unspecified"}
- Body build: ${profile.bodyBuild || "not specified"}
- Fit preference: ${profile.fit || "no strong preference"}
- Style worlds: ${profile.style.join(", ") || "open to suggestion"}
- Colours loved: ${profile.colorsLove.join(", ") || "no strong favourites stated"}
- Colours to avoid: ${profile.colorsAvoid.join(", ") || "none stated"}
- Restrictions: ${profile.restrictions.join(", ") || "none stated"}
- Occasion: ${profile.occasion || "not specified"}
- Desired impression: ${profile.impression.join(", ") || "not specified"}
- Budget: ${profile.budget || "not specified"}

Return exactly 5 complete-look recommendations as JSON.`;
}

const ModelOutputSchema = z.object({
  recommendations: z.array(LookRecommendationSchema.omit({ imageUrl: true })).length(5),
});

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
    pieces: { type: "array", items: LOOK_PIECE_JSON_SCHEMA, minItems: 3, maxItems: 5 },
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
    recommendations: { type: "array", items: LOOK_JSON_SCHEMA, minItems: 5, maxItems: 5 },
  },
  required: ["recommendations"],
  additionalProperties: false,
} as const;

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parsed = RecommendationsRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: RECOMMENDATION_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(parsed.data.profile) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "skintune_recommendations",
          strict: true,
          schema: RESPONSE_JSON_SCHEMA,
        },
      },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Model returned no content");

    const modelResult = ModelOutputSchema.parse(JSON.parse(raw));
    const recommendations: LookRecommendation[] = modelResult.recommendations.map((look) => ({
      ...look,
      imageUrl: "/replace-with-generated/pending.webp",
    }));

    const data = RecommendationsResponseSchema.parse({ recommendations });
    return NextResponse.json(data);
  } catch (err) {
    logger.error({ err }, "Failed to generate recommendations");
    console.error("recommendations route error detail:", err);
    return NextResponse.json(
      {
        error: "Failed to generate recommendations",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
