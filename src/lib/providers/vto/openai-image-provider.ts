import { toFile } from "openai";
import { getOpenAIClient, IMAGE_MODEL, RECOMMENDATION_MODEL } from "../../openai-client";
import { logger } from "../../logger";
import type { AvatarGenerationInput, TryOnGenerationInput, VtoProvider } from "./vto-provider";
import { buildAvatarPrompt } from "../../prompts/avatar-prompt";
import { buildTryOnPrompt, writeTryOnAddendum } from "../../prompts/try-on-prompt";

function decodeDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Not a valid base64 data URL");
  const [, mime, base64] = match;
  return { mime, buffer: Buffer.from(base64, "base64") };
}

export class OpenAiImageProvider implements VtoProvider {
  readonly name = "openai-image";

  async generateAvatar({ photoUrl, bodyBuild }: AvatarGenerationInput): Promise<string> {
    const openai = getOpenAIClient();
    const prompt = buildAvatarPrompt({ bodyBuild });

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
          output_compression: 98,
        },
      ],
    });

    const imageCall = response.output.find(
      (item): item is Extract<typeof item, { type: "image_generation_call" }> =>
        item.type === "image_generation_call",
    );
    if (imageCall?.result) return `data:image/jpeg;base64,${imageCall.result}`;

    logger.warn(
      { status: imageCall?.status ?? "no call found" },
      "Responses API avatar creation failed, falling back to images.edit",
    );
    const { mime, buffer } = decodeDataUrl(photoUrl);
    const file = await toFile(buffer, `photo.${mime.split("/")[1] ?? "jpg"}`, { type: mime });
    const result = await openai.images.edit({
      model: IMAGE_MODEL,
      image: file,
      prompt,
      size: "1024x1536",
      quality: "high",
      output_format: "jpeg",
      output_compression: 98,
      n: 1,
    });
    const image = result.data?.[0];
    const imageUrl = image?.b64_json ? `data:image/jpeg;base64,${image.b64_json}` : image?.url;
    if (!imageUrl) throw new Error("images.edit avatar creation returned no image");
    return imageUrl;
  }

  async generateTryOn({ avatarImageUrl, garmentImageUrl, context }: TryOnGenerationInput): Promise<string> {
    const openai = getOpenAIClient();
    const addendum = await writeTryOnAddendum(openai, avatarImageUrl, garmentImageUrl, context ?? {});
    const prompt = buildTryOnPrompt(context ?? {}, addendum);

    try {
      const response = await openai.responses.create({
        model: RECOMMENDATION_MODEL,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: avatarImageUrl, detail: "original" },
              { type: "input_image", image_url: garmentImageUrl, detail: "original" },
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
            output_compression: 98,
          },
        ],
      });
      const imageCall = response.output.find(
        (item): item is Extract<typeof item, { type: "image_generation_call" }> =>
          item.type === "image_generation_call",
      );
      if (imageCall?.result) return `data:image/jpeg;base64,${imageCall.result}`;
      throw new Error(`Responses API try-on returned no result (status: ${imageCall?.status ?? "no call found"})`);
    } catch (responsesApiErr) {
      logger.warn({ err: responsesApiErr }, "Responses API try-on failed, falling back to images.edit");
      const person = decodeDataUrl(avatarImageUrl);
      const personFile = await toFile(person.buffer, `photo.${person.mime.split("/")[1] ?? "jpg"}`, { type: person.mime });

      const garmentRes = await fetch(garmentImageUrl);
      if (!garmentRes.ok) throw new Error(`Failed to fetch garment image: ${garmentRes.status}`);
      const garmentBuffer = Buffer.from(await garmentRes.arrayBuffer());
      const garmentMime = garmentRes.headers.get("content-type") || "image/jpeg";
      const garmentFile = await toFile(garmentBuffer, `dress.${garmentMime.split("/")[1] ?? "jpg"}`, { type: garmentMime });

      const result = await openai.images.edit({
        model: IMAGE_MODEL,
        image: [personFile, garmentFile],
        prompt,
        size: "1024x1536",
        quality: "high",
        output_format: "jpeg",
        output_compression: 98,
        n: 1,
      });
      const image = result.data?.[0];
      const imageUrl = image?.b64_json ? `data:image/jpeg;base64,${image.b64_json}` : image?.url;
      if (!imageUrl) throw new Error("images.edit try-on returned no image");
      return imageUrl;
    }
  }
}
