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
  const apps = repo.getApps(false);
  return NextResponse.json({ apps });
}

export async function POST(request: NextRequest) {
  const auth = validateAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { slug, display_name, vendor, apple_app_id, trends_label, sort_order } = body;

    if (!slug || !display_name || !vendor) {
      return NextResponse.json({ error: "slug, display_name, and vendor are required" }, { status: 400 });
    }

    const db = getDb();
    const repo = new Repository(db);

    const existing = repo.getAppBySlug(slug);
    if (existing) {
      return NextResponse.json({ error: `An app with slug '${slug}' already exists` }, { status: 409 });
    }

    const newApp = repo.createApp({
      slug,
      display_name,
      vendor,
      apple_app_id: apple_app_id || null,
      apple_identity_status: "UNCONFIRMED",
      trends_label: trends_label || null,
      status_page_url: null,
      local_icon: null,
      is_active: 1,
      sort_order: typeof sort_order === "number" ? sort_order : 100,
    });

    repo.insertAuditLog({
      at: new Date().toISOString(),
      actor: "admin",
      action: "CREATE_APP",
      entity: "apps",
      entity_id: String(newApp.id),
      before_json: null,
      after_json: JSON.stringify(newApp),
    });

    return NextResponse.json({ app: newApp }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
