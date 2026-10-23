import { tavilySearch } from "../../tavily-client";
import { OpenAiWebSearchProvider } from "./openai-web-search-provider";
import { logger } from "../../logger";
import type { SearchProvider, SearchProviderResult, SearchProductCandidate, SearchPageResult } from "./search-provider";

export class LegacyTavilySearchProvider implements SearchProvider {
  readonly name = "tavily";
  private fallbackProvider = new OpenAiWebSearchProvider();

  async search(query: string, maxResults: number, includeDomains?: string[]): Promise<SearchProviderResult> {
    try {
      const { images, results } = await tavilySearch(query, maxResults, includeDomains);

      const mappedImages: SearchProductCandidate[] = images.map((img) => ({
        imageUrl: img.url,
        title: img.title,
        description: img.description,
      }));
      const pages: SearchPageResult[] = results.map((r) => ({
        url: r.url,
        title: r.title,
        content: r.content,
      }));

      return { images: mappedImages, pages };
    } catch (err) {
      logger.warn({ err, query }, "Tavily search failed (e.g. usage limit exceeded); falling back to OpenAI web search");
      return this.fallbackProvider.search(query, maxResults, includeDomains);
    }
  }
}

