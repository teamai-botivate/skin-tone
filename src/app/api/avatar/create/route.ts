import { NextResponse } from "next/server";
import { AvatarCreateRequestSchema, AvatarCreateResponseSchema, type Avatar } from "@/lib/skintune-schemas";
import { getVtoProvider } from "@/lib/providers/vto";
import { logger } from "@/lib/logger";
import { safeErrorResponse } from "@/lib/safe-error";
import { randomUUID } from "node:crypto";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parsed = AvatarCreateRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
    }

    const { photoUrl, profile } = parsed.data;

    try {
      const provider = getVtoProvider();
      const imageUrl = await provider.generateAvatar({ photoUrl, bodyBuild: profile.bodyBuild });

      const avatar: Avatar = {
        id: randomUUID(),
        imageUrl,
        createdAt: new Date().toISOString(),
        active: true,
      };

      const data = AvatarCreateResponseSchema.parse({ avatar });
      return NextResponse.json(data);
    } catch (err) {
      return safeErrorResponse(err, "Failed to create avatar", 502);
    }
  } catch (err) {
    logger.error({ err }, "Malformed avatar/create request");
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }
}
