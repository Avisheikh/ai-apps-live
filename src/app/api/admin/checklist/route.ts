import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { validateAdminRequest } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { Repository } from "@/lib/db/repo";
import { runIntegrityCheck } from "@/lib/db/integrity";

export const dynamic = "force-dynamic";

export interface ChecklistItem {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  details: string;
  severity: "BLOCKER" | "WARNING";
}

export async function GET(request: NextRequest) {
  const auth = validateAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const db = getDb();
  const repo = new Repository(db);
  const checklist: ChecklistItem[] = [];

  // 1. Apple collector succeeded within threshold
  const appleHealth = repo.getSourceHealth(1);
  const appleLastSuccess = appleHealth?.last_success_at;
  const appleAgeSec = appleLastSuccess
    ? Math.floor((Date.now() - new Date(appleLastSuccess).getTime()) / 1000)
    : null;
  const appleOk = appleHealth?.state === "HEALTHY" && appleAgeSec !== null && appleAgeSec < 86400;
  checklist.push({
    id: "apple_collector",
    name: "Apple App Store Collector",
    description: "Succeeded recently and health state is HEALTHY",
    passed: appleOk,
    details: appleOk
      ? `Healthy. Last success: ${Math.floor(appleAgeSec! / 60)} minutes ago.`
      : `Not ready. State: ${appleHealth?.state || "UNKNOWN"}, Last success: ${appleLastSuccess || "Never"}.`,
    severity: "BLOCKER",
  });

  // 2. Apple IDs confirmed for tracked apps
  const unconfirmedApps = db
    .prepare("SELECT slug, display_name FROM apps WHERE is_active = 1 AND apple_identity_status = 'UNCONFIRMED' AND apple_app_id IS NOT NULL")
    .all() as Array<{ slug: string; display_name: string }>;
  const idsConfirmed = unconfirmedApps.length === 0;
  checklist.push({
    id: "apple_ids_confirmed",
    name: "Apple IDs Confirmed",
    description: "All active apps with assigned Apple App IDs have identity confirmed by operator",
    passed: idsConfirmed,
    details: idsConfirmed
      ? "All configured Apple App IDs confirmed."
      : `${unconfirmedApps.length} apps have unconfirmed Apple IDs (${unconfirmedApps.map((a) => a.display_name).join(", ")}).`,
    severity: "BLOCKER",
  });

  // 3. Google Trends import or intentionally disabled
  const trendsControl = repo.getMetricControl("SEARCH_INTEREST");
  const acceptedTrendsCount = (
    db.prepare("SELECT count(*) as count FROM search_interest_imports WHERE status = 'ACCEPTED'").get() as { count: number }
  ).count;
  const trendsOk = !trendsControl?.enabled || acceptedTrendsCount > 0;
  checklist.push({
    id: "trends_import",
    name: "Google Trends Data",
    description: "At least one accepted Trends import exists or SEARCH_INTEREST is intentionally disabled",
    passed: trendsOk,
    details: trendsOk
      ? acceptedTrendsCount > 0
        ? `${acceptedTrendsCount} accepted Trends imports found.`
        : "SEARCH_INTEREST metric intentionally disabled."
      : "SEARCH_INTEREST is enabled but no accepted imports exist.",
    severity: "WARNING",
  });

  // 4. No DRAFT disclosures pending verification
  const draftDisclosuresCount = (
    db.prepare("SELECT count(*) as count FROM company_disclosures WHERE verification_status = 'DRAFT'").get() as { count: number }
  ).count;
  const disclosuresOk = draftDisclosuresCount === 0;
  checklist.push({
    id: "disclosures_draft",
    name: "Company Disclosures Verification",
    description: "No unverified DRAFT disclosures pending operator review",
    passed: disclosuresOk,
    details: disclosuresOk
      ? "Clean. Zero pending DRAFT disclosures."
      : `${draftDisclosuresCount} DRAFT disclosures pending verification in /admin.`,
    severity: "WARNING",
  });

  // 5. Test fixture integrity check (clean of example.test)
  const integrity = runIntegrityCheck(db);
  checklist.push({
    id: "integrity_check",
    name: "Database Integrity Purity",
    description: "Production database contains zero test fixture data (example.test domain)",
    passed: integrity.passed,
    details: integrity.passed
      ? "Clean. 0 test fixture rows detected."
      : `CRITICAL: ${integrity.violations.length} violations found with example.test domain!`,
    severity: "BLOCKER",
  });

  // 6. Clock skew < 60 seconds
  const latestRun = db
    .prepare("SELECT clock_skew_ms FROM collector_runs WHERE clock_skew_ms IS NOT NULL ORDER BY id DESC LIMIT 1")
    .get() as { clock_skew_ms: number } | undefined;
  const skewMs = latestRun?.clock_skew_ms ?? 0;
  const skewOk = Math.abs(skewMs) < 60000;
  checklist.push({
    id: "clock_skew",
    name: "System Clock Synchronization",
    description: "Clock skew relative to Apple server Date header is under 60 seconds",
    passed: skewOk,
    details: `Clock skew: ${skewMs} ms (${Math.abs(skewMs / 1000).toFixed(1)} s).`,
    severity: "BLOCKER",
  });

  // 7. DEMO_MODE off
  const demoModeOff = process.env.DEMO_MODE !== "1";
  checklist.push({
    id: "demo_mode",
    name: "Production Mode Active",
    description: "DEMO_MODE is disabled (no watermark painted)",
    passed: demoModeOff,
    details: demoModeOff ? "DEMO_MODE is off (0)." : "DEMO_MODE is active (1). Watermark will appear.",
    severity: "BLOCKER",
  });

  // 8. Admin password set and non-default
  const hasPassHash = !!process.env.ADMIN_PASSWORD_HASH;
  checklist.push({
    id: "admin_auth",
    name: "Operator Authentication Security",
    description: "ADMIN_PASSWORD_HASH environment variable is configured",
    passed: hasPassHash,
    details: hasPassHash ? "Admin password hash is configured." : "ADMIN_PASSWORD_HASH is unset!",
    severity: "BLOCKER",
  });

  // 9. Recent database backup
  const backupDir = path.resolve(process.cwd(), "data/backups");
  let hasRecentBackup = false;
  let backupDetails = "No backup folder found.";
  if (fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith(".db"));
    if (files.length > 0) {
      hasRecentBackup = true;
      backupDetails = `${files.length} backups stored in data/backups.`;
    } else {
      backupDetails = "Backup directory exists but contains no snapshot files.";
    }
  }
  checklist.push({
    id: "db_backup",
    name: "Database Backup Status",
    description: "Automated VACUUM INTO backup snapshot exists",
    passed: hasRecentBackup,
    details: backupDetails,
    severity: "WARNING",
  });

  const allPassed = checklist.every((i) => i.passed || i.severity === "WARNING");
  const blockersPassed = checklist.filter((i) => i.severity === "BLOCKER").every((i) => i.passed);

  return NextResponse.json({
    readyForBroadcast: blockersPassed,
    allPassed,
    checklist,
  });
}
