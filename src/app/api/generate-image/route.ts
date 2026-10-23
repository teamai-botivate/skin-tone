import { NextResponse } from "next/server";
import { toFile } from "openai";
import {
  GenerateImageRequestSchema,
  GenerateImageResponseSchema,
  type LookRecommendation,
  type SkinTuneProfile,
} from "@/lib/skintune-schemas";
import { getOpenAIClient, IMAGE_MODEL, RECOMMENDATION_MODEL } from "@/lib/openai-client";
import { logger } from "@/lib/logger";
import { safeErrorResponse } from "@/lib/safe-error";

type OccasionContext = { occasion: string; details: string };

/**
 * Converts one recommendation's structured styling data into an edit
 * instruction. The image model only ever visualizes a styling decision made
 * by the recommendation engine (see routes/recommendations.ts) — it never
 * invents its own outfit, colour, or styling strategy.
 *
 * Identity preservation is a real, documented weak point of image editing:
 * the further the requested composition is from the input photo (e.g. a
 * tight face-crop selfie -> a full-length editorial shot), the more room
 * the model has to "reinterpret" the face rather than preserve it. Two
 * prompt-level things mitigate this regardless of which API path is used
 * (see the route handler below for the API-level mitigation):
 * (1) very explicit, repeated identity instructions up front and again at
 * the end (models weight both ends of a prompt more heavily), and
 * (2) requesting waist-up/portrait framing instead of full-length, which is
 * a much smaller transformation from a typical selfie and empirically
 * preserves the face far better.
 *
 * Pose and head angle are re-composed regardless of the input photo's
 * angle: many real uploads are casual low-angle selfies (phone held below
 * eye level, chin tucked, eyes cast down/sideways), and preserving that
 * literal head angle would carry the "bad selfie" framing into a supposedly
 * polished result. The instructions below explicitly ask for eye-level
 * camera and a confident straight-on gaze regardless of how the input
 * photo was angled — only the FACE is preserved, not the camera angle or
 * head tilt it happened to be photographed at.
 *
 * Fit/drape is called out explicitly too: "preserve their build" alone
 * only prevents the model from altering body shape — it says nothing about
 * whether the generated garments actually fit that build correctly. The
 * dedicated fit instruction below asks for the outfit to look tailored to
 * this specific person's proportions (shoulder line, sleeve/hem length,
 * fabric fall), not merely worn.
 */
/**
 * Bare-minimum, last-resort line used ONLY when writeStylingAddendum()
 * (below) — the actual decision-maker — could not run or returned nothing
 * at all (e.g. no photo provided, or every vision-agent call attempt
 * failed). This is intentionally as thin as possible: it exists purely so
 * the prompt isn't left with a hole, not as a real styling decision. Every
 * real decision (pose, expression, hairstyle rendering, body language,
 * environment/background, and how any of it should look flattering for
 * this occasion and this person) is made by the vision agent, which
 * genuinely looks at the photo, the look, and the occasion — never by a
 * fixed template or keyword match here. Do not add occasion- or
 * gender-specific branching to this function; that reasoning belongs to
 * the agent, which can actually see the person and the context.
 */
function buildMinimalPoseFallback(): string {
  return "Compose this as one natural, well-lit, coherent photograph appropriate to the occasion and outfit.";
}

function buildLookEditPrompt(
  look: LookRecommendation,
  profile: SkinTuneProfile,
  context: OccasionContext,
  addendum: StylingAddendum | null,
): string {
  const occText = `${context.occasion || ""} ${profile.occasion || ""} ${look.note || ""} ${look.title || ""}`.toLowerCase();
  const isGarba = occText.includes("garba") || occText.includes("navratri") || occText.includes("dandiya");

  const parts = [
    `This is a photo of a real specific person. The ONLY thing that must never change is WHO this person is: their face, facial structure, facial features, and skin tone must stay recognizably this exact same person. Everything else — hairstyle, expression, pose, body language, clothing, makeup, background — is yours to change as much as needed to produce the best possible result. Preserving identity is not the same as preserving the original photo; you are re-styling this person for a new shoot, not lightly editing their selfie.`,
    "The face must be seamlessly and naturally part of the new photo — matching the new lighting, angle, and skin tone rendering of the rest of the scene. It must never look like a face cut out and pasted onto a different body or pose; the neck, jaw, hairline, and shoulders must blend continuously into the body below with consistent lighting and perspective, as if this is one single photograph taken in one moment, not a composite.",
    // Head-to-toe full-length framing mandate
    "COMPOSITION & FRAMING: Strictly compose this as a full-length, head-to-toe fashion editorial photograph. The entire subject must be completely visible from the crown of their head all the way down to their feet and footwear, grounded naturally in the environment. Do NOT crop at the waist, hips, thighs, or knees; the complete outfit, bottoms, and styled footwear must be fully visible in the image.",
    "The head and face must be sized correctly and naturally for a full-length photograph — proportional to the rest of the body the way a real full-body editorial photo actually looks, not enlarged or close-up-sized like a selfie.",
    `Re-dress and re-style this exact person for a ${context.occasion || "everyday"} setting.`,
    addendum ? "" : buildMinimalPoseFallback(),
    `New outfit: ${look.outfit}`,
    `Colour direction: ${look.outfitColor}`,
    `Footwear: ${look.footwear}. The footwear must be fully and clearly visible on their feet grounded in this head-to-toe shot.`,
    `Jewellery: ${look.jewellery}. The jewellery must tastefully and visibly adorn the subject, harmonizing completely with the outfit and occasion.`,
    `Accessories: ${look.accessories}`,
    isGarba
      ? `CULTURAL OCCASION AUTHENTICITY: This is a traditional Garba / Navratri festival celebration. The outfit MUST be an authentic Indian festive outfit (such as a flared mirror-work chaniya choli or lehenga) with traditional festive jewellery (such as oxidised silver jhumkas) and festive accessories (potli bag). Do NOT render western casual dresses, office blazers, modern western midi dresses, or corporate work totes.`
      : "",
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

/** Splits a "data:image/jpeg;base64,...." data URL into its mime type and raw bytes. */
function decodeDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("photoUrl is not a valid base64 data URL");
  const [, mime, base64] = match;
  return { mime, buffer: Buffer.from(base64, "base64") };
}

/**
 * Structured output of writeStylingAddendum() — see its doc comment. Split
 * into discrete fields (rather than one free-text paragraph) specifically
 * to stop the 5 parallel per-look calls from converging on similarly-worded
 * "confident, natural expression" prose: forcing the model to commit to a
 * specific value per field (not just "a mood") produces more concretely
 * different results, and lets buildLookEditPrompt() weight each aspect
 * (hairstyle rendering in particular) as its own strong instruction instead
 * of one clause buried in a paragraph.
 */
type StylingAddendum = {
  expression: string;
  headAndCameraAngle: string;
  bodyLanguage: string;
  hairstyleRendering: string;
  fitNotes: string;
  environmentAndSetting: string;
  flatteringDirection: string;
};

const STYLING_ADDENDUM_JSON_SCHEMA = {
  type: "object",
  properties: {
    expression: { type: "string", description: "The specific facial expression for this shot — concrete, not generic (e.g. 'a bright open laugh, eyes crinkled' not 'confident expression')." },
    headAndCameraAngle: { type: "string", description: "Full-length camera height and angle capturing the complete figure from head to shoes grounded on the floor." },
    bodyLanguage: { type: "string", description: "How the full body, shoulders, hands, and feet in styled footwear are positioned — natural full-body standing or seated posture." },
    hairstyleRendering: { type: "string", description: "How the new hairstyle should actually look on this person's real head/face shape, hair length, and texture as seen in the photo — must describe a hairstyle that is visibly different from what appears in the input photo, matching the look's requested hairstyle." },
    fitNotes: { type: "string", description: "1-2 sentences on how the outfit should fit this person's actual visible proportions/build/shoulder width from the photo." },
    environmentAndSetting: { type: "string", description: "A specific background/setting/lighting that genuinely fits this occasion and this look's mood — reasoned freshly for this request, not a stock choice." },
    flatteringDirection: { type: "string", description: "1-2 sentences of concrete, non-generic direction on what will make THIS specific person look genuinely great in THIS specific look and occasion — based on what you can actually see in their photo (their features, coloring, the outfit's cut and color), not a generic 'confident and radiant' line reused across requests." },
  },
  required: ["expression", "headAndCameraAngle", "bodyLanguage", "hairstyleRendering", "fitNotes", "environmentAndSetting", "flatteringDirection"],
  additionalProperties: false,
} as const;

/**
 * Prompt-writing agent — the PRIMARY decision-maker for this look's pose,
 * facial expression, hairstyle rendering, and body language. A GPT-4o
 * vision call that actually looks at the user's real photo (their real face
 * shape, features, apparent build, framing) plus the look's styling data,
 * and decides what pose, expression, and hairstyle rendering would
 * genuinely look natural and flattering ON THIS SPECIFIC FACE for this
 * specific look — not a lookup from a fixed set of mood keywords.
 *
 * History of this function (do not regress to earlier approaches — both
 * were tried and failed in production):
 * 1. A keyword-matched template picking a pose "family" from the look's
 *    title/category text — too generic, expressions barely changed.
 * 2. This function as free-form prose (3-5 sentences) — an improvement,
 *    but real production batches still came back with near-identical
 *    expressions/poses across all 5 looks AND near-identical, barely-changed
 *    hairstyles across different users entirely. Two causes: (a) the 5
 *    parallel per-look calls have no visibility into each other, so they
 *    independently converge on the same "safe" photographer-cliché answer
 *    regardless of vibe; (b) free prose gives the model room to write
 *    something plausible-sounding without committing to a genuinely
 *    different value, and hairstyle specifically kept losing to the
 *    identity-preservation instructions in the final edit prompt.
 * 3. Current fix (this version): structured JSON output with discrete
 *    required fields (forces commitment to specific values instead of
 *    vague prose), explicit sibling-look vibe awareness (told what the
 *    OTHER looks in this batch already used, and instructed to actively
 *    avoid repeating them), and an explicit, forceful hairstyle-rendering
 *    field paired with a matching forceful instruction in
 *    buildLookEditPrompt() that clarifies changing hairstyle does NOT
 *    violate identity preservation.
 * 4. Further fix: removed the last hardcoded pieces from generate-image.ts —
 *    a fixed pose/environment template string and 3 fixed gender-branched
 *    "flattering" paragraphs that used to sit in buildLookEditPrompt()
 *    regardless of what this agent decided. Now environment/setting and
 *    "what will genuinely look best on this person" are additional
 *    required fields on THIS agent's own output (environmentAndSetting,
 *    flatteringDirection) — reasoned fresh per request from the actual
 *    photo, look, and occasion, with pronouns passed only as context for
 *    tone, never branched into a fixed template. Nothing about pose,
 *    expression, hairstyle, environment, or "what looks good on this
 *    person" should ever be decided by a fixed string in this file again —
 *    if a future change needs a new dimension of styling decision, add a
 *    field to StylingAddendum and this prompt, not a new template function.
 *
 * Deliberately does NOT get to decide identity POLICY — the one mandatory,
 * non-negotiable rule (keep the same face/identity, seamlessly blended, not
 * pasted-looking) is always injected by buildLookEditPrompt() regardless of
 * what this agent returns, so a malformed or oddly-worded agent response
 * can only add nuance, never weaken or drop that one constraint. If this
 * call fails for any reason, the caller falls back to
 * buildMinimalPoseFallback() — a single neutral line, not a styling
 * decision — rather than failing the whole request.
 */
async function writeStylingAddendum(
  openai: ReturnType<typeof getOpenAIClient>,
  look: LookRecommendation,
  profile: SkinTuneProfile,
  context: OccasionContext,
  photoUrl: string,
  siblingVibes: string[],
): Promise<StylingAddendum | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: RECOMMENDATION_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a fashion photographer and social-media stylist directing a full-body photo shoot — capturing the person in a full-length, head-to-toe shot showing the complete outfit down to the footwear and feet, while keeping the photo looking like a genuine, spontaneously captured moment, never a stiff studio ID photo and never a face that looks pasted onto a different pose. The framing must show the complete body head-to-toe so that the entire outfit, footwear, and jewellery are all visible in the frame. You are shown a real person's actual photo and a complete-look recommendation for them. Your job is to genuinely study THIS person's face — their natural resting expression, face shape, features, coloring, and the vibe they already give off in the photo — and decide, like a photographer directing a real shoot, EVERY creative choice for this shot from scratch: facial expression, full-length head/camera angle, body language, hairstyle rendering, background/setting/lighting, and what will genuinely make this specific person look their best in this specific look and occasion. Nothing here should be a generic, reusable default — reason about this actual face, this actual outfit, and this actual occasion together, and commit to specific, concrete choices ('a bright open laugh with eyes crinkled, golden-hour light from camera-left' is useful, 'a confident expression, nice lighting' is not). The environment/setting must genuinely suit the occasion (e.g. a wedding calls for a different setting than a casual coffee run) — decide this fresh each time, don't default to the same generic backdrop. The ONLY thing that must stay the same as the input photo is who this person is (face/identity) — hairstyle, expression, pose, and setting are all expected and encouraged to change as much as suits the look; changing hair does not break identity. If you're told what expressions/vibes other looks in this same shoot already used, you MUST pick something genuinely different from all of them — repeating a similar expression, pose, or setting across looks is a failure. The person's stated pronouns are given only as context for natural tone, not as a lookup into a fixed set of phrases — write your own specific reasoning for this specific person. Never comment on attractiveness, body flaws, or anything that could read as a judgment — this is purely practical photography/styling direction. Output must be valid JSON matching the given schema exactly.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Look to render on this person: "${look.title}" — ${look.note} Outfit "${look.outfit}" (${look.outfitColor}), footwear "${look.footwear}", jewellery "${look.jewellery}", hairstyle "${look.hairstyle}", makeup "${look.makeup}", accessories "${look.accessories}". Why this look was chosen: ${look.reasoning.join(" ")}${look.vibe ? ` This look's intended vibe: "${look.vibe}".` : ""}${look.personaEnergy ? ` Photographer's energy brief for this look: ${look.personaEnergy}` : ""} Occasion: ${context.occasion || "everyday"}.${context.details ? ` Additional context: ${context.details}` : ""} Person's stated pronouns: ${profile.pronouns || "not specified"}, build: ${profile.bodyBuild || "not specified"}, fit preference: ${profile.fit || "not specified"}.${siblingVibes.length ? ` This person is getting ${siblingVibes.length + 1} looks generated in this same shoot. The OTHER looks' vibes are: ${siblingVibes.join(", ")}. Your expression, pose, body language, and setting for THIS look must be clearly and obviously different from all of those — do not converge on a similar "safe" default.` : ""} Study their actual face in the photo and direct this exact full-length head-to-toe shoot from scratch showing the complete outfit down to the footwear on their feet and jewellery, honoring the vibe/energy brief above but translated onto this specific real face — do not just restate the brief, show how it looks on THIS person. Decide a setting/background genuinely fitting this occasion, describe exactly how the new hairstyle ("${look.hairstyle}") should render on their actual head shape and hair as seen in the photo, and give concrete direction on what will make this exact person look genuinely great in this exact look.`,
            },
            { type: "image_url", image_url: { url: photoUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "styling_addendum",
          strict: true,
          schema: STYLING_ADDENDUM_JSON_SCHEMA,
        },
      },
      // No `temperature` override — see analyze-photo.ts's comment on the
      // same param; gpt-5.5 only supports the default value.
      // max_completion_tokens, not max_tokens — see analyze-photo.ts's
      // comment on the same param; gpt-5.5 rejects the older name.
      //
      // Raised from 500 to 1200 — this was a confirmed real bug on
      // try-on.ts's equivalent call (writeTryOnAddendum): gpt-5.5's
      // internal reasoning tokens appear to count against this same
      // budget, so a low limit risked the visible completion coming back
      // empty with NO log at all (the `if (!raw) return null` below used
      // to fail completely silently). Applying the same fix here
      // preventatively even though this exact route wasn't the one where
      // the empty-response symptom was directly observed.
      max_completion_tokens: 1200,
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      // Previously silent — see the identical fix and full explanation on
      // try-on.ts's writeStylingAddendum for why this now logs instead of
      // returning null with no trace at all.
      logger.warn(
        { lookId: look.id, finishReason: completion.choices[0]?.finish_reason },
        "Styling addendum agent returned empty content; continuing without it",
      );
      return null;
    }
    const addendum = JSON.parse(raw) as StylingAddendum;
    logger.info({ lookId: look.id, stylingAddendum: addendum }, "Styling addendum generated");
    return addendum;
  } catch (err) {
    logger.warn({ err, lookId: look.id }, "Styling addendum agent failed; continuing without it");
    return null;
  }
}

/**
 * Primary path: edit the user's own uploaded photo via the Responses API's
 * image_generation tool. Verified (against a real selfie) to preserve
 * identity — face, hairline, facial hair pattern, even a facial mole — far
 * better than the classic images.edit endpoint below. detail: 'original' on
 * the input image skips any downscaling before the model sees the photo;
 * quality: 'high' on the output tool improves fidelity further.
 *
 * Some mainline models require the OpenAI organization to be "Verified"
 * (platform.openai.com -> Settings -> Organization) to be used via the
 * Responses API with the image_generation tool — confirmed live that
 * `gpt-4o` specifically hits a 403 for this on an otherwise-working
 * account/key, while `gpt-5.5` (this file's RECOMMENDATION_MODEL default,
 * see openai-client.ts) does not require verification and works
 * immediately. If that changes, or a 403 shows up again, the caller falls
 * back to editViaImagesEdit below rather than failing the whole request —
 * but check which model is actually configured first, since this has now
 * been a real, verified model-specific gap, not just an account state.
 */
async function editViaResponsesApi(
  openai: ReturnType<typeof getOpenAIClient>,
  prompt: string,
  photoUrl: string,
): Promise<string> {
  const response = await openai.responses.create({
    model: RECOMMENDATION_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: photoUrl, detail: "original" },
        ],
      },
    ],
    tools: [
      {
        type: "image_generation",
        model: IMAGE_MODEL,
        quality: "high",
        moderation: "low",
        size: "1024x1536",
        output_format: "jpeg",
        output_compression: 90,
      },
    ],
  });

  const imageCall = response.output.find(
    (item): item is Extract<typeof item, { type: "image_generation_call" }> =>
      item.type === "image_generation_call",
  );
  if (!imageCall?.result) {
    throw new Error(
      `Responses API image generation returned no result (status: ${imageCall?.status ?? "no call found"})`,
    );
  }
  return `data:image/jpeg;base64,${imageCall.result}`;
}

/**
 * Fallback path: the classic images.edit endpoint. Weaker identity
 * preservation than the Responses API path above (confirmed against a real
 * selfie — this alone lost the user's face in production before the
 * Responses API migration), but doesn't require org verification, so it
 * keeps the feature working while that's pending. input_fidelity is
 * intentionally NOT set here either: gpt-image-2 rejects it with a 400
 * ("does not support the 'input_fidelity' parameter") on both this and the
 * Responses API path — confirmed against the live API.
 */
async function editViaImagesEdit(
  openai: ReturnType<typeof getOpenAIClient>,
  prompt: string,
  photoUrl: string,
): Promise<string> {
  const { mime, buffer } = decodeDataUrl(photoUrl);
  const ext = mime.split("/")[1] ?? "jpg";
  const file = await toFile(buffer, `photo.${ext}`, { type: mime });
  const result = await openai.images.edit({
    model: IMAGE_MODEL,
    image: file,
    prompt,
    size: "1024x1536",
    quality: "high",
    output_format: "jpeg",
    output_compression: 90,
    n: 1,
  });
  const image = result.data?.[0];
  const imageUrl = image?.b64_json ? `data:image/jpeg;base64,${image.b64_json}` : image?.url;
  if (!imageUrl) throw new Error("images.edit returned no image");
  return imageUrl;
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parsed = GenerateImageRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
    }

    const { look, profile, context, photoUrl, siblingVibes } = parsed.data;

    const openai = getOpenAIClient();
    const stylingAddendum = photoUrl
      ? await writeStylingAddendum(openai, look, profile, context, photoUrl, siblingVibes ?? [])
      : null;
    const prompt = buildLookEditPrompt(look, profile, context, stylingAddendum);

    let imageUrl: string | undefined;

    if (photoUrl) {
      try {
        imageUrl = await editViaResponsesApi(openai, prompt, photoUrl);
      } catch (responsesApiErr) {
        logger.warn(
          { err: responsesApiErr, lookId: look.id },
          "Responses API image edit failed, falling back to images.edit",
        );
        imageUrl = await editViaImagesEdit(openai, prompt, photoUrl);
      }
    } else {
      const result = await openai.images.generate({
        model: IMAGE_MODEL,
        prompt,
        size: "1024x1536",
        quality: "high",
        moderation: "low",
        output_format: "jpeg",
        output_compression: 90,
        n: 1,
      });
      const image = result.data?.[0];
      imageUrl = image?.b64_json ? `data:image/jpeg;base64,${image.b64_json}` : image?.url;
    }

    if (!imageUrl) throw new Error("Image provider returned no image");

    const data = GenerateImageResponseSchema.parse({ look: { ...look, imageUrl } });
    return NextResponse.json(data);
  } catch (err) {
    return safeErrorResponse(err, "Failed to generate look image", 502);
  }
}
