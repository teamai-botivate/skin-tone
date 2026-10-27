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
import { getStylingContext } from "@/lib/styling-context";
import {
  buildLookEditPrompt,
  type OccasionContext,
  type StylingAddendum,
} from "@/lib/image-prompt";

/** Splits a "data:image/jpeg;base64,...." data URL into its mime type and raw bytes. */
function decodeDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("photoUrl is not a valid base64 data URL");
  const [, mime, base64] = match;
  return { mime, buffer: Buffer.from(base64, "base64") };
}

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
    const ctx = getStylingContext(profile);
    const demographicLabel = ctx.isBoy
      ? "Young Boy Child"
      : ctx.isGirl
        ? "Young Girl Child"
        : ctx.isKids
          ? "Young Child (unspecified gender)"
          : ctx.isMan
            ? "Adult Man"
            : "Adult Woman";

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
              text: `Subject Demographic: ${demographicLabel} (Age group: ${profile.ageGroup || "child"}). Look to render on this person: "${look.title}" — ${look.note} Outfit "${look.outfit}" (${look.outfitColor}), footwear "${look.footwear}", jewellery "${look.jewellery}", hairstyle "${look.hairstyle}", makeup "${look.makeup}", accessories "${look.accessories}". Why this look was chosen: ${look.reasoning.join(" ")}${look.vibe ? ` This look's intended vibe: "${look.vibe}".` : ""}${look.personaEnergy ? ` Photographer's energy brief for this look: ${look.personaEnergy}` : ""} Occasion: ${context.occasion || "everyday"}.${context.details ? ` Additional context: ${context.details}` : ""} Person's stated pronouns: ${profile.pronouns || "not specified"}, build: ${profile.bodyBuild || "not specified"}, fit preference: ${profile.fit || "not specified"}.${siblingVibes.length ? ` This person is getting ${siblingVibes.length + 1} looks generated in this same shoot. The OTHER looks' vibes are: ${siblingVibes.join(", ")}. Your expression, pose, body language, and setting for THIS look must be clearly and obviously different from all of those — do not converge on a similar "safe" default.` : ""} Study their actual face in the photo and direct this exact full-length head-to-toe shoot from scratch showing the complete outfit down to the footwear on their feet and jewellery, honoring the vibe/energy brief above but translated onto this specific real face — do not just restate the brief, show how it looks on THIS person. Decide a setting/background genuinely fitting this occasion (for vacation or beach settings, choose a bright, breezy resort or coastal environment; strictly avoid formal office or heavy ethnic backdrops unless explicitly fitting), describe exactly how the new hairstyle ("${look.hairstyle}") should render on their actual head shape and hair as seen in the photo, and give concrete direction on what will make this exact person look genuinely great in this exact look.`,
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

import { executePaidOperation, CREDIT_COSTS } from "@/lib/credits";

export async function POST(req: Request) {
  return await executePaidOperation(
    req,
    {
      cost: CREDIT_COSTS.GENERATE_IMAGE,
      operationType: "generate_image",
      schema: GenerateImageRequestSchema,
      getOperationId: (data) => data.look.id,
      getDescription: (data) => `Visual generation for ${data.look.title}`,
    },
    async (data) => {
      const { look, profile, context, photoUrl, siblingVibes } = data;

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

      return GenerateImageResponseSchema.parse({ look: { ...look, imageUrl } });
    },
  );
}


