import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import {
  parseAndValidateTrendsCsv,
  commitTrendsImport,
  TrendsImportMetadata,
} from "@/importers/google-trends/index";

describe("Google Trends CSV Importer", () => {
  let db: Database.Database;

  const validMetadata: TrendsImportMetadata = {
    geo: "US",
    geo_label: "United States",
    search_type: "web",
    entity_mode: "search_term",
    category: "All categories",
    time_range_label: "Past 30 days",
    granularity: "weekly",
    exported_at: "2026-11-15",
    original_filename: "valid_trends.csv",
  };

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);

    // Set trends_label for active apps to enable matching
    db.prepare("UPDATE apps SET trends_label = 'ChatGPT' WHERE slug = 'chatgpt'").run();
    db.prepare("UPDATE apps SET trends_label = 'Claude' WHERE slug = 'claude'").run();
    db.prepare("UPDATE apps SET trends_label = 'Google Gemini' WHERE slug = 'gemini'").run();
  });

  afterEach(() => {
    db.close();
  });

  it("validates and accepts a valid 3-term Trends CSV with <1 handling and partial bucket detection", () => {
    const csvPath = path.resolve(import.meta.dirname, "../fixtures/trends/valid_trends.csv");
    const rawBytes = fs.readFileSync(csvPath);

    const result = parseAndValidateTrendsCsv(rawBytes, validMetadata, db);
    expect(result.valid).toBe(true);

    if (result.valid) {
      expect(result.terms).toEqual(["ChatGPT", "Claude", "Google Gemini"]);
      expect(result.periodStart).toBe("2026-10-18");
      expect(result.periodEnd).toBe("2026-11-15");
      expect(result.buckets).toHaveLength(5);

      // Check bucket 5 (2026-11-15) has Claude as '<1'
      const lastBucket = result.buckets[4];
      const claudeVal = lastBucket.values.find((v) => v.termLabel === "Claude")!;
      expect(claudeVal.valueRaw).toBe("<1");
      expect(claudeVal.valueIndex).toBeNull();

      const chatgptVal = lastBucket.values.find((v) => v.termLabel === "ChatGPT")!;
      expect(chatgptVal.valueRaw).toBe("85");
      expect(chatgptVal.valueIndex).toBe(85);
    }
  });

  it("commits valid Trends CSV, inserting import record, search_interest rows, and audit log", () => {
    const csvPath = path.resolve(import.meta.dirname, "../fixtures/trends/valid_trends.csv");
    const rawBytes = fs.readFileSync(csvPath);

    const commitResult = commitTrendsImport(rawBytes, validMetadata, "operator", db);
    expect(commitResult.success).toBe(true);
    expect(commitResult.importId).toBeGreaterThan(0);

    const importRow = db
      .prepare("SELECT * FROM search_interest_imports WHERE id = ?")
      .get(commitResult.importId) as { status: string; is_current: number; terms: string };
    expect(importRow.status).toBe("ACCEPTED");
    expect(importRow.is_current).toBe(1);

    // 5 buckets * 3 terms = 15 search_interest rows
    const rows = db.prepare("SELECT * FROM search_interest WHERE import_id = ?").all(commitResult.importId);
    expect(rows).toHaveLength(15);

    // Verify '<1' row in database
    const lt1Row = db
      .prepare("SELECT value_raw, value_index FROM search_interest WHERE import_id = ? AND value_raw = '<1'")
      .get(commitResult.importId) as { value_raw: string; value_index: number | null };
    expect(lt1Row).toBeDefined();
    expect(lt1Row.value_raw).toBe("<1");
    expect(lt1Row.value_index).toBeNull();
  });

  it("refuses duplicate file upload with identical SHA-256", () => {
    const csvPath = path.resolve(import.meta.dirname, "../fixtures/trends/valid_trends.csv");
    const rawBytes = fs.readFileSync(csvPath);

    // First commit
    const first = commitTrendsImport(rawBytes, validMetadata, "operator", db);
    expect(first.success).toBe(true);

    // Second validation attempt
    const secondValidation = parseAndValidateTrendsCsv(rawBytes, validMetadata, db);
    expect(secondValidation.valid).toBe(false);
    if (!secondValidation.valid) {
      expect(secondValidation.errors[0]).toMatch(/Duplicate file/);
    }
  });

  it("rejects regional export ('Subregion,') and stores auditable REJECTED record", () => {
    const csvPath = path.resolve(import.meta.dirname, "../fixtures/trends/invalid_region.csv");
    const rawBytes = fs.readFileSync(csvPath);

    const commitResult = commitTrendsImport(
      rawBytes,
      { ...validMetadata, original_filename: "invalid_region.csv" },
      "operator",
      db
    );

    expect(commitResult.success).toBe(false);
    expect(commitResult.error).toMatch(/regional export/);

    // Verify auditable REJECTED row exists
    const rejectedRow = db
      .prepare("SELECT * FROM search_interest_imports WHERE id = ?")
      .get(commitResult.importId) as { status: string; reject_reason: string };
    expect(rejectedRow.status).toBe("REJECTED");
    expect(rejectedRow.reject_reason).toMatch(/regional export/);
  });

  it("rejects unknown terms naming the offending term", () => {
    const csvPath = path.resolve(import.meta.dirname, "../fixtures/trends/invalid_unknown_term.csv");
    const rawBytes = fs.readFileSync(csvPath);

    const result = parseAndValidateTrendsCsv(rawBytes, validMetadata, db);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("NonExistentApp"))).toBe(true);
    }
  });

  it("rejects empty cell and never turns missing data into 0", () => {
    const csvPath = path.resolve(import.meta.dirname, "../fixtures/trends/invalid_empty_cell.csv");
    const rawBytes = fs.readFileSync(csvPath);

    const result = parseAndValidateTrendsCsv(rawBytes, validMetadata, db);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("Missing data cannot be inferred as zero"))).toBe(true);
    }
  });

  it("rejects out-of-bounds cell values (> 100)", () => {
    const csvPath = path.resolve(import.meta.dirname, "../fixtures/trends/invalid_out_of_bounds.csv");
    const rawBytes = fs.readFileSync(csvPath);

    const result = parseAndValidateTrendsCsv(rawBytes, validMetadata, db);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("is out of bounds"))).toBe(true);
    }
  });

  it("rejects non-ascending row dates", () => {
    const csvPath = path.resolve(import.meta.dirname, "../fixtures/trends/invalid_non_ascending_date.csv");
    const rawBytes = fs.readFileSync(csvPath);

    const result = parseAndValidateTrendsCsv(rawBytes, validMetadata, db);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("not strictly ascending"))).toBe(true);
    }
  });

  it("rejects files with more than 5 comparison terms", () => {
    const csvPath = path.resolve(import.meta.dirname, "../fixtures/trends/invalid_too_many_terms.csv");
    const rawBytes = fs.readFileSync(csvPath);

    const result = parseAndValidateTrendsCsv(rawBytes, validMetadata, db);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("at most 5 terms"))).toBe(true);
    }
  });
});
