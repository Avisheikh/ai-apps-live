# AI Apps Live — Operations Runbook & Maintenance Guide

This document describes how to deploy, operate, monitor, back up, and troubleshoot **AI Apps Live** in production as a continuous 24/7 broadcast feeding OBS Studio and YouTube Live.

---

## 1. Architecture Overview

AI Apps Live operates as a local-first, dual-process application running against an embedded SQLite database in WAL (Write-Ahead Logging) mode:

1. **`web` (`npm run start` / `next start`):**
   - Serves the Next.js broadcast dashboard (`/broadcast`) at 1920×1080.
   - Serves the password-protected operator console (`/admin`).
   - Serves the public read-only API and real-time Server-Sent Events stream (`/api/public/stream`).
   - Binds to `127.0.0.1:3000` (loopback only by default).

2. **`worker` (`npm run worker`):**
   - Headless background daemon responsible for scheduled data ingestion.
   - Executes the Apple Marketing Tools RSS collector (default every 30 minutes with jitter).
   - Monitors source health states (`UP`, `DEGRADED`, `DOWN`).
   - Broadcasts real-time events (`ranking_update`, `health_update`) via the shared SQLite event bus to the web server's SSE hub.

---

## 2. Process Supervision via systemd (User Units)

User units allow running the services without root privileges while ensuring automatic start on boot and restart on crash.

### 2.1 Installation

1. Create the systemd user directory if it does not already exist:
   ```bash
   mkdir -p ~/.config/systemd/user
   ```

2. Link the provided unit files:
   ```bash
   ln -sf $(pwd)/deploy/systemd/ai-apps-live-web.service ~/.config/systemd/user/
   ln -sf $(pwd)/deploy/systemd/ai-apps-live-worker.service ~/.config/systemd/user/
   ```

3. Reload the systemd user daemon:
   ```bash
   systemctl --user daemon-reload
   ```

4. Enable and start both services:
   ```bash
   systemctl --user enable --now ai-apps-live-web ai-apps-live-worker
   ```

### 2.2 Enabling Lingering (Critical)

By default, systemd user services terminate when the user logs out. To allow continuous 24/7 background operation:
```bash
loginctl enable-linger $USER
```
Verify lingering status with:
```bash
loginctl show-user $USER | grep Linger
# Expected output: Linger=yes
```

### 2.3 Operations & Logging Commands

- **Check status:**
  ```bash
  systemctl --user status ai-apps-live-web
  systemctl --user status ai-apps-live-worker
  ```

- **Inspect live logs:**
  ```bash
  journalctl --user -u ai-apps-live-web -f
  journalctl --user -u ai-apps-live-worker -f
  ```

- **Restart services:**
  ```bash
  systemctl --user restart ai-apps-live-web
  systemctl --user restart ai-apps-live-worker
  ```

- **Stop services:**
  ```bash
  systemctl --user stop ai-apps-live-worker ai-apps-live-web
  ```

---

## 3. Backups & Disaster Recovery

### 3.1 Automated Nightly Backup

AI Apps Live uses SQLite's native `VACUUM INTO` command, which creates an atomic, point-in-time snapshot without blocking concurrent database reads or transactions.

Run a manual backup at any time:
```bash
npm run db:backup
```
Backups are saved to `data/backups/ai-apps-live-backup-YYYY-MM-DDTHH-MM-SS-MSZ.db`. The backup engine automatically retains the **14 most recent backups** and safely deletes older ones.

### 3.2 Automated Nightly Cron Job

Add the backup command to your user crontab (`crontab -e`):
```cron
# Run AI Apps Live database backup daily at 03:00 UTC
0 3 * * * cd /home/avisheikh/ai-apps-live && npm run db:backup >> /home/avisheikh/ai-apps-live/data/backups/cron.log 2>&1
```

### 3.3 Disaster Recovery Restore Procedure

If the database file is corrupted or accidentally damaged:

1. Stop both running services:
   ```bash
   systemctl --user stop ai-apps-live-worker ai-apps-live-web
   ```

2. Identify the desired backup in `data/backups/`:
   ```bash
   ls -lt data/backups/
   ```

3. Execute the verified restore utility:
   ```bash
   npm run db:restore data/backups/ai-apps-live-backup-<TIMESTAMP>.db
   ```
   The restore tool:
   - Validates the backup file using `PRAGMA integrity_check`.
   - Cleans up any stale `-wal` and `-shm` sidecars to prevent WAL desync.
   - Atomically restores the database file.
   - Executes the production integrity check to verify no test fixture data exists.

4. Restart both services:
   ```bash
   systemctl --user start ai-apps-live-web ai-apps-live-worker
   ```

---

## 4. OBS Studio Browser Source Configuration

To configure AI Apps Live in OBS Studio as a continuous stream feed:

1. In OBS Studio, create a new **Scene** (e.g., `AI Apps Live Stream`).
2. Add a new **Browser** Source named `AI Apps Broadcast`.
3. Configure the source with the following **exact** parameters:
   - **URL:** `http://127.0.0.1:3000/broadcast?country=us&tz=UTC`
   - **Width:** `1920`
   - **Height:** `1080`
   - **Custom Framerate:** `30`
   - **Shutdown source when not visible:** `UNCHECKED` (Leave OFF: the browser source must stay loaded to receive live SSE events).
   - **Refresh browser when scene becomes active:** `CHECKED` (Leave ON: guarantees immediate re-synchronization when switching scenes).
   - **Control audio via OBS:** `UNCHECKED` (The broadcast produces no audio).
   - **Custom CSS:** (Leave blank).

---

## 5. YouTube Live Recommended Encoder Settings

When broadcasting 24/7 to YouTube Live via OBS:

- **Canvas & Output Resolution:** `1920×1080`
- **Output Framerate:** `30 FPS`
- **Rate Control:** `CBR` (Constant Bitrate)
- **Bitrate:** `4,500 – 6,000 Kbps`
- **Keyframe Interval:** `2 seconds`
- **Preset:** `Quality` (or `Medium` on NVENC / QuickSync)
- **Profile:** `High`
- **Max B-frames:** `2`

---

## 6. Incident Response & Mid-Stream Triage

### 6.1 Source Outage Mid-Stream (e.g., Apple RSS 5xx or Network Interruption)

- **Behavior:**
  - AI Apps Live will **never crash, never display zeroes, and never go blank**.
  - The broadcast retains the last good state.
  - As time passes beyond the stale threshold, the status badge automatically transitions to amber `STALE` and displays the exact elapsed age of the data.
  - If the collector fails consecutively, the source health indicator in the footer transitions from green `UP` to amber `DEGRADED` (after 2 failures), then red `DOWN` (after 5 failures).
- **Operator Action:**
  1. Open the `/admin` console in a separate browser tab.
  2. Navigate to **Runs & Logs** to review error messages and HTTP status codes.
  3. Navigate to **Sources & Health** and click **Trigger Manual Run** to test connectivity.
  4. If the upstream provider is undergoing an extended outage, disable the source with an explicit reason (e.g., `"Upstream Apple RSS CDN outage"`).
  5. The broadcast UI will update within 5 seconds to display the honest status: `UNAVAILABLE (Disabled by administrator: Upstream Apple RSS CDN outage)`.

### 6.2 SSE Disconnection Mid-Stream

- If the browser client temporarily loses connection to the local web server:
  - An amber banner appears at the top: `RECONNECTING — showing data from HH:MM:SS`.
  - The client automatically retries connection using exponential backoff (1s to 15s).
  - If no heartbeat is received for 120 seconds, the client executes an automated full page reload to restore state.
  - A scheduled daily reload at 04:00 local time bounds browser memory consumption.

---

## 7. Go-Live Verification Checklist

Before starting the live broadcast, log into `/admin` and ensure all items on the **Go-Live Checklist** pass:

- [ ] **Apple RSS Collector:** Last collection succeeded within stale threshold.
- [ ] **App Store IDs:** Apple App IDs confirmed for tracked apps.
- [ ] **Google Trends:** At least one valid comparison CSV committed, or the panel intentionally disabled.
- [ ] **Disclosures:** No pending unverified `DRAFT` disclosures.
- [ ] **Database Integrity:** Zero rows containing `example.test` fixtures.
- [ ] **Clock Synchronization:** System clock skew vs. upstream source `< 60 seconds`.
- [ ] **Demo Mode:** `DEMO_MODE=0` (watermark disabled).
- [ ] **Admin Security:** Non-default `ADMIN_PASSWORD_HASH` configured.
- [ ] **Backups:** Recent backup file present in `data/backups/`.
