import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getDb } from "./index";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export function runMigrations(customDb?: Database.Database): MigrationResult {
  const db = customDb || getDb();
  const migrationsDir = path.resolve(process.cwd(), "db/migrations");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          INTEGER PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      applied_at  TEXT NOT NULL
    );
  `);

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at ${migrationsDir}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const appliedRows = db.prepare("SELECT name FROM schema_migrations").all() as { name: string }[];
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  const result: MigrationResult = { applied: [], skipped: [] };

  for (const file of files) {
    if (appliedSet.has(file)) {
      result.skipped.push(file);
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, "utf-8");

    const runMigration = db.transaction(() => {
      db.exec(sql);
      const now = new Date().toISOString();
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(file, now);
    });

    runMigration();
    result.applied.push(file);
    console.log(`[DB Migration] Applied: ${file}`);
  }

  return result;
}

if (require.main === module || (typeof process !== "undefined" && process.argv[1]?.includes("migrate.ts"))) {
  try {
    const res = runMigrations();
    console.log(`[DB Migration] Complete. Applied: ${res.applied.length}, Skipped: ${res.skipped.length}`);
  } catch (err) {
    console.error("[DB Migration] Error:", err);
    process.exit(1);
  }
}
