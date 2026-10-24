import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createUser,
  getUserByEmail,
  hashPassword,
  validatePassword,
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

const SignupRequestSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().trim().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
});

export async function POST(req: Request) {
  try {
    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const parsed = SignupRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid input";
      return NextResponse.json({ error: firstError, details: parsed.error.flatten() }, { status: 400 });
    }

    const { name, email, password, confirmPassword } = parsed.data;

    // Password confirmation check
    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    }

    // Password policy validation
    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      return NextResponse.json({ error: pwdCheck.error }, { status: 400 });
    }

    // Rate limiting: 5 signups per hour per IP
    const clientIp = getClientIp(req);
    const rateLimitKey = `signup:${clientIp}`;
    const rateLimit = await checkRateLimit(rateLimitKey, 5, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Too many registration attempts. Please try again in ${Math.ceil(
            (rateLimit.retryAfterSeconds || 60) / 60,
          )} minutes.`,
        },
        { status: 429 },
      );
    }

    // Check duplicate email
    const normalized = normalizeEmail(email);
    const existingUser = await getUserByEmail(normalized);
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email address already exists. Please log in instead." },
        { status: 409 },
      );
    }

    // Hash password securely with bcrypt
    const passwordHash = await hashPassword(password);

    // Create user in database
    const user = await createUser({
      name,
      email: normalized,
      passwordHash,
    });

    // Reset rate limit on successful registration
    await resetRateLimit(rateLimitKey);

    // Create secure session
    const sessionToken = await createSession(user.id);

    logger.info({ userId: user.id, email: user.email }, "User registered successfully");

    const response = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });

    // Set secure HttpOnly session cookie
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, getCookieOptions());

    return response;
  } catch (err: any) {
    logger.error({ err }, "Registration error");

    const message = err?.message || "";
    if (message.includes("UNIQUE constraint") || message.includes("duplicate key")) {
      return NextResponse.json(
        { error: "An account with this email address already exists. Please log in instead." },
        { status: 409 },
      );
    }

    if (message.includes("database is locked") || message.includes("busy")) {
      return NextResponse.json(
        { error: "The server is currently busy. Please wait a moment and try again." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "development" && err?.message
            ? `Registration failed: ${err.message}`
            : "Registration failed. Please try again in a moment.",
      },
      { status: 500 },
    );
  }
}
