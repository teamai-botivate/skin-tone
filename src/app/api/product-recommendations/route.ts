import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  ProductRecommendationsRequestSchema,
  type ProductRecommendationsResponse,
} from "@/lib/skintune-schemas";
import { searchProductsForLook } from "@/lib/product-search";
import { executePaidOperation, CREDIT_COSTS } from "@/lib/credits";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  // Short id returned as x-request-id and shown in client diagnostics, so a failure the
  // user sees can be matched to this log line. Nothing personal or secret is logged.
  const requestId = randomUUID().slice(0, 8);
  const startedAt = Date.now();
  let summary: Record<string, unknown> = {};

  let response: NextResponse;
  try {
    response = await executePaidOperation(
      req,
      {
        cost: CREDIT_COSTS.PRODUCT_RECOMMENDATIONS,
        operationType: "product_recommendations",
        schema: ProductRecommendationsRequestSchema,
        description: "Live product matching",
      },
      async (data) => {
        const { look, profile, category, forceRefresh } = data;
        const result: ProductRecommendationsResponse = await searchProductsForLook(look, profile, category, forceRefresh);
        summary = {
          lookId: look.id,
          category: category ?? "all",
          forceRefresh: Boolean(forceRefresh),
          resultStatus: result.status,
          totalFound: result.totalFound,
          groups: (result.groups ?? []).map((g) => `${g.category}:${g.products.length}`),
          diagnostics: (result.diagnostics ?? []).map((d) => `${d.provider}/${d.status}`),
        };
        return result;
      },
    );
  } catch (err) {
    // executePaidOperation handles operation errors; this only catches failures around it
    logger.error({ err, requestId }, "Product discovery request crashed");
    response = NextResponse.json(
      { error: "Product discovery failed on the server. Please try again.", code: "INTERNAL_ERROR", requestId },
      { status: 500 },
    );
  }

  response.headers.set("x-request-id", requestId);
  const log = response.status >= 500 ? logger.error.bind(logger) : response.status >= 400 ? logger.warn.bind(logger) : logger.info.bind(logger);
  log({ requestId, httpStatus: response.status, ms: Date.now() - startedAt, ...summary }, "Product discovery request finished");
  return response;
}
