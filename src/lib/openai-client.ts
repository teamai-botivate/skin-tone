import OpenAI from "openai";

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
 */
export function getOpenAIClient(): OpenAI {
  if (client) return client;
  const rawKey =
    process.env["OPENAI_API_KEY"] ||
    process.env["NEXT_PUBLIC_OPENAI_API_KEY"];
  const apiKey = cleanEnv(rawKey);

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Configure it as an environment variable " +
        "to enable AI recommendations and image generation.",
    );
  }
  client = new OpenAI({ apiKey });
  return client;
}

export function getOpenAIKeyDiagnostics() {
  const rawKey =
    process.env["OPENAI_API_KEY"] ||
    process.env["NEXT_PUBLIC_OPENAI_API_KEY"];
  const apiKey = cleanEnv(rawKey);
  const isConfigured = Boolean(apiKey);
  const formatValid = isConfigured && (apiKey.startsWith("sk-") || apiKey.startsWith("sk-proj-"));
  const maskedKey = isConfigured
    ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`
    : undefined;

  return {
    isConfigured,
    formatValid,
    maskedKey,
    model: RECOMMENDATION_MODEL,
    keyName: "OPENAI_API_KEY",
  };
}

export const RECOMMENDATION_MODEL =
  cleanEnv(process.env["OPENAI_TEXT_MODEL"]) ||
  cleanEnv(process.env["NEXT_PUBLIC_OPENAI_TEXT_MODEL"]) ||
  "gpt-4o-mini";

export const IMAGE_MODEL =
  cleanEnv(process.env["OPENAI_IMAGE_MODEL"]) ||
  cleanEnv(process.env["NEXT_PUBLIC_OPENAI_IMAGE_MODEL"]) ||
  "dall-e-3";
