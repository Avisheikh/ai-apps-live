import Database from "better-sqlite3";
import { getDb } from "./index";
import { runMigrations } from "./migrate";

export function runSeed(customDb?: Database.Database): void {
  const db = customDb || getDb();
  runMigrations(db);

  const appCount = (db.prepare("SELECT count(*) as count FROM apps").get() as { count: number }).count;
  const sourceCount = (db.prepare("SELECT count(*) as count FROM data_sources").get() as { count: number }).count;

  console.log(`[DB Seed] Verified ${appCount} apps and ${sourceCount} data sources registered.`);
}

if (require.main === module || (typeof process !== "undefined" && process.argv[1]?.includes("seed.ts"))) {
  try {
    runSeed();
    console.log("[DB Seed] Completed successfully.");
  } catch (err) {
    console.error("[DB Seed] Error:", err);
    process.exit(1);
  }
}
