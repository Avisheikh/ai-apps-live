# ADR 001: Technology Stack and Dual-Process Architecture

## Status
Accepted

## Context
AI Apps Live is a local-first, broadcast-ready dashboard tracking public metrics for major AI applications. It is designed to run continuously on a local workstation as an OBS Browser Source streaming to YouTube Live.

The system requires:
1. Continuous 24/7 background scheduled data collection (Apple RSS feeds, health monitoring, raw body retention pruning).
2. A real-time web server providing OBS broadcast rendering (1920x1080 fixed canvas), admin management dashboard, REST API, and Server-Sent Events (SSE).
3. Zero budget, strictly free and open-source dependencies, and no cloud/SaaS dependencies.
4. Complete isolation between ingestion and serving so that collector network timeouts or failures never interrupt the live broadcast rendering.
5. Absolute data accuracy, auditable provenance, and append-only historical integrity.

## Decisions

### 1. Dual-Process Architecture
We adopt a decoupled two-process model sharing a single local SQLite database file:
- **`web` Process (`npm run dev` / `npm run start`):** Runs the Next.js App Router HTTP server. Handles `/broadcast` rendering, `/admin` UI, public and admin API endpoints, and real-time SSE streaming. SSE clients receive events streamed by tailing the `stream_events` table by monotonically increasing auto-incrementing `id`s with `Last-Event-ID` support.
- **`worker` Process (`npm run worker`):** Runs an autonomous Node.js service containing the scheduler, HTTP collectors (Apple RSS, optional Statuspage/Radar), retry backoff logic, and maintenance jobs (observation pruning, health watchdog).

**Fault Isolation:** The worker process operates independently of the web server. A crash or network timeout in the worker cannot crash the web server. If the worker stops, the web server continues serving the latest stored snapshot labeled with honest freshness/stale indicators.

### 2. Database & Concurrency
- **Engine:** SQLite via `better-sqlite3`.
- **Mode:** Write-Ahead Logging (`PRAGMA journal_mode = WAL`).
- **Safety Pragma:** `PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`.
- **Migrations:** Plain SQL files in `db/migrations/` managed by a dedicated runner tracking applied migrations in `schema_migrations`.
- **Integrity Safeguard:** Startup and `/api/health` integrity check verifying no test fixture domain (`example.test`) exists in production data.
- **Immutability & Enforcement:** SQLite database triggers enforce append-only rules on rankings and search interest, immutability of verified disclosures, and a hard lock on `CONCURRENT_USERS`.

### 3. Frontend & Rendering
- **Framework:** Next.js (App Router) + React + Tailwind CSS.
- **Design Tokens:** Dark broadcast terminal aesthetic (`#05080F` canvas, `#0A1020` panels, `#16233D` hairlines, tabular numerals).
- **Typography:** Self-hosted `@fontsource/inter` and `@fontsource/jetbrains-mono` ensuring zero external CDN dependencies and deterministic rendering offline or inside OBS.
- **Charts:** Handcrafted SVG components. No heavy or non-deterministic charting libraries.

### 4. Admin Authentication & Security
- **Authentication:** Single operator password verified using `scrypt` from `node:crypto`. Password hash stored in `ADMIN_PASSWORD_HASH` environment variable.
- **Session Security:** `HttpOnly`, `SameSite=Strict` session cookie; constant-time hash comparison; login rate limiting (5 attempts per 15 min per IP).
- **Network Binding:** Bound to `127.0.0.1` by default. Outbound requests constrained to strictly allowlisted hostnames per collector.

### 5. Testing & Verification Strategy
- **Unit & Integration:** Vitest for rapid execution of pure status derivation, parsers, schema triggers, collectors, and API endpoints.
- **End-to-End & Layout:** Playwright verifying exact 1920x1080 canvas geometry, overflow constraints, absence of scrollbars, and visual snapshot fidelity across broadcast states.

## Consequences
- Requires running two processes (`web` and `worker`), managed by systemd in production.
- SQLite WAL mode easily supports multiple concurrent readers and a single sequential writer without lock contention.
- Zero external runtime dependencies ensures reliable local streaming without SaaS outage risk.
