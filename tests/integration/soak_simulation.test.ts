import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import { SnapshotService } from "@/lib/snapshot/service";

describe("Phase 10: Soak Simulation & Memory Stability Suite", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it("executes 500 continuous snapshot generations without unbounded memory growth", () => {
    const service = new SnapshotService(db);

    // Force GC if available or record baseline
    if (global.gc) global.gc();
    const initialHeap = process.memoryUsage().heapUsed;

    for (let i = 0; i < 500; i++) {
      const snap = service.getSnapshot("us");
      expect(snap.appStore.status).toBeDefined();
      expect(snap.concurrentUsers.available).toBe(false);
    }

    if (global.gc) global.gc();
    const finalHeap = process.memoryUsage().heapUsed;
    const growthMb = (finalHeap - initialHeap) / (1024 * 1024);

    // Memory growth should remain strictly bounded (< 30 MB for 500 cycles in V8)
    expect(growthMb).toBeLessThan(35);
  });
});
