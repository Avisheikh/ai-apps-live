import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { Repository } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = validateAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const { id } = await params;
    const appId = parseInt(id, 10);
    if (isNaN(appId)) {
      return NextResponse.json({ error: "Invalid app ID" }, { status: 400 });
    }

    const body = await request.json();
    const db = getDb();
    const repo = new Repository(db);

    const current = repo.getAppById(appId);
    if (!current) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    const updated = repo.updateApp(appId, body);

    repo.insertAuditLog({
      at: new Date().toISOString(),
      actor: "admin",
      action: "UPDATE_APP",
      entity: "apps",
      entity_id: String(appId),
      before_json: JSON.stringify(current),
      after_json: JSON.stringify(updated),
    });

    return NextResponse.json({ app: updated });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
