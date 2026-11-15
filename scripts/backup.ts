import { createBackup } from "../src/lib/db/backup";

try {
  console.log("[Backup] Starting database backup via VACUUM INTO...");
  const result = createBackup();
  console.log(`[Backup] Successfully created: ${result.backupPath}`);
  if (result.prunedCount > 0) {
    console.log(`[Backup] Pruned ${result.prunedCount} older backup(s) to maintain 14-day retention.`);
  }
} catch (err) {
  console.error("[Backup Error] Failed to create backup:", err);
  process.exit(1);
}
