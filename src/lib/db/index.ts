import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let dbInstance: Database.Database | null = null;

export function getDatabasePath(): string {
  if (process.env.DEMO_MODE === "1") {
    return process.env.DEMO_DATABASE_PATH || path.resolve(process.cwd(), "data/ai-apps-live-demo.db");
  }
  return process.env.DATABASE_PATH || path.resolve(process.cwd(), "data/ai-apps-live.db");
}

export function createDatabaseConnection(dbPath?: string): Database.Database {
  const resolvedPath = dbPath || getDatabasePath();

  if (resolvedPath !== ":memory:") {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  return db;
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = createDatabaseConnection();
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
