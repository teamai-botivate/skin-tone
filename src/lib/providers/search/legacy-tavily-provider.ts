import { tavilySearch } from "../../tavily-client";
import type { SearchProvider, SearchProviderResult, SearchProductCandidate, SearchPageResult } from "./search-provider";

export class LegacyTavilySearchProvider implements SearchProvider {
  readonly name = "tavily";

  async search(query: string, maxResults: number, includeDomains?: string[]): Promise<SearchProviderResult> {
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
  }
}
