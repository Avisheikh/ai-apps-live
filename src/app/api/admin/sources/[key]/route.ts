import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { Repository } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const auth = validateAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const { key } = await params;
    const body = await request.json();
    const { enabled, reason, poll_interval_seconds, stale_after_seconds } = body;

    const db = getDb();
    const repo = new Repository(db);

    const current = repo.getDataSourceByKey(key);
    if (!current) {
      return NextResponse.json({ error: `Source '${key}' not found` }, { status: 404 });
    }

    if (enabled !== undefined && !enabled && (!reason || reason.trim().length === 0)) {
      return NextResponse.json({ error: "A reason is required when disabling a data source" }, { status: 400 });
    }

    if (poll_interval_seconds !== undefined && poll_interval_seconds !== null && poll_interval_seconds < 60) {
      return NextResponse.json({ error: "Polling interval cannot be lower than the 60-second floor" }, { status: 400 });
    }

    if (stale_after_seconds !== undefined && stale_after_seconds <= 0) {
      return NextResponse.json({ error: "Stale threshold must be greater than zero" }, { status: 400 });
    }

    const updated = repo.updateDataSource(key, {
      enabled: enabled !== undefined ? (enabled ? 1 : 0) : undefined,
      disabled_reason: enabled === false ? reason : null,
      poll_interval_seconds,
      stale_after_seconds,
    });

    const now = new Date().toISOString();
    repo.insertAuditLog({
      at: now,
      actor: "admin",
      action: "UPDATE_DATA_SOURCE",
      entity: "data_sources",
      entity_id: key,
      before_json: JSON.stringify(current),
      after_json: JSON.stringify(updated),
    });

    repo.insertStreamEvent("health_update", {
      sourceKey: key,
      enabled: updated.enabled,
      updatedAt: now,
    });

    return NextResponse.json({ source: updated });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
