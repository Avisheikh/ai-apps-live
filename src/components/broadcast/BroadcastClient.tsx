"use client";

import React, { useEffect, useState, useRef, useTransition } from "react";
import { PublicSnapshot, AppStoreItem, OfficialUserItem, ChartItem } from "@/lib/snapshot/service";
import { StatusBadge } from "./Badge";
import { Monogram } from "./Monogram";
import { SearchInterestChart } from "./SearchInterestChart";
import { RankSparklines } from "./RankSparklines";

interface BroadcastClientProps {
  initialSnapshot: PublicSnapshot;
  country?: string;
  tz?: string;
  preview?: boolean;
  demoMode?: boolean;
  defaultView?: "tracked" | "top50";
}

type ConnectionState = "CONNECTED" | "RECONNECTING" | "INTERRUPTED";

export function BroadcastClient({
  initialSnapshot,
  country = "us",
  tz = "UTC",
  preview = false,
  demoMode = false,
  defaultView = "tracked",
}: BroadcastClientProps) {
  const [snapshot, setSnapshot] = useState<PublicSnapshot>(initialSnapshot);
  const [viewMode, setViewMode] = useState<"tracked" | "top50">(defaultView);
  const [connectionState, setConnectionState] = useState<ConnectionState>("CONNECTED");
  const [lastEventTime, setLastEventTime] = useState<number>(Date.now());
  const [scale, setScale] = useState<number>(1);
  const [, startTransition] = useTransition();

  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const backoffDelayRef = useRef<number>(1000);

  // Sync view from query parameter if present
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("view");
      const l = params.get("layout");
      if (v === "top50" || l === "fullscreen" || l === "top50") setViewMode("top50");
      else if (v === "tracked" || l === "standard") setViewMode("tracked");
    }
  }, []);

  // 1. Window scaling in preview mode
  useEffect(() => {
    if (!preview) return;

    function handleResize() {
      const scaleX = window.innerWidth / 1920;
      const scaleY = window.innerHeight / 1080;
      setScale(Math.min(scaleX, scaleY));
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [preview]);

  // 2. Scheduled daily reload at 04:00 local time to bound memory growth
  useEffect(() => {
    const now = new Date();
    const reloadTarget = new Date();
    reloadTarget.setHours(4, 0, 0, 0);
    if (reloadTarget.getTime() <= now.getTime()) {
      reloadTarget.setDate(reloadTarget.getDate() + 1);
    }
    const msUntilReload = reloadTarget.getTime() - now.getTime();

    const reloadTimer = setTimeout(() => {
      window.location.reload();
    }, msUntilReload);

    return () => clearTimeout(reloadTimer);
  }, []);

  // 3. Heartbeat health monitor (120s timeout -> reload, 30s -> reconnecting)
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - lastEventTime;
      if (elapsed > 120_000) {
        // No heartbeat for 120s: full page reload
        window.location.reload();
      } else if (elapsed > 60_000) {
        setConnectionState("INTERRUPTED");
      } else if (elapsed > 30_000 && connectionState === "CONNECTED") {
        setConnectionState("RECONNECTING");
      }
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [lastEventTime, connectionState]);

  // 4. SSE Stream connection with backoff
  useEffect(() => {
    let active = true;

    async function fetchLatestSnapshot() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(`/api/public/snapshot?country=${encodeURIComponent(country)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timeout);
        if (res.ok && active) {
          const data: PublicSnapshot = await res.json();
          startTransition(() => {
            setSnapshot(data);
          });
        }
      } catch (err) {
        console.warn("Snapshot fetch failed:", err);
      }
    }

    function connectSSE() {
      if (!active) return;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource("/api/public/stream");
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!active) return;
        setConnectionState("CONNECTED");
        setLastEventTime(Date.now());
        backoffDelayRef.current = 1000;
      };

      es.addEventListener("snapshot", (e) => {
        if (!active) return;
        setLastEventTime(Date.now());
        try {
          const data = JSON.parse(e.data);
          startTransition(() => {
            setSnapshot(data);
          });
        } catch (err) {
          console.error("Failed to parse snapshot SSE event:", err);
        }
      });

      const handleUpdate = () => {
        if (!active) return;
        setLastEventTime(Date.now());
        fetchLatestSnapshot();
      };

      es.addEventListener("ranking_update", handleUpdate);
      es.addEventListener("disclosure_update", handleUpdate);
      es.addEventListener("control_update", handleUpdate);
      es.addEventListener("health_update", handleUpdate);

      es.addEventListener("heartbeat", () => {
        if (!active) return;
        setLastEventTime(Date.now());
        setConnectionState("CONNECTED");
      });

      es.onerror = () => {
        if (!active) return;
        setConnectionState("RECONNECTING");
        es.close();

        // Exponential backoff capped at 15s
        const delay = backoffDelayRef.current;
        backoffDelayRef.current = Math.min(delay * 1.5, 15000);

        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = setTimeout(() => {
          connectSSE();
        }, delay);
      };
    }

    connectSSE();

    return () => {
      active = false;
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [country]);

  // Format timestamp helper
  function formatTime(iso: string | null) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("en-GB", {
        timeZone: tz,
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function formatDateTime(iso: string | null) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      const datePart = d.toLocaleDateString("en-CA", { timeZone: tz });
      const timePart = d.toLocaleTimeString("en-GB", {
        timeZone: tz,
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      return `${datePart} ${timePart} ${tz}`;
    } catch {
      return iso;
    }
  }

  const canvas = (
    <div
      id="broadcast-canvas"
      className="w-[1920px] h-[1080px] bg-canvas text-broadcast-text overflow-hidden relative select-none flex flex-col font-sans border border-hairline/20"
      style={{ minWidth: 1920, minHeight: 1080, maxWidth: 1920, maxHeight: 1080 }}
    >
      {/* Demo Mode Watermark */}
      {demoMode && (
        <div className="absolute inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden">
          <div className="rotate-[-25deg] text-broadcast-red/15 text-8xl font-black font-mono tracking-widest uppercase border-8 border-broadcast-red/15 px-16 py-8 rounded-2xl select-none">
            DEMO DATA — NOT REAL
          </div>
        </div>
      )}

      {/* HEADER (88px) */}
      <header className="h-[88px] px-6 border-b border-hairline flex items-center justify-between shrink-0 bg-panel/30">
        <div className="flex items-center space-x-6">
          <div className="flex flex-col">
            <span className="font-mono text-2xl font-black tracking-wider text-broadcast-text">
              AI APPS LIVE
            </span>
            <span className="text-[11px] font-mono tracking-widest text-broadcast-secondary uppercase">
              Broadcast Intelligence & Public Observability
            </span>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center space-x-1.5 bg-canvas/80 p-1 rounded-lg border border-hairline/80">
          <button
            id="view-toggle-standard"
            onClick={() => setViewMode("tracked")}
            className={`px-3.5 py-1.5 rounded text-xs font-mono font-bold transition flex items-center space-x-1.5 ${
              viewMode === "tracked"
                ? "bg-broadcast-blue text-white shadow-sm"
                : "text-broadcast-secondary hover:text-broadcast-text"
            }`}
          >
            <span>Standard (3-Column View)</span>
          </button>
          <button
            id="view-toggle-top50"
            onClick={() => setViewMode("top50")}
            className={`px-3.5 py-1.5 rounded text-xs font-mono font-bold transition flex items-center space-x-1.5 ${
              viewMode === "top50"
                ? "bg-broadcast-blue text-white shadow-sm"
                : "text-broadcast-secondary hover:text-broadcast-text"
            }`}
          >
            <span>Full-Screen Top 50 + Downloads</span>
            <span className="px-1.5 py-0.2 rounded bg-white/20 text-[10px] font-mono">1-Screen</span>
          </button>
        </div>

        {/* Connection status and banners */}
        <div className="flex items-center space-x-4">
          {connectionState === "RECONNECTING" && (
            <div className="px-3 py-1 bg-broadcast-amber/20 border border-broadcast-amber/40 text-broadcast-amber font-mono text-xs font-bold rounded animate-pulse">
              RECONNECTING — showing data from {formatTime(new Date(lastEventTime).toISOString())}
            </div>
          )}
          {connectionState === "INTERRUPTED" && (
            <div className="px-3 py-1 bg-broadcast-red/20 border border-broadcast-red/40 text-broadcast-red font-mono text-xs font-bold rounded">
              DATA FEED INTERRUPTED
            </div>
          )}

          <div className="flex items-center space-x-2 px-3 py-1.5 rounded bg-panel border border-hairline">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                connectionState === "CONNECTED"
                  ? "bg-broadcast-green shadow-[0_0_8px_#2BD576]"
                  : connectionState === "RECONNECTING"
                  ? "bg-broadcast-amber animate-pulse"
                  : "bg-broadcast-red"
              }`}
            />
            <span className="text-xs font-mono font-bold tracking-wider">
              {connectionState}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[10px] font-mono text-broadcast-secondary uppercase">
            Dashboard Refresh
          </span>
          <span className="font-mono text-sm font-bold text-broadcast-text">
            {formatDateTime(snapshot.timestamps.dashboardRefreshAt)}
          </span>
        </div>
      </header>

      {/* MAIN (920px) */}
      {viewMode === "top50" ? (
        /* FULL-SCREEN TOP 50 SINGLE-SCREEN VIEW (Zero scrollbars, full 1920x920 canvas, Metric 2 & 3 hidden) */
        <main className="h-[920px] p-6 shrink-0 overflow-hidden">
          <section
            id="panel-top50-fullscreen"
            className="w-full h-full bg-panel border border-hairline rounded-lg p-5 flex flex-col justify-between overflow-hidden"
          >
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-hairline/60">
                <div>
                  <div className="flex items-center space-x-3 mb-1">
                    <span className="text-xs font-mono font-bold tracking-widest text-broadcast-secondary uppercase">
                      Metric 1 · App Store Popularity · Live Public Ingestion
                    </span>
                    <span className="px-2 py-0.5 rounded bg-broadcast-blue/20 border border-broadcast-blue/40 text-broadcast-cyan text-[11px] font-mono font-bold">
                      Top 50 Free Chart ({snapshot.appStore.country.toUpperCase()})
                    </span>
                    <span className="px-2 py-0.5 rounded bg-canvas/80 border border-hairline text-broadcast-secondary text-[11px] font-mono">
                      Single-Screen Broadcast Mode (Zero Scroll)
                    </span>
                  </div>
                  <h2 className="text-2xl font-black tracking-wide text-broadcast-text">
                    App Store Top 50 Free · Live Ranking & Downloads
                  </h2>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2 text-xs font-mono text-broadcast-secondary">
                    <span className="w-2.5 h-2.5 rounded-full bg-broadcast-blue inline-block shadow-[0_0_8px_#2D7BFF]" />
                    <span>Tracked AI Apps Monitored</span>
                  </div>
                  <StatusBadge status={snapshot.appStore.status} />
                </div>
              </div>

              {/* 5-Column Grid */}
              <div className="mt-3 grid grid-cols-5 gap-3.5 h-[745px] overflow-hidden select-none">
                {[
                  { title: "Ranks 1–10", items: (snapshot.appStore.topChart || []).slice(0, 10) },
                  { title: "Ranks 11–20", items: (snapshot.appStore.topChart || []).slice(10, 20) },
                  { title: "Ranks 21–30", items: (snapshot.appStore.topChart || []).slice(20, 30) },
                  { title: "Ranks 31–40", items: (snapshot.appStore.topChart || []).slice(30, 40) },
                  { title: "Ranks 41–50", items: (snapshot.appStore.topChart || []).slice(40, 50) },
                ].map((col, idx) => (
                  <div
                    key={col.title}
                    className="bg-canvas/40 border border-hairline/60 rounded-lg p-2.5 flex flex-col justify-between h-full overflow-hidden"
                  >
                    <div className="pb-1.5 mb-1 border-b border-hairline/50 flex items-center justify-between text-[11px] font-mono font-bold text-broadcast-secondary uppercase">
                      <span>{col.title}</span>
                      <span className="text-[10px] text-hairline">Col {idx + 1}</span>
                    </div>

                    <div className="flex-1 flex flex-col justify-between space-y-1 overflow-hidden">
                      {col.items.map((item) => (
                        <TopChartCard key={`${item.rank}-${item.appleAppId}`} item={item} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-hairline/60 flex items-center justify-between text-xs font-mono text-broadcast-secondary">
              <div className="flex items-center space-x-4">
                <span>{snapshot.appStore.attribution}</span>
                <span className="text-hairline">|</span>
                <span className="text-broadcast-secondary">
                  Downloads: Direct App Store download links provided for all 50 apps · Disclosed metrics verified per truth-in-data rules
                </span>
              </div>
              <span>
                Source Updated: {formatTime(snapshot.appStore.sourceUpdatedAt)}
              </span>
            </div>
          </section>
        </main>
      ) : (
        /* STANDARD 3-COLUMN VIEW (Metric 1, Metric 2, Metric 3, Metric 4) */
        <main className="h-[920px] p-6 flex gap-4 shrink-0 overflow-hidden">
          {/* COLUMN 1: APP STORE POPULARITY (760px) */}
          <section
            id="panel-app-store"
            className="w-[760px] h-full bg-panel border border-hairline rounded-lg p-5 flex flex-col justify-between shrink-0 overflow-hidden"
          >
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-hairline/60">
                <div>
                  <div className="flex items-center space-x-3 mb-0.5">
                    <span className="text-xs font-mono font-bold tracking-widest text-broadcast-secondary uppercase">
                      Metric 1 · Automatic Public Ingestion
                    </span>
                    {/* Mode switcher pills */}
                    <div className="flex items-center space-x-1 bg-canvas/80 p-0.5 rounded border border-hairline/70">
                      <button
                        onClick={() => setViewMode("tracked")}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition ${
                          viewMode === "tracked"
                            ? "bg-broadcast-blue text-white shadow-sm"
                            : "text-broadcast-secondary hover:text-broadcast-text"
                        }`}
                      >
                        Tracked AI ({snapshot.appStore.items.length})
                      </button>
                      <button
                        onClick={() => setViewMode("top50")}
                        className="px-2 py-0.5 rounded text-[10px] font-mono font-bold text-broadcast-secondary hover:text-broadcast-text transition"
                      >
                        Full-Screen Top 50 ↗
                      </button>
                    </div>
                  </div>
                  <h2 className="text-xl font-bold tracking-wide text-broadcast-text">
                    App Store Popularity (Top Free · {snapshot.appStore.country.toUpperCase()})
                  </h2>
                </div>
                <div className="flex items-center space-x-2">
                  <StatusBadge status={snapshot.appStore.status} />
                </div>
              </div>

              {/* List of ranked apps */}
              <div className="mt-3 flex flex-col space-y-2">
                {snapshot.appStore.status === "UNAVAILABLE" ? (
                  <div className="h-96 flex flex-col items-center justify-center text-center p-8 text-broadcast-secondary font-mono text-sm">
                    <span>Awaiting first collection · next attempt scheduled</span>
                    <span className="text-hairline mt-2 text-xs">
                      Source state: {snapshot.appStore.freshness.state}
                    </span>
                  </div>
                ) : snapshot.appStore.items.length === 0 ? (
                  <div className="h-96 flex flex-col items-center justify-center text-center p-8 text-broadcast-secondary font-mono text-sm">
                    <span>No tracked applications ranked in current Top 100 chart.</span>
                  </div>
                ) : (
                  snapshot.appStore.items.map((item) => (
                    <AppStoreRow key={item.appleAppId} item={item} />
                  ))
                )}
              </div>

              {/* Not in Top 100 section */}
              {snapshot.appStore.notInTop100.length > 0 && (
                <div className="mt-4 pt-3 border-t border-hairline/60">
                  <div className="text-[11px] font-mono text-broadcast-secondary mb-1.5 uppercase tracking-wide">
                    Not in Top 100
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {snapshot.appStore.notInTop100.map((app) => (
                      <span
                        key={app.slug}
                        className="px-2.5 py-1 rounded bg-canvas/60 border border-hairline/60 font-mono text-xs text-broadcast-secondary"
                      >
                        {app.displayName}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-hairline/60 flex items-center justify-between text-[11px] font-mono text-broadcast-secondary">
              <span>{snapshot.appStore.attribution}</span>
              <span>
                Source Updated: {formatTime(snapshot.appStore.sourceUpdatedAt)}
              </span>
            </div>
          </section>

        {/* COLUMN 2: SEARCH INTEREST & 24H RANK MOVEMENT (560px) */}
        <div className="w-[560px] h-full flex flex-col gap-4 shrink-0 overflow-hidden">
          {/* SEARCH INTEREST (TOP) */}
          <section
            id="panel-search-interest"
            className="h-[476px] bg-panel border border-hairline rounded-lg p-4 flex flex-col justify-between shrink-0 overflow-hidden"
          >
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-hairline/60">
                <div>
                  <span className="text-[10px] font-mono font-bold tracking-widest text-broadcast-secondary uppercase">
                    Metric 2 · Curated Manual Import
                  </span>
                  <h2 className="text-lg font-bold tracking-wide text-broadcast-text">
                    Search Interest (Google Trends)
                  </h2>
                </div>
                <StatusBadge status={snapshot.searchInterest.status} />
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-broadcast-secondary">
                <span>{snapshot.searchInterest.geoLabel} · {snapshot.searchInterest.timeRangeLabel}</span>
                <span className="italic text-broadcast-amber/80">Relative index 0–100, not search volume</span>
              </div>

              {/* Chart SVG */}
              <div className="mt-2 flex justify-center">
                <SearchInterestChart
                  series={snapshot.searchInterest.series}
                  width={526}
                  height={220}
                />
              </div>
            </div>

            <div className="pt-2 border-t border-hairline/60 flex items-center justify-between text-[11px] font-mono text-broadcast-secondary">
              <span>{snapshot.searchInterest.attribution}</span>
              <span>Export: {snapshot.searchInterest.exportedAt || "—"}</span>
            </div>
          </section>

          {/* 24H RANK MOVEMENT (BOTTOM) */}
          <section
            id="panel-rank-movement"
            className="h-[428px] bg-panel border border-hairline rounded-lg p-4 flex flex-col justify-between shrink-0 overflow-hidden"
          >
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-hairline/60">
                <div>
                  <span className="text-[10px] font-mono font-bold tracking-widest text-broadcast-secondary uppercase">
                    Telemetry · 24-Hour Snapshot Trajectory
                  </span>
                  <h2 className="text-lg font-bold tracking-wide text-broadcast-text">
                    Rank Movement (24h)
                  </h2>
                </div>
                <span className="text-[11px] font-mono text-broadcast-secondary">
                  Top Free · {snapshot.appStore.country.toUpperCase()}
                </span>
              </div>

              <div className="mt-2 overflow-y-auto max-h-[310px] pr-1">
                <RankSparklines items={snapshot.rankMovement.items} />
              </div>
            </div>

            <div className="pt-2 border-t border-hairline/60 flex items-center justify-between text-[11px] font-mono text-broadcast-secondary">
              <span>Stored snapshot history (1–100 positions)</span>
              <span>Gaps represent unranked / missing intervals</span>
            </div>
          </section>
        </div>

        {/* COLUMN 3: OFFICIALLY REPORTED USERS & CONCURRENT USERS (520px) */}
        <div className="w-[520px] h-full flex flex-col gap-4 shrink-0 overflow-hidden">
          {/* OFFICIALLY REPORTED USERS (TOP) */}
          <section
            id="panel-official-users"
            className="h-[560px] bg-panel border border-hairline rounded-lg p-4 flex flex-col justify-between shrink-0 overflow-hidden"
          >
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-hairline/60">
                <div>
                  <span className="text-[10px] font-mono font-bold tracking-widest text-broadcast-secondary uppercase">
                    Metric 3 · Human Verified Disclosures
                  </span>
                  <h2 className="text-lg font-bold tracking-wide text-broadcast-text">
                    Officially Reported Users
                  </h2>
                </div>
                <StatusBadge status={snapshot.officialUsers.status} />
              </div>

              <div className="mt-2 text-[11px] font-mono text-broadcast-amber flex items-center justify-between">
                <span>metrics differ: WAU/MAU/other</span>
                <span className="text-broadcast-secondary">Source: SEC filings, earnings calls</span>
              </div>

              {/* Rows */}
              <div className="mt-3 flex flex-col space-y-2.5 overflow-y-auto max-h-[400px]">
                {snapshot.officialUsers.items.length === 0 ? (
                  <div className="p-6 text-center text-xs font-mono text-broadcast-secondary border border-hairline/40 rounded bg-canvas/30">
                    No verified disclosures yet recorded.
                  </div>
                ) : (
                  snapshot.officialUsers.items.map((item) => (
                    <OfficialUserRow key={item.disclosureId} item={item} />
                  ))
                )}

                {/* Unreported Apps */}
                {snapshot.officialUsers.unreportedApps.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-hairline/40">
                    <div className="text-[10px] font-mono text-broadcast-secondary uppercase mb-1">
                      No verified disclosure
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {snapshot.officialUsers.unreportedApps.map((app) => (
                        <span
                          key={app.slug}
                          className="px-2 py-0.5 rounded bg-canvas/60 border border-hairline/40 font-mono text-[11px] text-broadcast-secondary"
                        >
                          {app.displayName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-hairline/60 text-[11px] font-mono text-broadcast-secondary">
              Source: Company official disclosures (SEC filings, earnings calls, official announcements)
            </div>
          </section>

          {/* CONCURRENT USERS (BOTTOM - HARDCODED UNAVAILABLE) */}
          <section
            id="panel-concurrent-users"
            className="h-[344px] bg-panel border border-hairline rounded-lg p-5 flex flex-col justify-between shrink-0 overflow-hidden"
          >
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-hairline/60">
                <div>
                  <span className="text-[10px] font-mono font-bold tracking-widest text-broadcast-secondary uppercase">
                    Metric 4 · Verification Barrier
                  </span>
                  <h2 className="text-lg font-bold tracking-wide text-broadcast-text">
                    Concurrent Users
                  </h2>
                </div>
                <StatusBadge status="UNAVAILABLE" />
              </div>

              <div className="mt-6 flex flex-col space-y-3 p-4 rounded bg-canvas/40 border border-hairline/60">
                <div className="font-mono text-lg font-bold text-broadcast-secondary">
                  {snapshot.concurrentUsers.message}
                </div>
                <div className="font-mono text-sm text-broadcast-secondary/80">
                  {snapshot.concurrentUsers.explanation}
                </div>
                <p className="text-xs text-broadcast-secondary leading-relaxed font-sans pt-2 border-t border-hairline/40">
                  No legitimate public, free, or audited telemetry feed provides verified real-time concurrent active users for major consumer AI applications. AI Apps Live adheres to strict truth-in-data principles and will not extrapolate, interpolate, or fabricate usage figures.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-hairline/60 text-[11px] font-mono text-broadcast-gray">
              Metric permanently locked off in v1 (database-level constraint)
            </div>
          </section>
        </div>
      </main>
      )}

      {/* FOOTER (72px) */}
      <footer className="h-[72px] px-6 border-t border-hairline flex items-center justify-between shrink-0 bg-panel/40">
        {/* Source Health Chips */}
        <div className="flex items-center space-x-3">
          {snapshot.sourceHealth.map((sh) => (
            <div
              key={sh.sourceKey}
              className="flex items-center space-x-2 px-2.5 py-1 rounded bg-canvas/60 border border-hairline font-mono text-xs"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  sh.state === "UP"
                    ? "bg-broadcast-green"
                    : sh.state === "DEGRADED"
                    ? "bg-broadcast-amber"
                    : sh.state === "DOWN"
                    ? "bg-broadcast-red"
                    : "bg-broadcast-gray"
                }`}
              />
              <span className="text-broadcast-text font-semibold">{sh.sourceName}</span>
              <span className="text-broadcast-secondary text-[11px]">
                {sh.ageSeconds !== null ? `${Math.round(sh.ageSeconds / 60)}m ago` : "never"}
              </span>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="text-xs font-mono text-broadcast-secondary text-center px-4">
          Independent project. Not affiliated with any listed company.
        </div>

        {/* Timestamps */}
        <div className="flex items-center space-x-6 text-xs font-mono">
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-broadcast-secondary uppercase">Last Collection</span>
            <span className="text-broadcast-text font-semibold">
              {formatTime(snapshot.timestamps.lastCollectionAt)}
            </span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-broadcast-secondary uppercase">Source Updated</span>
            <span className="text-broadcast-text font-semibold">
              {formatTime(snapshot.timestamps.sourceUpdatedAt)}
            </span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-broadcast-secondary uppercase">Dashboard Refresh</span>
            <span className="text-broadcast-text font-semibold">
              {formatTime(snapshot.timestamps.dashboardRefreshAt)}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );

  if (preview) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-black overflow-hidden select-none">
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          {canvas}
        </div>
      </div>
    );
  }

  return canvas;
}

function AppStoreRow({ item }: { item: AppStoreItem }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-center justify-between p-2.5 rounded bg-panel/70 border border-hairline/40 hover:border-hairline transition">
      <div className="flex items-center space-x-4">
        {/* Rank numeral */}
        <div className="w-14 font-mono text-3xl font-black text-broadcast-text tabular-nums text-center">
          #{item.rank}
        </div>

        {/* Icon with fallback */}
        <div className="w-11 h-11 shrink-0 relative flex items-center justify-center">
          {item.iconUrl && !imgError ? (
            <img
              src={item.iconUrl}
              alt={item.displayName}
              onError={() => setImgError(true)}
              className="w-11 h-11 rounded-lg border border-hairline/60 object-cover"
            />
          ) : (
            <Monogram name={item.displayName} slug={item.slug} size={44} />
          )}
        </div>

        {/* Names */}
        <div className="flex flex-col truncate max-w-[280px]">
          <span className="font-bold text-base text-broadcast-text truncate">
            {item.displayName}
          </span>
          <span className="text-xs text-broadcast-secondary truncate">
            {item.vendor || "Unknown Vendor"}
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Rank Change Indicator */}
        <div className="w-16 text-center font-mono font-bold">
          {item.rankChange === "NEW" ? (
            <span className="px-2 py-0.5 rounded bg-broadcast-cyan/20 text-broadcast-cyan text-xs">
              NEW
            </span>
          ) : item.rankChange.startsWith("+") ? (
            <span className="text-broadcast-green text-base">{item.rankChange}</span>
          ) : item.rankChange.startsWith("-") ? (
            <span className="text-broadcast-red text-base">{item.rankChange}</span>
          ) : item.rankChange === "0" ? (
            <span className="text-broadcast-secondary text-sm">0</span>
          ) : (
            <span className="text-broadcast-gray text-sm">—</span>
          )}
        </div>

        <StatusBadge status={item.badge} />
      </div>
    </div>
  );
}

function OfficialUserRow({ item }: { item: OfficialUserItem }) {
  return (
    <div className="p-3 rounded bg-panel/70 border border-hairline/50 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <Monogram name={item.displayName} slug={item.slug} size={36} />
        <div>
          <div className="font-bold text-sm text-broadcast-text">{item.displayName}</div>
          <div className="text-[11px] font-mono text-broadcast-secondary">
            {item.metricLabel} ({item.metricType})
          </div>
          <div className="text-[10px] font-mono text-hairline">
            as of {item.period} · {item.sourceDomain}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end">
        <div className="font-mono text-2xl font-black text-broadcast-text">
          {item.valueFormatted}
        </div>
        <StatusBadge status={item.badge} />
      </div>
    </div>
  );
}

function TopChartCard({ item }: { item: ChartItem }) {
  return (
    <div
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md border text-xs leading-tight transition ${
        item.isTracked
          ? "bg-broadcast-blue/20 border-broadcast-blue/80 shadow-[0_0_10px_rgba(45,123,255,0.25)] ring-1 ring-broadcast-blue/40"
          : "bg-panel/90 border-hairline/40 hover:border-hairline"
      }`}
    >
      <div className="flex items-center space-x-2 truncate min-w-0 flex-1 mr-2">
        <span className="w-6 font-mono font-black text-sm text-broadcast-text text-right shrink-0 tabular-nums">
          #{item.rank}
        </span>
        <Monogram name={item.name} size={26} />
        <div className="flex flex-col truncate min-w-0">
          <span className="font-bold text-xs text-broadcast-text truncate" title={item.name}>
            {item.name}
          </span>
          <span className="text-[10px] text-broadcast-secondary truncate" title={item.artist || ""}>
            {item.artist || "Unknown Developer"}
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2 shrink-0">
        {item.isTracked && (
          <span className="px-1.5 py-0.5 rounded bg-broadcast-blue/40 border border-broadcast-blue/70 text-broadcast-cyan font-mono text-[9px] font-black uppercase tracking-wider">
            AI APP
          </span>
        )}
        <div className="flex flex-col items-end">
          <a
            href={item.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Download ${item.name} on Apple App Store`}
            className="flex items-center space-x-1 px-2 py-0.5 rounded bg-broadcast-blue hover:bg-blue-600 text-white font-mono text-[10px] font-bold shadow-sm transition"
          >
            <span>⬇ Get</span>
            <span className="text-[8px] opacity-75">↗</span>
          </a>
          {item.verifiedDownloads ? (
            <span className="text-[9px] font-mono font-bold text-broadcast-green leading-none mt-0.5">
              {item.verifiedDownloads}
            </span>
          ) : (
            <span className="text-[9px] font-mono text-broadcast-secondary/70 leading-none mt-0.5">
              Free DL
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
