import { NextResponse } from "next/server";
import { getOpenAIKeyDiagnostics } from "@/lib/openai-client";
import { getTavilyKeyDiagnostics } from "@/lib/tavily-client";

export async function GET() {
  const openai = getOpenAIKeyDiagnostics();
  const tavily = getTavilyKeyDiagnostics();

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    keys: {
      openai: {
        configured: openai.isConfigured,
        validFormat: openai.formatValid,
        maskedKey: openai.maskedKey,
        model: openai.model,
      },
      tavily: {
        configured: tavily.isConfigured,
        validFormat: tavily.formatValid,
        maskedKey: tavily.maskedKey,
      },
    },
  });
}
