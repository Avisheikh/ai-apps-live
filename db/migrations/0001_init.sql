-- AI Apps Live — SQLite schema v1 (migration 0001_init.sql)
-- All timestamps: UTC, ISO-8601 with milliseconds and trailing Z (e.g. 2026-11-15T01:48:08.000Z).
-- Run at every connection: PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  applied_at  TEXT NOT NULL
);

-- ───────────── Registry ─────────────
CREATE TABLE apps (
  id                    INTEGER PRIMARY KEY,
  slug                  TEXT NOT NULL UNIQUE,
  display_name          TEXT NOT NULL,
  vendor                TEXT NOT NULL,
  apple_app_id          TEXT UNIQUE,                       -- numeric App Store ID stored as text
  apple_identity_status TEXT NOT NULL DEFAULT 'UNCONFIRMED'
                        CHECK (apple_identity_status IN ('UNCONFIRMED','CONFIRMED')),
  trends_label          TEXT,                              -- exact term/topic label used in Google Trends CSV header
  status_page_url       TEXT CHECK (status_page_url IS NULL OR status_page_url LIKE 'https://%'),
  local_icon            TEXT,                              -- path to a locally generated monogram/asset, never a copied logo
  is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order            INTEGER NOT NULL DEFAULT 100,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE data_sources (
  id                     INTEGER PRIMARY KEY,
  key                    TEXT NOT NULL UNIQUE,   -- apple_rss | google_trends_csv | company_disclosure | statuspage | cloudflare_radar
  name                   TEXT NOT NULL,
  kind                   TEXT NOT NULL CHECK (kind IN ('AUTOMATIC','MANUAL_IMPORT','MANUAL_ENTRY')),
  base_url               TEXT NOT NULL,
  terms_url              TEXT,
  license_note           TEXT,
  enabled                INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  disabled_reason        TEXT,
  poll_interval_seconds  INTEGER CHECK (poll_interval_seconds IS NULL OR poll_interval_seconds >= 60),
  stale_after_seconds    INTEGER NOT NULL CHECK (stale_after_seconds > 0),
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  CHECK (kind <> 'AUTOMATIC' OR base_url LIKE 'https://%')
);

CREATE TABLE metric_controls (
  metric_key  TEXT PRIMARY KEY CHECK (metric_key IN
              ('APP_STORE_RANK','SEARCH_INTEREST','OFFICIAL_USERS','CONCURRENT_USERS','SERVICE_STATUS','DNS_POPULARITY')),
  enabled     INTEGER NOT NULL CHECK (enabled IN (0,1)),
  reason      TEXT,
  updated_by  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- v1 hard rule: CONCURRENT_USERS can never be enabled.
CREATE TRIGGER trg_block_concurrent_enable_upd
BEFORE UPDATE OF enabled ON metric_controls
WHEN NEW.metric_key = 'CONCURRENT_USERS' AND NEW.enabled = 1
BEGIN SELECT RAISE(ABORT, 'CONCURRENT_USERS is locked off in v1 (see ACCURACY_POLICY.md)'); END;

CREATE TRIGGER trg_block_concurrent_enable_ins
BEFORE INSERT ON metric_controls
WHEN NEW.metric_key = 'CONCURRENT_USERS' AND NEW.enabled = 1
BEGIN SELECT RAISE(ABORT, 'CONCURRENT_USERS is locked off in v1 (see ACCURACY_POLICY.md)'); END;

-- ───────────── Collection provenance ─────────────
CREATE TABLE collector_runs (
  id                INTEGER PRIMARY KEY,
  source_id         INTEGER NOT NULL REFERENCES data_sources(id),
  scope             TEXT NOT NULL,                         -- e.g. 'us/top-free/100'
  started_at        TEXT NOT NULL,
  finished_at       TEXT,
  status            TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCESS','NO_CHANGE','FAILED','SKIPPED')),
  http_status       INTEGER,
  error_code        TEXT,
  error_message     TEXT,
  records_seen      INTEGER,
  records_inserted  INTEGER,
  records_rejected  INTEGER,
  server_date_header TEXT,                                 -- HTTP Date header of the response
  clock_skew_ms     INTEGER                                -- local clock minus server Date header
);
CREATE INDEX idx_runs_source_started ON collector_runs(source_id, started_at DESC);

CREATE TABLE source_observations (            -- raw, immutable except body pruning
  id                 INTEGER PRIMARY KEY,
  source_id          INTEGER NOT NULL REFERENCES data_sources(id),
  run_id             INTEGER REFERENCES collector_runs(id),
  scope              TEXT NOT NULL,
  request_url        TEXT NOT NULL,
  collected_at       TEXT NOT NULL,
  source_updated_at  TEXT,                                 -- as stated by the source, if it states one
  content_type       TEXT,
  body_sha256        TEXT NOT NULL,
  body_gzip          BLOB,                                 -- NULL only after retention pruning
  body_pruned_at     TEXT
);
CREATE INDEX idx_obs_source_scope ON source_observations(source_id, scope, collected_at DESC);

CREATE TABLE source_health (
  source_id                          INTEGER PRIMARY KEY REFERENCES data_sources(id),
  state                              TEXT NOT NULL CHECK (state IN ('UNKNOWN','HEALTHY','DEGRADED','DOWN','DISABLED')),
  last_attempt_at                    TEXT,
  last_success_at                    TEXT,
  last_source_updated_at             TEXT,
  consecutive_failures               INTEGER NOT NULL DEFAULT 0,
  last_error                         TEXT,
  observed_update_interval_seconds   INTEGER,              -- median gap between distinct source_updated_at values
  updated_at                         TEXT NOT NULL
);

-- ───────────── Metric 1: App Store popularity ─────────────
CREATE TABLE chart_snapshots (                -- one row per observed chart state, even if no tracked app is in it
  id                 INTEGER PRIMARY KEY,
  observation_id     INTEGER NOT NULL REFERENCES source_observations(id),
  country            TEXT NOT NULL CHECK (length(country) = 2 AND country = lower(country)),
  chart              TEXT NOT NULL CHECK (chart IN ('top-free','top-paid')),
  source_updated_at  TEXT NOT NULL,
  collected_at       TEXT NOT NULL,
  list_size          INTEGER NOT NULL CHECK (list_size BETWEEN 1 AND 100),
  UNIQUE (country, chart, source_updated_at)             -- duplicate detection
);

CREATE TABLE app_store_rankings (
  id              INTEGER PRIMARY KEY,
  snapshot_id     INTEGER NOT NULL REFERENCES chart_snapshots(id),
  apple_app_id    TEXT NOT NULL,
  app_id          INTEGER REFERENCES apps(id),             -- NULL for untracked apps; history is kept so apps can be added later
  rank            INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 100),
  name_in_feed    TEXT NOT NULL,
  artist_in_feed  TEXT,
  UNIQUE (snapshot_id, apple_app_id),
  UNIQUE (snapshot_id, rank)
);
CREATE INDEX idx_rank_app ON app_store_rankings(app_id, snapshot_id);

-- append-only protection
CREATE TRIGGER trg_rank_no_update BEFORE UPDATE OF snapshot_id, apple_app_id, rank, name_in_feed ON app_store_rankings
BEGIN SELECT RAISE(ABORT, 'app_store_rankings is append-only'); END;

CREATE TRIGGER trg_rank_no_delete BEFORE DELETE ON app_store_rankings
BEGIN SELECT RAISE(ABORT, 'app_store_rankings is append-only'); END;

CREATE TRIGGER trg_snapshot_no_delete BEFORE DELETE ON chart_snapshots
BEGIN SELECT RAISE(ABORT, 'chart_snapshots is append-only'); END;

-- ───────────── Metric 2: Search interest (manual Google Trends CSV) ─────────────
CREATE TABLE search_interest_imports (
  id                INTEGER PRIMARY KEY,
  source_id         INTEGER NOT NULL REFERENCES data_sources(id),
  original_filename TEXT NOT NULL,
  file_sha256       TEXT NOT NULL UNIQUE,                  -- duplicate-file detection
  raw_file          BLOB NOT NULL,                         -- original bytes, preserved
  imported_at       TEXT NOT NULL,
  imported_by       TEXT NOT NULL,
  exported_at       TEXT NOT NULL,                         -- date the admin downloaded it from Google Trends (declared)
  geo               TEXT NOT NULL,                         -- ISO 3166 code or 'WORLD'
  geo_label         TEXT NOT NULL,                         -- as shown in the CSV header, e.g. 'United States'
  search_type       TEXT NOT NULL CHECK (search_type IN ('web','image','news','youtube','shopping')),
  entity_mode       TEXT NOT NULL CHECK (entity_mode IN ('search_term','topic')),
  category          TEXT NOT NULL DEFAULT 'All categories',
  time_range_label  TEXT NOT NULL,                         -- as selected in the Trends UI
  granularity       TEXT NOT NULL CHECK (granularity IN ('hourly','daily','weekly','monthly')),
  period_start      TEXT NOT NULL,
  period_end        TEXT NOT NULL,
  header_terms_json TEXT NOT NULL,                         -- comparison set exactly as in the file (values are only comparable within one import)
  status            TEXT NOT NULL CHECK (status IN ('ACCEPTED','REJECTED')),
  reject_reason     TEXT,
  is_current        INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0,1))
);

CREATE TABLE search_interest (
  id            INTEGER PRIMARY KEY,
  import_id     INTEGER NOT NULL REFERENCES search_interest_imports(id),
  app_id        INTEGER NOT NULL REFERENCES apps(id),
  term_label    TEXT NOT NULL,
  bucket_start  TEXT NOT NULL,
  value_raw     TEXT NOT NULL,                             -- verbatim cell, e.g. '57' or '<1'
  value_index   INTEGER CHECK (value_index IS NULL OR value_index BETWEEN 0 AND 100),  -- NULL when '<1'
  is_partial    INTEGER NOT NULL DEFAULT 0 CHECK (is_partial IN (0,1)),
  UNIQUE (import_id, app_id, bucket_start)
);

CREATE TRIGGER trg_si_no_update BEFORE UPDATE OF import_id, app_id, bucket_start, value_raw, value_index ON search_interest
BEGIN SELECT RAISE(ABORT, 'search_interest is append-only'); END;

-- ───────────── Metric 3: Officially reported users (manual, human-verified) ─────────────
CREATE TABLE company_disclosures (
  id                      INTEGER PRIMARY KEY,
  app_id                  INTEGER NOT NULL REFERENCES apps(id),
  metric_type             TEXT NOT NULL CHECK (metric_type IN ('DAU','WAU','MAU','OTHER')),   -- no concurrent type exists, by design
  metric_label            TEXT NOT NULL,                   -- what the company actually counted, e.g. 'Gemini app monthly active users'
  value_numeric           INTEGER NOT NULL CHECK (value_numeric > 0),
  value_qualifier         TEXT NOT NULL DEFAULT 'EXACT' CHECK (value_qualifier IN ('EXACT','AT_LEAST','ABOUT')),
  unit                    TEXT NOT NULL DEFAULT 'users',
  geography               TEXT NOT NULL DEFAULT 'GLOBAL',
  reporting_period_start  TEXT,
  reporting_period_end    TEXT NOT NULL,                   -- the "as of" date the company gave
  disclosed_at            TEXT NOT NULL,                   -- date the company published it
  source_kind             TEXT NOT NULL CHECK (source_kind IN
                          ('EARNINGS_CALL','EARNINGS_RELEASE','COMPANY_BLOG','EXECUTIVE_STATEMENT','REGULATORY_FILING','OTHER_OFFICIAL')),
  source_url              TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  source_locator          TEXT NOT NULL,                   -- page, slide, timestamp or short (<15 word) quote
  entered_by              TEXT NOT NULL,
  entered_at              TEXT NOT NULL,
  verification_status     TEXT NOT NULL DEFAULT 'DRAFT' CHECK (verification_status IN ('DRAFT','VERIFIED','REJECTED','WITHDRAWN')),
  verified_by             TEXT,
  verified_at             TEXT,
  verifier_note           TEXT,
  supersedes_id           INTEGER REFERENCES company_disclosures(id),
  is_current              INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0,1)),
  CHECK (verification_status <> 'VERIFIED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE INDEX idx_disc_app ON company_disclosures(app_id, verification_status, is_current);

CREATE TRIGGER trg_disc_no_value_edit_after_verify
BEFORE UPDATE OF app_id, metric_type, metric_label, value_numeric, value_qualifier, geography,
                 reporting_period_end, source_url ON company_disclosures
WHEN OLD.verification_status = 'VERIFIED'
BEGIN SELECT RAISE(ABORT, 'verified disclosures are immutable; create a superseding record'); END;

-- ───────────── Optional metric modules (default OFF until enabled in /admin) ─────────────
CREATE TABLE service_status_observations (       -- operational status only; says nothing about user counts
  id                INTEGER PRIMARY KEY,
  app_id            INTEGER NOT NULL REFERENCES apps(id),
  observation_id    INTEGER NOT NULL REFERENCES source_observations(id),
  collected_at      TEXT NOT NULL,
  page_updated_at   TEXT,
  indicator         TEXT NOT NULL CHECK (indicator IN ('none','minor','major','critical','maintenance','unknown')),
  description       TEXT NOT NULL
);

CREATE TABLE dns_popularity_observations (       -- Cloudflare Radar; relative ranking, CC BY-NC 4.0 data
  id                INTEGER PRIMARY KEY,
  observation_id    INTEGER NOT NULL REFERENCES source_observations(id),
  app_id            INTEGER REFERENCES apps(id),
  service_name      TEXT NOT NULL,
  rank              INTEGER NOT NULL CHECK (rank >= 1),
  ranking_date      TEXT NOT NULL,
  collected_at      TEXT NOT NULL,
  UNIQUE (service_name, ranking_date)
);

-- ───────────── Broadcast + audit + settings ─────────────
CREATE TABLE stream_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,   -- used as SSE Last-Event-ID
  event_type    TEXT NOT NULL,                       -- ranking_update | disclosure_update | health_update | control_update
  payload_json  TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY,
  at           TEXT NOT NULL,
  actor        TEXT NOT NULL,
  action       TEXT NOT NULL,
  entity       TEXT NOT NULL,
  entity_id    TEXT,
  before_json  TEXT,
  after_json   TEXT
);

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
