import { getDb } from "../db";
import { User, AuthenticatedUser } from "./types";
import { getCreditBalance } from "../credits";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { logger } from "../logger";

export const SESSION_COOKIE_NAME = "letstyle_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Creates a new secure session for a user in the database.
 */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const createdAt = new Date().toISOString();

  const db = await getDb();
  await db.query(
    "INSERT INTO user_sessions (id, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)",
    [token, userId, expiresAt, createdAt],
  );

  return token;
}

/**
 * Validates a session token and returns the user with current credit balance.
 */
export async function validateSession(token: string): Promise<AuthenticatedUser | null> {
  if (!token || typeof token !== "string" || token.length < 32) {
    return null;
  }

  const db = await getDb();
  const now = new Date().toISOString();

  const sessionRow = await db.get<{
    user_id: string;
    expires_at: string;
  }>("SELECT user_id, expires_at FROM user_sessions WHERE id = $1 AND expires_at > $2", [
    token,
    now,
  ]);

  if (!sessionRow) {
    return null;
  }

  const userRow = await db.get<{
    id: string;
    email: string;
    name: string;
    created_at: string;
    updated_at: string;
  }>("SELECT id, email, name, created_at, updated_at FROM users WHERE id = $1", [
    sessionRow.user_id,
  ]);

  if (!userRow) {
    return null;
  }

  const credits = await getCreditBalance(userRow.id);

  return {
    id: userRow.id,
    email: userRow.email,
    name: userRow.name,
    createdAt: userRow.created_at,
    updatedAt: userRow.updated_at,
    credits,
  };
}

/**
 * Deletes a session from the database (logout).
 */
export async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  const db = await getDb();
  await db.query("DELETE FROM user_sessions WHERE id = $1", [token]);
}

/**
 * Helper to extract the session token from an incoming Request.
 */
export function getSessionTokenFromRequest(req: Request): string | null {
  // Support Authorization: Bearer <token>
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;

  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!match) return null;
  return match.slice(SESSION_COOKIE_NAME.length + 1);
}

/**
 * Retrieves the currently authenticated user from a Request.
 */
export async function getAuthenticatedUser(req: Request): Promise<AuthenticatedUser | null> {
  const token = getSessionTokenFromRequest(req);
  if (!token) return null;
  return await validateSession(token);
}

/**
 * Retrieves client IP from request for rate limiting.
 */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}
