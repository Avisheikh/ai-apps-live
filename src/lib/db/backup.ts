import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runIntegrityCheck } from "./integrity";

export interface BackupResult {
  backupPath: string;
  timestamp: string;
  prunedCount: number;
}

export function createBackup(
  dbPath = process.env.DATABASE_PATH || "data/ai-apps-live.db",
  backupDir?: string,
  maxRetention = 14
): BackupResult {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Cannot backup non-existent database file: ${dbPath}`);
  }

  const resolvedBackupDir =
    backupDir || path.join(path.dirname(path.resolve(dbPath)), "backups");
  fs.mkdirSync(resolvedBackupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFileName = `ai-apps-live-backup-${timestamp}.db`;
  const backupPath = path.join(resolvedBackupDir, backupFileName);

  const db = new Database(dbPath);
  try {
    // SQLite VACUUM INTO produces an atomic, clean copy
    db.prepare("VACUUM INTO ?").run(backupPath);
  } finally {
    db.close();
  }

  // Prune older backups retaining maxRetention
  const files = fs
    .readdirSync(resolvedBackupDir)
    .filter((f) => f.startsWith("ai-apps-live-backup-") && f.endsWith(".db"))
    .sort();

  let prunedCount = 0;
  if (files.length > maxRetention) {
    const toDelete = files.slice(0, files.length - maxRetention);
    for (const f of toDelete) {
      try {
        fs.unlinkSync(path.join(resolvedBackupDir, f));
        prunedCount++;
      } catch (err) {
        console.warn(`Failed to prune backup file ${f}:`, err);
      }
    }
  }

  return {
    backupPath,
    timestamp,
    prunedCount,
  };
}

export function restoreBackup(
  backupPath: string,
  targetDbPath = process.env.DATABASE_PATH || "data/ai-apps-live.db"
): void {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file does not exist: ${backupPath}`);
  }

  // 1. Verify backup file integrity before restoring
  const backupDb = new Database(backupPath, { readonly: true });
  try {
    const integrity = backupDb.prepare("PRAGMA integrity_check").all() as Array<{
      integrity_check: string;
    }>;
    if (!integrity || integrity[0]?.integrity_check !== "ok") {
      throw new Error("Corrupted backup file: integrity_check failed");
    }
  } finally {
    backupDb.close();
  }

  // 2. Remove any active WAL/SHM sidecars for target
  const targetWal = `${targetDbPath}-wal`;
  const targetShm = `${targetDbPath}-shm`;
  if (fs.existsSync(targetWal)) fs.unlinkSync(targetWal);
  if (fs.existsSync(targetShm)) fs.unlinkSync(targetShm);

  // 3. Atomically copy the backup file into the target path
  fs.copyFileSync(backupPath, targetDbPath);

  // 4. Verify integrity of the restored target database
  const targetDb = new Database(targetDbPath);
  try {
    targetDb.pragma("journal_mode = WAL");
    const check = runIntegrityCheck(targetDb);
    if (!check.passed) {
      throw new Error(`Integrity check failed on restored database: ${check.violations.length} fixture leaks detected`);
    }
  } finally {
    targetDb.close();
  }
}
