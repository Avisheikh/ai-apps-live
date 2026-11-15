import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get("ai_apps_session")?.value;
  if (cookie) {
    deleteSession(cookie);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete("ai_apps_session");
  return response;
}
