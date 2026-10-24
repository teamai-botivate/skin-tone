import {
  ProductRecommendationsRequestSchema,
  ProductRecommendationsResponseSchema,
} from "@/lib/skintune-schemas";
import { searchProductsForLook } from "@/lib/product-search";
import { executePaidOperation, CREDIT_COSTS } from "@/lib/credits";

export async function POST(req: Request) {
  return await executePaidOperation(
    req,
    {
      cost: CREDIT_COSTS.PRODUCT_RECOMMENDATIONS,
      operationType: "product_recommendations",
      schema: ProductRecommendationsRequestSchema,
      description: "Live product matching",
    },
    async (data) => {
      const { look, profile, category, forceRefresh } = data;
      const result = await searchProductsForLook(look, profile, category, forceRefresh);
      return ProductRecommendationsResponseSchema.parse(result);
    },
  );
}
