import { NextResponse } from "next/server";
import {
  AnalyzePhotoRequestSchema,
  AnalyzePhotoResponseSchema,
} from "@/lib/skintune-schemas";
import { getOpenAIClient, RECOMMENDATION_MODEL } from "@/lib/openai-client";
import { logger } from "@/lib/logger";
import { z } from "zod";

const SYSTEM_PROMPT = `You are SkinTune's photo-quality and appearance analysis assistant. You are given one photo a user uploaded for styling purposes — most commonly an ordinary phone selfie, not a studio photo.

Be lenient by default. A normal phone selfie — held at arm's length, slightly low or off-centre angle, indoor room lighting, a bit of shadow, everyday framing — is completely normal and should be marked "good". Only flag a real problem when it would genuinely prevent reading the person's coloring: the photo is so dark you can barely make out facial features, so blurred the face is not recognisable, the face is mostly covered or out of frame, or there's an obvious strong beauty filter smoothing/distorting the skin. When in doubt between "good" and a problem, choose "good" — the cost of being too strict (making someone retake a perfectly usable photo) is worse than a slightly imperfect read.

Your job:
1. First, judge whether the photo is usable for styling colour analysis using the lenient standard above. If there's a genuine problem, pick the single most applicable one from this exact set: "low-light" (too dark to make out features, not just dim), "warm-light" (strong yellow/orange indoor tint clearly skewing colour, not just normal warm indoor light), "blurry" (face is not recognisably in focus), "angle" (face is not visible at all, e.g. turned fully away or looking down out of frame — a slightly tilted or low-angle selfie is fine), "filter" (an obvious strong beauty filter is visibly smoothing or altering the face), "occluded" (face is mostly covered by sunglasses, a hand, hair, or is out of frame). Use "good" for everything else, including typical imperfect but usable phone selfies.
2. If the photo is usable (status "good"), estimate, reasoning through each of these as a distinct step rather than guessing a single overall impression:
   - skinTone: this is the OVERTONE — the visible surface colour you can actually see in THIS photo at first glance (a short, respectful descriptive word: "Fair", "Light", "Medium", "Tan", "Deep", "Rich"). Read this fresh from the actual photo's lighting and camera colour balance — mentally correct for any obvious warm/cool tint in the lighting itself before judging the value, so the read reflects the person's real surface tone, not the room's lighting colour. Don't default to a generic middle value like "Medium" out of caution; commit to what the photo actually shows.
   - undertone: "Warm", "Cool", or "Neutral" — this is the subtler underlying cast beneath the surface colour, independent of how light/dark that surface tone is (it stays relatively stable even if the person tans or the surface tone above reads differently). Reason from concrete visual signals actually visible in the photo: a warm undertone shows as yellow/golden/peachy casts, especially visible where skin is thinner (cheeks catching light, under the eyes); a cool undertone shows as pink/rosy/reddish or slightly bluish casts in the same areas; a neutral undertone shows a fairly even balance of both with no cast dominating. Do not just restate the skinTone value in different words — undertone and skinTone are answering two different questions (surface lightness/depth vs. underlying colour cast) and should be reasoned separately, even though they're often reported together.
   - contrast: "Low", "Medium", or "High" — the contrast between the person's hair/eyes and their skin tone.
   - confidence: an integer 0-100 that must genuinely vary with how easy THIS specific photo actually was to read, not cluster around one "safe" number. Reason explicitly about this photo's real signals before picking a number: lighting evenness (even, well-lit face vs. mixed/patchy light or hard shadows across the face), focus sharpness (crisp facial detail vs. soft/slightly-soft focus), how much of the face is clearly visible and at what size in the frame (large, unobstructed, close-to-camera vs. small, partial, or at a distance), and colour-cast clarity (neutral-ish light letting true skin colour show vs. a light tint you have to mentally correct for even though it wasn't strong enough to flag as "warm-light"). A photo that's well-lit, sharp, close, and neutrally lit deserves a high score (90+); a "good" but imperfect photo — slightly soft focus, a bit of mixed lighting, a face partly at an angle or slightly small in frame, a mild colour cast — should genuinely score lower (roughly 60-84) to reflect that real uncertainty, not be rounded up to a generic high number. Do not converge on the same number across different photos — two different "good" photos with different actual quality should get two different confidence scores.
3. If the photo has a genuine problem (status is not "good"), still provide your best-guess skinTone/undertone/contrast (they'll be shown as provisional) but set confidence low (under 60) to reflect the uncertainty.

Never make medical, health, or diagnostic claims. Never comment on attractiveness, body shape, or perceived flaws — this is styling context only, not a judgment. Be supportive and neutral in tone; your only output is the structured fields below, no extra commentary.

Respond with JSON matching exactly this shape:
{"status": "good" | "low-light" | "warm-light" | "blurry" | "angle" | "filter" | "occluded", "skinTone": string, "undertone": string, "contrast": string, "confidence": number}`;

const ModelOutputSchema = z.object({
  status: z.enum(["good", "low-light", "warm-light", "blurry", "angle", "filter", "occluded"]),
  skinTone: z.string(),
  undertone: z.string(),
  contrast: z.string(),
  confidence: z.number(),
});

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parsed = AnalyzePhotoRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
    }

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: RECOMMENDATION_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this photo for styling purposes." },
            { type: "image_url", image_url: { url: parsed.data.photoUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "skintune_photo_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["good", "low-light", "warm-light", "blurry", "angle", "filter", "occluded"],
              },
              skinTone: { type: "string" },
              undertone: { type: "string" },
              contrast: { type: "string" },
              confidence: { type: "integer" },
            },
            required: ["status", "skinTone", "undertone", "contrast", "confidence"],
            additionalProperties: false,
          },
        },
      },
      max_completion_tokens: 1600,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      logger.error(
        { finishReason: completion.choices[0]?.finish_reason },
        "Photo analysis returned no content",
      );
      throw new Error("Model returned no content");
    }

    const modelResult = ModelOutputSchema.parse(JSON.parse(raw));
    const data = AnalyzePhotoResponseSchema.parse(modelResult);
    return NextResponse.json(data);
  } catch (err) {
    logger.error({ err }, "Failed to analyze photo");
    return NextResponse.json(
      {
        error: "Failed to analyze photo",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
