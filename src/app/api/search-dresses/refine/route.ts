import {
  RefineSearchRequestSchema,
  SearchDressesResponseSchema,
} from "@/lib/skintune-schemas";
import { runDressSearch, collectAvoidTitles } from "@/lib/dress-search-server";
import { executePaidOperation, CREDIT_COSTS } from "@/lib/credits";

export async function POST(req: Request) {
  return await executePaidOperation(
    req,
    {
      cost: CREDIT_COSTS.SEARCH_DRESSES_REFINE,
      operationType: "search_dresses_refine",
      schema: RefineSearchRequestSchema,
      description: "Refined outfit search",
    },
    async (data) => {
      const { profile, limit, memory, refinement } = data;
      const avoidTitles = collectAvoidTitles(memory);
      const { dresses, shopLinks } = await runDressSearch(profile, 0, limit, { refinement, avoidTitles });
      return SearchDressesResponseSchema.parse({
        results: dresses,
        shopLinks,
        hasMore: dresses.length >= limit,
      });
    },
  );
}
