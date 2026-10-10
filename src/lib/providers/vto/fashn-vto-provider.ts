import { logger } from "../../logger";
import type { AvatarGenerationInput, TryOnGenerationInput, VtoProvider } from "./vto-provider";

const FASHN_BASE_URL = "https://api.fashn.ai";

function getFashnApiKey(): string {
  const key = process.env["FASHN_API_KEY"];
  if (!key) {
    throw new Error(
      "FASHN_API_KEY is not set. Configure it as an environment variable to use VTO_PROVIDER=fashn.",
    );
  }
  return key;
}

type FashnRunResponse = { id: string; error: string | null };
type FashnStatusResponse =
  | { id: string; status: "starting" | "in_queue" | "processing"; output: null; error: null }
  | { id: string; status: "completed"; output: unknown; error: null }
  | { id: string; status: "failed"; output: null; error: { name: string; message: string } };

async function fashnRun(modelName: string, inputs: Record<string, unknown>): Promise<string> {
  const apiKey = getFashnApiKey();
  const res = await fetch(`${FASHN_BASE_URL}/v1/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model_name: modelName, inputs }),
  });
  const body = (await res.json().catch(() => null)) as (FashnRunResponse & { error?: string; message?: string }) | null;
  if (!res.ok || !body?.id) {
    throw new Error(`FASHN ${modelName} run failed: ${res.status} ${body?.message ?? body?.error ?? "unknown error"}`);
  }
  return body.id;
}

async function fashnPollUntilDone(id: string): Promise<unknown> {
  const apiKey = getFashnApiKey();
  const deadline = Date.now() + 2 * 60 * 1000;
  while (Date.now() < deadline) {
    const res = await fetch(`${FASHN_BASE_URL}/v1/status/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = (await res.json().catch(() => null)) as FashnStatusResponse | null;
    if (!res.ok || !body) {
      throw new Error(`FASHN status poll failed: ${res.status}`);
    }
    if (body.status === "completed") return body.output;
    if (body.status === "failed") {
      throw new Error(`FASHN prediction failed: ${body.error?.name ?? "UnknownError"} — ${body.error?.message ?? "no message"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`FASHN prediction ${id} did not complete within 2 minutes`);
}

export class FashnVtoProvider implements VtoProvider {
  readonly name = "fashn";

  async generateAvatar({ photoUrl }: AvatarGenerationInput): Promise<string> {
    const id = await fashnRun("face-to-model", {
      face_image: photoUrl,
      aspect_ratio: "3:4",
      resolution: "1k",
      output_format: "jpeg",
    });
    const output = await fashnPollUntilDone(id);
    const images = (output as { images?: string[] } | null)?.images;
    const imageUrl = images?.[0];
    if (!imageUrl) {
      logger.error({ output }, "FASHN face-to-model completed but returned no image");
      throw new Error("FASHN face-to-model returned no image");
    }
    return imageUrl;
  }

  async generateTryOn({ avatarImageUrl, garmentImageUrl }: TryOnGenerationInput): Promise<string> {
    const id = await fashnRun("tryon-max", {
      model_image: avatarImageUrl,
      product_image: garmentImageUrl,
      resolution: "1k",
      output_format: "jpeg",
    });
    const output = await fashnPollUntilDone(id);
    const images = output as string[] | null;
    const imageUrl = images?.[0];
    if (!imageUrl) {
      logger.error({ output }, "FASHN tryon-max completed but returned no image");
      throw new Error("FASHN tryon-max returned no image");
    }
    return imageUrl;
  }
}
