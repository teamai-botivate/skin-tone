import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getUserByEmail,
  verifyPassword,
  normalizeEmail,
  createSession,
  getCookieOptions,
  SESSION_COOKIE_NAME,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  getClientIp,
} from "@/lib/auth";
import { logger } from "@/lib/logger";

const LoginRequestSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: Request) {
  try {
    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const parsed = LoginRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email or password format." }, { status: 400 });
    }

    const { email, password } = parsed.data;
    const normalized = normalizeEmail(email);
    const clientIp = getClientIp(req);
    const rateLimitKey = `login:${clientIp}:${normalized}`;

    // Check brute force rate limit (max 5 failed attempts per 15 min)
    const rateLimit = await checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      const waitMinutes = Math.ceil((rateLimit.retryAfterSeconds || 60) / 60);
      return NextResponse.json(
        {
          error: `Too many failed login attempts. Please wait ${waitMinutes} minute${
            waitMinutes > 1 ? "s" : ""
          } before trying again.`,
        },
        { status: 429 },
      );
    }

    // Look up user
    const user = await getUserByEmail(normalized);
    if (!user) {
      await recordFailedAttempt(rateLimitKey, 5, 15 * 60 * 1000, 15 * 60 * 1000);
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    // Verify password with bcrypt
    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      await recordFailedAttempt(rateLimitKey, 5, 15 * 60 * 1000, 15 * 60 * 1000);
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    // Reset rate limit upon successful login
    await resetRateLimit(rateLimitKey);

    // Create secure session in DB
    const sessionToken = await createSession(user.id);

    logger.info({ userId: user.id }, "User logged in successfully");

    const response = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, getCookieOptions());

    return response;
  } catch (err) {
    logger.error({ err }, "Login error");
    return NextResponse.json(
      { error: "Login failed. Please check your credentials and try again." },
      { status: 500 },
    );
  }
}
