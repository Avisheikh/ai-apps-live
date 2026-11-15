import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get("ai_apps_session")?.value;
  const session = getSession(cookie);

  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  });
}
