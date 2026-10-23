import { NextResponse } from "next/server";
import {
  ResearchAgainRequestSchema,
  SearchDressesResponseSchema,
} from "@/lib/skintune-schemas";
import { runDressSearch, collectAvoidTitles } from "@/lib/dress-search-server";
import { logger } from "@/lib/logger";
import { safeErrorResponse } from "@/lib/safe-error";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parsed = ResearchAgainRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { profile, limit, memory } = parsed.data;
    const avoidTitles = collectAvoidTitles(memory);

    try {
      const { dresses, shopLinks } = await runDressSearch(profile, 0, limit, { avoidTitles });
      const data = SearchDressesResponseSchema.parse({
        results: dresses,
        shopLinks,
        hasMore: dresses.length >= limit,
      });
      return NextResponse.json(data);
    } catch (err) {
      return safeErrorResponse(err, "Failed to research dresses again", 502);
    }
  } catch (err) {
    logger.error({ err }, "Malformed search-dresses/research request");
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }
}
