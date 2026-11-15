import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import { Repository } from "@/lib/db/repo";
import { AppleRssCollector } from "@/collectors/apple-rss/index";
import { Scheduler, calculateBackoffSeconds } from "@/worker/scheduler";
import { createMockAppleFeed } from "../fixtures/apple_feed_fixture";

describe("Apple RSS Collector & Scheduler Integration", () => {
  let db: Database.Database;
  let repo: Repository;
  let server: http.Server;
  let serverPort: number;
  let mockStatusCode = 200;
  const mockContentType = "application/json";
  let mockResponseBody = "";
  const mockResponseDelayMs = 0;

  beforeEach(async () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repo = new Repository(db);

    // Setup local mock server
    await new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        if (mockResponseDelayMs > 0) {
          setTimeout(() => {
            res.writeHead(mockStatusCode, {
              "Content-Type": mockContentType,
              Date: new Date().toUTCString(),
            });
            res.end(mockResponseBody);
          }, mockResponseDelayMs);
          return;
        }

        res.writeHead(mockStatusCode, {
          "Content-Type": mockContentType,
          Date: new Date().toUTCString(),
        });
        res.end(mockResponseBody);
      });

      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        serverPort = addr.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  it("successfully collects a 100-item feed, records observation, snapshot, rankings, and stream event", async () => {
    const fixedUpdated = new Date(Date.now() - 60000).toUTCString();
    const feedPayload = createMockAppleFeed({ updated: fixedUpdated, count: 100 });
    mockStatusCode = 200;
    mockResponseBody = JSON.stringify(feedPayload);

    const collector = new AppleRssCollector(`http://127.0.0.1:${serverPort}`, 10);
    const scheduler = new Scheduler(db);
    scheduler.registerCollector(collector);

    const result = await scheduler.runCollector("apple_rss");

    expect(result.status).toBe("SUCCESS");
    expect(result.recordsSeen).toBe(100);
    expect(result.recordsInserted).toBe(100);

    // Verify database state
    const snapshots = db.prepare("SELECT * FROM chart_snapshots").all();
    expect(snapshots).toHaveLength(1);

    const rankings = db.prepare("SELECT * FROM app_store_rankings WHERE snapshot_id = 1 ORDER BY rank ASC").all() as Array<{
      apple_app_id: string;
      app_id: number | null;
      rank: number;
      name_in_feed: string;
    }>;
    expect(rankings).toHaveLength(100);

    // Rank 4 is ChatGPT, but apple_identity_status is UNCONFIRMED, so app_id MUST be NULL
    const chatgptRanking = rankings.find((r) => r.rank === 4)!;
    expect(chatgptRanking.apple_app_id).toBe("6448311069");
    expect(chatgptRanking.name_in_feed).toBe("ChatGPT");
    expect(chatgptRanking.app_id).toBeNull(); // UNCONFIRMED ID never maps to apps.id!

    // Health state should be HEALTHY
    const health = repo.getSourceHealth(1)!;
    expect(health.state).toBe("HEALTHY");
    expect(health.consecutive_failures).toBe(0);

    // Stream events should contain ranking_update and health_update
    const events = repo.getStreamEventsSince(0);
    expect(events.some((e) => e.event_type === "ranking_update")).toBe(true);
    expect(events.some((e) => e.event_type === "health_update")).toBe(true);
  });

  it("maps app_id when apple_identity_status is CONFIRMED", async () => {
    // Confirm ChatGPT
    db.prepare("UPDATE apps SET apple_identity_status = 'CONFIRMED' WHERE slug = 'chatgpt'").run();

    const feedPayload = createMockAppleFeed({ updated: new Date(Date.now() - 60000).toUTCString(), count: 100 });
    mockStatusCode = 200;
    mockResponseBody = JSON.stringify(feedPayload);

    const collector = new AppleRssCollector(`http://127.0.0.1:${serverPort}`, 10);
    const scheduler = new Scheduler(db);
    scheduler.registerCollector(collector);

    await scheduler.runCollector("apple_rss");

    const chatgptRanking = db
      .prepare("SELECT app_id FROM app_store_rankings WHERE apple_app_id = '6448311069'")
      .get() as { app_id: number };
    expect(chatgptRanking.app_id).toBe(1); // Mapped to ChatGPT app id 1!
  });

  it("returns NO_CHANGE and does not duplicate snapshots when updated is unchanged", async () => {
    const fixedUpdated = new Date(Date.now() - 60000).toUTCString();
    const feedPayload = createMockAppleFeed({ updated: fixedUpdated, count: 100 });
    mockStatusCode = 200;
    mockResponseBody = JSON.stringify(feedPayload);

    const collector = new AppleRssCollector(`http://127.0.0.1:${serverPort}`, 10);
    const scheduler = new Scheduler(db);
    scheduler.registerCollector(collector);

    const firstRun = await scheduler.runCollector("apple_rss");
    expect(firstRun.status).toBe("SUCCESS");

    const secondRun = await scheduler.runCollector("apple_rss");
    expect(secondRun.status).toBe("NO_CHANGE");

    const snapshots = db.prepare("SELECT count(*) as count FROM chart_snapshots").get() as { count: number };
    expect(snapshots.count).toBe(1); // strictly 1 snapshot
  });

  it("handles implausible source timestamps (>5 min future or >7 days past) by storing observation, failing run, and blocking snapshot", async () => {
    // 10 days in the past
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000).toUTCString();
    mockStatusCode = 200;
    mockResponseBody = JSON.stringify(createMockAppleFeed({ updated: tenDaysAgo }));

    const collector = new AppleRssCollector(`http://127.0.0.1:${serverPort}`, 10);
    const scheduler = new Scheduler(db);
    scheduler.registerCollector(collector);

    const result = await scheduler.runCollector("apple_rss");
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("SOURCE_TIMESTAMP_IMPLAUSIBLE");

    // Observation stored for audit
    const obs = db.prepare("SELECT count(*) as count FROM source_observations").get() as { count: number };
    expect(obs.count).toBe(1);

    // Zero snapshots created!
    const snapshots = db.prepare("SELECT count(*) as count FROM chart_snapshots").get() as { count: number };
    expect(snapshots.count).toBe(0);
  });

  it("marks run FAILED on malformed JSON or duplicate IDs without creating snapshot", async () => {
    mockStatusCode = 200;
    mockResponseBody = "INVALID_NOT_JSON";

    const collector = new AppleRssCollector(`http://127.0.0.1:${serverPort}`, 10);
    const scheduler = new Scheduler(db);
    scheduler.registerCollector(collector);

    const result = await scheduler.runCollector("apple_rss");
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("MALFORMED_JSON");

    const snapshots = db.prepare("SELECT count(*) as count FROM chart_snapshots").get() as { count: number };
    expect(snapshots.count).toBe(0);
  });

  it("transitions health state through DEGRADED at 2 failures and DOWN at 5 failures, keeping prior data intact", async () => {
    // First, complete a successful collection so prior data exists
    const validPayload = createMockAppleFeed({ updated: new Date(Date.now() - 60000).toUTCString() });
    mockStatusCode = 200;
    mockResponseBody = JSON.stringify(validPayload);

    const collector = new AppleRssCollector(`http://127.0.0.1:${serverPort}`, 10);
    const scheduler = new Scheduler(db);
    scheduler.registerCollector(collector);

    await scheduler.runCollector("apple_rss");
    expect(repo.getSourceHealth(1)!.state).toBe("HEALTHY");

    // Now simulate failures (HTTP 500)
    mockStatusCode = 500;
    mockResponseBody = "Internal Server Error";

    // Failure 1
    await scheduler.runCollector("apple_rss");
    let health = repo.getSourceHealth(1)!;
    expect(health.consecutive_failures).toBe(1);
    expect(health.state).toBe("HEALTHY"); // 1 failure does not degrade yet

    // Failure 2 -> moves to DEGRADED
    await scheduler.runCollector("apple_rss");
    health = repo.getSourceHealth(1)!;
    expect(health.consecutive_failures).toBe(2);
    expect(health.state).toBe("DEGRADED");

    // Failure 3 & 4 -> still DEGRADED
    await scheduler.runCollector("apple_rss");
    await scheduler.runCollector("apple_rss");
    health = repo.getSourceHealth(1)!;
    expect(health.consecutive_failures).toBe(4);
    expect(health.state).toBe("DEGRADED");

    // Failure 5 -> moves to DOWN
    await scheduler.runCollector("apple_rss");
    health = repo.getSourceHealth(1)!;
    expect(health.consecutive_failures).toBe(5);
    expect(health.state).toBe("DOWN");

    // CRITICAL: Previously collected data remains completely intact!
    const snapshots = db.prepare("SELECT count(*) as count FROM chart_snapshots").get() as { count: number };
    expect(snapshots.count).toBe(1);
    const rankings = db.prepare("SELECT count(*) as count FROM app_store_rankings").get() as { count: number };
    expect(rankings.count).toBe(100);
  });

  it("calculates exponential backoff with jitter and 6-hour ceiling", () => {
    expect(calculateBackoffSeconds(0)).toBe(0);

    const b1 = calculateBackoffSeconds(1); // base 60s
    expect(b1).toBeGreaterThanOrEqual(54); // 60 * 0.9
    expect(b1).toBeLessThanOrEqual(66); // 60 * 1.1

    const b2 = calculateBackoffSeconds(2); // base 120s
    expect(b2).toBeGreaterThanOrEqual(108);
    expect(b2).toBeLessThanOrEqual(132);

    const b3 = calculateBackoffSeconds(3); // base 240s
    expect(b3).toBeGreaterThanOrEqual(216);
    expect(b3).toBeLessThanOrEqual(264);

    const bLarge = calculateBackoffSeconds(15); // capped at 21600s (6h)
    expect(bLarge).toBeGreaterThanOrEqual(19440);
    expect(bLarge).toBeLessThanOrEqual(23760);
  });
});
