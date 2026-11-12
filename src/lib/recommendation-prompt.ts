import type OpenAI from "openai";
import { z } from "zod";
import {
  LookRecommendationSchema,
  type LookRecommendation,
  type SkinTuneProfile,
  type StyleIntent,
} from "@/lib/skintune-schemas";
import { RECOMMENDATION_MODEL, type OpenAIRequestOptions } from "@/lib/openai-client";
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
- The style worlds were chosen by the user in this session and are intentional preferences, not leftovers: every look must express them together with the request. The request refines them — garments, fabrics, accessories, colours, comfort needs or a general mood (such as modern, minimal or sleek) are expressed WITHIN the selected style worlds — and overrides a selected style world only where it explicitly rules that style out (e.g. "no ethnic wear", "western only").
- Other selected options (occasion, impression) may be outdated leftovers from an earlier session. Use them where they are consistent with the request; where they conflict, the user's own request wins. Record each conflict and how you resolved it in "resolvedConflicts".
- Decide the effective occasion and the theme/aesthetic from everything the user provided. Never assume an occasion or theme the user did not express.
- Decide the style direction (traditional, western, fusion, mixed, or other) from the user's actual intent — the selected style worlds and the request first — and the genuine cultural context of the effective occasion. A selected traditional / ethnic / festive style world makes the direction traditional, whatever the occasion: interpret the occasion through it (e.g. light, breathable everyday ethnic wear for a relaxed occasion) instead of switching to western wear. A selected fusion / Indo-Western style world makes the direction fusion. When traditional or fusion is selected together with western style worlds, the direction is mixed or fusion so that each selected world is genuinely represented across the looks. Do not default to any tradition the user's intent does not support, and do not exclude one the user asked for, selected, or that the occasion genuinely calls for. Explain the choice in "styleDirectionReasoning".
- List in "mustInclude" and "mustAvoid" ONLY requirements and exclusions the user actually expressed (in their request, selected style worlds, colours, restrictions, or non-conflicting selections) — e.g. a stated theme, selected style world, fabric, comfort need, garment, colour, or exclusion. Never list your own styling ideas or specific garment choices there; those belong in the looks, where they can vary.

- Set "sareeAesthetic" ONLY from what the user asked for: "traditional" when they want a traditional saree or authentic regional weave, "contemporary" when they want a modern / latest / new fashion / pre-draped / innovative saree (any mention of "latest saree", "latest sarees", "new fashion saree", "trendy saree", "designer saree", or modern variations MUST map to "contemporary"), "traditional_with_modern_touch" when they want a traditional saree updated with modern elements, and "not_requested" when the request is not about sarees. If they ask for a saree without saying which, choose from their style worlds, impression and occasion and explain it in "styleDirectionReasoning".

STEP 2 — GENERATE 5 LOOKS THAT FOLLOW THE BRIEF:
- Every look must satisfy every "mustInclude" item and none of the "mustAvoid" items, and genuinely express the brief's theme and style direction in its garments (silhouette, fabric, print, detailing) — not just in its title.
- Choose garments using your own fashion and cultural knowledge for this exact person, occasion and theme. Be culturally authentic whenever the brief's style direction is traditional or fusion.
- Vary the 5 looks within the brief (silhouette, textile, detailing, energy) — never by abandoning the brief. Five looks that differ only in colour are a failure.

SAREE EXPERTISE (applies whenever the brief's sareeAesthetic is not "not_requested"):
- Know the saree itself — WHAT it is (weave, fabric, regional origin, construction) — and treat it separately from HOW it is draped. A weave is never a drape and a drape is never a weave: a Kanjeevaram can be worn in a Nivi or a Bengali drape; a Bengali drape can be done with a Tant, a Banarasi or a plain silk.
  * Traditional weaves and regional sarees: Banarasi (Varanasi brocade, zari), Kanjeevaram / Kanchipuram (heavy mulberry silk, contrast korvai borders), Paithani (Maharashtra, peacock / lotus pallu), Patola (Gujarat double ikat), Chanderi (sheer silk-cotton, buttis), Maheshwari (Madhya Pradesh, reversible borders), Bandhani (tie-dye, Gujarat / Rajasthan), Sambalpuri (Odisha ikat), Tant (Bengal handloom cotton), Gadwal (cotton body with silk border and pallu), Kasavu (Kerala off-white with gold border), and other traditional silk, cotton and handloom sarees.
  * Contemporary saree constructions: pre-draped / ready-to-wear, pre-stitched, ruffle, concept, pant-style, dhoti-style, cowl drape, cape-style, belted, jacket-style, and contemporary fusion sarees, saree-jumpsuits, skirt-pleated sarees.
  * Draping styles: Nivi, Bengali, Gujarati, Maharashtrian (Nauvari), dhoti drape, butterfly, seedha pallu, pant-style, contemporary cowl drape, pre-stitched drapes, cascading neck-wrap drape, cape-pallu drape, pleated mermaid drape, sculpted belted pleats.
  * Cutting-edge contemporary fabrics & textiles: metallic tissue silk, liquid organza, crushed / micro-pleated georgette, fluid satin crepe, metallic shimmer lamé, sequined tulle/mesh, foil-printed georgette, modal silk, shimmering lurex.
  * Modern blouses & outerwear layers: structured corset blouses, sculpted boned bustiers, tailored cropped blazers, tuxedo jackets, sheer floor-length embroidered capes, halter cutaway necklines, peplum tops, metallic waist cinchers/belts.
- Honour the requested aesthetic exactly:
  * traditional: authentic traditional sarees and regional weaves, traditionally draped, with classic blouses. A contemporary element is allowed only if the look still reads traditional. Never fill the looks with western or fusion outfits.
  * contemporary: lead with modern constructions — pre-draped, ruffle, pant-style, dhoti-style, belted, cape, jacket or cowl drapes and innovative drapes — with modern blouses (corset, structured, sheer, halter, cropped blazer, sculpted bustier) and cutting-edge fabrics (metallic tissue, liquid organza, crushed georgette, satin crepe). When the user asks for "latest saree", "latest sarees", "new fashion saree", "designer saree", or new variations, strictly propose latest runway-inspired variations: pre-draped pant-sarees, belted concept sarees with metallic cinchers, corset-blouse sarees, cape-jacket sarees, or liquid metallic tissue sarees.
  * traditional_with_modern_touch: an authentic traditional saree or weave combined with a contemporary element — a modern blouse, jacket or cape, a belt, or an updated drape — so both sides are visible in every look.
- Match fabric weight and richness to the effective occasion's formality: rich zari silks and heirloom weaves for grand ceremonies; breathable handloom cotton, Chanderi or Maheshwari for daily wear; follow the user's stated fabric or comfort needs above all.
- Make the 5 saree looks genuinely different from each other: vary the weave or construction, regional origin, drape, blouse design and silhouette — not just the colour.
- For every saree look: 'outfit' names the saree type, fabric and weave or origin, the draping style, and the blouse design (and any jacket, cape or layer). In pieces, the saree is an "Outfit" piece whose name is the saree itself (type, fabric, weave — never the drape) and whose detail gives origin, border / motifs and the drape; the blouse is a "Top" piece; a jacket or cape is a "Layer"; a belt goes in 'accessories'. The note and reasoning explain colour and occasion suitability and how to style it; jewellery and footwear must suit that saree and drape.

MENSWEAR STYLING EXPERTISE (applies only when the audience is an adult man):
- Menswear is a discipline of silhouette, proportion, cut, fabric weight, texture and coordinated formality. Choose every garment from THIS person's brief (request, effective occasion, aesthetic, build, fit, colours, climate); never fall back on a default formula such as shirt + chinos + loafers in different colours.
- DYNAMIC AESTHETIC UNIVERSES — interpret the requested aesthetic through its principles, then choose the garments yourself (these describe qualities, not outfits to copy):
  * Minimal: clean lines, restrained tonal palettes, no unnecessary detail, quiet hardware.
  * Smart Casual: relaxed tailoring and refined texture; polished without full suiting.
  * Formal / Business: structured tailoring, crisp shirting, refined leather footwear, the highest formality the brief calls for.
  * Streetwear: relaxed or boxy proportions, utility details, layered casual pieces, sneaker-led footwear.
  * Old Money: understated heritage quality, natural fibres, muted classic colour, no visible logos.
  * Warm-weather leisure: breathable natural fabrics, open collars, light relaxed shapes.
  * Indian traditional & festive menswear: authentic garments and textiles for the brief's cultural context, from everyday traditional to ceremonial; Indo-Western fusion only when the brief's style direction is fusion.
  * Any other aesthetic the user names: work out its principles the same way; never map it onto one of the above.
- HEAD-TO-TOE OUTFIT COHESION:
  * Each look has ONE clear styling direction: top, bottom, any layer, footwear and accessories share the same formality level and aesthetic, with coordinated colours, patterns, fabric weights and fit.
  * Footwear follows the outfit's formality and silhouette (refined leather for tailoring, traditional footwear for traditional garments, sneakers or casual shoes for casual and street looks).
  * Accessories and jewellery appear only when they genuinely serve the look; "None" is a valid answer. When present, their formality and metals match the outfit (strap and belt leathers coordinate with footwear).
  * Layers are balanced: heavy outerwear over suitably light base layers; never bulk forced under slim tailoring.
- PROPORTIONS, BODY BUILD & FIT ADAPTATION (only from what the user provided; never assume a build or fit):
  * Broader frames: vertical lines, softer shoulders, straight rather than clinging cuts.
  * Slimmer frames: texture and considered layering add dimension; avoid both tent-like volume and skin-tight cuts.
  * Fuller frames: clean drape from the natural waist, tonal or vertical colour, matte fabrics.
  * Athletic builds: room through the chest and thighs with a clean, tapered line.
  * Honour the stated fit preference (fitted, regular, relaxed, oversized) in every garment without changing the brief's formality.
  * Use the age group only to calibrate formality and proportion, never to impose stereotypes.
- BATCH VARIETY ACROSS THE 5 LOOKS:
  * NEVER generate 5 repetitive variations of "shirt + chino trousers + loafers".
  * Vary the 5 looks within the brief by silhouette, garment family, layering strategy, fabric and texture, and footwear, choosing whichever variations this brief genuinely supports. There is no fixed slot or template per look; never introduce a garment the brief or occasion does not support just to create variety.

AUDIENCE & DEMOGRAPHIC INTEGRITY (always applies):
- Dress the person strictly for the stated audience, gender and age group.
  * Children: age-appropriate kidswear only. Strictly NO adult or mature styling (no deep necks, adult formal tailoring, high heels, lingerie-style pieces), and NO cosmetics: makeup must be "None (child-friendly natural skin)".
    - OCCASION-DRIVEN KIDSWEAR & ACCESSORY COHESION (dynamically adapt to candidate's inputs, style direction, and occasion):
      * Traditional / Ethnic / Festive: Propose authentic Indian traditional ethnic wear (strictly NO western wear like jeans, t-shirts, denim, casual shorts, or western blazers; use comfortable breathable fabrics like cotton-silk, mulmul, chanderi, linen-cotton, soft organza accents, rich joyful festive colors):
        - For Girls: traditional ethnic kurti with dhoti/pyjama pants, beautiful lehenga-choli sets with attached sheer flutter capes (strictly NO loose tripping dupattas), ruffled sharara/palazzo sets, or peplum tops with dhoti pants. Accessories: stylish festive potli bags with tassel drawstrings, or festive floral / pearl hair clips, hair bands, headbands, or embroidered hair bows. Footwear: cushioned flat juttis, embellished bellies, or soft ethnic sandals.
        - For Boys: traditional ethnic kurtas (angrakha, straight, or asymmetric placket) with pyjama or dhoti pants, lightweight printed bundi / Nehru waistcoats with pocket squares, festive silk stoles / dupattas, or festive sherwani sets with pyjamas (strictly NEVER recommend churidars for boys: boys wear comfortable pyjama or dhoti pants, never tight churidars; kids ethnic wear is bought as complete kurta/pyjama/dhoti sets). Any layer, drape or jacket MUST be an authentic Indian ethnic piece (Nehru jacket, Bundi waistcoat, Modi jacket, Koti, or traditional festive silk stole/dupatta; NEVER western bomber, puffer, denim, fleece, or tailored spread-collar jackets). Accessories: festive brooches or pocket squares when wearing formal bundi/sherwani, or ethnic caps; otherwise "None". Footwear: cushioned ethnic mojris, juttis, or traditional ethnic sandals (NEVER western sneakers or loafers).
      * Everyday / Casual: Focus on all-day comfort, breathability, and playful ease:
        - For Girls: cute tiered cotton dresses, soft tunics paired with leggings, pinafore sets, graphic tee & culotte coords. Accessories: cute hair accessories (floral clips, bow clips, hair bands, headbands, soft scrunchies) or cute mini everyday pouches / small crossbody bags. Footwear: comfortable velcro sneakers, cute ballerina flats, slide sandals.
        - For Boys: comfortable graphic or polo tees with casual shorts/joggers, breathable cotton button-down shirts over tees. Accessories: casual baseball caps, cute bucket hats, kids UV sunglasses, or playful digital watches; otherwise "None". Footwear: comfortable sneakers, canvas slip-ons, casual floaters, or sandals.
      * Vacation / Resort / Beach / Holiday: Lightweight sun-ready breathable silhouettes (linen, gauze, chambray):
        - For Girls: breezy cotton sundresses, floral rompers, tiered frocks. Accessories: soft cotton or canvas cute tote / crossbody pouches, straw sun hats, cute sunglasses, floral clips. Footwear: comfortable walking sandals, slides, breathable canvas shoes.
        - For Boys: linen resort shirts, tropical short-sleeve button-downs with drawstring shorts, easy coordinated resort sets. Accessories: sun bucket hats, UV sunglasses, canvas caps. Footwear: breathable water-resistant sandals, slide floaters, canvas sneakers.
      * Mini Gentleman / Special Event / Party / Dressy (Boys): Propose tailored waistcoats, waistcoat sets, smart dress shirts (crisp white, cream, or pastel tones harmonizing with the palette), bowties or dressy little details, tailored trousers or chinos, and smart loafers or derby shoes. Layered pieces must be authentic tailored waistcoats or blazers; NEVER winter puffer jackets, outdoor bomber jackets, or casual hoodies.
    - Style Direction Adaptation: Dynamically adapt silhouettes, cuts, layering, colors, and piece composition based on the candidate's selected style direction (Minimal, Streetwear, Bohemian, Classic, Preppy, etc.) and custom notes (e.g. "breathable fabrics", "no glitter", "pastel tones").
  * Boys: boys' kidswear only — STRICTLY NEVER adult men's garments or women's/girls' garments (no adult shirts/blazers, adult formal tailoring, skirts, dresses, cholis, lehengas, heels, or girls' hair accessories). When a look features a blazer, waistcoat, or formal layer, NEVER recommend or suggest winter puffer jackets, quilted jackets, hooded varsity bombers, or casual sportswear.
  * Girls: girls' kidswear only — STRICTLY NEVER adult women's garments or men's/boys' garments (no adult cocktail/bodycon dresses, adult deep necklines, adult formal suits, adult heels, or boys' garments).
  * Unisex children: comfortable, age-appropriate clothing without gender assumptions.
  * TRADITIONAL & ETHNIC INTEGRITY (applies to every look when the brief's styleDirection is "traditional", to each traditional look of a "mixed" brief, and whenever occasion is Traditional, Festive, Diwali, Navratri, Garba, Wedding, Puja, Eid, etc.):
    - STRICTLY NO MODERN OR WESTERN WEAR in these looks, whatever the occasion:
      * NEVER suggest western garments: no blue jeans, denim jackets, bomber jackets, puffer jackets, fleece jackets, flannel shirts, western casual jackets, spread-collar buttoned jackets, classic western jackets, western casual shirts, polo t-shirts, blazers, western cocktail dresses, mini skirts, shorts, joggers, cargo pants, hoodies, western evening gowns, or western formal suits. Any layer, jacket, or drape must be an authentic Indian traditional piece: Nehru jacket, Bundi waistcoat, Modi jacket, ethnic embroidered koti, or traditional festive silk stole/dupatta.
      * Every look must be authentic Indian traditional ethnic wear (Sarees, Lehengas/Chaniya Choli, Kurta sets, Sherwanis, Bundi sets, Anarkalis, Shararas).
      * Footwear must be traditional ethnic footwear: ethnic mojris, juttis, kolhapuris, or traditional embellished sandals — NEVER western sneakers, running shoes, loafers, or stilettos.
      * FOR BOYS KIDSWEAR: Strictly NEVER recommend, suggest, or separate out "churidar" or "churidars". All boys ethnic wear must be complete kurta sets, dhoti sets, pyjama sets, or sherwani sets. Standalone churidars are not worn by young boys.
  * Men: set makeup to "Clean natural grooming" or "None" unless explicitly requested otherwise.
    - NEVER recommend potli bags, clutches, minaudières, or women's purses for men.
    - NEVER put a belt over a kurta, sherwani, or other traditional tunic (belts only go through belt loops of western bottoms).
    - Men's jewellery stays minimal and masculine (watch, kada/bracelet, signet ring, brooch); NEVER women's jewellery (no temple necklaces, dangling pendants, chokers, jhumkas, earrings, maang tikkas, anklets).
    - When fusion / Indo-Western style direction is requested: propose cutting-edge masculine Indo-Western cuts (asymmetric high-low kurtas with diagonal plackets, tuxedo bandhgalas with satin shawl lapels, open-front achkans over cowl-draped kurtas, short crossover angrakha jackets; bottoms MUST be tailored modern cigarette trousers or stretch chinos, NEVER loose traditional salwars or pyjamas; footwear: leather monk straps or dress loafers).
  * Women: complete head-to-toe curation; when jewellery is included, specify both ear and wrist jewellery that harmonise with the outfit's formality (minimal and sleek for formal looks).
    - When fusion / Indo-Western style direction is requested: propose cutting-edge contemporary silhouettes (pre-draped ready-to-wear sarees paired with structured cropped blazers or corsets and belts, cape-style bustier tops with high-waist dhoti pants or tiered shararas and sheer floor-length capes, belted saree jumpsuits, peplum tops with cowl/tulip pants, or rich brocade skirts with crisp white poplin shirts). Style with a modern designer aesthetic, structured tailoring, and sleek modern accessories.
    - When occasion is Cocktail, Mocktail, Soirée, or Evening Party (or when party styling is requested): propose latest high-fashion evening party outfits: liquid metallic or tissue pre-draped cocktail sarees with sculpted boned bustiers, fluid satin cowl slip gowns or column dresses with high slits, sculpted corset midi dresses, tailored feminine tuxedo suits in velvet or crepe with satin lapels, or chic Indo-Western party cape sets. Footwear: sleek stiletto heels or elegant metallic strappy sandals; Jewellery: statement modern earrings (ear cuffs, architectural drops) and delicate bracelets; Hair & Makeup: sleek high-fashion hairstyles (Hollywood waves, sleek bun, slicked ponytail) and luminous night-out glam.

FIELD RULES:
- 'outfit' contains ONLY the clothing garments (never footwear or bags), and must name EVERY clothing garment listed in pieces (e.g. both the top AND the bottom of a two-piece) — it drives the photo render.
- 'footwear' and 'accessories' (bags, belts, scarves, hats) belong in their own fields.
- INTERNAL CONSISTENCY: title, note, outfit, outfitColor and pieces must all describe the SAME outfit. Never name a garment in the title, note or pieces that is not in 'outfit'.
- Respect loved colours prominently and never use a colour the user avoids.
- All pieces in a look MUST strictly harmonize with the look's designated palette and outfitColor. For monochromatic or coordinated sets (e.g. Butter Yellow Vest Ensemble), inner shirts and separates must be tonal (matching palette shade) or crisp elegant neutrals (white, cream, ivory); NEVER introduce random unrequested contrasting colours (such as blue denim or bright blue shirts) that clash with the look.
- applicableCategories: women ["outfit", "makeup", "jewellery", "footwear", "accessories"]; men ["outfit", "footwear", "accessories", "jewellery"]; children ["outfit", "footwear", "accessories"].
- The 5 "vibe" values must be 5 DIFFERENT single words; "personaEnergy" is 1-2 vivid sentences on how this person moves and feels in this specific look (a photo step uses these, so make them genuinely different).
- reasoning: 3-5 short, concrete, supportive bullet points explaining why THIS look suits THIS person and their request. Never use words like "flaws", "hide your body", "make you fairer", "dull", "unsuitable body", or "imperfections".
- confidence: integer 0-100 for how well the look matches the profile and request. palette: 3 hex colours.
- pieces: 3-6 {category, name, detail} objects. Clothing uses "Top", "Bottom", "Layer", or "Outfit" (one-piece garments); then "Footwear", "Jewellery", "Accessories".
- Output must be valid JSON matching the schema exactly, with look ids "look-01".."look-05".`;

/**
 * The user's Step 7 style worlds as written for the model: a custom "Other: Cottagecore" choice is
 * passed as "Cottagecore", and an "Other" chip with no text (no preference stated) is dropped.
 */
export function selectedStyleWorlds(style: string[] | undefined): string[] {
  return (style || [])
    .map((s) => (s.startsWith("Other: ") ? s.slice(7) : s).trim())
    .filter((s) => s && s !== "Other");
}

/**
 * Presents the profile neutrally: the user's own request verbatim and first, the style worlds
 * chosen in this session as intentional preferences, and the remaining selected options as
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
- Age group: ${ctx.ageGroup || (ctx.isKids ? "Child" : "Adult")}
- Appearance: skin tone ${profile.appearance.skinTone || "unspecified"}, ${profile.appearance.undertone || "unspecified"} undertone, contrast ${profile.appearance.contrast || "unspecified"}
- Body build: ${profile.bodyBuild || "not specified"}
- Fit preference: ${profile.fit || "no strong preference"}

STYLE WORLDS CHOSEN IN THIS SESSION (intentional preferences — every look must express them; the request above refines them and overrides one only where it explicitly rules it out):
- Style worlds: ${list(selectedStyleWorlds(profile.style), "open to suggestion")}

SELECTED OPTIONS (may be left over from an earlier session; use where consistent with the request above):
- Occasion: ${profile.occasion || "not specified"}
- Desired impression: ${list(profile.impression, "not specified")}

PREFERENCES & LIMITS:
- Colours loved: ${list(profile.colorsLove, "no strong favourites stated")}
- Colours to avoid: ${list(profile.colorsAvoid, "none stated")}
- Restrictions: ${list(profile.restrictions, "none stated")}
- Budget: ${profile.budget || "not specified"}

Fill "styleBrief" first by interpreting all of the above, then return exactly 5 complete-look recommendations that follow it, as JSON.`;
}

export const SAREE_AESTHETICS = ["traditional", "contemporary", "traditional_with_modern_touch", "not_requested"] as const;

const StyleBriefSchema = z.object({
  effectiveOccasion: z.string(),
  occasionReasoning: z.string(),
  themeOrAesthetic: z.string(),
  styleDirection: z.enum(["traditional", "western", "fusion", "mixed", "other"]),
  styleDirectionReasoning: z.string(),
  // The model always returns it (strict schema); the default only keeps older
  // outputs parseable.
  sareeAesthetic: z.enum(SAREE_AESTHETICS).default("not_requested"),
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
    sareeAesthetic: { type: "string", enum: [...SAREE_AESTHETICS] },
    mustInclude: { type: "array", items: { type: "string" } },
    mustAvoid: { type: "array", items: { type: "string" } },
    resolvedConflicts: { type: "array", items: { type: "string" } },
  },
  required: [
    "effectiveOccasion", "occasionReasoning", "themeOrAesthetic", "styleDirection",
    "styleDirectionReasoning", "sareeAesthetic", "mustInclude", "mustAvoid", "resolvedConflicts",
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
    palette: { type: "array", items: { type: "string" } },
    pieces: { type: "array", items: LOOK_PIECE_JSON_SCHEMA },
    outfit: { type: "string" },
    outfitColor: { type: "string" },
    jewellery: { type: "string" },
    hairstyle: { type: "string" },
    makeup: { type: "string" },
    accessories: { type: "string" },
    footwear: { type: "string" },
    reasoning: { type: "array", items: { type: "string" } },
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
    recommendations: { type: "array", items: LOOK_JSON_SCHEMA },
  },
  required: ["styleBrief", "recommendations"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------------------------
// Review: a second model pass judges the looks against the user's own inputs
// ---------------------------------------------------------------------------------------------

export const REVIEW_SYSTEM_PROMPT = `You are LetStyle's styling quality reviewer. You receive a user's profile (including their own free-text styling request), the style brief a stylist derived from it, and 5 proposed looks. Audit each look against an explicit checklist — be literal and evidence-based, not a matter of taste.

1. Build the checklist ONCE in "requirements": every explicit requirement or exclusion in the user's own request (split compound requests into separate items, e.g. "full sleeves", "ankle length", "no slits"), plus brief mustInclude/mustAvoid items ONLY if they are grounded in something the user actually provided (request, selected style worlds, colours, restrictions, non-conflicting selections) — skip items that are merely the stylist's own garment or styling ideas — plus the effective occasion and the style direction. The style worlds chosen in this session ARE requirements: a selected traditional / ethnic style needs authentic traditional garments and a selected fusion / Indo-Western style needs a visible fusion of Indian and western elements (across the looks the brief's direction assigns them to), unless the user's own request explicitly rules that style out. The user's own words outrank the brief; other selected options (occasion, impression) that conflict with the user's request are NOT requirements. Do not invent requirements (no colour-matching or comfort preferences the user did not state).
   When the brief's sareeAesthetic is not "not_requested", add one requirement for it: "traditional" = an authentic traditional saree or regional weave, traditionally worn (no western or fusion outfit); "contemporary" = a modern saree construction or innovative drape (pre-draped, ruffle, pant-style, dhoti-style, belted, cape, jacket or cowl); "traditional_with_modern_touch" = an authentic traditional saree or weave AND a visible contemporary element (modern blouse, jacket or cape, belt, or updated drape). A saree look that names a weave but no drape, or calls a drape a weave, does not satisfy it. When the user asks for "latest saree", "latest sarees", "new fashion saree", or trendy variations, verify that the looks feature contemporary saree constructions, modern drapes, or modern blouse/layer styling.
   When styling women for Indo-Western fusion, cocktail, mocktail, or parties, ensure the looks reflect the latest contemporary fashion (modern cuts, chic silhouettes, sleek partywear or fusion tailoring) appropriate to that occasion.
   When styling men, check menswear styling cohesion and aesthetic fidelity: ensure footwear and accessories match the outfit formality (no running shoes with formal suits; no women's jewellery, potli bags or clutches; no belts over kurtas or ethnic tunics); and ensure the aesthetic and occasion the user actually asked for are genuinely reflected in the garments and footwear, with each look having one coherent formality level.
2. For each look, check EVERY requirement against the garments actually named in the look's outfit and pieces: satisfied = true only if the look clearly meets it; quote the deciding words in "evidence". A different garment than requested (e.g. a length, cut or fabric other than the one specified) is NOT satisfied.
3. audienceAppropriate: every garment suits the stated audience, gender and age group.
4. titleGarmentsInOutfit: every garment named in the title or note also appears in the 'outfit' field.
5. outfitNamesAllClothingPieces: the 'outfit' field names every clothing piece (Top/Bottom/Layer/Outfit categories) listed in pieces.
6. batchVariety (once, for all 5 looks): variedBeyondColour = true only if the looks differ in more than colour — e.g. silhouette, garment type, fabric or weave, construction, drape, or blouse/top design. Five near-identical garments in different colours (or for men, repeating identical shirt-and-chinos variations across the looks) is false; quote the deciding differences (or their absence) in "evidence".
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
  // Required from the model (strict schema); optional here so older outputs still parse.
  batchVariety: z.object({ variedBeyondColour: z.boolean(), evidence: z.string() }).optional(),
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
    batchVariety: {
      type: "object",
      properties: {
        variedBeyondColour: { type: "boolean" },
        evidence: { type: "string" },
      },
      required: ["variedBeyondColour", "evidence"],
      additionalProperties: false,
    },
  },
  required: ["requirements", "reviews", "batchVariety"],
  additionalProperties: false,
} as const;

const INTENT_TEXT_MAX = 240;
const INTENT_LIST_MAX = 8;
const clipText = (s: string) => (s || "").replace(/\s+/g, " ").trim().slice(0, INTENT_TEXT_MAX);

/**
 * The reviewed brief reduced to what image generation can use as context: the effective
 * occasion, theme/aesthetic and style direction, plus the user's own requirements and
 * exclusions. Free-text reasoning and conflict notes are dropped, and text is bounded so a
 * long brief can never bloat an image request.
 */
export function toStyleIntent(brief: StyleBrief): StyleIntent {
  const list = (xs: string[]) => xs.map(clipText).filter(Boolean).slice(0, INTENT_LIST_MAX);
  return {
    effectiveOccasion: clipText(brief.effectiveOccasion),
    themeOrAesthetic: clipText(brief.themeOrAesthetic),
    styleDirection: brief.styleDirection,
    sareeAesthetic: brief.sareeAesthetic,
    mustInclude: list(brief.mustInclude),
    mustAvoid: list(brief.mustAvoid),
  };
}

/** Attaches the reviewed brief's intent to every look of the batch; the looks themselves are unchanged. */
export function attachStyleIntent<T extends object>(looks: T[], brief: StyleBrief): Array<T & { styleIntent: StyleIntent }> {
  const styleIntent = toStyleIntent(brief);
  return looks.map((look) => ({ ...look, styleIntent }));
}

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
  requestOptions?: OpenAIRequestOptions,
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
  }, requestOptions);
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Reviewer returned no content");
  const { reviews, batchVariety } = ReviewSchema.parse(JSON.parse(raw));
  // Pass/fail is decided from the structured checks only, never from free-form remarks
  const issues = reviews.flatMap((r) => {
    const issues = r.requirementChecks
      .filter((c) => !c.satisfied)
      .map((c) => `${r.lookId}: does not satisfy "${c.requirement}" (${c.evidence})`);
    if (!r.audienceAppropriate) issues.push(`${r.lookId}: contains garments unsuitable for the stated audience, gender or age group`);
    if (!r.titleGarmentsInOutfit) issues.push(`${r.lookId}: title/note names a garment missing from the outfit field`);
    if (!r.outfitNamesAllClothingPieces) issues.push(`${r.lookId}: outfit field does not name every clothing piece`);
    return issues;
  });
  if (batchVariety && !batchVariety.variedBeyondColour) {
    issues.push(`all looks: the 5 looks differ only in colour — vary silhouette, fabric/weave, construction, drape or top design (${batchVariety.evidence})`);
  }
  return issues;
}

/**
 * Generates 5 looks (with the model's own interpretation of the request), has them reviewed
 * against the user's inputs, and — if the reviewer reports issues — requests one correction
 * that is reviewed again. The result with fewer issues is returned.
 */
export async function generateLookRecommendations(
  openai: OpenAI,
  profile: SkinTuneProfile,
  /** Forwarded to every provider call (the background job runner passes a deadline signal). */
  requestOptions?: OpenAIRequestOptions,
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
    }, requestOptions);
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Model returned no content");
    const parsed = ModelOutputSchema.parse(JSON.parse(raw));
    return { raw, looks: parsed.recommendations, styleBrief: parsed.styleBrief };
  };

  const safeReview = async (brief: StyleBrief, looks: GeneratedLook[]) => {
    try {
      return await reviewLooks(openai, profile, brief, looks, requestOptions);
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
