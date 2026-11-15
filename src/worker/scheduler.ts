import Database from "better-sqlite3";
import { getDb } from "@/lib/db/index";
import { Repository, SourceHealthRecord } from "@/lib/db/repo";
import { Collector, CollectResult } from "@/collectors/types";
import { AppleRssCollector } from "@/collectors/apple-rss/index";

export function calculateBackoffSeconds(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  // Exponential backoff doubling from 60 s up to 6 h (21600 s)
  const base = Math.min(60 * Math.pow(2, consecutiveFailures - 1), 21600);
  // ±10% jitter
  const jitterFactor = 0.9 + Math.random() * 0.2;
  return Math.round(base * jitterFactor);
}

export function computeMedianUpdateInterval(db: Database.Database, country = "us", chart = "top-free"): number | null {
  const rows = db
    .prepare(
      `SELECT DISTINCT source_updated_at FROM chart_snapshots
       WHERE country = ? AND chart = ?
       ORDER BY source_updated_at DESC
       LIMIT 20`
    )
    .all(country, chart) as Array<{ source_updated_at: string }>;

  if (rows.length < 2) return null;

  const gaps: number[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const t1 = new Date(rows[i].source_updated_at).getTime();
    const t2 = new Date(rows[i + 1].source_updated_at).getTime();
    const diffSec = Math.abs(Math.round((t1 - t2) / 1000));
    if (diffSec > 0) gaps.push(diffSec);
  }

  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);

  const mid = Math.floor(gaps.length / 2);
  if (gaps.length % 2 === 1) {
    return gaps[mid];
  }
  return Math.round((gaps[mid - 1] + gaps[mid]) / 2);
}

export class Scheduler {
  private db: Database.Database;
  private repo: Repository;
  private collectors: Map<string, Collector> = new Map();
  private timers: NodeJS.Timeout[] = [];
  private isRunning = false;

  constructor(customDb?: Database.Database) {
    this.db = customDb || getDb();
    this.repo = new Repository(this.db);
    this.registerCollector(new AppleRssCollector());
  }

  registerCollector(collector: Collector): void {
    this.collectors.set(collector.key, collector);
  }

  async runCollector(key: string, specificScope?: string): Promise<CollectResult> {
    const collector = this.collectors.get(key);
    if (!collector) {
      throw new Error(`Collector '${key}' is not registered`);
    }

    const dataSource = this.repo.getDataSourceByKey(key);
    if (!dataSource) {
      throw new Error(`Data source '${key}' not found in database`);
    }

    const scopes = specificScope ? [specificScope] : collector.scopes();
    let finalResult: CollectResult = { status: "SKIPPED" };

    for (const scope of scopes) {
      const startedAt = new Date().toISOString();

      // Record running row
      const runInfo = this.db
        .prepare(
          `INSERT INTO collector_runs (source_id, scope, started_at, status)
           VALUES (?, ?, ?, 'RUNNING')`
        )
        .run(dataSource.id, scope, startedAt);
      const runId = Number(runInfo.lastInsertRowid);

      const ctx = {
        db: this.db,
        repo: this.repo,
        operatorContact: process.env.OPERATOR_CONTACT || "operator@localhost",
      };

      let result: CollectResult;
      try {
        result = await collector.collect(scope, ctx);
      } catch (err: unknown) {
        result = {
          status: "FAILED",
          errorCode: "COLLECTOR_UNCAUGHT_EXCEPTION",
          errorMessage: err instanceof Error ? err.message : String(err),
        };
      }

      const finishedAt = new Date().toISOString();

      // Update collector_runs row
      this.db
        .prepare(
          `UPDATE collector_runs SET
           finished_at = ?, status = ?, http_status = ?, error_code = ?,
           error_message = ?, records_seen = ?, records_inserted = ?,
           records_rejected = ?, server_date_header = ?, clock_skew_ms = ?
           WHERE id = ?`
        )
        .run(
          finishedAt,
          result.status,
          result.httpStatus || null,
          result.errorCode || null,
          result.errorMessage || null,
          result.recordsSeen || null,
          result.recordsInserted || null,
          result.recordsRejected || null,
          result.serverDateHeader || null,
          result.clockSkewMs !== undefined ? result.clockSkewMs : null,
          runId
        );

      // Update Source Health
      this.updateSourceHealth(dataSource.id, result, startedAt);

      finalResult = result;
    }

    return finalResult;
  }

  private updateSourceHealth(sourceId: number, result: CollectResult, attemptAt: string): void {
    const current = this.repo.getSourceHealth(sourceId);
    let consecutiveFailures = current ? current.consecutive_failures : 0;
    let lastSuccessAt = current ? current.last_success_at : null;
    let lastSourceUpdatedAt = current ? current.last_source_updated_at : null;
    let state: SourceHealthRecord["state"] = current ? current.state : "UNKNOWN";
    let lastError = current ? current.last_error : null;

    if (result.status === "SUCCESS" || result.status === "NO_CHANGE") {
      consecutiveFailures = 0;
      state = "HEALTHY";
      lastSuccessAt = attemptAt;
      if (result.sourceUpdatedAt) {
        lastSourceUpdatedAt = result.sourceUpdatedAt;
      }
      lastError = null;
    } else if (result.status === "FAILED") {
      consecutiveFailures += 1;
      lastError = result.errorMessage || result.errorCode || "Unknown collector error";

      if (consecutiveFailures >= 5) {
        state = "DOWN";
      } else if (consecutiveFailures >= 2) {
        state = "DEGRADED";
      }
    }

    const medianInterval = computeMedianUpdateInterval(this.db);
    const now = new Date().toISOString();

    this.repo.upsertSourceHealth({
      source_id: sourceId,
      state,
      last_attempt_at: attemptAt,
      last_success_at: lastSuccessAt,
      last_source_updated_at: lastSourceUpdatedAt,
      consecutive_failures: consecutiveFailures,
      last_error: lastError,
      observed_update_interval_seconds: medianInterval,
      updated_at: now,
    });

    // Emit health_update event to stream_events
    this.repo.insertStreamEvent("health_update", {
      sourceId,
      state,
      consecutiveFailures,
      lastAttemptAt: attemptAt,
      lastSuccessAt,
      lastError,
      updatedAt: now,
    });
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[Scheduler] Background scheduler started.");

    // Apple RSS periodic poll
    const runAppleRss = async () => {
      try {
        const ds = this.repo.getDataSourceByKey("apple_rss");
        if (ds && ds.enabled) {
          await this.runCollector("apple_rss");
        }
      } catch (err) {
        console.error("[Scheduler] Error running apple_rss collector:", err);
      }
    };

    // Run immediately on boot
    runAppleRss();

    // Schedule periodic execution every 30 mins (1800 s)
    const intervalTimer = setInterval(runAppleRss, 1800 * 1000);
    this.timers.push(intervalTimer);
  }

  stop(): void {
    this.isRunning = false;
    for (const t of this.timers) {
      clearInterval(t);
    }
    this.timers = [];
    console.log("[Scheduler] Background scheduler stopped.");
  }
}
