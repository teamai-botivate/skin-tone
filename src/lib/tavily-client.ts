import { logger } from "./logger";

if (typeof window !== "undefined") {
  throw new Error("tavily-client module can only be executed on the server.");
}

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

export type TavilyImage = {
  url: string;
  title?: string;
  description?: string;
};

export type TavilyResult = {
  url: string;
  title: string;
  content: string;
};

export type TavilySearchResponse = {
  images: TavilyImage[];
  results: TavilyResult[];
};

export class TavilySearchError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string = "",
  ) {
    super(`Tavily search failed with status ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "TavilySearchError";
  }
}

function cleanEnv(val?: string): string {
  if (!val) return "";
  let trimmed = val.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function getTavilyApiKey(): string {
  const rawKey = process.env["TAVILY_API_KEY"];
  const key = cleanEnv(rawKey);
  if (!key) {
    throw new Error(
      "TAVILY_API_KEY is not set. Configure it as a server environment variable " +
        "to enable real-dress web search.",
    );
  }
  return key;
}

export function getTavilyKeyDiagnostics() {
  const rawKey = process.env["TAVILY_API_KEY"];
  const key = cleanEnv(rawKey);
  const isConfigured = Boolean(key);
  const formatValid = isConfigured && (key.startsWith("tvly-") || key.length > 20);

  return {
    isConfigured,
    formatValid,
    keyName: "TAVILY_API_KEY",
  };
}

export async function tavilySearch(
  query: string,
  maxResults: number,
  includeDomains?: string[],
): Promise<TavilySearchResponse> {
  const apiKey = getTavilyApiKey();
  const res = await fetch(TAVILY_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      include_images: true,
      max_results: maxResults,
      ...(includeDomains?.length ? { include_domains: includeDomains } : {}),
    }),
    signal: AbortSignal.timeout(6500),
  });

  if (!res.ok) {
    // Keep Tavily's own reason (e.g. HTTP 432 "exceeds your plan's set usage limit") for diagnostics
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new TavilySearchError(res.status, detail);
  }

  const data = (await res.json()) as {
    images?: Array<{ url: string; title?: string; description?: string } | string>;
    results?: Array<{ url: string; title: string; content: string }>;
  };

  const images: TavilyImage[] = (data.images ?? []).map((img) =>
    typeof img === "string" ? { url: img } : img,
  );
  const results: TavilyResult[] = (data.results ?? []).map((r) => ({
    url: r.url,
    title: r.title,
    content: r.content,
  }));

  logger.debug({ query, imageCount: images.length, resultCount: results.length }, "Tavily search complete");
  return { images, results };
}
