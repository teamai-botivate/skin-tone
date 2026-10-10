import { OpenAiImageProvider } from "./openai-image-provider";
import { FashnVtoProvider } from "./fashn-vto-provider";
import type { VtoProvider } from "./vto-provider";

export type { VtoProvider, AvatarGenerationInput, TryOnGenerationInput } from "./vto-provider";

let cached: VtoProvider | null = null;

export function getVtoProvider(): VtoProvider {
  if (cached) return cached;
  const configured = (process.env["VTO_PROVIDER"] ?? "openai").toLowerCase();
  cached = configured === "fashn" ? new FashnVtoProvider() : new OpenAiImageProvider();
  return cached;
}
