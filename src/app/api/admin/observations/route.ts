import { NextRequest, NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";
import { validateAdminRequest } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = validateAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const obsId = searchParams.get("id");

  const db = getDb();

  if (obsId) {
    const row = db
      .prepare("SELECT * FROM source_observations WHERE id = ?")
      .get(parseInt(obsId, 10)) as {
      id: number;
      body_gzip: Buffer | null;
      content_type: string | null;
      body_sha256: string;
      body_pruned_at: string | null;
    } | undefined;

    if (!row) {
      return NextResponse.json({ error: "Observation not found" }, { status: 404 });
    }

    let decompressedBody = "";
    if (row.body_gzip) {
      try {
        decompressedBody = gunzipSync(row.body_gzip).toString("utf-8");
      } catch (err) {
        decompressedBody = `Decompression error: ${err}`;
      }
    } else {
      decompressedBody = `Body was pruned at ${row.body_pruned_at}`;
    }

    return NextResponse.json({
      id: row.id,
      bodySha256: row.body_sha256,
      contentType: row.content_type,
      body: decompressedBody,
    });
  }

  const observations = db
    .prepare(
      `SELECT so.id, so.source_id, so.scope, so.request_url, so.collected_at,
              so.source_updated_at, so.content_type, so.body_sha256,
              (so.body_gzip IS NOT NULL) as has_body, so.body_pruned_at,
              ds.key as source_key
       FROM source_observations so
       JOIN data_sources ds ON ds.id = so.source_id
       ORDER BY so.collected_at DESC
       LIMIT 100`
    )
    .all();

  return NextResponse.json({ observations });
}
