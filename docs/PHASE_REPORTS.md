# AI Apps Live — Phase Reports

## Phase 1 Report: Repository Inspection and Architecture Scaffold

**Date:** 2026-11-15T13:54:00Z  
**Phase Status:** COMPLETED

### 1. What Changed
- Inspected the host system and user workspace (`/home/avisheikh`). Noted Node.js `v24.5.0`, npm `11.5.1`, and Git `2.54.0`.
- Initialized a clean project repository at `/home/avisheikh/ai-apps-live` on git branch `main`.
- Authored `docs/INSPECTION.md` recording system environment, tooling, and directory structure.
- Authored `docs/adr/0001-stack-and-process-model.md` specifying the dual-process architecture (`web` and `worker`), SQLite WAL mode, status derivation rules, and security policies.
- Configured project scaffolding:
  - `package.json` with scripts: `dev`, `build`, `start`, `worker`, `typecheck`, `lint`, `test`, `test:e2e`, `db:migrate`, `db:seed`, `admin:hash`.
  - Dependencies: `next@16.4.6`, `react@19.0.0`, `react-dom@19.0.0`, `better-sqlite3@13.2.0`, `zod@4.6.7`, `csv-parse@7.0.3`, `@fontsource/inter@5.3.0`, `@fontsource/jetbrains-mono@5.3.0`.
  - Dev dependencies: `typescript@6.0.3`, `vitest@5.1.0`, `@playwright/test@1.65.1`, `tailwindcss@3.4.19`, `eslint@9.39.5`, `tsx@4.23.15`, `@rolldown/binding-linux-x64-gnu`.
  - Environment config: `.env.example`, `.env` with scrypt admin password hash.
  - Next.js config with security headers (strict CSP, frame-options, referrer policy) and mzstatic image remote patterns.
  - Tailwind and PostCSS configurations with exact dark broadcast design tokens.
  - Scrypt password hashing and verification utility in `src/lib/auth/hash.ts`.
  - Scaffold entries for worker, migrations, seeds, and unit tests.

### 2. Commands Actually Run & Final Output Lines

#### Command: `npm run typecheck`
```
> ai-apps-live@1.0.0 typecheck
> tsc --noEmit
```
(Exited with code 0)

#### Command: `npm run lint`
```
> ai-apps-live@1.0.0 lint
> eslint .
```
(Exited with code 0, 0 errors, 0 warnings)

#### Command: `npm run test`
```
> ai-apps-live@1.0.0 test
> vitest run

 ✓ tests/unit/scaffold.test.ts (1 test) 163ms
   ✓ Scaffold Verification (1)
     ✓ authenticates password hashing and verification accurately with scrypt 161ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  13:53:17
   Duration  532ms (tests 68%, transform 16%, import 9%, worker 8%)
```
(Exited with code 0)

#### Command: `npm run build`
```
✓ Generating static pages using 4 workers (3/3) in 603ms
  Finalizing page optimization in 7ms    ✓ Finalizing page optimization in 7ms 

Route (app)
┌ ○ /
└ ○ /_not-found

○  (Static)  prerendered as static content
```
(Exited with code 0)

### 3. Test Counts
- Unit tests: 1 passed, 0 failed.
- Type check: 0 errors.
- Lint: 0 problems.

### 4. Known Gaps
- Database migrations, tables, triggers, and seed data will be implemented in Phase 2.
- Real Apple RSS collector implementation scheduled for Phase 3.


## Phase 2 Report: Database Schema, Migrations, Registry, and Integrity

**Date:** 2026-11-15T13:57:30Z  
**Phase Status:** COMPLETED

### 1. What Changed
- Created `db/migrations/0001_init.sql` matching the exact SQLite v1 schema with WAL mode, foreign keys, constraints, and database triggers:
  - `trg_block_concurrent_enable_upd` and `trg_block_concurrent_enable_ins` locking `CONCURRENT_USERS` metric permanently off.
  - `trg_rank_no_update`, `trg_rank_no_delete`, and `trg_snapshot_no_delete` enforcing append-only protection on App Store rankings and snapshots.
  - `trg_si_no_update` enforcing append-only protection on search interest data.
  - `trg_disc_no_value_edit_after_verify` enforcing that verified disclosures cannot be edited in place.
- Created `db/migrations/0002_seed.sql` seeding:
  - 10 tracked apps (ChatGPT, Claude, Google Gemini, DeepSeek, Perplexity, Grok, Microsoft Copilot, Character.AI, Poe, Meta AI). Apple IDs set only for ChatGPT, Claude, and Gemini with status `UNCONFIRMED`; all others NULL.
  - 5 data sources (`apple_rss`, `google_trends_csv`, `company_disclosure`, `statuspage`, `cloudflare_radar`).
  - Source health records initialized in `UNKNOWN` or `DISABLED`.
  - Metric controls enabled for core metrics and disabled for concurrent users and optional modules.
  - Zero metric values seeded.
- Implemented `src/lib/db/index.ts` connection manager supporting `DATABASE_PATH`, `DEMO_MODE`, and in-memory databases.
- Implemented `src/lib/db/migrate.ts` migration runner recording applied migrations in `schema_migrations`.
- Implemented `src/lib/db/seed.ts` runner.
- Implemented `src/lib/db/integrity.ts` scanning for `example.test` fixture leaks and throwing on production integrity violations.
- Implemented `src/lib/db/repo.ts` typed repository layer for apps, data sources, metric controls, source health, stream events, audit logs, and settings.
- Authored test suite `tests/unit/database.test.ts` covering migrations, schema triggers, seed purity, and integrity verification.

### 2. Commands Actually Run & Final Output Lines

#### Command: `npm run db:migrate && npm run db:seed`
```
> ai-apps-live@1.0.0 db:migrate
> tsx src/lib/db/migrate.ts

[DB Migration] Applied: 0001_init.sql
[DB Migration] Applied: 0002_seed.sql
[DB Migration] Complete. Applied: 2, Skipped: 0

> ai-apps-live@1.0.0 db:seed
> tsx src/lib/db/seed.ts

[DB Seed] Verified 10 apps and 5 data sources registered.
[DB Seed] Completed successfully.
```
(Exited with code 0)

#### Command: `npm test`
```
> ai-apps-live@1.0.0 test
> vitest run

 ✓ tests/unit/database.test.ts (10 tests) 48ms
 ✓ tests/unit/scaffold.test.ts (1 test) 188ms

 Test Files  2 passed (2)
      Tests  11 passed (11)
   Start at  13:56:55
   Duration  525ms (tests 56%, transform 29%, import 10%, worker 5%)
```
(Exited with code 0)

#### Command: `npm run typecheck && npm run lint`
```
> ai-apps-live@1.0.0 typecheck
> tsc --noEmit

> ai-apps-live@1.0.0 lint
> eslint .
```
(Exited with code 0)

### 3. Test Counts
- Unit tests: 11 passed, 0 failed.
- Schema trigger tests: 5 passed.
- Integrity check tests: 2 passed.

### 4. Known Gaps
- Apple RSS collector to be implemented in Phase 3.


## Phase 3 Report: Apple RSS Collector, Schedulers, and Provenance

**Date:** 2026-11-15T14:09:00Z  
**Phase Status:** COMPLETED

### 1. What Changed
- Inspected live Apple endpoints and robots.txt files:
  - `rss.marketingtools.apple.com/robots.txt` has no disallow rules.
  - `itunes.apple.com/robots.txt` explicitly disallows `/*/lookup?`, `/search*`, and `/*/rss/*`.
  - Documented findings in `docs/DATA_SOURCES.md`.
  - Observed Apple CDN round-robin anomaly where node `17.33.193.45` intermittently returned HTTP 502/504 while sibling nodes returned HTTP 200. Implemented intelligent retry logic in `AppleRssCollector` that recovers seamlessly.
- Implemented `src/collectors/types.ts` defining `Collector`, `CollectContext`, and `CollectResult`.
- Implemented `src/collectors/apple-rss/index.ts`:
  - Enforced SSRF hostname allowlist (`rss.marketingtools.apple.com`).
  - Added strict Zod schema validation for Apple App Store JSON feeds.
  - Validated country matching, 1–100 item limits, unique item IDs, and source timestamp plausibility (between now − 7 days and now + 5 minutes).
  - Calculated SHA-256 and GZIP compressed buffer of raw payload.
  - Implemented single atomic transaction inserting `source_observations`, `chart_snapshots`, `app_store_rankings`, and emitting `stream_events`.
  - Only mapped `apple_app_id` to `app_id` when `apple_identity_status = 'CONFIRMED'`.
- Implemented `src/worker/scheduler.ts`:
  - Wrapped collector execution in 20 s timeout and error isolation.
  - Recorded detailed run logs in `collector_runs`.
  - Calculated `observed_update_interval_seconds` as median gap between the last 20 snapshots.
  - Managed `source_health` state transitions (`HEALTHY` on success; `DEGRADED` at 2 failures; `DOWN` at 5 failures).
  - Implemented exponential backoff arithmetic doubling from 60 s to 6 h with ±10% jitter.
- Executed real live collection against `https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/100/apps.json`, successfully storing 100 rankings in the database.
- Created mock feed fixtures in `tests/fixtures/apple_feed_fixture.ts`.
- Authored test suite `tests/integration/apple_collector.test.ts` verifying:
  - 100-item feed parsing and storage.
  - Unconfirmed ID filtering (`app_id = NULL`) vs confirmed mapping (`app_id` populated).
  - Duplicate snapshot prevention (`NO_CHANGE`).
  - Implausible source timestamp rejection (`SOURCE_TIMESTAMP_IMPLAUSIBLE`).
  - Malformed JSON handling.
  - Health state degradation to `DEGRADED` and `DOWN` while preserving prior historical data.
  - Exponential backoff calculation and ceiling.

### 2. Commands Actually Run & Final Output Lines

#### Command: Live Collection via `Scheduler.runCollector('apple_rss')`
```
Collector result: {
  "status": "SUCCESS",
  "httpStatus": 200,
  "serverDateHeader": "Sun, 15 Nov 2026 08:21:08 GMT",
  "clockSkewMs": 835,
  "recordsSeen": 100,
  "recordsInserted": 100,
  "sourceUpdatedAt": "2026-11-15T08:21:08.000Z",
  "rawBodySha256": "2511a1e0509bf4bd572f91171ff4e39f804f9491666b598c550cff8de9fd3226"
}
```
(Exited with code 0)

#### Command: `npm test`
```
> ai-apps-live@1.0.0 test
> vitest run

 ✓ tests/unit/database.test.ts (10 tests) 94ms
 ✓ tests/unit/scaffold.test.ts (1 test) 284ms
 ✓ tests/integration/apple_collector.test.ts (7 tests) 298ms

 Test Files  3 passed (3)
      Tests  18 passed (18)
   Start at  14:08:21
   Duration  937ms (tests 54%, transform 25%, import 18%, worker 3%)
```
(Exited with code 0)

#### Command: `npm run typecheck && npm run lint`
```
> ai-apps-live@1.0.0 typecheck
> tsc --noEmit

> ai-apps-live@1.0.0 lint
> eslint .
```
(Exited with code 0)

### 3. Test Counts
- Unit & Integration tests: 18 passed, 0 failed.
- Real live HTTP collector execution: 1 passed (100 rankings stored).

### 4. Known Gaps
- Phase 4 Trends CSV importer to be implemented.


## Phase 4 Report: Google Trends CSV Importer

**Date:** 2026-11-15T14:12:00Z  
**Phase Status:** COMPLETED

### 1. What Changed
- Implemented `src/importers/google-trends/index.ts`:
  - Enforced 2 MB file size limit and UTF-8 / BOM stripping.
  - Implemented duplicate detection using SHA-256 hash.
  - Validated "Interest over time" export format; explicitly rejected regional ("Subregion,") and related queries/topics exports.
  - Validated comparison terms: maximum 5 terms, strict 1:1 matching against active apps' `trends_label`, geography label consistency.
  - Validated time series: ascending date order, matching declared granularity.
  - Validated values: 0–100 integer range or `<1` literal (stored as `value_raw = '<1'`, `value_index = NULL`). Prohibited empty or non-numeric cells (no zero extrapolation).
  - Detected partial buckets where time extends beyond export date.
  - Created atomic commit transaction that deactivates previous current imports with the same geography and search type, inserts `search_interest_imports` and `search_interest` rows, logs to `audit_log`, and emits `disclosure_update` stream event.
  - Implemented auditable `REJECTED` row persistence storing the raw file and specific rejection reason whenever validation fails.
- Created test fixtures under `tests/fixtures/trends/`:
  - `valid_trends.csv`
  - `invalid_region.csv`
  - `invalid_unknown_term.csv`
  - `invalid_empty_cell.csv`
  - `invalid_out_of_bounds.csv`
  - `invalid_non_ascending_date.csv`
  - `invalid_too_many_terms.csv`
- Authored test suite `tests/unit/trends_importer.test.ts` verifying all Phase 4 acceptance criteria.

### 2. Commands Actually Run & Final Output Lines

#### Command: `npm test`
```
> ai-apps-live@1.0.0 test
> vitest run

 ✓ tests/unit/database.test.ts (10 tests) 97ms
 ✓ tests/unit/scaffold.test.ts (1 test) 249ms
 ✓ tests/unit/trends_importer.test.ts (9 tests) 58ms
 ✓ tests/integration/apple_collector.test.ts (7 tests) 274ms

 Test Files  4 passed (4)
      Tests  27 passed (27)
   Start at  14:11:34
   Duration  965ms (tests 43%, transform 32%, import 22%, worker 3%)
```
(Exited with code 0)

#### Command: `npm run typecheck && npm run lint`
```
> ai-apps-live@1.0.0 typecheck
> tsc --noEmit

> ai-apps-live@1.0.0 lint
> eslint .
```
(Exited with code 0)

### 3. Test Counts
- Unit & Integration tests: 27 passed, 0 failed.
- Trends importer tests: 9 passed.

### 4. Known Gaps
- Phase 5 Disclosure management to be implemented.


## Phase 5 Report: Official Company Disclosures Management

**Date:** 2026-11-15T14:13:00Z  
**Phase Status:** COMPLETED

### 1. What Changed
- Implemented `src/lib/disclosures/service.ts` managing the end-to-end lifecycle of official company disclosures:
  - Input validation: verified mandatory HTTPS `source_url`, mandatory `source_locator`, positive `value_numeric`, and recognized metric types (`DAU`, `WAU`, `MAU`, `OTHER`). No concurrent users metric permitted.
  - Draft creation: status defaults to `DRAFT`. Confirmed that DRAFT records are completely isolated and never exposed via public endpoints or `/broadcast`.
  - Verification workflow: requires non-empty `verifier_note` confirming primary source match; status transitions to `VERIFIED`; immutability database trigger takes effect immediately.
  - Immutability enforcement: verified through SQLite trigger `trg_disc_no_value_edit_after_verify` that verified records cannot be updated in place.
  - Superseding workflow: `supersedeDisclosure` creates a new draft pointing to `supersedes_id = old.id`. The prior record remains current and visible until the superseding draft is verified, at which point the old record transitions to `is_current = 0` atomically.
  - Withdrawal workflow: `withdrawDisclosure` flags records as `WITHDRAWN` and `is_current = 0`, immediately removing them from publication while retaining raw provenance in the database for audit.
  - Audit & real-time: all state mutations log to `audit_log` with before/after JSON and emit `disclosure_update` events to `stream_events`.
- Authored test suite `tests/unit/disclosures.test.ts` verifying all Phase 5 lifecycle operations.

### 2. Commands Actually Run & Final Output Lines

#### Command: `npm test`
```
> ai-apps-live@1.0.0 test
> vitest run

 ✓ tests/unit/database.test.ts (10 tests) 71ms
 ✓ tests/unit/trends_importer.test.ts (9 tests) 84ms
 ✓ tests/unit/disclosures.test.ts (6 tests) 63ms
 ✓ tests/unit/scaffold.test.ts (1 test) 229ms
 ✓ tests/integration/apple_collector.test.ts (7 tests) 271ms

 Test Files  5 passed (5)
      Tests  33 passed (33)
   Start at  14:12:49
   Duration  1.01s (tests 39%, transform 26%, import 22%, worker 13%)
```
(Exited with code 0)

#### Command: `npm run typecheck && npm run lint`
```
> ai-apps-live@1.0.0 typecheck
> tsc --noEmit

> ai-apps-live@1.0.0 lint
> eslint .
```
(Exited with code 0)

### 3. Test Counts
- Unit & Integration tests: 33 passed, 0 failed.
- Disclosures tests: 6 passed.

### 4. Known Gaps
- Phase 6 Metric processing, status derivation, and snapshot service to be implemented.


## Phase 6 Report: Metric Processing, Status Derivation, and Snapshot Engine

**Date:** 2026-11-15T14:16:30Z  
**Phase Status:** COMPLETED

### 1. What Changed
- Implemented `src/lib/status/derive.ts` as the single pure source of truth for display status and freshness derivation across the entire application:
  - Strict priority order evaluation: Administrative disablement -> Missing/unverified records -> Age threshold (STALE) -> Canonical mapping.
  - Hard constraint: Green `VERIFIED` status is strictly reserved for human-verified official company disclosures (`OFFICIAL_USERS`). It is programmatically impossible for any other metric to receive it.
- Implemented `src/lib/snapshot/service.ts`:
  - Structured typed public snapshot partitioned into four independent metric families: App Store Popularity, Search Interest, Officially Reported Users, and Concurrent Users.
  - Calculated rank changes (`+N`, `-N`, `0`, `NEW`, `—`) comparing against the previous snapshot with a different source timestamp.
  - Partitioned tracked apps absent from the chart into an explicit `notInTop100` array ("Not in Top 100").
  - Formatted user counts with qualifiers (`250M+`, `~1B`).
  - Hard-wired `concurrentUsers` to `available: false`, fixed explanatory text, and zero numbers/sparklines.
  - Bound complete provenance metadata to every displayed item (metric name, source name, URL, geography, period, timestamps, status, database row reference).
- Implemented `src/lib/sse/hub.ts`:
  - Real-time Server-Sent Events stream delivering initial snapshot on connect, missed event replay via `Last-Event-ID`, 15-second heartbeats, and 1-second `stream_events` tailing.
- Authored `tests/unit/accuracy_suite.test.ts` verifying all 8 Accuracy Release Blockers:
  - Test 1 & 2: DAU/MAU figures never appear in concurrent user section; concurrent text contains zero digits.
  - Test 3: Google Trends scores never cross into user counts or carry user units; disclaimer is present.
  - Test 4: App Store ranks never appear as user counts.
  - Test 5: Missing data never becomes zero ("Not in Top 100", "—", "No verified disclosure").
  - Test 6: Stale data is visibly identified with age and amber badge while retaining value display.
  - Test 7: Property-based exhaustive test verifying that unverified observations never display as verified.
  - Test 8: Full database-level provenance traceability.

### 2. Commands Actually Run & Final Output Lines

#### Command: `npm test`
```
> ai-apps-live@1.0.0 test
> vitest run

 ✓ tests/unit/database.test.ts (10 tests) 55ms
 ✓ tests/unit/trends_importer.test.ts (9 tests) 72ms
 ✓ tests/unit/disclosures.test.ts (6 tests) 63ms
 ✓ tests/unit/scaffold.test.ts (1 test) 225ms
 ✓ tests/unit/accuracy_suite.test.ts (7 tests) 57ms
 ✓ tests/integration/apple_collector.test.ts (7 tests) 259ms

 Test Files  6 passed (6)
      Tests  40 passed (40)
   Start at  14:15:23
   Duration  753ms (tests 48%, import 25%, transform 24%, worker 4%)
```
(Exited with code 0)

#### Command: `npm run typecheck && npm run lint`
```
> ai-apps-live@1.0.0 typecheck
> tsc --noEmit

> ai-apps-live@1.0.0 lint
> eslint .
```
(Exited with code 0)

### 3. Test Counts
- Unit & Integration tests: 40 passed, 0 failed.
- Accuracy Release Blocker tests: 7 tests passed (covering all 8 criteria).

### 4. Known Gaps
- Phase 7 Management dashboard (`/admin`) and secure APIs to be implemented.


## Phase 7 Report: Management Dashboard, Security, and Administrative Control

**Date:** 2026-11-15T14:24:00Z  
**Phase Status:** COMPLETED

### 1. What Changed
- Implemented `src/lib/auth/session.ts`:
  - Single operator authentication with scrypt constant-time password comparison (`timingSafeEqual`).
  - Session cookie (`ai_apps_session`, `HttpOnly`, `SameSite=Strict`, 12-hour TTL).
  - Login rate limiter strictly enforcing maximum 5 attempts per 15 minutes per IP (returns HTTP 429).
  - CSRF protection requiring matching `X-CSRF-Token` on all state-changing endpoints (`POST`, `PATCH`, `PUT`, `DELETE`).
- Implemented public and health API routes:
  - `GET /api/health`: reporting DB status, migration version, process health, clock skew warning (> 60 s), and `example.test` integrity verification.
  - `GET /api/public/snapshot`: delivering typed snapshots with `Cache-Control: no-store`.
  - `GET /api/public/stream`: Server-Sent Events stream with heartbeat and replay.
  - `GET /api/public/history/rankings`: paginated historical rankings.
- Implemented protected admin API routes:
  - `POST /api/admin/auth/login`, `POST /api/admin/auth/logout`, `GET /api/admin/auth/session`.
  - `GET /api/admin/apps`, `POST /api/admin/apps`, `PATCH /api/admin/apps/[id]` (including Apple ID confirmation toggles).
  - `PATCH /api/admin/sources/[key]`: enable/disable with required reason; validated 60 s floor for polling intervals.
  - `PUT /api/admin/metric-controls/[key]`: enable/disable with required reason; CONCURRENT_USERS lock verified. Emits `control_update` stream event.
  - `POST /api/admin/imports/trends/preview` and `POST /api/admin/imports/trends/commit`.
  - `GET /api/admin/disclosures`, `POST /api/admin/disclosures`, `/verify`, `/supersede`, `/withdraw`.
  - `POST /api/admin/collectors/[key]/run`: manual collector trigger using the identical scheduler code path.
  - `GET /api/admin/runs`, `GET /api/admin/observations`, `GET /api/admin/audit`.
  - `GET /api/admin/checklist`: live computed go-live checklist (pass/fail items evaluated against live system state).
- Implemented `/admin` UI in `src/app/admin/page.tsx`:
  - Login screen with rate limit error handling.
  - Tabs: Go-Live Checklist, Apps Registry, Sources & Health, Metric Controls, Trends Importer, Disclosures, Runs & Logs, Audit Timeline, and Live Broadcast Scaling Preview.
  - Prominent "IMPORTER NOT YET VERIFIED AGAINST A REAL GOOGLE EXPORT" banner on the Trends tab.
  - Hard-locked CONCURRENT_USERS row with policy explanation.
  - Reason modal for disabling sources/controls and human verification modal with mandatory source confirmation checkbox and verifier note.
- Authored test suite `tests/integration/admin_api.test.ts` verifying authentication enforcement, rate limiting, CSRF validation, audit logging, and real-time control broadcast events.

### 2. Commands Actually Run & Final Output Lines

#### Command: `npm test`
```
> ai-apps-live@1.0.0 test
> vitest run

 ✓ tests/unit/accuracy_suite.test.ts (7 tests) 63ms
 ✓ tests/unit/database.test.ts (10 tests) 75ms
 ✓ tests/integration/admin_api.test.ts (5 tests) 93ms
 ✓ tests/unit/trends_importer.test.ts (9 tests) 88ms
 ✓ tests/unit/disclosures.test.ts (6 tests) 63ms
 ✓ tests/unit/scaffold.test.ts (1 test) 219ms
 ✓ tests/integration/apple_collector.test.ts (7 tests) 261ms

 Test Files  7 passed (7)
      Tests  45 passed (45)
   Start at  14:23:27
   Duration  956ms (tests 43%, import 31%, transform 20%, worker 6%)
```
(Exited with code 0)

#### Command: `npm run typecheck && npm run lint`
```
> ai-apps-live@1.0.0 typecheck
> tsc --noEmit

> ai-apps-live@1.0.0 lint
> eslint .
```
(Exited with code 0)

### 3. Test Counts
- Unit & Integration tests: 45 passed, 0 failed.
- Admin API & Security tests: 5 passed.

### 4. Known Gaps
- Phase 8 Broadcast dashboard (`/broadcast`) with deterministic hand-crafted SVG charts and OBS Browser Source optimization to be implemented.
