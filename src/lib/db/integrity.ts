import Database from "better-sqlite3";
import { getDb } from "./index";

export interface IntegrityCheckResult {
  passed: boolean;
  violations: Array<{
    table: string;
    column: string;
    id: number;
    value: string;
  }>;
}

export function runIntegrityCheck(customDb?: Database.Database): IntegrityCheckResult {
  const db = customDb || getDb();
  const violations: IntegrityCheckResult["violations"] = [];

  // Check source_observations.request_url
  try {
    const obsRows = db
      .prepare("SELECT id, request_url FROM source_observations WHERE request_url LIKE '%example.test%'")
      .all() as Array<{ id: number; request_url: string }>;
    for (const row of obsRows) {
      violations.push({
        table: "source_observations",
        column: "request_url",
        id: row.id,
        value: row.request_url,
      });
    }
  } catch {
    // table might not exist yet if called before migrations
  }

  // Check company_disclosures.source_url
  try {
    const discRows = db
      .prepare("SELECT id, source_url FROM company_disclosures WHERE source_url LIKE '%example.test%'")
      .all() as Array<{ id: number; source_url: string }>;
    for (const row of discRows) {
      violations.push({
        table: "company_disclosures",
        column: "source_url",
        id: row.id,
        value: row.source_url,
      });
    }
  } catch {
    // table might not exist yet
  }

  // Check data_sources.base_url
  try {
    const dsRows = db
      .prepare("SELECT id, base_url FROM data_sources WHERE base_url LIKE '%example.test%'")
      .all() as Array<{ id: number; base_url: string }>;
    for (const row of dsRows) {
      violations.push({
        table: "data_sources",
        column: "base_url",
        id: row.id,
        value: row.base_url,
      });
    }
  } catch {
    // table might not exist yet
  }

  const passed = violations.length === 0;

  if (!passed && process.env.NODE_ENV === "production") {
    const details = violations.map((v) => `${v.table}.${v.column} (id: ${v.id}) = "${v.value}"`).join(", ");
    throw new Error(`CRITICAL INTEGRITY FAILURE: Production database contains test fixture data (example.test): ${details}`);
  }

  return { passed, violations };
}
