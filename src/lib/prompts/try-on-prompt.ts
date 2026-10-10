import { getOpenAIClient, RECOMMENDATION_MODEL } from "../openai-client";
import { logger } from "../logger";

export type TryOnContext = {
  occasion?: string;
  bodyBuild?: string;
  fit?: string;
  pronouns?: string;
  garmentTitle?: string;
  garmentSiteName?: string;
};

export type TryOnAddendum = {
  expression: string;
  headAndCameraAngle: string;
  bodyLanguage: string;
  environmentAndSetting: string;
  fitNotes: string;
  hairstyleRendering: string;
  flatteringDirection: string;
};

const TRY_ON_ADDENDUM_JSON_SCHEMA = {
  type: "object",
  properties: {
    expression: { type: "string", description: "A specific, concrete, genuinely confident and flattering facial expression for this shot, matching this dress's mood — not generic, and NOT simply whatever expression the person happened to have in their own casual reference photo (which may be flat, tired, or off-guard). Direct them the way a real photographer would coach a subject to look their best for this specific shot." },
    headAndCameraAngle: { type: "string", description: "Camera height and head angle/tilt for this specific shot — must differ from a plain straight-on head-level shot unless that genuinely suits this dress and occasion." },
    bodyLanguage: { type: "string", description: "How the body, shoulders, hands, and weight are positioned — concrete and specific to this dress's mood, not a stiff standing-still default." },
    environmentAndSetting: { type: "string", description: "A specific background/setting/lighting that genuinely fits this exact dress and the person's stated occasion — reasoned fresh, not a stock choice." },
    fitNotes: { type: "string", description: "How this exact dress (as seen in its real product photo) should drape and fit this specific person's actual visible build/proportions from their photo." },
    hairstyleRendering: { type: "string", description: "A concrete, specific styling decision for the hair in this shot — genuinely reasoned from this person's real hair length/texture/type as seen in their photo and what would look best groomed and styled for this exact dress and occasion (e.g. neater and more polished for a formal look, textured and relaxed for casual). Do not default to simply describing the hair exactly as it looks in the input photo — decide how a stylist would groom and present it for THIS shoot, even if that's a genuinely different look (different length, texture treatment, or styling) from their everyday appearance. State the specific styling choice, not a vague 'well-groomed hair'." },
    flatteringDirection: { type: "string", description: "1-2 sentences of concrete, non-generic reasoning about what will make THIS specific person look genuinely great wearing THIS specific garment — based on what you can actually see in their photo (their features, coloring, build) and this garment's actual cut/colour, not a generic 'confident and radiant' line reused across every try-on." },
  },
  required: ["expression", "headAndCameraAngle", "bodyLanguage", "environmentAndSetting", "fitNotes", "hairstyleRendering", "flatteringDirection"],
  additionalProperties: false,
} as const;

export async function writeTryOnAddendum(
  openai: ReturnType<typeof getOpenAIClient>,
  avatarImageUrl: string,
  garmentImageUrl: string,
  context: TryOnContext,
): Promise<TryOnAddendum | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: RECOMMENDATION_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a fashion photographer directing a virtual try-on shoot — the kind of natural, well-composed \"outfit change\" edit popular on Instagram/Reels, where the same real person appears in a new outfit but the photo looks like a genuine, freshly-taken, professionally shot photograph, never a lightly-touched-up copy of their original selfie. You are shown two images: a real person's own photo (very often a casual, off-guard phone selfie — flat lighting, a neutral or tired expression, an awkward low angle, not their best moment) and a real product photo of a specific dress/outfit they want to try on (typically showing a DIFFERENT model, in the store's own pose, setting, and background — none of that belongs in your output; only the garment itself does). Your job is to genuinely study both — this person's underlying face shape and features, their build, and this exact garment's cut, colour, and mood — and decide, like a photographer directing a real shoot, the facial expression, head/camera angle, body language, background/setting, hairstyle, how this specific garment should drape on this specific body, and concretely what will make THIS specific person look genuinely great in THIS specific garment (not a generic 'confident and radiant' line — real reasoning from their actual features, coloring, and build together with this garment's actual cut and colour). This is a full re-styling for a new shoot, not a light touch-up on the input photo, and it is also NOT a recreation of the product photo's own shoot — the pose, expression, hair, and setting should all genuinely change from whatever they were in EITHER reference photo; you are directing an entirely new, third photograph, not choosing between the two you were shown. Explicitly do NOT carry over the input selfie's expression or mood as-is — even if the person looked flat, tired, serious, or camera-shy in their own casual photo, direct a genuinely confident, warm, camera-ready expression for this shot instead. Equally, do NOT carry over the product photo's pose, model's stance, chair, furniture, or background — that photo exists only to show you the garment's design, not to dictate the shot. Nothing should be a generic, reusable default: reason freshly about this exact person and this exact garment together, and commit to specific, concrete choices rather than safe generic ones. The ONLY thing that must stay the same as the input photo is who this person is — their underlying facial structure, features, and build — not their literal expression, mood, or however flattering (or not) that one casual photo happened to be, and not the pose or setting of either reference image. Never comment on attractiveness or body shape judgmentally — this is purely practical photography direction. Output must be valid JSON matching the given schema exactly.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Dress/outfit to try on this person: "${context.garmentTitle ?? "this garment"}" (from ${context.garmentSiteName ?? "an online store"}). Person's stated occasion: ${context.occasion || "everyday"}, build: ${context.bodyBuild || "not specified"}, fit preference: ${context.fit || "not specified"}, pronouns: ${context.pronouns || "not specified"} (context only, not a template lookup). Study their actual face/build/hair in the first photo and this exact garment in the second photo, then direct this shoot as a genuinely new photograph — a different pose, expression, and hairstyle from whatever the input photo happens to show, whatever combination actually suits this garment and occasion best on this real person.`,
            },
            { type: "image_url", image_url: { url: avatarImageUrl } },
            { type: "image_url", image_url: { url: garmentImageUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "try_on_addendum",
          strict: true,
          schema: TRY_ON_ADDENDUM_JSON_SCHEMA,
        },
      },
      max_completion_tokens: 1200,
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      logger.warn(
        { finishReason: completion.choices[0]?.finish_reason },
        "Try-on addendum agent returned empty content; continuing without it",
      );
      return null;
    }
    const addendum = JSON.parse(raw) as TryOnAddendum;
    logger.info({ tryOnAddendum: addendum }, "Try-on addendum generated");
    return addendum;
  } catch (err) {
    logger.warn({ err }, "Try-on addendum agent failed; continuing without it");
    return null;
  }
}

export function buildTryOnPrompt(context: TryOnContext, addendum: TryOnAddendum | null): string {
  const parts = [
    `This is a photo of a real specific person, shown alongside a real product photo of a dress/outfit ("${context.garmentTitle ?? "this garment"}"). The single most important rule: the output must show the SAME PERSON as the first reference photo — the same underlying face, features, and body build, genuinely recognizable as this individual. This is a hard, non-negotiable constraint that overrides every other instruction in this prompt if they ever conflict. But matching identity means matching WHO they are, not literally copying pixels from their photo: this must be a brand new, freshly-composed photograph — a different expression, a different pose, different lighting, a different setting — never a crop or copy-paste of the input photo's face pasted onto a new body or background. Think of this the way a skilled portrait photographer would: they'd recognize the person on sight, but every photograph they take of that person looks like a real, distinct moment, not a repeated copy of one snapshot. Everything else — hairstyle, expression, pose, body language, background — is yours to change as much as needed for the best result. Preserving identity is not the same as preserving the original photo; you are re-styling this person for a new shoot, not lightly editing their existing photo.`,
    "Study the person's underlying facial structure in the first reference photo — face shape and jawline, eyebrow shape and thickness, eye shape and spacing, nose shape, mouth/lip shape, any facial hair (style, density, and pattern), skin tone, and hairline — and reproduce THAT structure faithfully in the new photo, rendered naturally under the new photo's own lighting and expression. This is about matching their real bone structure and features, not about literally transplanting the face pixels from the input photo — the output should look like a new photograph of this same person, with their face lit and rendered as part of the new scene, not a cutout. Do not generate a generic or idealized face that merely resembles this person. Do not slim, narrow, or otherwise idealize the face shape — reproduce it as it actually is, fuller or rounder faces included — but do let them look genuinely well-lit, well-groomed, and at their best, the way a good photographer would present anyone: flattering light and a confident, polished expression, never a copy of however they happened to look in a casual, off-guard selfie.",
    context.bodyBuild
      ? `Preserve their exact natural body build as seen in the first reference photo (${context.bodyBuild}) — do not slim them down, do not make them more athletic or toned than they actually appear, do not alter their body shape, proportions, height, or weight in any way. The garment should be shown fitting THIS person's real build, not a slimmer or more idealized version of them.`
      : "Preserve their exact natural body build, proportions, and weight as seen in the first reference photo — do not slim them down or otherwise alter their body shape.",
    "The face must be seamlessly and naturally part of the new photo — matching the new lighting, angle, and skin tone rendering of the rest of the scene. It must never look like a face cut out and pasted onto a different body or pose; the neck, jaw, hairline, and shoulders must blend continuously into the body below with consistent lighting and perspective, as if this is one single photograph taken in one moment, not a composite of the original photo with a new outfit glued on.",
    "Frame this as a full-length shot showing the complete outfit from head to shoes — the whole garment, including any bottoms and footwear, must be visible in the frame. Do not crop to a waist-up or close-up portrait; the point of this photo is to show the full look.",
    "The head and face must be sized correctly and naturally for a full-length photograph — proportional to the rest of the body the way a real full-body photo actually looks, not enlarged or close-up-sized the way it would appear cropped tightly in a selfie. Get the head-to-body size ratio right for someone standing at a normal distance from the camera.",
    "Dress this exact person in the exact garment shown in the second reference image — match its actual cut, colour, pattern, and details faithfully, not a generic approximation.",
    "Only the GARMENT ITSELF — its cut, colour, pattern, and fabric — should be taken from the second reference image. Do NOT copy that image's pose, the way its own model is sitting or standing, its background, its furniture, or its setting. The pose, setting, and background for this photo are decided fresh below, independent of both reference images.",
    "The garment must fit this exact person's actual body correctly: drape, sit, and follow their REAL proportions and build (not a slimmer or idealized version) as if properly worn, not pasted on or floating away from the body.",
    addendum
      ? `Facial expression for this shot — this is a specific, deliberate creative decision, not optional flavour text: ${addendum.expression} The output's expression MUST match this description, not the input photo's expression.`
      : "",
    addendum
      ? `Head position and camera angle for this shot: ${addendum.headAndCameraAngle} The output MUST be composed at this angle, not a plain reproduction of the input photo's angle.`
      : "",
    addendum
      ? `Body language and pose for this shot: ${addendum.bodyLanguage} The output MUST show this exact body language and pose.`
      : "",
    addendum
      ? `Background and setting for this shot: ${addendum.environmentAndSetting} The output MUST be set in this environment, not a generic or different backdrop.`
      : "",
    addendum
      ? `New hairstyle rendering for this shot: ${addendum.hairstyleRendering} This hair MUST be visibly restyled to match that description if it calls for a change from the input photo — do not simply leave the hair exactly as it appears in the original photo. Changing hairstyle does NOT change who this person is, so restyle it with confidence.`
      : "",
    addendum
      ? `Fit notes for how the garment sits on this person: ${addendum.fitNotes}`
      : "Compose this as one natural, well-lit, coherent photograph with a pose, expression, and setting genuinely different from the input photo's own — a new shoot, not a copy of the original.",
    addendum
      ? `What will make this specific person look genuinely great in this specific garment: ${addendum.flatteringDirection} This reasoning MUST shape the final shot, not just be background context.`
      : "",
    "Natural lighting, tasteful and supportive, no beauty filter, no visible text or watermark. Professional editorial photo quality, the kind of natural, well-composed photo you'd see in a stylish social-media outfit post — not a stiff studio ID photo, and not a barely-modified copy of the input selfie.",
    "The image must be sharp, high-resolution, and richly detailed — crisp fabric texture and weave on the garment, natural skin texture and fine hair strands clearly resolved, no softness, no blur, no visible compression artifacts or blockiness. This should look like a genuine high-definition photograph straight out of a good camera, not a low-resolution or over-smoothed render.",
    "Final reminder, the most important rules in this entire prompt: (1) the output face AND body build must be unmistakably the SAME PERSON as the first reference photo — same face shape, same features, same facial hair, same skin tone, same body build and proportions (not slimmer, not more toned, not idealized); (2) EVERY styling instruction given above — expression, head/camera angle, body language, background/setting, and especially hairstyle — must be followed as stated, not softened, not defaulted back toward EITHER reference photo, and not treated as optional; (3) the second reference image's pose, model, chair/furniture, and background must NOT appear in the output — only that garment's own design should transfer. Look at the first reference photo again before finishing and check the output genuinely matches it on identity, check it does NOT match the second reference photo's pose/setting, and check the styling instructions above were genuinely followed, not just approximated. Seamlessly integrated into the new scene (not pasted-looking), full-length framing with the complete outfit visible. This is a full re-styling for a new photograph, not a light touch-up or recreation of either reference image.",
  ];
  return parts.filter(Boolean).join(" ");
}
