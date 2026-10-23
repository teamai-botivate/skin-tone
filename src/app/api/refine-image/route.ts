import { NextResponse } from "next/server";
import { toFile } from "openai";
import {
  RefineImageRequestSchema,
  RefineImageResponseSchema,
  type LookRecommendation,
} from "@/lib/skintune-schemas";
import { getOpenAIClient, IMAGE_MODEL, RECOMMENDATION_MODEL } from "@/lib/openai-client";
import { logger } from "@/lib/logger";
import { safeErrorResponse } from "@/lib/safe-error";

function buildRefinementPrompt(look: LookRecommendation, customization: string, hasOriginalPhoto: boolean): string {
  const parts = [
    hasOriginalPhoto
      ? "You are shown two images: the person's original photo (for face/identity reference) and an already-generated styled photo of them in a complete look. Keep the exact same face and identity as the original photo."
      : "You are shown an already-generated styled photo of a real person in a complete look. Keep the exact same face and identity as shown.",
    "COMPOSITION: Maintain full-length, head-to-toe framing showing the complete outfit and footwear on the feet.",
    `Apply this specific correction requested by the user: ${customization}`,
    `Keep everything else about the look the same unless the correction implies otherwise: outfit "${look.outfit}" in ${look.outfitColor}, footwear "${look.footwear}", jewellery "${look.jewellery}", hairstyle "${look.hairstyle}", makeup "${look.makeup}", accessories "${look.accessories}".`,
    "The outfit must still fit this person's actual body correctly — proper shoulder line, sleeve and hem length, and natural fabric drape for their build, never pasted-on or generic.",
    "Do not change the person's face, facial structure, or identity. Do not start over from scratch — this is a targeted refinement of the existing styled photo, not a new photo.",
    "Natural lighting, tasteful and supportive, no beauty filter, no visible text or watermark. Professional editorial photo quality.",
  ];
  return parts.filter(Boolean).join(" ");
}

function decodeDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Not a valid base64 data URL");
  const [, mime, base64] = match;
  return { mime, buffer: Buffer.from(base64, "base64") };
}

async function refineViaResponsesApi(
  openai: ReturnType<typeof getOpenAIClient>,
  prompt: string,
  generatedImageUrl: string,
  originalPhotoUrl: string | undefined,
): Promise<string> {
  const imageInputs = originalPhotoUrl
    ? [
      { type: "input_image" as const, image_url: originalPhotoUrl, detail: "original" as const },
      { type: "input_image" as const, image_url: generatedImageUrl, detail: "original" as const },
    ]
    : [{ type: "input_image" as const, image_url: generatedImageUrl, detail: "original" as const }];

  const response = await openai.responses.create({
    model: RECOMMENDATION_MODEL,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: prompt }, ...imageInputs],
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
      `Responses API refinement returned no result (status: ${imageCall?.status ?? "no call found"})`,
    );
  }
  return `data:image/jpeg;base64,${imageCall.result}`;
}

async function refineViaImagesEdit(
  openai: ReturnType<typeof getOpenAIClient>,
  prompt: string,
  generatedImageUrl: string,
  originalPhotoUrl: string | undefined,
): Promise<string> {
  const generated = decodeDataUrl(generatedImageUrl);
  const generatedFile = await toFile(generated.buffer, `look.${generated.mime.split("/")[1] ?? "jpg"}`, {
    type: generated.mime,
  });

  const images = [generatedFile];
  if (originalPhotoUrl) {
    const original = decodeDataUrl(originalPhotoUrl);
    images.push(
      await toFile(original.buffer, `photo.${original.mime.split("/")[1] ?? "jpg"}`, { type: original.mime }),
    );
  }

  const result = await openai.images.edit({
    model: IMAGE_MODEL,
    image: images,
    prompt,
    size: "1024x1536",
    quality: "high",
    output_format: "jpeg",
    output_compression: 90,
    n: 1,
  });
  const image = result.data?.[0];
  const imageUrl = image?.b64_json ? `data:image/jpeg;base64,${image.b64_json}` : image?.url;
  if (!imageUrl) throw new Error("images.edit refinement returned no image");
  return imageUrl;
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parsed = RefineImageRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
    }

    const { look, photoUrl, customization } = parsed.data;

    if (!look.imageUrl || look.imageUrl.startsWith("/replace-with-generated")) {
      return NextResponse.json({ error: "This look has no generated image yet to refine." }, { status: 400 });
    }

    const openai = getOpenAIClient();
    const prompt = buildRefinementPrompt(look, customization, Boolean(photoUrl));

    let imageUrl: string;
    try {
      imageUrl = await refineViaResponsesApi(openai, prompt, look.imageUrl, photoUrl);
    } catch (responsesApiErr) {
      logger.warn(
        { err: responsesApiErr, lookId: look.id },
        "Responses API refinement failed, falling back to images.edit",
      );
      imageUrl = await refineViaImagesEdit(openai, prompt, look.imageUrl, photoUrl);
    }

    const data = RefineImageResponseSchema.parse({ look: { ...look, imageUrl } });
    return NextResponse.json(data);
  } catch (err) {
    return safeErrorResponse(err, "Failed to refine look image", 502);
  }
}
