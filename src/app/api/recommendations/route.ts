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

import { getStylingContext } from "@/lib/styling-context";

const SYSTEM_PROMPT = `You are LetStyle's styling engine. Given a user's appearance, persona, body, taste, and occasion profile, propose exactly 5 distinct complete-look recommendations.

Guidelines:
- Each look must be a genuinely complete styling recommendation tailored specifically to the person's audience and gender:
  * For Children (Kids):
    - For Boys (Children): Propose authentic, age-appropriate BOYS kidswear ONLY!
      * Apparel: T-shirts, collared shirts, polo tees, denim jeans, chinos, joggers, shorts, hoodies, jackets. For festive/cultural events (Garba, weddings, festivals): Boys' vibrant kurta-pyjama or kurta-dhoti sets, embroidered Nehru jackets, bandhgalas, or traditional kedia sets.
      * Footwear: Boys' sneakers, loafers, sandals, ethnic mojaris.
      * Accessories: Simple child-friendly accessories (cap, hat, watch, belt).
      * STRICT PROHIBITION: NEVER recommend adult women's clothes, kurtis, sarees, lehengas, cholis, skirts, dresses, heels, women's makeup, or girls' hair accessories for a boy!
    - For Girls (Children): Propose age-appropriate GIRLS kidswear ONLY!
      * Apparel: Playful dresses, frocks, skirts, tops, flared chaniya cholis, lehenga choli sets, anarkalis.
      * Footwear: Cushioned flats, Mary Janes, sandals, ethnic juttis.
      * STRICT PROHIBITION: Strictly NO adult women's mature styling, corporate blazers, deep necks, high heels, or adult makeup.
    - For Children (Unspecified / Unisex): Propose comfortable, age-appropriate children's clothing without gender assumptions (tees, joggers, jackets, sneakers, festive kids outfits).
    - Child Grooming & Makeup: Strictly NO adult cosmetics ("None (child-friendly natural skin)") and NO mature styling.
  * For Women: Complete head-to-toe styling curation consisting of distinct, unblurred categories:
    - OUTFIT CATEGORY & 'outfit' FIELD: The outfit MUST STRICTLY be the main garment/apparel ONLY (e.g. "Emerald Green Pleated Midi Dress", "Tailored Double-Breasted Blazer & Trousers", "Silk Banarasi Saree", "Linen Kurta Set", "A-Line Midi Dress", "Pleated Skirt & Blouse"). NEVER combine or write footwear or bags into the 'outfit' field (e.g., NEVER say "Dress and heeled shoes" or "Dress with bag"). The 'outfit' field is exclusively for the garment/clothing.
    - FOOTWEAR: Always specify exact footwear in the dedicated 'footwear' field (e.g., "Almond-toe block heels", "Emerald satin heeled sandals", "Sleek leather loafers", "Minimal pointed flats") coordinating with the apparel.
    - ACCESSORIES: Bags, handbags, totes, clutches, belts, and scarves belong exclusively in the dedicated 'accessories' field (e.g., "Structured emerald satin mini tote", "Minimal leather clutch", "Classic leather shoulder bag").
    - Jewellery & Styling Harmony: Jewellery MUST strictly harmonize with the outfit formality and style aesthetic:
      * For formal, office/workwear, corporate, modern tailoring, or smart-casual: recommend MINIMAL, UNDERSTATED, and SLEEK jewellery (e.g. delicate geometric or pearl stud earrings, tiny huggies, sleek gold or silver chain/cuff bracelet or refined watch). STRICTLY AVOID gaudy dangling hoops, heavy loops, or oversized ethnic jhumkas for modern office/corporate attire.
      * Always propose a cohesive jewellery curation: explicitly specify BOTH ear jewellery (e.g. minimal studs) AND wrist jewellery (e.g. delicate sleek gold bangle/bracelet or minimal cuff) so the look is accessorized head-to-toe.
    - Makeup: Flattering direction based on skin tone and undertone (foundation finish, lip shade, compact/setting).
  * For Men: Complete outfit (e.g. kurta/sherwani/suit/blazer/chinos/etc.), colour direction, footwear, accessories (watch, pocket square, belt, sunglasses, cufflinks), grooming/hairstyle, and jewellery if appropriate. Set makeup to "Clean natural grooming" or "None". Do NOT prescribe women's makeup to men unless explicitly requested.
- OCCASION & CULTURAL CONTEXT AUTHENTICITY (CRITICAL):
  * Garba / Navratri / Dandiya: Strictly propose culturally authentic traditional attire!
    - For Women & Girls: Flared mirror-work chaniya cholis, lehengas with broad flare, embroidered choli blouses, oxidised silver tribal jhumkas, stacked bangles, ethnic juttis, and potli bags.
    - For Men & Boys: Vibrant festive kurta sets with dhoti/churidar/pyjama, embroidered Nehru jackets or traditional kedia sets, and cushioned ethnic mojaris.
    - STRICT PROHIBITION: NEVER recommend adult women's dresses, skirts, lehengas, or kurtis for boys or men! NEVER recommend formal office blazers, suits, or generic Western dresses for Garba or festive events.
  * Vacation / Resort / Beach / Holiday / Casual: Strictly propose breezy, comfortable vacation/resort wear tailored to the demographic and occasion!
    - For Boys / Kids: Breathable linen or cotton short-sleeve button-down shirts, camp collar / Cuban printed shirts, lightweight tees, relaxed chino shorts, drawstring linen shorts, breezy resort co-ord sets, slip-on canvas sneakers or cushioned sandals, sun hats or caps.
    - For Men: Breezy linen shirts, polo shirts, resort shorts, lightweight chinos, loafers, boat shoes, or sandals.
    - For Women: Breezy sundresses, linen co-ord sets, flowy resort wear, chic flat sandals or espadrilles.
    - STRICT PROHIBITION: NEVER recommend heavy traditional ethnic wear (such as kurta-pajama, sherwani, dhoti, sarees, or heavy lehengas) or formal suiting/blazers for a beach/resort/vacation setting unless the user explicitly requests ethnic resortwear in their prompt!
  * Wedding / Festive / Traditional: Recommend occasion-appropriate silk sarees or lehengas for women/girls, and royal sherwanis or kurta sets for men/boys.
  * Office / Formal / Corporate: Recommend tailored formal blazers, trousers, pencil skirts, formal shirts, minimal stud jewellery, pointed pumps/oxfords, and structured laptop totes.
  * Date Night: Recommend romantic slip midi dresses, wrap dresses, chic co-ords, delicate drop earrings, strappy heels, and evening clutches.
  * Party / Cocktail: Recommend glamorous partywear, sequin or satin outfits, statement chandelier jewellery, and metallic clutches.
  * Colour Fidelity: Deeply respect the user's loved colours. If the user loves Pink, the primary garment and palette MUST prominently feature Pink (e.g., Fuschia, Rani Pink, Soft Rose) rather than replacing it with unrelated colors.
- Dynamically determine applicableCategories for each look based on the persona and occasion:
  * Women: ["outfit", "makeup", "jewellery", "footwear", "accessories"]
  * Men: ["outfit", "footwear", "accessories", "jewellery"]
  * Children: ["outfit", "footwear", "accessories"]
- Vary the 5 looks meaningfully — not just different outfit details, but a genuinely different PERSONALITY AND ENERGY per look, because a downstream photo-generation step uses your "vibe" and "personaEnergy" fields to decide how the person should be posed and photographed for each look, and near-duplicate energy across looks produces near-duplicate photos. The 5 "vibe" values must be 5 DIFFERENT single words, no repeats, chosen freely to fit this person and occasion. "personaEnergy" must be 1-2 vivid sentences describing how this person would actually move, stand, and feel in this specific look.
- ABSOLUTE OCCASION LOCK (CRITICAL):
  * ALL 5 LOOKS MUST BELONG 100% TO THE USER'S CHOSEN OCCASION! Under NO circumstances should ANY look diverge into a different occasion or inappropriate clothing genre.
  * For Vacation / Beach / Resort / Casual / Holiday: ALL 5 looks must be authentic casual resort/vacation appropriate (e.g. linen/cotton shirts, shorts, breathable tees, resort co-ords). Under NO circumstances should traditional festive kurta-pajamas, dhotis, heavy sherwanis, or formal blazers be recommended!
  * OCCASION PRIMACY & INPUT PRECEDENCE: When the user specifies an occasion (e.g. Vacation, Beach, Resort, Casual, Everyday), the OCCASION and CUSTOM STYLING REQUEST MUST OVERRIDE any conflicting or residual style tags (such as "Traditional" or "Festive" left over from a previous festive session). Do NOT generate traditional Indian ethnic clothing (kurta-pajama, sarees, lehengas) for non-festive/casual/resort occasions unless the user explicitly asks for traditional/ethnic clothing in their custom styling notes!
  * For Garba / Navratri / Dandiya:
    - For Boys: ALL 5 looks must be authentic Boys festive Indian outfits (Look 1: Boys embroidered festive kurta-dhoti set with mirror-work Nehru jacket; Look 2: Boys traditional Gujarati kedia jacket & tulip dhoti; Look 3: Boys silk-blend kurta-pyjama with contrast bandi waistcoat; Look 4: Boys festive angrakha kurta set; Look 5: Boys royal printed kurta with churidar & mojaris).
    - For Men: ALL 5 looks must be authentic Men's festive ethnic kurta/dhoti/sherwani sets.
    - For Girls / Women: ALL 5 looks must be authentic festive chaniya choli / lehenga sets.
  * For Office / Formal: ALL 5 looks must be strictly corporate/workplace appropriate.
  * For Wedding: ALL 5 looks must be wedding/festive appropriate.
  * For Date Night: ALL 5 looks must be date-appropriate.
  * For Party: ALL 5 looks must be glamorous partywear.
  * How the 5 looks vary: Vary the SILHOUETTE, TEXTILE, EMBROIDERY STYLE, and ENERGY WITHIN the chosen occasion — NOT by abandoning the occasion or recommending inappropriate clothes!
- Respect the user's stated colour preferences and restrictions; never contradict a stated dislike.
- Infer a sensible balance of style and comfort yourself from their style-world choices, desired impression, and occasion, and infer reasonable context for the occasion from the occasion word alone without needing it spelled out.
- reasoning must be 3-5 short, concrete, supportive bullet points explaining why THIS look suits THIS person's profile (appearance, body/fit, occasion, impression). Never use words like "flaws", "hide your body", "make you fairer", "dull", "unsuitable body", or "imperfections".
- confidence is an integer 0-100 reflecting how well the look matches the stated profile.
- palette is an array of 3 hex color strings representing the look's dominant colours.
- pieces is an array of 3-6 {category, name, detail} objects breaking the look into its distinct wearable components:
  * For two-piece or multi-piece outfits, separate the garments into distinct pieces:
    - category "Top" for the shirt, t-shirt, polo, blouse, camisole, or kurta (e.g. name: "Boys Maroon Relaxed-Fit Linen Shirt")
    - category "Bottom" for the shorts, trousers, pants, skirt, or dhoti (e.g. name: "Boys Breathable Off-White Linen Shorts")
    - category "Layer" for outerwear (blazer, jacket, cardigan, shrug, Nehru jacket) if layered
  * For one-piece garments (dresses, jumpsuits, rompers, sarees), use category "Outfit"
  * category "Footwear" for shoes, sandals, loafers, heels, or mojaris (e.g. name: "Boys Tan Leather Slide Sandals")
  * category "Jewellery" for earrings, necklaces, watches, bracelets
  * category "Accessories" for bags, belts, hats, sunglasses
- Output must be valid JSON matching the provided schema exactly, with an "id" like "look-01".."look-05".`;

function buildUserPrompt(profile: SkinTuneProfile): string {
  const ctx = getStylingContext(profile);
  const occLower = (profile.occasion || "").toLowerCase();
  const isVacationOrResort =
    occLower.includes("vacation") ||
    occLower.includes("resort") ||
    occLower.includes("beach") ||
    occLower.includes("goa") ||
    occLower.includes("holiday") ||
    occLower.includes("summer") ||
    occLower.includes("casual");

  const isFestiveOrTraditional =
    occLower.includes("garba") ||
    occLower.includes("navratri") ||
    occLower.includes("dandiya") ||
    occLower.includes("wedding") ||
    occLower.includes("shaadi") ||
    occLower.includes("diwali") ||
    occLower.includes("festive") ||
    occLower.includes("puja");

  const notesLower = (profile.customStyleNotes || "").toLowerCase();
  const explicitlyRequestsEthnic =
    notesLower.includes("ethnic") ||
    notesLower.includes("traditional") ||
    notesLower.includes("kurta") ||
    notesLower.includes("sherwani") ||
    notesLower.includes("saree") ||
    notesLower.includes("lehenga");

  const effectiveStyles = isVacationOrResort && !explicitlyRequestsEthnic
    ? profile.style.filter((s) => !["traditional", "royal & regal", "ethnic", "festive"].includes(s.toLowerCase()))
    : profile.style;

  const defaultImpression = isVacationOrResort
    ? "relaxed, breezy and confident"
    : occLower.includes("office") || occLower.includes("formal")
      ? "poised, sharp and capable"
      : isFestiveOrTraditional
        ? "festive, radiant and celebratory"
        : "confident, stylish and comfortable";

  const demographicDirective = ctx.isBoy
    ? `CRITICAL: The user is a young BOY child. Propose ONLY age-appropriate BOYS kidswear: ${
        isVacationOrResort && !explicitlyRequestsEthnic
          ? "casual resort wear (breathable linen or cotton shirts, camp-collar shirts, shorts, tees, co-ord sets, casual boat shoes or sandals). Strictly NO traditional ethnic kurtas, pyjamas, dhotis, or wedding wear!"
          : isFestiveOrTraditional
            ? "vibrant festive boys outfits (kurta-pyjama, kurta-dhoti set, embroidered Nehru jacket, mojaris)."
            : "age-appropriate boys casual/smart clothing (shirts, tees, chinos, jeans, sneakers, shorts)."
      } Under NO circumstances recommend girls dresses, skirts, lehengas, or adult womens clothes!`
    : ctx.isGirl
      ? `CRITICAL: The user is a young GIRL child. Propose age-appropriate GIRLS kidswear: ${
          isVacationOrResort && !explicitlyRequestsEthnic
            ? "casual resort wear (breezy cotton dresses, rompers, shorts/tee co-ords, flat sandals)."
            : isFestiveOrTraditional
              ? "vibrant festive girls outfits (flared chaniya cholis, lehenga cholis, ethnic juttis)."
              : "age-appropriate girls clothing (dresses, skirts, tees, flats)."
        } Under NO circumstances recommend adult womens mature clothes!`
      : ctx.isKids
        ? "CRITICAL: The user is a CHILD. Propose age-appropriate children clothing. Strictly no adult clothing or mature styling!"
        : ctx.isMan
          ? `CRITICAL: The user is an ADULT MAN. Propose Mens ${isVacationOrResort && !explicitlyRequestsEthnic ? "resort wear (linen shirts, shorts/chinos, loafers/sandals)" : "tailoring and clothing"}.`
          : `The user is an ADULT WOMAN. Propose Womens ${isVacationOrResort && !explicitlyRequestsEthnic ? "resort wear (sundresses, linen co-ords, sandals)" : "styling"}.`;

  return `User profile:
- Target audience: ${ctx.audience.toUpperCase()}
- Gender / demographic: ${ctx.isBoy ? "Boy (Child)" : ctx.isGirl ? "Girl (Child)" : ctx.isKids ? "Child (Unspecified gender)" : ctx.isMan ? "Adult Man" : "Adult Woman"}
- Age group: ${profile.ageGroup || (ctx.isKids ? "Child" : "Adult")}
- Demographic styling directive: ${demographicDirective}
- Appearance: skin tone ${profile.appearance.skinTone || "unspecified"}, ${profile.appearance.undertone || "unspecified"} undertone, contrast ${profile.appearance.contrast || "unspecified"}
- Body build: ${profile.bodyBuild || "not specified"}
- Fit preference: ${profile.fit || "no strong preference"}
- Style worlds: ${effectiveStyles.join(", ") || "open to suggestion"}
${profile.customStyleNotes ? `- Custom styling request from user: "${profile.customStyleNotes}". Prioritize their specific garment, cut, silhouette, and aesthetic preferences closely.\n` : ""}- Colours loved: ${profile.colorsLove.join(", ") || "no strong favourites stated"}
- Colours to avoid: ${profile.colorsAvoid.join(", ") || "none stated"}
- Restrictions: ${profile.restrictions.join(", ") || "none stated"}
- Occasion: ${profile.occasion || "not specified"}
${isVacationOrResort && !explicitlyRequestsEthnic ? `- OCCASION DIRECTIVE (MANDATORY): The occasion is "${profile.occasion}". ALL 5 looks must be authentic casual resort / vacation wear (e.g. linen/cotton shirts, shorts, breathable co-ords, sandals). Strictly DO NOT propose traditional ethnic kurta-pajama, sherwani, dhoti, or formal suiting.\n` : ""}- Desired impression: ${profile.impression?.length ? profile.impression.join(", ") : defaultImpression}
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

import { executePaidOperation, CREDIT_COSTS } from "@/lib/credits";

export async function POST(req: Request) {
  return await executePaidOperation(
    req,
    {
      cost: CREDIT_COSTS.RECOMMENDATIONS,
      operationType: "recommendations",
      schema: RecommendationsRequestSchema,
      description: "5 complete-look styling recommendations",
    },
    async (data) => {
      const openai = getOpenAIClient();
      const completion = await openai.chat.completions.create({
        model: RECOMMENDATION_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(data.profile) },
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

      return RecommendationsResponseSchema.parse({ recommendations });
    },
  );
}


