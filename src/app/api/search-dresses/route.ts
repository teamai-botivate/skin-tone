import {
  SearchDressesRequestSchema,
  SearchDressesResponseSchema,
} from "@/lib/skintune-schemas";
import { runDressSearch } from "@/lib/dress-search-server";
import { executePaidOperation, CREDIT_COSTS } from "@/lib/credits";

export async function POST(req: Request) {
  return await executePaidOperation(
    req,
    {
      cost: CREDIT_COSTS.SEARCH_DRESSES,
      operationType: "search_dresses",
      schema: SearchDressesRequestSchema,
      description: "Live outfit search",
    },
    async (data) => {
      const { profile, offset, limit } = data;
      const { dresses, shopLinks } = await runDressSearch(profile, offset, limit);
      return SearchDressesResponseSchema.parse({
        results: dresses,
        shopLinks,
        hasMore: dresses.length >= limit,
      });
    },
  );
}
