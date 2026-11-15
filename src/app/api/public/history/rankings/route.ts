import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const appSlug = searchParams.get("app");
    const country = searchParams.get("country") || "us";
    const chart = searchParams.get("chart") || "top-free";
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limitParam = parseInt(searchParams.get("limit") || "100", 10);
    const limit = Math.min(Math.max(1, isNaN(limitParam) ? 100 : limitParam), 1000);

    const db = getDb();

    let query = `
      SELECT r.id, r.apple_app_id, r.rank, r.name_in_feed, r.artist_in_feed,
             cs.country, cs.chart, cs.source_updated_at, cs.collected_at,
             a.slug, a.display_name
      FROM app_store_rankings r
      JOIN chart_snapshots cs ON cs.id = r.snapshot_id
      LEFT JOIN apps a ON a.id = r.app_id
      WHERE cs.country = ? AND cs.chart = ?
    `;
    const params: unknown[] = [country.toLowerCase(), chart.toLowerCase()];

    if (appSlug) {
      query += " AND a.slug = ?";
      params.push(appSlug);
    }
    if (from) {
      query += " AND cs.source_updated_at >= ?";
      params.push(from);
    }
    if (to) {
      query += " AND cs.source_updated_at <= ?";
      params.push(to);
    }

    query += " ORDER BY cs.source_updated_at DESC, r.rank ASC LIMIT ?";
    params.push(limit);

    const rows = db.prepare(query).all(...params);

    return NextResponse.json({
      country,
      chart,
      count: rows.length,
      limit,
      results: rows,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
