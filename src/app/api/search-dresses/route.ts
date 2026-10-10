import { NextResponse } from "next/server";
import {
  SearchDressesRequestSchema,
  SearchDressesResponseSchema,
} from "@/lib/skintune-schemas";
import { runDressSearch } from "@/lib/dress-search-server";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parsed = SearchDressesRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { profile, offset, limit } = parsed.data;

    try {
      const { dresses, shopLinks } = await runDressSearch(profile, offset, limit);
      const data = SearchDressesResponseSchema.parse({
        results: dresses,
        shopLinks,
        hasMore: dresses.length >= limit,
      });
      return NextResponse.json(data);
    } catch (err) {
      logger.error({ err }, "Failed to search for dresses");
      return NextResponse.json(
        {
          error: "Failed to search for dresses",
          message: err instanceof Error ? err.message : String(err),
        },
        { status: 502 },
      );
    }
  } catch (err) {
    logger.error({ err }, "Malformed search-dresses request");
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }
}
