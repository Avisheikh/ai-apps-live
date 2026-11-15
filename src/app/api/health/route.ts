import { NextResponse } from "next/server";
import fs from "node:fs";
import { getDb, getDatabasePath } from "@/lib/db/index";
import { Repository } from "@/lib/db/repo";
import { runIntegrityCheck } from "@/lib/db/integrity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const repo = new Repository(db);

    // 1. Verify DB connection
    db.prepare("SELECT 1").get();

    // 2. Run test fixture integrity check (fails loudly if example.test is present in prod)
    const integrity = runIntegrityCheck(db);

    // 3. Database file size
    const dbPath = getDatabasePath();
    let dbSizeBytes = 0;
    if (fs.existsSync(dbPath)) {
      dbSizeBytes = fs.statSync(dbPath).size;
    }

    // 4. Migration version
    const appliedMigrations = db.prepare("SELECT name, applied_at FROM schema_migrations ORDER BY id DESC").all() as Array<{
      name: string;
      applied_at: string;
    }>;

    // 5. Source health
    const sourceHealth = repo.getSourceHealthList();

    // 6. Check clock skew against latest collector run Date header
    const latestRun = db
      .prepare("SELECT server_date_header, clock_skew_ms FROM collector_runs WHERE clock_skew_ms IS NOT NULL ORDER BY id DESC LIMIT 1")
      .get() as { server_date_header: string; clock_skew_ms: number } | undefined;

    const clockSkewMs = latestRun?.clock_skew_ms ?? 0;
    const isClockSkewWarning = Math.abs(clockSkewMs) > 60000; // > 60s warning

    const status = integrity.passed && !isClockSkewWarning ? "healthy" : "degraded";

    return NextResponse.json(
      {
        status,
        process: "web",
        demoMode: process.env.DEMO_MODE === "1",
        timestamps: {
          serverTimeUtc: new Date().toISOString(),
          clockSkewMs,
          clockSkewWarning: isClockSkewWarning,
        },
        integrity: {
          passed: integrity.passed,
          violationsCount: integrity.violations.length,
        },
        database: {
          path: dbPath,
          sizeBytes: dbSizeBytes,
          appliedMigrationsCount: appliedMigrations.length,
          latestMigration: appliedMigrations[0]?.name || null,
        },
        sources: sourceHealth.map((sh) => ({
          key: sh.source_key,
          name: sh.source_name,
          state: sh.state,
          consecutiveFailures: sh.consecutive_failures,
          lastAttemptAt: sh.last_attempt_at,
          lastSuccessAt: sh.last_success_at,
          lastError: sh.last_error,
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        status: "unhealthy",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
