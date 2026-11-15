import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import { Repository } from "@/lib/db/repo";
import { AppleRssCollector } from "@/collectors/apple-rss/index";
import { Scheduler } from "@/worker/scheduler";
import { createSseStream } from "@/lib/sse/hub";
import { createMockAppleFeed } from "../fixtures/apple_feed_fixture";

describe("Phase 10: Chaos & Failure Resilience Suite", () => {
  let db: Database.Database;
  let repo: Repository;
  let mockServer: http.Server | null = null;
  let mockPort = 0;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repo = new Repository(db);
  });

  afterEach(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer!.close(() => resolve()));
      mockServer = null;
    }
    db.close();
  });

  it("handles outbound network blockage gracefully, preserving prior data and degrading health", async () => {
    // 1. Point collector to an unrouteable loopback port
    const collector = new AppleRssCollector("http://127.0.0.1:59998", 5);
    const scheduler = new Scheduler(db);
    scheduler.registerCollector(collector);

    const result = await scheduler.runCollector("apple_rss");
    expect(result.status).toBe("FAILED");

    // Prior snapshots count is 0, database is not corrupted
    const snapCount = (db.prepare("SELECT count(*) as c FROM chart_snapshots").get() as { c: number }).c;
    expect(snapCount).toBe(0);

    // Health state recorded failure via repo
    const health = repo.getSourceHealth(1);
    expect(health?.consecutive_failures).toBe(1);
  });

  it("rejects malformed upstream JSON, failing run without corrupting rankings", async () => {
    mockServer = http.createServer((req, res) => {
      res.writeHead(200, {
        "Content-Type": "application/json",
        Date: new Date().toUTCString(),
      });
      res.end('{"feed": {"title": "Top Free", "results": [ { incomplete json');
    });

    await new Promise<void>((resolve) => mockServer!.listen(0, "127.0.0.1", () => resolve()));
    mockPort = (mockServer.address() as { port: number }).port;

    const collector = new AppleRssCollector(`http://127.0.0.1:${mockPort}`, 5);
    const scheduler = new Scheduler(db);
    scheduler.registerCollector(collector);

    const result = await scheduler.runCollector("apple_rss");
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("MALFORMED_JSON");

    // Zero invalid rankings created
    const rankCount = (db.prepare("SELECT count(*) as c FROM app_store_rankings").get() as { c: number }).c;
    expect(rankCount).toBe(0);
  });

  it("rejects 10-day-old source timestamp (implausible updated header), failing run and blocking snapshot", async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000).toUTCString();

    mockServer = http.createServer((req, res) => {
      res.writeHead(200, {
        "Content-Type": "application/json",
        Date: new Date().toUTCString(),
      });
      res.end(JSON.stringify(createMockAppleFeed({ updated: tenDaysAgo, count: 100 })));
    });

    await new Promise<void>((resolve) => mockServer!.listen(0, "127.0.0.1", () => resolve()));
    mockPort = (mockServer.address() as { port: number }).port;

    const collector = new AppleRssCollector(`http://127.0.0.1:${mockPort}`, 5);
    const scheduler = new Scheduler(db);
    scheduler.registerCollector(collector);

    const result = await scheduler.runCollector("apple_rss");
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("SOURCE_TIMESTAMP_IMPLAUSIBLE");

    const snapshots = db.prepare("SELECT count(*) as count FROM chart_snapshots").get() as { count: number };
    expect(snapshots.count).toBe(0);
  });

  it("handles SSE client disconnection cleanly without unhandled exceptions", async () => {
    const req = new Request("http://127.0.0.1:3000/api/public/stream");
    const response = createSseStream(req, "us");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    // Read initial snapshot chunk
    const firstChunk = await reader!.read();
    expect(firstChunk.done).toBe(false);
    const text = new TextDecoder().decode(firstChunk.value);
    expect(text).toContain("event: snapshot");

    // Cancel reader (simulates client disconnect)
    await reader!.cancel();
  });
});
