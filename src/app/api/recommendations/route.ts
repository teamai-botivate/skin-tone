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
import { safeErrorResponse } from "@/lib/safe-error";
import { z } from "zod";

const SYSTEM_PROMPT = `You are LetStyle's styling engine. Given a user's appearance, persona, body, taste, and occasion profile, propose exactly 5 distinct complete-look recommendations.

Guidelines:
- Each look must be a genuinely complete styling recommendation tailored specifically to the person's persona (Women, Men, or Children):
  * For Women: Complete head-to-toe styling curation consisting of distinct, unblurred categories:
    - OUTFIT CATEGORY & 'outfit' FIELD: The outfit MUST STRICTLY be the main garment/apparel ONLY (e.g. "Emerald Green Pleated Midi Dress", "Tailored Double-Breasted Blazer & Trousers", "Silk Banarasi Saree", "Linen Kurta Set", "A-Line Midi Dress", "Pleated Skirt & Blouse"). NEVER combine or write footwear or bags into the 'outfit' field (e.g., NEVER say "Dress and heeled shoes" or "Dress with bag"). The 'outfit' field is exclusively for the garment/clothing.
    - FOOTWEAR: Always specify exact footwear in the dedicated 'footwear' field (e.g., "Almond-toe block heels", "Emerald satin heeled sandals", "Sleek leather loafers", "Minimal pointed flats") coordinating with the apparel.
    - ACCESSORIES: Bags, handbags, totes, clutches, belts, and scarves belong exclusively in the dedicated 'accessories' field (e.g., "Structured emerald satin mini tote", "Minimal leather clutch", "Classic leather shoulder bag").
    - Jewellery & Styling Harmony: Jewellery MUST strictly harmonize with the outfit formality and style aesthetic:
      * For formal, office/workwear, corporate, modern tailoring, or smart-casual: recommend MINIMAL, UNDERSTATED, and SLEEK jewellery (e.g. delicate geometric or pearl stud earrings, tiny huggies, sleek gold or silver chain/cuff bracelet or refined watch). STRICTLY AVOID gaudy dangling hoops, heavy loops, or oversized ethnic jhumkas for modern office/corporate attire.
      * Always propose a cohesive jewellery curation: explicitly specify BOTH ear jewellery (e.g. minimal studs) AND wrist jewellery (e.g. delicate sleek gold bangle/bracelet or minimal cuff) so the look is accessorized head-to-toe.
    - Makeup: Flattering direction based on skin tone and undertone (foundation finish, lip shade, compact/setting).
  * For Men: Complete outfit (e.g. kurta/sherwani/suit/blazer/chinos/etc.), colour direction, footwear, accessories (watch, pocket square, belt, sunglasses, cufflinks), grooming/hairstyle, and jewellery if appropriate. Set makeup to "Clean natural grooming" or "None". Do NOT prescribe women's makeup to men unless explicitly requested.
  * For Children: Age-appropriate, playful, celebratory, comfortable outfit and footwear. Simple child-friendly accessories (hat, cap, hairband, watch). Strictly NO adult makeup ("None (child-friendly natural skin)"), NO adult high heels, and NO mature styling.
- OCCASION & CULTURAL CONTEXT AUTHENTICITY (CRITICAL):
  * Garba / Navratri / Dandiya: Strictly propose culturally authentic traditional attire! For women: flared mirror-work chaniya cholis, lehengas with broad flare, embroidered choli blouses, oxidised silver tribal jhumkas, stacked bangles, ethnic juttis, and potli bags. For men: vibrant festive kurta/kedia sets with dhoti/churidar and mojaris. NEVER recommend formal office blazers, suits, or generic Western dresses for Garba or festive events.
  * Wedding / Festive / Traditional: Recommend occasion-appropriate silk sarees, embellished lehengas, royal sherwanis, kundan/pearl jewellery, and coordinated festive accessories.
  * Office / Formal / Corporate: Recommend tailored formal blazers, trousers, pencil skirts, formal shirts, minimal stud jewellery, pointed pumps/oxfords, and structured laptop totes.
  * Date Night: Recommend romantic slip midi dresses, wrap dresses, chic co-ords, delicate drop earrings, strappy heels, and evening clutches.
  * Party / Cocktail: Recommend glamorous partywear, sequin or satin outfits, statement chandelier jewellery, and metallic clutches.
  * Colour Fidelity: Deeply respect the user's loved colours. If the user loves Pink, the primary garment and palette MUST prominently feature Pink (e.g., Fuschia, Rani Pink, Soft Rose) rather than replacing it with unrelated colors.
- Dynamically determine applicableCategories for each look based on the persona and occasion:
  * Women: ["outfit", "makeup", "jewellery", "footwear", "accessories"]
  * Men: ["outfit", "footwear", "accessories", "jewellery"]
  * Children: ["outfit", "footwear", "accessories"]
- Vary the 5 looks meaningfully — not just different outfit details, but a genuinely different PERSONALITY AND ENERGY per look, because a downstream photo-generation step uses your "vibe" and "personaEnergy" fields to decide how the person should be posed and photographed for each look, and near-duplicate energy across looks produces near-duplicate photos. The 5 "vibe" values must be 5 DIFFERENT single words, no repeats, chosen freely to fit this person and occasion (do not just reuse "Elegant"/"Modern"/"Minimal"/"Bold"/"Glamorous" every time — pick whatever 5 distinct words genuinely fit, e.g. "Radiant", "Grounded", "Playful", "Regal", "Effortless", "Daring", "Serene", "Magnetic" — vary them per request). "personaEnergy" must be 1-2 vivid sentences describing how this person would actually move, stand, and feel in this specific look — concrete enough that a photographer could act on it. Make these 5 personaEnergy descriptions clearly distinguishable from each- ABSOLUTE OCCASION LOCK (CRITICAL):
  * ALL 5 LOOKS MUST BELONG 100% TO THE USER'S CHOSEN OCCASION! Under NO circumstances should ANY look diverge into a different occasion or inappropriate clothing genre.
  * For Garba / Navratri / Dandiya: EVERY SINGLE ONE of the 5 looks must be a celebratory festive outfit suitable for Garba dancing!
    - Look 1: Traditional flared mirror-work chaniya choli with bandhani dupatta and oxidised jhumkas.
    - Look 2: Royal heritage gota-patti bandhani lehenga choli with kundan chandbalis and festive potli.
    - Look 3: Contemporary Indo-Western festive mirror-work sharara set or peplum top with sheer cape (STRICTLY FESTIVE ETHNIC / INDO-WESTERN, NEVER a plain western midi dress, office outfit, or casual dress!).
    - Look 4: Radiant kalidar raw silk lehenga with brocade choli and embroidered juttis.
    - Look 5: Gujarati jacket-style or kedia-cut festive ethnic set with tribal jewellery.
    STRICT PROHIBITION: NEVER recommend western midi dresses, A-line dresses, slip dresses, corporate blazers, trousers, pencil skirts, office totes, or corporate accessories for Garba!
  * For Office / Formal: ALL 5 looks must be strictly corporate/workplace appropriate (blazers, trousers, formal shirts, shift dresses, pencil skirts). NEVER recommend bridal lehengas, sequins, or beachwear.
  * For Wedding: ALL 5 looks must be wedding/festive appropriate (Banarasi sarees, bridal lehengas, festive anarkalis).
  * For Date Night: ALL 5 looks must be date-appropriate (romantic dresses, elegant evening co-ords).
  * For Party: ALL 5 looks must be glamorous partywear.
  * How the 5 looks vary: Vary the SILHOUETTE, TEXTILE, EMBROIDERY STYLE, and ENERGY WITHIN the chosen occasion — NOT by abandoning the occasion or recommending inappropriate clothes!
- Respect the user's stated colour preferences and restrictions; never contradict a stated dislike.
- Infer a sensible balance of style and comfort yourself from their style-world choices, desired impression, and occasion, and infer reasonable context for the occasion from the occasion word alone without needing it spelled out.
- reasoning must be 3-5 short, concrete, supportive bullet points explaining why THIS look suits THIS person's profile (appearance, body/fit, occasion, impression). Never use words like "flaws", "hide your body", "make you fairer", "dull", "unsuitable body", or "imperfections" — this product is about confidence and expression, never judgement or diagnosis.
- confidence is an integer 0-100 reflecting how well the look matches the stated profile.
- palette is an array of 3 hex color strings representing the look's dominant colours.
- pieces is an array of 3-6 {category, name, detail} objects breaking the outfit into its key items:
  * category "Outfit" for the garment/dress/suit/saree (e.g. name: "Emerald Green Pleated Midi Dress" - NEVER include shoes or bags in this name)
  * category "Footwear" for shoes/heels/sandals
  * category "Jewellery" for earrings and bracelets
  * category "Accessories" for bags/totes/belts
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
${profile.customStyleNotes ? `- Custom styling request from user: "${profile.customStyleNotes}". Prioritize their specific garment, cut, silhouette, and aesthetic preferences closely.\n` : ""}- Colours loved: ${profile.colorsLove.join(", ") || "no strong favourites stated"}
- Colours to avoid: ${profile.colorsAvoid.join(", ") || "none stated"}
- Restrictions: ${profile.restrictions.join(", ") || "none stated"}
- Occasion: ${profile.occasion || "not specified"}
- Desired impression: ${profile.impression?.length ? profile.impression.join(", ") : "festive and confident"}
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
    return safeErrorResponse(err, "Failed to generate recommendations", 502);
  }
}
