import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import { runIntegrityCheck } from "@/lib/db/integrity";
import { Repository } from "@/lib/db/repo";

describe("Database Schema, Migrations, Triggers, and Integrity", () => {
  let db: Database.Database;
  let repo: Repository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repo = new Repository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("applies migrations cleanly and seeds 10 apps and 5 data sources", () => {
    const apps = repo.getApps(false);
    expect(apps).toHaveLength(10);
    expect(apps.map((a) => a.slug)).toEqual([
      "chatgpt",
      "claude",
      "gemini",
      "deepseek",
      "perplexity",
      "grok",
      "copilot",
      "character-ai",
      "poe",
      "meta-ai",
    ]);

    // Unconfirmed Apple IDs only for ChatGPT, Claude, Gemini
    const chatgpt = apps.find((a) => a.slug === "chatgpt")!;
    expect(chatgpt.apple_app_id).toBe("6448311069");
    expect(chatgpt.apple_identity_status).toBe("UNCONFIRMED");

    const claude = apps.find((a) => a.slug === "claude")!;
    expect(claude.apple_app_id).toBe("6473753684");
    expect(claude.apple_identity_status).toBe("UNCONFIRMED");

    const gemini = apps.find((a) => a.slug === "gemini")!;
    expect(gemini.apple_app_id).toBe("6477489729");
    expect(gemini.apple_identity_status).toBe("UNCONFIRMED");

    // All others must be NULL
    const deepseek = apps.find((a) => a.slug === "deepseek")!;
    expect(deepseek.apple_app_id).toBeNull();

    const sources = repo.getDataSources();
    expect(sources).toHaveLength(5);
    expect(sources.map((s) => s.key)).toEqual([
      "apple_rss",
      "google_trends_csv",
      "company_disclosure",
      "statuspage",
      "cloudflare_radar",
    ]);
  });

  it("seeds ZERO metric values in the real database tables", () => {
    const tables = [
      "chart_snapshots",
      "app_store_rankings",
      "search_interest_imports",
      "search_interest",
      "company_disclosures",
      "service_status_observations",
      "dns_popularity_observations",
    ];

    for (const table of tables) {
      const row = db.prepare(`SELECT count(*) as count FROM ${table}`).get() as { count: number };
      expect(row.count, `Expected table ${table} to have 0 rows`).toBe(0);
    }
  });

  describe("Hard Rule Triggers: CONCURRENT_USERS lock", () => {
    it("aborts when updating CONCURRENT_USERS to enabled = 1", () => {
      expect(() => {
        db.prepare(
          "UPDATE metric_controls SET enabled = 1 WHERE metric_key = 'CONCURRENT_USERS'"
        ).run();
      }).toThrow(/CONCURRENT_USERS is locked off in v1/);
    });

    it("aborts when inserting CONCURRENT_USERS with enabled = 1", () => {
      db.prepare("DELETE FROM metric_controls WHERE metric_key = 'CONCURRENT_USERS'").run();
      expect(() => {
        db.prepare(
          "INSERT INTO metric_controls (metric_key, enabled, updated_by, updated_at) VALUES ('CONCURRENT_USERS', 1, 'TEST', '2026-11-15T00:00:00.000Z')"
        ).run();
      }).toThrow(/CONCURRENT_USERS is locked off in v1/);
    });
  });

  describe("Append-Only Triggers", () => {
    it("aborts on update or delete of app_store_rankings", () => {
      // Create observation & snapshot
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO source_observations (id, source_id, scope, request_url, collected_at, body_sha256) VALUES (1, 1, 'us/top-free/100', 'https://rss.marketingtools.apple.com/test', ?, 'sha')"
      ).run(now);
      db.prepare(
        "INSERT INTO chart_snapshots (id, observation_id, country, chart, source_updated_at, collected_at, list_size) VALUES (1, 1, 'us', 'top-free', ?, ?, 1)"
      ).run(now, now);
      db.prepare(
        "INSERT INTO app_store_rankings (id, snapshot_id, apple_app_id, app_id, rank, name_in_feed) VALUES (1, 1, '6448311069', 1, 1, 'ChatGPT')"
      ).run();

      expect(() => {
        db.prepare("UPDATE app_store_rankings SET rank = 2 WHERE id = 1").run();
      }).toThrow(/app_store_rankings is append-only/);

      expect(() => {
        db.prepare("DELETE FROM app_store_rankings WHERE id = 1").run();
      }).toThrow(/app_store_rankings is append-only/);

      expect(() => {
        db.prepare("DELETE FROM chart_snapshots WHERE id = 1").run();
      }).toThrow(/chart_snapshots is append-only/);
    });

    it("aborts on update of search_interest", () => {
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO search_interest_imports (id, source_id, original_filename, file_sha256, raw_file, imported_at, imported_by, exported_at, geo, geo_label, search_type, entity_mode, category, time_range_label, granularity, period_start, period_end, header_terms_json, status, is_current)
         VALUES (1, 2, 'test.csv', 'sha256test', X'1234', ?, 'admin', '2026-11-15', 'US', 'United States', 'web', 'search_term', 'All categories', 'Past 30 days', 'daily', '2026-10-15', '2026-11-15', '["ChatGPT"]', 'ACCEPTED', 1)`
      ).run(now);

      db.prepare(
        "INSERT INTO search_interest (id, import_id, app_id, term_label, bucket_start, value_raw, value_index, is_partial) VALUES (1, 1, 1, 'ChatGPT', '2026-11-14', '75', 75, 0)"
      ).run();

      expect(() => {
        db.prepare("UPDATE search_interest SET value_index = 80 WHERE id = 1").run();
      }).toThrow(/search_interest is append-only/);
    });
  });

  describe("Disclosure Immutability Trigger", () => {
    it("aborts when attempting to modify a verified disclosure", () => {
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO company_disclosures (
           id, app_id, metric_type, metric_label, value_numeric, value_qualifier, unit,
           geography, reporting_period_end, disclosed_at, source_kind, source_url, source_locator,
           entered_by, entered_at, verification_status, verified_by, verified_at, verifier_note
         ) VALUES (
           1, 1, 'WAU', 'Weekly Active Users', 200000000, 'EXACT', 'users',
           'GLOBAL', '2026-10-01', '2026-10-05', 'COMPANY_BLOG', 'https://openai.com/blog/milestone',
           'Paragraph 2', 'operator', ?, 'VERIFIED', 'verifier_human', ?, 'Checked official blog post'
         )`
      ).run(now, now);

      expect(() => {
        db.prepare("UPDATE company_disclosures SET value_numeric = 300000000 WHERE id = 1").run();
      }).toThrow(/verified disclosures are immutable; create a superseding record/);
    });

    it("enforces verification constraint: verified requires verified_by and verified_at", () => {
      const now = new Date().toISOString();
      expect(() => {
        db.prepare(
          `INSERT INTO company_disclosures (
             id, app_id, metric_type, metric_label, value_numeric, value_qualifier, unit,
             geography, reporting_period_end, disclosed_at, source_kind, source_url, source_locator,
             entered_by, entered_at, verification_status
           ) VALUES (
             2, 1, 'WAU', 'Weekly Active Users', 200000000, 'EXACT', 'users',
             'GLOBAL', '2026-10-01', '2026-10-05', 'COMPANY_BLOG', 'https://openai.com/blog/milestone',
             'Paragraph 2', 'operator', ?, 'VERIFIED'
           )`
        ).run(now);
      }).toThrow(/CHECK constraint failed/);
    });
  });

  describe("Integrity Check (Section 0 Rule 5)", () => {
    it("passes on a clean production database", () => {
      const result = runIntegrityCheck(db);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("detects and flags rows containing example.test", () => {
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO source_observations (id, source_id, scope, request_url, collected_at, body_sha256) VALUES (99, 1, 'test', 'https://example.test/feed.json', ?, 'sha')"
      ).run(now);

      const result = runIntegrityCheck(db);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].table).toBe("source_observations");
      expect(result.violations[0].value).toBe("https://example.test/feed.json");
    });
  });
});
