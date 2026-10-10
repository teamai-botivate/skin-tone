export type SearchProductCandidate = {
  imageUrl: string;
  pageUrl?: string;
  title?: string;
  description?: string;
  sourceDomain?: string;
  price?: string;
};

export type SearchPageResult = {
  url: string;
  title: string;
  content: string;
};

export type SearchProviderResult = {
  images: SearchProductCandidate[];
  pages: SearchPageResult[];
};

export interface SearchProvider {
  readonly name: string;
  search(query: string, maxResults: number, includeDomains?: string[]): Promise<SearchProviderResult>;
}
