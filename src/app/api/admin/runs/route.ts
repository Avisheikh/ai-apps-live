import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = validateAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const db = getDb();
  const runs = db
    .prepare(
      `SELECT r.*, ds.key as source_key, ds.name as source_name
       FROM collector_runs r
       JOIN data_sources ds ON ds.id = r.source_id
       ORDER BY r.started_at DESC
       LIMIT 100`
    )
    .all();

  return NextResponse.json({ runs });
}
