import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import { deriveDisplayStatus } from "@/lib/status/derive";
import { SnapshotService } from "@/lib/snapshot/service";
import { DisclosureService } from "@/lib/disclosures/service";

describe("Phase 6 Accuracy Test Suite (Section 13 Release Blockers)", () => {
  let db: Database.Database;
  let snapshotService: SnapshotService;
  let disclosureService: DisclosureService;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    snapshotService = new SnapshotService(db);
    disclosureService = new DisclosureService(db);

    // Confirm ChatGPT & Claude IDs
    db.prepare("UPDATE apps SET apple_identity_status = 'CONFIRMED' WHERE slug IN ('chatgpt', 'claude')").run();
  });

  afterEach(() => {
    db.close();
  });

  it("Test 1 & 2: DAU/MAU are never rendered as concurrent users", () => {
    const draft = disclosureService.createDraft(
      {
        app_id: 1, // ChatGPT
        metric_type: "DAU",
        metric_label: "Daily active users",
        value_numeric: 100000000,
        value_qualifier: "AT_LEAST",
        reporting_period_end: "2026-10-31",
        disclosed_at: "2026-11-01",
        source_kind: "COMPANY_BLOG",
        source_url: "https://openai.com/index/milestone",
        source_locator: "Slide 2",
      },
      "operator"
    );
    disclosureService.verifyDisclosure(draft.id, "verifier", "Verified primary source");

    const snapshot = snapshotService.getSnapshot("us");

    // Check Concurrent section
    expect(snapshot.concurrentUsers.available).toBe(false);
    expect(snapshot.concurrentUsers.message).toBe("Concurrent user data unavailable.");
    expect(snapshot.concurrentUsers.explanation).toBe("No public source reports this.");

    // Must NOT contain any digits!
    expect(/\d/.test(snapshot.concurrentUsers.message)).toBe(false);
    expect(/\d/.test(snapshot.concurrentUsers.explanation)).toBe(false);

    // DAU value must not exist anywhere in concurrentUsers
    const concurrentStr = JSON.stringify(snapshot.concurrentUsers);
    expect(concurrentStr).not.toContain("100000000");
    expect(concurrentStr).not.toContain("100M");
  });

  it("Test 3: Trends scores are never user counts", () => {
    // Insert search interest record
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO search_interest_imports (
         id, source_id, original_filename, file_sha256, raw_file, imported_at, imported_by,
         exported_at, geo, geo_label, search_type, entity_mode, category, time_range_label,
         granularity, period_start, period_end, header_terms_json, status, is_current
       ) VALUES (
         1, 2, 'trends.csv', 'sha_trends', X'00', ?, 'operator',
         '2026-11-15', 'US', 'United States', 'web', 'search_term', 'All categories', 'Past 30 days',
         'weekly', '2026-10-15', '2026-11-15', '["ChatGPT"]', 'ACCEPTED', 1
       )`
    ).run(now);

    db.prepare(
      `INSERT INTO search_interest (id, import_id, app_id, term_label, bucket_start, value_raw, value_index, is_partial)
       VALUES (1, 1, 1, 'ChatGPT', '2026-11-15', '85', 85, 0)`
    ).run();

    const snapshot = snapshotService.getSnapshot("us");

    expect(snapshot.searchInterest.available).toBe(true);
    expect(snapshot.searchInterest.disclaimer).toBe("Relative index 0–100, not search volume");
    expect(snapshot.searchInterest.attribution).toBe("Data source: Google Trends (https://www.google.com/trends)");

    // Ensure Trends value 85 never appears in officialUsers
    const officialStr = JSON.stringify(snapshot.officialUsers);
    expect(officialStr).not.toContain('"valueNumeric":85');

    // Ensure search interest series items never contain 'users' or 'DAU'
    const seriesStr = JSON.stringify(snapshot.searchInterest.series);
    expect(seriesStr).not.toContain("DAU");
    expect(seriesStr).not.toContain("users");
  });

  it("Test 4: App Store ranks are never user counts", () => {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO source_observations (id, source_id, scope, request_url, collected_at, body_sha256) VALUES (1, 1, 'us/top-free/100', 'https://rss.marketingtools.apple.com/api', ?, 'hash')"
    ).run(now);
    db.prepare(
      "INSERT INTO chart_snapshots (id, observation_id, country, chart, source_updated_at, collected_at, list_size) VALUES (1, 1, 'us', 'top-free', ?, ?, 100)"
    ).run(now, now);
    db.prepare(
      "INSERT INTO app_store_rankings (id, snapshot_id, apple_app_id, app_id, rank, name_in_feed) VALUES (1, 1, '6448311069', 1, 4, 'ChatGPT')"
    ).run();

    const snapshot = snapshotService.getSnapshot("us");
    const item = snapshot.appStore.items.find((i) => i.appleAppId === "6448311069")!;
    expect(item.rank).toBe(4);

    // Ranks must never appear in officialUsers
    const officialUsersJson = JSON.stringify(snapshot.officialUsers);
    expect(officialUsersJson).not.toContain('"rank":4');

    // Ranks must never carry user units
    expect(typeof item.rank).toBe("number");
    expect(String(item.rank)).toBe("4");
  });

  it("Test 5: Missing data never becomes zero", () => {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO source_observations (id, source_id, scope, request_url, collected_at, body_sha256) VALUES (1, 1, 'us/top-free/100', 'https://rss.marketingtools.apple.com/api', ?, 'hash')"
    ).run(now);
    db.prepare(
      "INSERT INTO chart_snapshots (id, observation_id, country, chart, source_updated_at, collected_at, list_size) VALUES (1, 1, 'us', 'top-free', ?, ?, 1)"
    ).run(now, now);
    // Only ChatGPT is in top free
    db.prepare(
      "INSERT INTO app_store_rankings (id, snapshot_id, apple_app_id, app_id, rank, name_in_feed) VALUES (1, 1, '6448311069', 1, 4, 'ChatGPT')"
    ).run();

    const snapshot = snapshotService.getSnapshot("us");

    // All other tracked apps must be in notInTop100 list!
    const notInTop = snapshot.appStore.notInTop100;
    expect(notInTop.some((a) => a.slug === "claude")).toBe(true);
    expect(notInTop.some((a) => a.slug === "deepseek")).toBe(true);

    // Absent apps MUST NOT have a rank of 0 or 101 in items
    const absentInItems = snapshot.appStore.items.find((i) => i.slug === "deepseek");
    expect(absentInItems).toBeUndefined();

    // Check first observation rank change is '—', never 0
    const chatgptItem = snapshot.appStore.items.find((i) => i.slug === "chatgpt")!;
    expect(chatgptItem.rankChange).toBe("—");

    // Unreported disclosures must list apps without disclosures
    expect(snapshot.officialUsers.unreportedApps.some((a) => a.slug === "deepseek")).toBe(true);
  });

  it("Test 6: Stale data is visibly identified with age", () => {
    const oldTimestamp = new Date(Date.now() - 3 * 86400 * 1000).toISOString(); // 3 days ago (threshold is 86400s = 1 day)

    db.prepare(
      "INSERT INTO source_observations (id, source_id, scope, request_url, collected_at, body_sha256) VALUES (1, 1, 'us/top-free/100', 'https://rss.marketingtools.apple.com/api', ?, 'hash')"
    ).run(oldTimestamp);
    db.prepare(
      "INSERT INTO chart_snapshots (id, observation_id, country, chart, source_updated_at, collected_at, list_size) VALUES (1, 1, 'us', 'top-free', ?, ?, 1)"
    ).run(oldTimestamp, oldTimestamp);
    db.prepare(
      "INSERT INTO app_store_rankings (id, snapshot_id, apple_app_id, app_id, rank, name_in_feed) VALUES (1, 1, '6448311069', 1, 4, 'ChatGPT')"
    ).run();

    const snapshot = snapshotService.getSnapshot("us");

    expect(snapshot.appStore.status).toBe("STALE");
    expect(snapshot.appStore.freshness.state).toBe("STALE");
    expect(snapshot.appStore.freshness.ageSeconds).toBeGreaterThan(86400);

    // Value is still shown, not hidden
    expect(snapshot.appStore.items).toHaveLength(1);
    expect(snapshot.appStore.items[0].rank).toBe(4);
    expect(snapshot.appStore.items[0].badge).toBe("STALE");
  });

  it("Test 7: Unverified observations cannot display as verified (Property-Based & Exhaustive)", () => {
    // 1. DRAFT is absent from public snapshot
    disclosureService.createDraft(
      {
        app_id: 1,
        metric_type: "MAU",
        metric_label: "Monthly active users",
        value_numeric: 500000000,
        reporting_period_end: "2026-10-31",
        disclosed_at: "2026-11-01",
        source_kind: "EARNINGS_RELEASE",
        source_url: "https://example.com/earnings",
        source_locator: "p. 5",
      },
      "operator"
    );

    const snapshot = snapshotService.getSnapshot("us");
    expect(snapshot.officialUsers.items).toHaveLength(0); // DRAFT excluded

    // 2. Property-based test over all combinations of deriveDisplayStatus inputs
    const metrics = [
      "APP_STORE_RANK",
      "SEARCH_INTEREST",
      "OFFICIAL_USERS",
      "SERVICE_STATUS",
      "DNS_POPULARITY",
    ] as const;

    const bools = [true, false];
    const statuses = [undefined, "DRAFT", "VERIFIED", "REJECTED", "WITHDRAWN"] as const;
    const nowIso = new Date().toISOString();

    for (const m of metrics) {
      for (const mEnabled of bools) {
        for (const sEnabled of bools) {
          for (const vStatus of statuses) {
            for (const isCur of [true, false, undefined]) {
              const res = deriveDisplayStatus({
                metric: m,
                metricEnabled: mEnabled,
                sourceEnabled: sEnabled,
                record: vStatus
                  ? {
                      verificationStatus: vStatus,
                      isCurrent: isCur,
                      referenceTime: nowIso,
                    }
                  : null,
                now: nowIso,
                staleAfterSeconds: 86400,
              });

              // Green "VERIFIED" is strictly impossible for any metric except OFFICIAL_USERS with VERIFIED & isCurrent=true
              if (res.status === "VERIFIED") {
                expect(m).toBe("OFFICIAL_USERS");
                expect(mEnabled).toBe(true);
                expect(sEnabled).toBe(true);
                expect(vStatus).toBe("VERIFIED");
                expect(isCur).not.toBe(false);
              }
            }
          }
        }
      }
    }
  });

  it("Test 8: Provenance is traceable for every displayed metric item", () => {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO source_observations (id, source_id, scope, request_url, collected_at, body_sha256) VALUES (42, 1, 'us/top-free/100', 'https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/100/apps.json', ?, 'hash')"
    ).run(now);
    db.prepare(
      "INSERT INTO chart_snapshots (id, observation_id, country, chart, source_updated_at, collected_at, list_size) VALUES (7, 42, 'us', 'top-free', ?, ?, 100)"
    ).run(now, now);
    db.prepare(
      "INSERT INTO app_store_rankings (id, snapshot_id, apple_app_id, app_id, rank, name_in_feed) VALUES (99, 7, '6448311069', 1, 4, 'ChatGPT')"
    ).run();

    const snapshot = snapshotService.getSnapshot("us");
    const item = snapshot.appStore.items[0];

    expect(item.provenance).toBeDefined();
    expect(item.provenance.metricName).toBe("App Store Popularity");
    expect(item.provenance.sourceName).toBe("Apple App Store charts");
    expect(item.provenance.sourceUrl).toBe("https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/100/apps.json");
    expect(item.provenance.geography).toBe("US");
    expect(item.provenance.sourceTimestamp).toBe(now);
    expect(item.provenance.collectionTimestamp).toBe(now);
    expect(item.provenance.databaseRef.table).toBe("app_store_rankings");
    expect(item.provenance.databaseRef.id).toBe(99);

    // Verify row links back to chart_snapshots (id 7) which links to source_observations (id 42)
    const rankRow = db.prepare("SELECT snapshot_id FROM app_store_rankings WHERE id = ?").get(item.provenance.databaseRef.id) as { snapshot_id: number };
    expect(rankRow.snapshot_id).toBe(7);

    const snapRow = db.prepare("SELECT observation_id FROM chart_snapshots WHERE id = ?").get(rankRow.snapshot_id) as { observation_id: number };
    expect(snapRow.observation_id).toBe(42);
  });
});
