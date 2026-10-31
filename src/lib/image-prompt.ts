import type { LookRecommendation, SkinTuneProfile } from "@/lib/skintune-schemas";
import { getStylingContext } from "@/lib/styling-context";

export type OccasionContext = { occasion: string; details: string };

// Look-piece categories (as defined by the recommendation schema) that are not clothing garments
const NON_GARMENT_PIECE_CATEGORY = /\b(shoe|footwear|jewel|accessor|bag|hair|makeup|finish)/i;

export type StylingAddendum = {
  expression: string;
  headAndCameraAngle: string;
  bodyLanguage: string;
  hairstyleRendering: string;
  fitNotes: string;
  environmentAndSetting: string;
  flatteringDirection: string;
};

export function buildMinimalPoseFallback(): string {
  return "Compose this as one natural, well-lit, coherent photograph appropriate to the occasion and outfit.";
}

export function buildLookEditPrompt(
  look: LookRecommendation,
  profile: SkinTuneProfile,
  context: OccasionContext,
  addendum: StylingAddendum | null,
): string {
  const ctx = getStylingContext(profile);
  // Occasion-specific rendering rules follow the generated look itself (which the styling model
  // derived from the user's full brief), not the raw selected occasion, which may be stale or
  // superseded by the user's custom styling notes.
  const occText = `${look.note || ""} ${look.title || ""} ${look.outfit || ""}`.toLowerCase();
  const isGarba = occText.includes("garba") || occText.includes("navratri") || occText.includes("dandiya");
  const isVacationOrResort =
    occText.includes("vacation") ||
    occText.includes("resort") ||
    occText.includes("beach") ||
    occText.includes("goa") ||
    occText.includes("holiday") ||
    occText.includes("summer");
  const garmentBreakdown = (look.pieces || []).filter((p) => !NON_GARMENT_PIECE_CATEGORY.test(p.category)).map((p) => p.name);

  const demographicInstruction = ctx.isBoy
    ? `DEMOGRAPHIC & GENDER INTEGRITY: The subject is a young BOY child (age: ${profile.ageGroup || "child"}). The generated photo MUST depict an age-appropriate young boy in boys' kidswear. Do NOT change their gender presentation to a girl. Strictly NO dresses, skirts, chaniya choli, lehenga, adult women's kurtis, high heels, or makeup. The child must be dressed strictly in boys' clothing matching the requested outfit: ${look.outfit}.`
    : ctx.isGirl
      ? `DEMOGRAPHIC & GENDER INTEGRITY: The subject is a young GIRL child (age: ${profile.ageGroup || "child"}). The generated photo MUST depict an age-appropriate young girl in girls' clothing. Strictly NO adult women's mature styling or high heels.`
      : ctx.isKids
        ? `DEMOGRAPHIC INTEGRITY: The subject is a young child (age: ${profile.ageGroup || "child"}). The generated photo MUST depict an age-appropriate child in comfortable kidswear. Strictly NO adult clothing or mature styling.`
        : ctx.isMan
          ? `DEMOGRAPHIC INTEGRITY: The subject is an adult man. Style in men's tailoring and clothing.`
          : `DEMOGRAPHIC INTEGRITY: The subject is an adult woman. Style in women's fashion.`;

  const garbaInstruction = isGarba
    ? ctx.isBoy
      ? `CULTURAL OCCASION AUTHENTICITY: This is a traditional Garba / Navratri festival celebration for a young boy. The outfit MUST be an authentic Indian festive boys' outfit (such as a boys' embroidered kurta-pyjama or kurta-dhoti set with festive Nehru jacket and mojaris). Do NOT render women's or girls' clothing, dresses, or skirts.`
      : ctx.isMan
        ? `CULTURAL OCCASION AUTHENTICITY: This is a traditional Garba / Navratri festival celebration for a man. The outfit MUST be an authentic Indian festive men's outfit (such as an embroidered kurta-dhoti or kurta-pyjama set with mojaris).`
        : `CULTURAL OCCASION AUTHENTICITY: This is a traditional Garba / Navratri festival celebration. The outfit MUST be an authentic Indian festive outfit (such as a flared mirror-work chaniya choli or lehenga) with traditional festive jewellery (such as oxidised silver jhumkas) and festive accessories (potli bag). Do NOT render western casual dresses, office blazers, modern western midi dresses, or corporate work totes.`
    : "";

  const vacationInstruction = isVacationOrResort
    ? ctx.isBoy
      ? `OCCASION & RESORT CASUAL AUTHENTICITY: This is a casual vacation / resort setting (e.g. Goa vacation) for a young boy. The outfit MUST be age-appropriate casual resort wear matching the recommended outfit: ${look.outfit} (such as a breathable linen or cotton shirt, relaxed shorts, casual resort co-ord, with casual sandals or sneakers). Strictly DO NOT render traditional Indian ethnic wear (NO kurta, NO pyjama, NO dhoti, NO sherwani) and NO formal suits. The setting MUST be a sunny, pleasant coastal resort / vacation outdoor environment.`
      : ctx.isKids
        ? `OCCASION & RESORT CASUAL AUTHENTICITY: This is a casual vacation / resort setting for a child. The outfit MUST be age-appropriate casual resort wear matching the recommended outfit: ${look.outfit} (breathable linen/cotton, shorts, tees, co-ord set, sandals). Strictly DO NOT render traditional ethnic wear (no kurta, pyjama, lehenga) or formal suits.`
        : ctx.isMan
          ? `OCCASION & RESORT CASUAL AUTHENTICITY: This is a casual vacation / resort setting. The outfit MUST be relaxed resort wear: ${look.outfit} (linen shirt, resort shorts/chinos, loafers/sandals). Strictly DO NOT render traditional ethnic kurta/sherwani or corporate suits.`
          : `OCCASION & RESORT CASUAL AUTHENTICITY: This is a casual vacation / resort setting. The outfit MUST be relaxed resort wear: ${look.outfit} (breezy resort dress, linen co-ord, sandals). Strictly DO NOT render heavy traditional ethnic wear (no heavy sarees, no bridal lehengas) or corporate office suits.`
    : "";

  const fullStyleText = `${look.note || ""} ${look.title || ""} ${look.outfit || ""} ${(profile.style || []).join(" ")} ${profile.customStyleNotes || ""} ${context.details || ""} ${context.occasion || ""}`.toLowerCase();
  const isIndoWestern =
    fullStyleText.includes("indo-western") ||
    fullStyleText.includes("indo western") ||
    fullStyleText.includes("fusion") ||
    occText.includes("pant-saree") ||
    occText.includes("pre-draped") ||
    occText.includes("dhoti-pant") ||
    occText.includes("tuxedo bandhgala") ||
    occText.includes("asymmetric") ||
    occText.includes("cowl kurta");

  const indoWesternInstruction = isIndoWestern
    ? ctx.isBoy
      ? `INDO-WESTERN FUSION VISUAL FIDELITY: The outfit is a modern, age-appropriate boys' Indo-Western fusion set (such as an asymmetric cut kurta with tailored stretch chino trousers, or a printed bundi waistcoat over a short kurta set). The garments must look sharp, stylish, and comfortable for a young boy with no bulky, uncomfortable layers.`
      : ctx.isGirl
        ? `INDO-WESTERN FUSION VISUAL FIDELITY: The outfit is a modern, age-appropriate girls' Indo-Western fusion set (such as a crop top with ruffled palazzo pants and an attached sheer flutter cape, or an elasticated pre-stitched pant-saree jumpsuit). It must be stylish, comfortable, and completely free of loose falling dupattas.`
        : ctx.isKids
          ? `INDO-WESTERN FUSION VISUAL FIDELITY: The outfit is an age-appropriate children's Indo-Western fusion set with clean lines, comfortable stretch bottoms, and modern tailored touches.`
          : ctx.isMan
            ? `INDO-WESTERN FUSION VISUAL FIDELITY: The outfit is contemporary menswear Indo-Western fusion (such as an asymmetric high-low kurta with diagonal placket paired with sharp tailored cigarette trousers, a tuxedo-style bandhgala with satin lapel detailing, or an open-front long achkan over a cowl-draped kurta). The bottoms MUST be crisp, tailored modern trousers (STRICTLY NO loose baggy traditional salwars or pyjamas). Footwear must be leather dress loafers or monk straps.`
            : `INDO-WESTERN FUSION VISUAL FIDELITY: The outfit is high-fashion contemporary women's Indo-Western fusion (such as a pre-draped saree with a structured blazer or corset blouse and metallic belt, an embellished bustier with dhoti pants or sharara and a flowing floor-length sheer cape jacket, a belted saree jumpsuit, or a brocade skirt with a crisp white shirt). Visually render the exact fusion silhouette described in the outfit — sharp modern tailoring blended with rich Indian textures, with no messy loose wraps.`
    : "";

  const menEthnicIntegrity = (ctx.isMan || ctx.isBoy)
    ? `MASCULINE STYLING & ETHNIC WEAR INTEGRITY (CRITICAL): For men and boys wearing Indian traditional, ethnic, or festive attire (such as kurtas, sherwanis, bandhgalas, kurta-pyjama, dhoti-kurta): 1) WAIST BELTS ARE STRICTLY FORBIDDEN OVER ETHNIC TUNICS: NEVER render a belt strapped, buckled, or worn over the outside waist of a kurta or sherwani! Kurtas are tunic garments that MUST drape freely, straight, and naturally over the bottoms without any external waist belt cinching them. 2) STRICTLY NO FEMININE JEWELLERY: NEVER render women's jewellery on men — strictly NO gold temple necklaces, NO dangling pendants, NO choker necklaces, NO jhumkas, and NO feminine chains hanging over the chest/collar. Men's traditional accessories must be strictly masculine (e.g. an analog watch, metallic kada bracelet, royal sherwani brooch/sarpech, or multi-strand royal pearl groom mala only for wedding grooms). 3) STRICTLY NO WOMEN'S ACCESSORIES: NEVER render women's accessories on men — strictly NO potli bags, clutches, or women's purses.`
    : "";

  const parts = [
    `This is a photo of a real specific person. The ONLY thing that must never change is WHO this person is: their face, facial structure, facial features, and skin tone must stay recognizably this exact same person. Everything else — hairstyle, expression, pose, body language, clothing, makeup, background — is yours to change as much as needed to produce the best possible result. Preserving identity is not the same as preserving the original photo; you are re-styling this person for a new shoot, not lightly editing their selfie.`,
    demographicInstruction,
    "The face must be seamlessly and naturally part of the new photo — matching the new lighting, angle, and skin tone rendering of the rest of the scene. It must never look like a face cut out and pasted onto a different body or pose; the neck, jaw, hairline, and shoulders must blend continuously into the body below with consistent lighting and perspective, as if this is one single photograph taken in one moment, not a composite.",
    // Head-to-toe full-length framing mandate
    "COMPOSITION & FRAMING: Strictly compose this as a full-length, head-to-toe fashion editorial photograph. The entire subject must be completely visible from the crown of their head all the way down to their feet and footwear, grounded naturally in the environment. Do NOT crop at the waist, hips, thighs, or knees; the complete outfit, bottoms, and styled footwear must be fully visible in the image.",
    "The head and face must be sized correctly and naturally for a full-length photograph — proportional to the rest of the body the way a real full-body editorial photo actually looks, not enlarged or close-up-sized like a selfie.",
    context.details
      ? `Re-dress and re-style this exact person for the occasion and setting described in the user's own styling request ("${context.details}"), which takes precedence over the selected occasion ("${context.occasion || "everyday"}") wherever they differ.`
      : `Re-dress and re-style this exact person for a ${context.occasion || "everyday"} setting.`,
    addendum ? "" : buildMinimalPoseFallback(),
    `New outfit: ${look.outfit}`,
    garmentBreakdown.length
      ? `Garment breakdown — render exactly these clothing pieces together as this one outfit, with no substitutions: ${garmentBreakdown.join("; ")}.`
      : "",
    `Colour direction: ${look.outfitColor}`,
    `Footwear: ${look.footwear}. The footwear must be fully and clearly visible on their feet grounded in this head-to-toe shot.`,
    `Jewellery: ${look.jewellery}. The jewellery must tastefully and visibly adorn the subject, harmonizing completely with the outfit and occasion.`,
    `Accessories: ${look.accessories}`,
    garbaInstruction,
    vacationInstruction,
    indoWesternInstruction,
    menEthnicIntegrity,
    `New hairstyle: ${look.hairstyle}. This hairstyle MUST be visibly and clearly restyled to match this description — do not leave the hair looking like the input photo. A different look calls for a different hairstyle; rendering the same hair across every look is a failure. Changing hairstyle does NOT change who this person is, so restyle it with confidence.`,
    `Makeup: ${look.makeup}`,
    profile.bodyBuild ? `Preserve their natural build (${profile.bodyBuild}) — do not alter body shape.` : "",
    `The outfit must fit this exact person correctly: the garments should drape, sit, and follow their actual body shape and proportions as if properly tailored for them — correct shoulder line, sleeve and hem length, and natural fabric fall for their build. It should never look pasted on, stretched, floating away from the body, or cut for a different body shape. This should read as clothing that genuinely suits and flatters this specific person, not a generic outfit overlaid on them.`,
    context.details ? `Context: ${context.details}` : "",
    addendum
      ? `Pose, expression, hairstyle rendering, setting, and body language for this specific person and this specific look (decided by analyzing their actual photo, and deliberately different from this person's other looks in this same shoot): Facial expression: ${addendum.expression} Head and camera angle: ${addendum.headAndCameraAngle} Body language and pose: ${addendum.bodyLanguage} How the new hairstyle should actually render on this person's head/face shape: ${addendum.hairstyleRendering} Background/setting: ${addendum.environmentAndSetting} What will make this specific person look genuinely great in this look: ${addendum.flatteringDirection} ${addendum.fitNotes}`
      : "",
    "Natural lighting, tasteful and supportive, no beauty filter, no visible text or watermark. Professional editorial photo quality, the kind of natural, well-composed photo you'd see in a stylish social-media outfit post — not a stiff studio ID photo.",
    "Reminder: keep the same face and identity as the input photo, seamlessly integrated into the new scene (not pasted-looking) — full-length head-to-toe framing with the complete outfit and footwear fully visible, hairstyle, expression, pose, and clothing all changed as directed above.",
  ];
  return parts.filter(Boolean).join(" ");
}
