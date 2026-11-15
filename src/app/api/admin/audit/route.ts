import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { Repository } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = validateAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const db = getDb();
  const repo = new Repository(db);
  const logs = repo.getAuditLogs(100);

  return NextResponse.json({ logs });
}
