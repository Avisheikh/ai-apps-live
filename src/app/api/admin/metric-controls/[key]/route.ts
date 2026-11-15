import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { Repository } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function PUT(
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
    const { enabled, reason } = body;

    if (enabled === undefined) {
      return NextResponse.json({ error: "Field 'enabled' is required" }, { status: 400 });
    }

    if (!enabled && (!reason || reason.trim().length === 0)) {
      return NextResponse.json({ error: "A reason is required when disabling a metric" }, { status: 400 });
    }

    const db = getDb();
    const repo = new Repository(db);

    const current = repo.getMetricControl(key);
    if (!current) {
      return NextResponse.json({ error: `Metric '${key}' not found` }, { status: 404 });
    }

    let updated;
    try {
      updated = repo.updateMetricControl(key, enabled, reason || null, "admin");
    } catch (dbErr: unknown) {
      return NextResponse.json(
        { error: dbErr instanceof Error ? dbErr.message : String(dbErr) },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    repo.insertAuditLog({
      at: now,
      actor: "admin",
      action: "UPDATE_METRIC_CONTROL",
      entity: "metric_controls",
      entity_id: key,
      before_json: JSON.stringify(current),
      after_json: JSON.stringify(updated),
    });

    // Broadcast change within 5 seconds via SSE stream_events
    repo.insertStreamEvent("control_update", {
      metricKey: key,
      enabled: updated.enabled === 1,
      reason: updated.reason,
      updatedAt: now,
    });

    return NextResponse.json({ control: updated });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
