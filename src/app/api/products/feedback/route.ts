import { NextResponse } from "next/server";
import { ProductFeedbackRequestSchema } from "@/lib/skintune-schemas";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parsed = ProductFeedbackRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
    }

    const { dress, feedbackType, reason, sessionId } = parsed.data;
    logger.info(
      { dressId: dress.id, dressTitle: dress.title, feedbackType, reason, sessionId },
      "Product feedback recorded",
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Malformed products/feedback request");
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }
}
