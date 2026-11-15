# Data Sources Documentation & Verification

**Last Verified:** 2026-11-15T08:14:02Z  
**Verification Method:** Direct HTTP requests, headers analysis, and robots.txt review against live endpoints.

---

## 1. Apple Marketing Tools RSS (Metric 1: App Store Popularity)

### 1.1 Endpoint Specifications
- **Base URL:** `https://rss.marketingtools.apple.com`
- **Pattern:** `https://rss.marketingtools.apple.com/api/v2/{country}/apps/{chart}/{limit}/apps.json`
- **Supported Charts:** `top-free` (and `top-paid`). `top-grossing` returns 404.
- **Limit:** Up to `100` items per feed.
- **Default Scope:** `us/top-free/100`

### 1.2 Verification Findings
- Live GET to `https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/10/apps.json` returned HTTP 200 JSON.
- `feed.country`: `"us"`
- `feed.updated`: `"Sun, 15 Nov 2026 08:14:02 +0000"` (RFC 2822 / 822 format with timezone offset).
- `feed.results`: 1-based indexed array of app objects containing:
  - `id`: string numeric Apple App ID (e.g., `"6448311069"`).
  - `name`: string application name (e.g., `"ChatGPT"`).
  - `artistName`: string developer name (e.g., `"OpenAI OpCo, LLC"`).
  - `artworkUrl100`: HTTPS URL to 100x100 icon on `is1-ssl.mzstatic.com`.
  - `url`: App Store canonical product page URL.
- **Observed App Store Ranks (at verification time):**
  - ChatGPT (`6448311069`): Rank 4 in US Top Free.
  - Muse from Meta (`6760173601`): Rank 2. Kept unassigned to "Meta AI" per policy (admin confirmation required).

### 1.3 Robots.txt & Policy
- `https://rss.marketingtools.apple.com/robots.txt`:
  - Contains no `Disallow` rules.
  - Polling interval set to 1800 s (30 min) with ±120 s jitter.
- `https://itunes.apple.com/robots.txt`:
  - Contains explicit `Disallow: /*/lookup?`, `Disallow: /search*`, and `Disallow: /*/rss/*`.
  - **ADR / Compliance Decision:** Automated bulk scraping of `/lookup` is strictly avoided. Admin ID resolution operates with manual input and administrative confirmation only.

---

## 2. Google Trends (Metric 2: Search Interest)

### 2.1 Specification
- **Website:** `https://trends.google.com/trends/`
- **Data Acquisition:** Operator manual export via Google Trends "Interest over time" CSV download.
- **API Status:** Official API is gated alpha. No unofficial scrapers, `pytrends`, or reverse-engineered endpoints are permitted.
- **Values:** Relative interest index (0–100) within a specific comparison set and timeframe. `<1` indicates low interest below 1.
- **Attribution Required:** "Data source: Google Trends (https://www.google.com/trends)" displayed on the broadcast panel.
- **Verification Gate:** Displays `"IMPORTER NOT YET VERIFIED AGAINST A REAL GOOGLE EXPORT"` until a verified real export has been imported.

---

## 3. Company Disclosures (Metric 3: Officially Reported Users)

### 3.1 Specification
- **Acquisition:** Manual operator entry from audited primary sources:
  - Earnings call transcripts
  - Form 10-Q / 10-K regulatory filings
  - Official company press releases and corporate engineering blogs
  - Executive on-the-record public disclosures
- **Verification Workflow:** Two-step: `DRAFT` → Human verification tick + verifier note → `VERIFIED`.
- **Database Trigger:** Once `VERIFIED`, rows are strictly immutable. Corrections require creating a superseding record.
- **Publication Rule:** Only `VERIFIED` and `is_current = 1` rows are included in the broadcast snapshot.

---

## 4. Concurrent Users (Metric 4)

- **Status:** **Permanently Unavailable in v1.**
- **Reason:** No free, publicly legitimate, and verifiable data source exists for live concurrent active users across AI applications.
- **Enforcement:** Hard database triggers (`trg_block_concurrent_enable_upd` and `trg_block_concurrent_enable_ins`) abort any attempt to enable this metric. Broadcast UI displays fixed explanatory text.

---

## 5. Optional Extension Modules (Default Disabled)

### 5.1 Vendor Statuspage JSON
- **Base Endpoint:** e.g., `https://status.openai.com/api/v2/status.json`
- **Polling Cadence:** Minimum floor 60 s, default 120 s.
- **Scope:** Operational indicator only (`none`, `minor`, `major`, `critical`, `maintenance`). Does not imply user counts.

### 5.2 Cloudflare Radar Internet Services
- **Base Endpoint:** `https://api.cloudflare.com/client/v4/radar/ranking/internet_services/top`
- **License:** CC BY-NC 4.0 (non-commercial).
- **Requirements:** Free API token and explicit administrative non-commercial license acknowledgement before enabling.
