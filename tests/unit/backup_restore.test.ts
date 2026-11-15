import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import { createBackup, restoreBackup } from "@/lib/db/backup";

const TEST_DIR = path.join(process.cwd(), "data", "test_backup_suite");
const TEST_DB = path.join(TEST_DIR, "test-source.db");
const BACKUP_DIR = path.join(TEST_DIR, "backups");
const RESTORE_TARGET = path.join(TEST_DIR, "test-restored.db");

describe("Backup & Restore Suite (Phase 9 Operations)", () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    // Build fresh database
    const db = new Database(TEST_DB);
    db.pragma("journal_mode = WAL");
    runMigrations(db);
    db.close();
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("creates a consistent backup via VACUUM INTO", () => {
    const result = createBackup(TEST_DB, BACKUP_DIR, 14);
    expect(fs.existsSync(result.backupPath)).toBe(true);

    // Verify backup contains initialized tables and seeded apps
    const backupDb = new Database(result.backupPath, { readonly: true });
    const apps = backupDb.prepare("SELECT count(*) as cnt FROM apps").get() as { cnt: number };
    expect(apps.cnt).toBe(10);
    backupDb.close();
  });

  it("enforces retention policy by pruning older backups beyond maxRetention", () => {
    // Generate 16 dummy backup files
    for (let i = 1; i <= 16; i++) {
      const pad = String(i).padStart(2, "0");
      const name = `ai-apps-live-backup-2026-11-15T00-00-${pad}-000Z.db`;
      const dummyPath = path.join(BACKUP_DIR, name);
      // Create minimal valid sqlite file
      const db = new Database(dummyPath);
      db.prepare("CREATE TABLE dummy (id INTEGER PRIMARY KEY)").run();
      db.close();
    }

    expect(fs.readdirSync(BACKUP_DIR).length).toBe(16);

    // Run createBackup with retention limit 14
    const result = createBackup(TEST_DB, BACKUP_DIR, 14);
    const remaining = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".db"));

    expect(remaining.length).toBe(14);
    expect(result.prunedCount).toBe(3); // 16 existing + 1 new = 17 -> prune 3 -> 14 remaining
  });

  it("restores database cleanly and preserves integrity", () => {
    const backupResult = createBackup(TEST_DB, BACKUP_DIR, 14);

    // Restore to brand new target path
    restoreBackup(backupResult.backupPath, RESTORE_TARGET);
    expect(fs.existsSync(RESTORE_TARGET)).toBe(true);

    const restoredDb = new Database(RESTORE_TARGET);
    // Verify apps count
    const apps = restoredDb.prepare("SELECT count(*) as cnt FROM apps").get() as { cnt: number };
    expect(apps.cnt).toBe(10);

    // Verify triggers are active by testing concurrent lock trigger
    expect(() => {
      restoredDb.prepare("UPDATE metric_controls SET enabled = 1 WHERE metric_key = 'CONCURRENT_USERS'").run();
    }).toThrow(/CONCURRENT_USERS is locked off/);

    restoredDb.close();
  });
});
