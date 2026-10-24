import { NextResponse } from "next/server";
import {
  getSessionTokenFromRequest,
  deleteSession,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const token = getSessionTokenFromRequest(req);
    if (token) {
      await deleteSession(token);
    }

    const response = NextResponse.json({ ok: true });

    // Clear session cookie
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });

    return response;
  } catch (err) {
    return NextResponse.json({ ok: true });
  }
}
