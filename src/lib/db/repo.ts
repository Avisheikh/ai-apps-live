import Database from "better-sqlite3";
import { getDb } from "./index";

export interface AppRecord {
  id: number;
  slug: string;
  display_name: string;
  vendor: string;
  apple_app_id: string | null;
  apple_identity_status: "UNCONFIRMED" | "CONFIRMED";
  trends_label: string | null;
  status_page_url: string | null;
  local_icon: string | null;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DataSourceRecord {
  id: number;
  key: string;
  name: string;
  kind: "AUTOMATIC" | "MANUAL_IMPORT" | "MANUAL_ENTRY";
  base_url: string;
  terms_url: string | null;
  license_note: string | null;
  enabled: number;
  disabled_reason: string | null;
  poll_interval_seconds: number | null;
  stale_after_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface MetricControlRecord {
  metric_key: string;
  enabled: number;
  reason: string | null;
  updated_by: string;
  updated_at: string;
}

export interface SourceHealthRecord {
  source_id: number;
  state: "UNKNOWN" | "HEALTHY" | "DEGRADED" | "DOWN" | "DISABLED";
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_source_updated_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
  observed_update_interval_seconds: number | null;
  updated_at: string;
}

export interface StreamEventRecord {
  id: number;
  event_type: string;
  payload_json: string;
  created_at: string;
}

export interface AuditLogRecord {
  id?: number;
  at: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
}

export class Repository {
  constructor(private db: Database.Database = getDb()) {}

  // ───────────── Apps ─────────────
  getApps(onlyActive = true): AppRecord[] {
    const query = onlyActive
      ? "SELECT * FROM apps WHERE is_active = 1 ORDER BY sort_order ASC, id ASC"
      : "SELECT * FROM apps ORDER BY sort_order ASC, id ASC";
    return this.db.prepare(query).all() as AppRecord[];
  }

  getAppById(id: number): AppRecord | undefined {
    return this.db.prepare("SELECT * FROM apps WHERE id = ?").get(id) as AppRecord | undefined;
  }

  getAppBySlug(slug: string): AppRecord | undefined {
    return this.db.prepare("SELECT * FROM apps WHERE slug = ?").get(slug) as AppRecord | undefined;
  }

  getAppByAppleAppId(appleAppId: string): AppRecord | undefined {
    return this.db.prepare("SELECT * FROM apps WHERE apple_app_id = ?").get(appleAppId) as AppRecord | undefined;
  }

  createApp(data: Omit<AppRecord, "id" | "created_at" | "updated_at">): AppRecord {
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO apps (slug, display_name, vendor, apple_app_id, apple_identity_status, trends_label, status_page_url, local_icon, is_active, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.slug,
        data.display_name,
        data.vendor,
        data.apple_app_id,
        data.apple_identity_status,
        data.trends_label,
        data.status_page_url,
        data.local_icon,
        data.is_active,
        data.sort_order,
        now,
        now
      );
    return this.getAppById(Number(info.lastInsertRowid))!;
  }

  updateApp(id: number, data: Partial<AppRecord>): AppRecord {
    const current = this.getAppById(id);
    if (!current) throw new Error(`App ${id} not found`);

    const updated = { ...current, ...data, updated_at: new Date().toISOString() };
    this.db
      .prepare(
        `UPDATE apps SET
         slug = ?, display_name = ?, vendor = ?, apple_app_id = ?,
         apple_identity_status = ?, trends_label = ?, status_page_url = ?,
         local_icon = ?, is_active = ?, sort_order = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        updated.slug,
        updated.display_name,
        updated.vendor,
        updated.apple_app_id,
        updated.apple_identity_status,
        updated.trends_label,
        updated.status_page_url,
        updated.local_icon,
        updated.is_active,
        updated.sort_order,
        updated.updated_at,
        id
      );
    return updated;
  }

  // ───────────── Data Sources ─────────────
  getDataSources(): DataSourceRecord[] {
    return this.db.prepare("SELECT * FROM data_sources ORDER BY id ASC").all() as DataSourceRecord[];
  }

  getDataSourceByKey(key: string): DataSourceRecord | undefined {
    return this.db.prepare("SELECT * FROM data_sources WHERE key = ?").get(key) as DataSourceRecord | undefined;
  }

  updateDataSource(
    key: string,
    updates: {
      enabled?: number;
      disabled_reason?: string | null;
      poll_interval_seconds?: number | null;
      stale_after_seconds?: number;
    }
  ): DataSourceRecord {
    const current = this.getDataSourceByKey(key);
    if (!current) throw new Error(`Data source ${key} not found`);

    const now = new Date().toISOString();
    const updated = { ...current, ...updates, updated_at: now };

    this.db
      .prepare(
        `UPDATE data_sources SET
         enabled = ?, disabled_reason = ?, poll_interval_seconds = ?,
         stale_after_seconds = ?, updated_at = ?
         WHERE key = ?`
      )
      .run(
        updated.enabled,
        updated.disabled_reason,
        updated.poll_interval_seconds,
        updated.stale_after_seconds,
        now,
        key
      );

    return updated;
  }

  // ───────────── Metric Controls ─────────────
  getMetricControls(): MetricControlRecord[] {
    return this.db.prepare("SELECT * FROM metric_controls ORDER BY metric_key ASC").all() as MetricControlRecord[];
  }

  getMetricControl(key: string): MetricControlRecord | undefined {
    return this.db.prepare("SELECT * FROM metric_controls WHERE metric_key = ?").get(key) as MetricControlRecord | undefined;
  }

  updateMetricControl(key: string, enabled: boolean, reason: string | null, updatedBy: string): MetricControlRecord {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE metric_controls SET
         enabled = ?, reason = ?, updated_by = ?, updated_at = ?
         WHERE metric_key = ?`
      )
      .run(enabled ? 1 : 0, reason, updatedBy, now, key);

    return this.getMetricControl(key)!;
  }

  // ───────────── Source Health ─────────────
  getSourceHealthList(): (SourceHealthRecord & { source_key: string; source_name: string })[] {
    return this.db
      .prepare(
        `SELECT sh.*, ds.key as source_key, ds.name as source_name
         FROM source_health sh
         JOIN data_sources ds ON ds.id = sh.source_id
         ORDER BY ds.id ASC`
      )
      .all() as (SourceHealthRecord & { source_key: string; source_name: string })[];
  }

  getSourceHealth(sourceId: number): SourceHealthRecord | undefined {
    return this.db.prepare("SELECT * FROM source_health WHERE source_id = ?").get(sourceId) as SourceHealthRecord | undefined;
  }

  upsertSourceHealth(health: SourceHealthRecord): void {
    this.db
      .prepare(
        `INSERT INTO source_health (source_id, state, last_attempt_at, last_success_at, last_source_updated_at, consecutive_failures, last_error, observed_update_interval_seconds, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET
           state = excluded.state,
           last_attempt_at = excluded.last_attempt_at,
           last_success_at = excluded.last_success_at,
           last_source_updated_at = excluded.last_source_updated_at,
           consecutive_failures = excluded.consecutive_failures,
           last_error = excluded.last_error,
           observed_update_interval_seconds = excluded.observed_update_interval_seconds,
           updated_at = excluded.updated_at`
      )
      .run(
        health.source_id,
        health.state,
        health.last_attempt_at,
        health.last_success_at,
        health.last_source_updated_at,
        health.consecutive_failures,
        health.last_error,
        health.observed_update_interval_seconds,
        health.updated_at
      );
  }

  // ───────────── Stream Events ─────────────
  insertStreamEvent(eventType: string, payload: unknown): number {
    const now = new Date().toISOString();
    const payloadJson = typeof payload === "string" ? payload : JSON.stringify(payload);
    const info = this.db
      .prepare("INSERT INTO stream_events (event_type, payload_json, created_at) VALUES (?, ?, ?)")
      .run(eventType, payloadJson, now);
    return Number(info.lastInsertRowid);
  }

  getStreamEventsSince(lastId: number, limit = 100): StreamEventRecord[] {
    return this.db
      .prepare("SELECT * FROM stream_events WHERE id > ? ORDER BY id ASC LIMIT ?")
      .all(lastId, limit) as StreamEventRecord[];
  }

  getLatestStreamEventId(): number {
    const row = this.db.prepare("SELECT MAX(id) as max_id FROM stream_events").get() as { max_id: number | null };
    return row?.max_id || 0;
  }

  // ───────────── Audit Log ─────────────
  insertAuditLog(log: Omit<AuditLogRecord, "id">): void {
    this.db
      .prepare(
        `INSERT INTO audit_log (at, actor, action, entity, entity_id, before_json, after_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        log.at,
        log.actor,
        log.action,
        log.entity,
        log.entity_id,
        log.before_json,
        log.after_json
      );
  }

  getAuditLogs(limit = 100): AuditLogRecord[] {
    return this.db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?").all(limit) as AuditLogRecord[];
  }

  // ───────────── Settings ─────────────
  getSetting<T>(key: string, defaultValue: T): T {
    const row = this.db.prepare("SELECT value_json FROM settings WHERE key = ?").get(key) as { value_json: string } | undefined;
    if (!row) return defaultValue;
    try {
      return JSON.parse(row.value_json) as T;
    } catch {
      return defaultValue;
    }
  }

  setSetting<T>(key: string, value: T): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run(key, JSON.stringify(value), now);
  }
}
