import { getDb } from "../db";
import { logger } from "../logger";

export interface RateLimitStatus {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
}

export async function checkRateLimit(
  key: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000,
): Promise<RateLimitStatus> {
  const db = await getDb();
  const row = await db.get<{
    attempts: number;
    locked_until: string | null;
    updated_at: string;
  }>("SELECT attempts, locked_until, updated_at FROM auth_rate_limits WHERE key = $1", [key]);

  if (!row) {
    return { allowed: true, remainingAttempts: maxAttempts };
  }

  const now = Date.now();
  const updatedAt = new Date(row.updated_at).getTime();

  // If currently locked out
  if (row.locked_until) {
    const lockedUntil = new Date(row.locked_until).getTime();
    if (now < lockedUntil) {
      const retryAfterSeconds = Math.ceil((lockedUntil - now) / 1000);
      return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
    }
  }

  // If the window has expired, allow and reset
  if (now - updatedAt > windowMs) {
    return { allowed: true, remainingAttempts: maxAttempts };
  }

  if (row.attempts >= maxAttempts) {
    const retryAfterSeconds = Math.ceil((windowMs - (now - updatedAt)) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  return {
    allowed: true,
    remainingAttempts: maxAttempts - row.attempts,
  };
}

export async function recordFailedAttempt(
  key: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000,
  lockoutMs: number = 15 * 60 * 1000,
): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const nowIso = now.toISOString();

  const row = await db.get<{
    attempts: number;
    locked_until: string | null;
    updated_at: string;
  }>("SELECT attempts, locked_until, updated_at FROM auth_rate_limits WHERE key = $1", [key]);

  if (!row) {
    await db.query(
      "INSERT INTO auth_rate_limits (key, attempts, locked_until, updated_at) VALUES ($1, $2, $3, $4)",
      [key, 1, null, nowIso],
    );
    return;
  }

  const lastUpdated = new Date(row.updated_at).getTime();
  let newAttempts = row.attempts + 1;

  // Reset if window has elapsed
  if (now.getTime() - lastUpdated > windowMs) {
    newAttempts = 1;
  }

  let lockedUntilIso: string | null = null;
  if (newAttempts >= maxAttempts) {
    lockedUntilIso = new Date(now.getTime() + lockoutMs).toISOString();
    logger.warn({ key, attempts: newAttempts }, "Rate limit exceeded; lock applied");
  }

  await db.query(
    "UPDATE auth_rate_limits SET attempts = $1, locked_until = $2, updated_at = $3 WHERE key = $4",
    [newAttempts, lockedUntilIso, nowIso, key],
  );
}

export async function resetRateLimit(key: string): Promise<void> {
  const db = await getDb();
  await db.query("DELETE FROM auth_rate_limits WHERE key = $1", [key]);
}
