# AI Apps Live

**AI Apps Live** is a local-first, broadcast-ready dashboard tracking public metrics for major consumer artificial intelligence applications (ChatGPT, Google Gemini, Claude, DeepSeek, Perplexity, Grok, Microsoft Copilot, Character.AI, Poe, Meta AI).

It is specifically engineered to run continuously as an OBS Studio Browser Source feeding a 24/7 YouTube Live stream at 1920×1080 resolution.

---

## 1. Metric Families & Integrity Principles

AI Apps Live presents **four separate metric families**, each with its own panel, methodology, and provenance metadata. In compliance with strict truth-in-data standards, these families are **never combined into a unified ranking or composite score**:

| # | Metric Family | Data Source | Ingestion Mode | Status Badge |
|---|---|---|---|---|
| **1** | **App Store Popularity** | Apple Marketing Tools RSS | Automatic (every 30m) | `SOURCE DATA` |
| **2** | **Search Interest** | Google Trends CSV Exports | Operator Manual Import | `MANUAL IMPORT` |
| **3** | **Officially Reported Users** | Corporate Disclosures (SEC/IR) | Human Verified Workflow | `VERIFIED` |
| **4** | **Concurrent Users** | None (No legitimate public source) | **Permanently Unavailable** | `UNAVAILABLE` |

### Absolute Accuracy Policy
- **No Extrapolations:** We never invent, model, interpolate, or extrapolate user counts.
- **Missing Data ≠ Zero:** An app absent from the Apple Top 100 is labeled **"Not in Top 100"**, never `101`, and never `0`.
- **Concurrent Users Lock:** The concurrent users panel displays fixed text: *"Concurrent user data unavailable."* and *"No public source reports this."* Database triggers permanently prevent enabling this metric.
- **Traceable Provenance:** Every metric item displays source attribution, original timestamp, collection timestamp, and database reference.

---

## 2. Prerequisites

- **Node.js:** `v22.x` or `v24.x` (Node.js LTS)
- **Package Manager:** `npm` (v10+)
- **Operating System:** Linux (systemd supported), macOS, or Windows
- **OBS Studio:** v29+ with Browser Source support

---

## 3. Quick Start Installation

### 3.1 Clone & Install Dependencies
```bash
git clone <repository-url> ai-apps-live
cd ai-apps-live
npm install
```

### 3.2 Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Generate a secure scrypt password hash for the operator admin console:
```bash
npm run admin:hash
# Enter your desired password when prompted (e.g. your secret password)
# Output: ADMIN_PASSWORD_HASH=scrypt:16384:8:1:<salt>:<hash>
```
Paste the generated `ADMIN_PASSWORD_HASH` into `.env`.

### 3.3 Initialize the SQLite Database
Run database migrations and seed core applications and data sources:
```bash
npm run db:migrate
npm run db:seed
```
*Note: Seed files register application entities and data sources with **zero metric values** to maintain absolute data purity.*

### 3.4 Build and Run

AI Apps Live uses a dual-process model:

1. **Terminal 1 — Web Server (Broadcast & Admin):**
   ```bash
   npm run build
   npm run start
   ```
   *(For active development with hot-reload, run `npm run dev`)*

2. **Terminal 2 — Background Ingestion Worker:**
   ```bash
   npm run worker
   ```

---

## 4. Interfaces & URLs

- **Broadcast Dashboard:** [http://127.0.0.1:3000/broadcast](http://127.0.0.1:3000/broadcast)
  - Fixed 1920×1080 OBS broadcast canvas.
  - Query parameters:
    - `country=us` (Apple App Store storefront, default `us`)
    - `tz=UTC` (Display timezone, default `UTC`)
    - `preview=1` (Enables responsive window scaling for operator inspection)
- **Operator Admin Console:** [http://127.0.0.1:3000/admin](http://127.0.0.1:3000/admin)
  - Login-protected dashboard with live go-live checklist, source controls, manual collection triggers, Google Trends CSV importer, and verified company disclosures workflow.
- **Public Snapshot API:** [http://127.0.0.1:3000/api/public/snapshot](http://127.0.0.1:3000/api/public/snapshot)
- **Real-Time SSE Stream:** [http://127.0.0.1:3000/api/public/stream](http://127.0.0.1:3000/api/public/stream)
- **Health & Integrity Endpoint:** [http://127.0.0.1:3000/api/health](http://127.0.0.1:3000/api/health)

---

## 5. OBS Studio Browser Source Setup

To stream AI Apps Live 24/7 to YouTube Live:

1. In OBS Studio, add a new **Browser** Source named `AI Apps Broadcast`.
2. Configure with the following settings:
   - **URL:** `http://127.0.0.1:3000/broadcast?country=us&tz=UTC`
   - **Width:** `1920`
   - **Height:** `1080`
   - **Custom Framerate:** `30`
   - **Shutdown source when not visible:** `UNCHECKED` (Keep running in background)
   - **Refresh browser when scene becomes active:** `CHECKED`
   - **Control audio via OBS:** `UNCHECKED`
3. Recommended YouTube Live encoder settings:
   - Resolution: `1920×1080` @ `30 FPS`
   - Rate Control: `CBR`
   - Bitrate: `4500 – 6000 Kbps`
   - Keyframe Interval: `2 seconds`

---

## 6. Operations & Maintenance

- **Systemd User Units:** Pre-configured service files are provided in `deploy/systemd/` for 24/7 autonomous background operation. Run `loginctl enable-linger $USER` to maintain operation across terminal sessions.
- **Atomic Backups:**
  ```bash
  npm run db:backup
  ```
  Creates an atomic point-in-time snapshot using SQLite `VACUUM INTO` and preserves the last 14 backups in `data/backups/`.
- **Disaster Recovery Restore:**
  ```bash
  npm run db:restore data/backups/ai-apps-live-backup-<TIMESTAMP>.db
  ```
- **Operations Runbook:** See [docs/OPERATIONS.md](file:///home/avisheikh/ai-apps-live/docs/OPERATIONS.md) for full operational guides, mid-stream triage, and systemd units setup.
- **Architecture Documentation:** See [docs/ARCHITECTURE.md](file:///home/avisheikh/ai-apps-live/docs/ARCHITECTURE.md).
- **Accuracy Policy:** See [docs/ACCURACY_POLICY.md](file:///home/avisheikh/ai-apps-live/docs/ACCURACY_POLICY.md).

---

## 7. Testing Suite

Run the full verification suites:
```bash
# Typecheck
npm run typecheck

# Linting
npm run lint

# Unit & Integration Tests (Vitest)
npm test

# E2E Layout & Canvas Tests (Playwright @ 1920x1080)
npm run test:e2e
```
