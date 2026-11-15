import { restoreBackup } from "../src/lib/db/backup";

const backupPath = process.argv[2];

if (!backupPath) {
  console.error("Usage: npm run db:restore <path-to-backup.db>");
  process.exit(1);
}

try {
  console.log(`[Restore] Restoring database from: ${backupPath}...`);
  restoreBackup(backupPath);
  console.log("[Restore] Successfully restored and verified target database.");
} catch (err) {
  console.error("[Restore Error] Failed to restore database:", err);
  process.exit(1);
}
