import webpush, { WebPushError, type PushSubscription } from "web-push";
import { getDb } from "./db";
import { logger } from "./logger";

/**
 * Server-only Web Push delivery.
 *
 * VAPID keys come exclusively from server env vars (generate once with
 * `npx web-push generate-vapid-keys`). The public key is handed to the
 * browser through /api/push/vapid-public-key at runtime; the private key
 * never leaves the server.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Same-origin path the notification click should open. */
  url: string;
  /** Notification tag — the OS replaces rather than stacks notifications with the same tag. */
  tag: string;
}

export interface StoredPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

let vapidConfigured: boolean | null = null;

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function ensureVapid(): boolean {
  if (vapidConfigured !== null) return vapidConfigured;
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    logger.warn("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set; push notifications are disabled");
    vapidConfigured = false;
    return false;
  }
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT?.trim() || "mailto:support@letstyle.app",
      publicKey,
      privateKey,
    );
    vapidConfigured = true;
  } catch (err) {
    logger.error({ err }, "Invalid VAPID configuration; push notifications are disabled");
    vapidConfigured = false;
  }
  return vapidConfigured;
}

export function isPushConfigured(): boolean {
  return ensureVapid();
}

/** Test hook: lets offline tests reset the cached VAPID state after changing env vars. */
export function resetPushConfigForTests() {
  vapidConfigured = null;
}

export async function savePushSubscription(
  userId: string,
  subscription: StoredPushSubscription,
  userAgent: string | null,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  // An endpoint identifies one browser install. If it was previously
  // registered to another account on a shared device, it moves to the
  // current user so the previous account stops receiving pushes there.
  await db.query(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, user_agent, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = excluded.user_agent,
       updated_at = excluded.updated_at`,
    [
      subscription.endpoint,
      userId,
      subscription.keys.p256dh,
      subscription.keys.auth,
      userAgent ? userAgent.slice(0, 300) : null,
      now,
      now,
    ],
  );
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  const db = await getDb();
  await db.query("DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2", [
    endpoint,
    userId,
  ]);
}

/**
 * Sends a notification to every browser the user has subscribed from.
 * Subscriptions the push service reports as gone (404/410) are deleted;
 * other failures are logged and left alone so a transient outage doesn't
 * unsubscribe anyone. Never throws.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number; failed: number }> {
  const outcome = { sent: 0, removed: 0, failed: 0 };
  if (!ensureVapid()) return outcome;

  let rows: Array<{ endpoint: string; p256dh: string; auth: string }>;
  try {
    const db = await getDb();
    rows = await db.query(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
      [userId],
    );
  } catch (err) {
    logger.error({ err, userId }, "Could not load push subscriptions");
    return outcome;
  }

  const body = JSON.stringify(payload);
  // Push-service-level collapsing: a re-delivered message with the same
  // topic replaces the queued one instead of producing a second alert.
  // Topic must be <= 32 URL-safe base64 chars.
  const topic = payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(-32) || undefined;

  await Promise.all(
    rows.map(async (row) => {
      const subscription: PushSubscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(subscription, body, {
          TTL: 60 * 60 * 24,
          urgency: "high",
          topic,
        });
        outcome.sent += 1;
      } catch (err) {
        const statusCode = err instanceof WebPushError ? err.statusCode : undefined;
        if (statusCode === 404 || statusCode === 410) {
          outcome.removed += 1;
          try {
            const db = await getDb();
            await db.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [row.endpoint]);
          } catch (deleteErr) {
            logger.warn({ err: deleteErr }, "Could not delete expired push subscription");
          }
          logger.info({ userId, statusCode }, "Removed expired push subscription");
        } else {
          outcome.failed += 1;
          logger.warn({ err, userId, statusCode }, "Push notification delivery failed");
        }
      }
    }),
  );

  return outcome;
}
