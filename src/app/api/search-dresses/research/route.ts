import {
  ResearchAgainRequestSchema,
  SearchDressesResponseSchema,
} from "@/lib/skintune-schemas";
import { runDressSearch, collectAvoidTitles } from "@/lib/dress-search-server";
import { executePaidOperation, CREDIT_COSTS } from "@/lib/credits";

export async function POST(req: Request) {
  return await executePaidOperation(
    req,
    {
      cost: CREDIT_COSTS.SEARCH_DRESSES_RESEARCH,
      operationType: "search_dresses_research",
      schema: ResearchAgainRequestSchema,
      description: "Repeat outfit search with updated preferences",
    },
    async (data) => {
      const { profile, limit, memory } = data;
      const avoidTitles = collectAvoidTitles(memory);
      const { dresses, shopLinks } = await runDressSearch(profile, 0, limit, { avoidTitles });
      return SearchDressesResponseSchema.parse({
        results: dresses,
        shopLinks,
        hasMore: dresses.length >= limit,
      });
    },
  );
}
