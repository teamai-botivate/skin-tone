import { NextResponse } from "next/server";
import {
  ProductRecommendationsRequestSchema,
  ProductRecommendationsResponseSchema,
} from "@/lib/skintune-schemas";
import { searchProductsForLook } from "@/lib/product-search";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parsed = ProductRecommendationsRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { look, profile, category } = parsed.data;

    try {
      const result = await searchProductsForLook(look, profile, category);
      const validated = ProductRecommendationsResponseSchema.parse(result);
      return NextResponse.json(validated);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err, lookId: look.id }, "Failed to process product recommendations");
      return NextResponse.json({
        lookId: look.id,
        persona: "neutral",
        applicableCategories: ["outfit", "footwear", "accessories"],
        products: [],
        status: "unavailable",
        disclaimer: "Real product discovery is currently taking longer than expected. Please try again shortly.",
        searchedAt: new Date().toISOString(),
        totalFound: 0,
        errorMessage: errMsg,
        diagnostics: [
          {
            provider: "system",
            status: "error",
            message: errMsg,
            suggestedFix: "Check server logs or verify your API keys in .env.local",
          },
        ],
      });
    }
  } catch (err) {
    logger.error({ err }, "Product recommendations request parsing failed");
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }
}
