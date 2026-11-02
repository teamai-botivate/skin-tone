import { NextResponse } from "next/server";
import { getVapidPublicKey, isPushConfigured } from "@/lib/push-notifications";

/** The VAPID public key the browser needs to subscribe. 404 when push isn't configured. */
export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey || !isPushConfigured()) {
    return NextResponse.json({ error: "Push notifications are not configured" }, { status: 404 });
  }
  return NextResponse.json({ publicKey });
}
