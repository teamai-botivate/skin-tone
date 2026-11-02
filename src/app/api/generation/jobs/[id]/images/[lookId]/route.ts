import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getGenerationJobImageForUser } from "@/lib/generation-jobs";
import { safeErrorResponse } from "@/lib/safe-error";

/** One generated look image for the job's owner, as { lookId, imageUrl } (a data URL). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; lookId: string }> },
) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required.", code: "UNAUTHORIZED" }, { status: 401 });
  }
  const { id, lookId } = await params;

  try {
    const imageUrl = await getGenerationJobImageForUser(id, lookId, user.id);
    if (!imageUrl) return NextResponse.json({ error: "Image not ready" }, { status: 404 });
    return NextResponse.json(
      { lookId, imageUrl },
      // A stored image never changes, but it is private to this user.
      { headers: { "Cache-Control": "private, max-age=86400, immutable" } },
    );
  } catch (err) {
    return safeErrorResponse(err, "Could not load generated image.", 500);
  }
}
