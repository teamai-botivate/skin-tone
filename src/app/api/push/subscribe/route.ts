import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { deletePushSubscription, savePushSubscription } from "@/lib/push-notifications";
import { safeErrorResponse } from "@/lib/safe-error";

const SubscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(128),
  }),
});

const UnsubscribeSchema = z.object({ endpoint: z.string().max(2048) });

async function requireUser(req: Request) {
  return await getAuthenticatedUser(req);
}

/** Stores (or re-assigns) this browser's push subscription for the signed-in user. */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required.", code: "UNAUTHORIZED" }, { status: 401 });

  const parsed = SubscriptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }
  try {
    await savePushSubscription(user.id, parsed.data, req.headers.get("user-agent"));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return safeErrorResponse(err, "Could not save notification settings.", 500);
  }
}

/** Removes this browser's subscription (only if it belongs to the signed-in user). */
export async function DELETE(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required.", code: "UNAUTHORIZED" }, { status: 401 });

  const parsed = UnsubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    await deletePushSubscription(user.id, parsed.data.endpoint);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return safeErrorResponse(err, "Could not update notification settings.", 500);
  }
}
