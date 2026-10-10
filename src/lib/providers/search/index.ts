import { OpenAiWebSearchProvider } from "./openai-web-search-provider";
import { LegacyTavilySearchProvider } from "./legacy-tavily-provider";
import type { SearchProvider } from "./search-provider";

export type { SearchProvider, SearchProviderResult, SearchProductCandidate, SearchPageResult } from "./search-provider";

let cached: SearchProvider | null = null;

export function getSearchProvider(): SearchProvider {
  if (cached) return cached;
  const configured = (process.env["SEARCH_PROVIDER"] ?? "tavily").toLowerCase();
  cached = configured === "openai" ? new OpenAiWebSearchProvider() : new LegacyTavilySearchProvider();
  return cached;
}
