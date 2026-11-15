import { NextRequest, NextResponse } from "next/server";
import { checkLoginRateLimit, resetLoginRateLimit, verifyAdminCredentials, createSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Extract client IP for rate limiting
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
  const rateLimit = checkLoginRateLimit(ip);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Too many failed login attempts. Please try again in ${rateLimit.retryAfterSeconds} seconds.`,
      },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const password = body.password;

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    const isValid = verifyAdminCredentials(password);
    if (!isValid) {
      return NextResponse.json(
        {
          error: "Invalid password",
          remainingAttempts: rateLimit.remainingAttempts,
        },
        { status: 401 }
      );
    }

    // Success: reset rate limit and create session
    resetLoginRateLimit(ip);
    const session = createSession();

    const response = NextResponse.json({
      success: true,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
    });

    response.cookies.set("ai_apps_session", session.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 12 * 3600, // 12 hours
    });

    return response;
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
