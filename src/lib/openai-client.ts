import OpenAI from "openai";

if (typeof window !== "undefined") {
  throw new Error("openai-client module can only be executed on the server.");
}

let client: OpenAI | null = null;

function cleanEnv(val?: string): string {
  if (!val) return "";
  let trimmed = val.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Lazily-constructed singleton OpenAI client.
 * Strictly reads server-side OPENAI_API_KEY.
 */
/**
 * Per-request options forwarded to every provider call. The background job
 * runner passes an AbortSignal so one slow call can never outlive its step
 * deadline (or the serverless execution window); the HTTP route passes none.
 */
export interface OpenAIRequestOptions {
  signal?: AbortSignal;
  timeout?: number;
}

export function getOpenAIClient(): OpenAI {
  if (client) return client;
  const rawKey = process.env["OPENAI_API_KEY"];
  const apiKey = cleanEnv(rawKey);

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Configure it as a server environment variable " +
      "to enable AI recommendations and image generation.",
    );
  }
  client = new OpenAI({ apiKey });
  return client;
}

export function getOpenAIKeyDiagnostics() {
  const rawKey = process.env["OPENAI_API_KEY"];
  const apiKey = cleanEnv(rawKey);
  const isConfigured = Boolean(apiKey);
  const formatValid = isConfigured && (apiKey.startsWith("sk-") || apiKey.startsWith("sk-proj-"));

  return {
    isConfigured,
    formatValid,
    model: RECOMMENDATION_MODEL,
    keyName: "OPENAI_API_KEY",
  };
}

function getValidTextModel(): string {
  const model = cleanEnv(process.env["OPENAI_TEXT_MODEL"]);
  if (model && !model.includes("5") && (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3"))) {
    return model;
  }
  return "gpt-4o-mini";
}

export const RECOMMENDATION_MODEL = getValidTextModel();

function getValidImageModel(): string {
  const model = cleanEnv(process.env["OPENAI_IMAGE_MODEL"]);
  if (
    model &&
    !model.includes("flare") &&
    !model.includes("2.5") &&
    model !== "dall-e-3" &&
    (model.startsWith("gpt-image-") || model === "chatgpt-image-latest")
  ) {
    return model;
  }
  return "gpt-image-2";
}

export const IMAGE_MODEL = getValidImageModel();
