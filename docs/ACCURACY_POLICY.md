# AI Apps Live — Absolute Accuracy & Truth-in-Data Policy

This document establishes the binding accuracy rules and architectural constraints governing **AI Apps Live**. These rules are non-negotiable and enforced at the database, business logic, API, and visual presentation layers.

---

## 1. Core Principle: Truth in Data Over Plausibility

In the domain of public artificial intelligence metrics, speculation, unverified scraping, and algorithmic extrapolation are pervasive. AI Apps Live adheres to a strict journalistic and operational principle:

> **An honest empty state or explicit unavailable badge is always superior to a plausible-looking fabricated number.**

Every metric displayed on the dashboard must be traced directly to an authoritative, verifiable source with complete provenance metadata.

---

## 2. The Eight Absolute Accuracy Rules

### Rule 1: Never Invent, Estimate, Interpolate, or Extrapolate User Counts
No telemetry exists to accurately measure real-time concurrent users across private AI infrastructure. AI Apps Live will never synthesize or calculate concurrency figures from indirect proxies (such as website traffic, DNS popularity, app store rank, or search query indexes).

### Rule 2: Strict Metric Isolation
The dashboard presents four separate metric families:
1. **App Store Popularity** (Apple public RSS 1–100 ranking)
2. **Search Interest** (Google Trends relative index 0–100)
3. **Officially Reported Users** (DAU/WAU/MAU disclosed by company leadership)
4. **Concurrent Users** (Permanently unavailable in v1)

**These metric families must never be combined into a unified score, weighted index, or cross-metric leaderboard.** Comparing an app's App Store rank directly against another app's search interest index is statistically invalid and strictly prohibited.

### Rule 3: No Scraping or Unverified Models Presented as Verified
All automated data collection is restricted to documented, publicly offered machine-readable feeds (e.g., Apple Marketing Tools RSS). Scraped HTML, reverse-engineered private mobile APIs, and synthetic traffic estimates from third-party SEO aggregators are prohibited.

### Rule 4: Stale Data Must Be Visibly Identified with Exact Age
Data must never look fresher than it actually is:
- No count-up animations or ticking tickers.
- No pulsing "live" dots on data collected hours or days ago.
- If data exceeds its configured freshness threshold (`stale_after_seconds`), the UI immediately flags it with an amber `STALE` status badge and displays the elapsed time since collection.

### Rule 5: Missing Data Never Becomes Zero
Missing information represents an absence of observation, not an absence of users or activity:
- An app absent from the Apple US Top 100 is labeled **"Not in Top 100"**, never `101`, and never `0`.
- Missing historical datapoints in rank trajectories are rendered as explicit visual gaps in sparklines, never interpolated as a straight line.
- Missing values in CSV imports result in rejection of the file, never coercion to 0.

### Rule 6: Verified Status is Reserved Exclusively for Human-Verified Disclosures
The green `VERIFIED` status badge is cryptographically and procedurally reserved for **Officially Reported Company Disclosures** that have undergone manual operator verification against primary filings (SEC reports, audited earnings releases, official corporate blogs). No automated collector or import is permitted to receive the `VERIFIED` status.

### Rule 7: Zero Metric Values in Seed Data
Production seed files (`db/migrations/0002_seed.sql`) register application entities and data source definitions only. They contain **zero metric values**. Metric values can enter the system solely via auditable ingestion pipelines.

### Rule 8: Comprehensive Provenance on Every Value
Every metric item rendered on the broadcast canvas or served via the API carries complete provenance fields:
- `metricName`
- `sourceName`
- `sourceUrl`
- `geography`
- `reportingPeriod`
- `sourceTimestamp` (from upstream provider)
- `collectionTimestamp`
- `verificationStatus`
- `freshnessStatus`
- `databaseRef` (underlying table name and primary key id)

---

## 3. Enforcement Mechanisms

| Accuracy Rule | Database Enforcement | Service / API Enforcement | UI / Presentation Enforcement |
|---|---|---|---|
| **Concurrent Users Lock** | Triggers `trg_block_concurrent_enable_ins` & `trg_block_concurrent_enable_upd` abort any SQL write enabling `CONCURRENT_USERS`. | Hardcoded `available: false` in snapshot service; cannot be overridden. | Text only: `"Concurrent user data unavailable."` and `"No public source reports this."` Zero numbers. |
| **Verified Immutability** | Trigger `trg_disc_no_value_edit_after_verify` prevents editing verified disclosure values. | Superseding workflow creates new record; verifier note and audit log mandatory. | Changes trigger `disclosure_update` SSE event. |
| **Append-Only History** | Triggers `trg_rank_no_update`, `trg_rank_no_delete`, `trg_si_no_update` block mutation of observations. | Ingestion pipelines only insert new snapshots. | Historic charts show true historical snapshot points. |
| **No Test Leaks** | `example.test` check rejects server startup if test fixtures leak into production database. | `/api/health` and backup restore fail loudly on fixture detection. | Clean separation of fixtures in `tests/fixtures/`. |
