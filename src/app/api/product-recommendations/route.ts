import { NextResponse } from "next/server";
import {
  ProductRecommendationsRequestSchema,
  ProductRecommendationsResponseSchema,
} from "@/lib/skintune-schemas";
import { searchProductsForLook } from "@/lib/product-search";
import { logger } from "@/lib/logger";
import { sanitizeErrorMessage } from "@/lib/safe-error";

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

    const { look, profile, category, forceRefresh } = parsed.data;

    try {
      const result = await searchProductsForLook(look, profile, category, forceRefresh);
      const validated = ProductRecommendationsResponseSchema.parse(result);
      return NextResponse.json(validated);
    } catch (err) {
      const safeMsg = sanitizeErrorMessage(err, "Product recommendations search failed");
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
        errorMessage: safeMsg,
        diagnostics: [
          {
            provider: "system",
            status: "error",
            message: safeMsg,
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
