import { NextResponse } from "next/server";
import { TryOnRequestSchema, TryOnResponseSchema } from "@/lib/skintune-schemas";
import { getVtoProvider } from "@/lib/providers/vto";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parsed = TryOnRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
    }

    const { dress, profile, photoUrl } = parsed.data;

    try {
      const provider = getVtoProvider();
      const imageUrl = await provider.generateTryOn({
        avatarImageUrl: photoUrl,
        garmentImageUrl: dress.imageUrl,
        context: {
          occasion: profile.occasion,
          bodyBuild: profile.bodyBuild,
          fit: profile.fit,
          pronouns: profile.pronouns,
          garmentTitle: dress.title,
          garmentSiteName: dress.siteName,
        },
      });

      const data = TryOnResponseSchema.parse({ imageUrl });
      return NextResponse.json(data);
    } catch (err) {
      logger.error({ err, dressId: dress.id }, "Failed to generate try-on image");
      return NextResponse.json(
        {
          error: "Failed to generate try-on image",
          message: err instanceof Error ? err.message : String(err),
        },
        { status: 502 },
      );
    }
  } catch (err) {
    logger.error({ err }, "Malformed try-on request");
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }
}
