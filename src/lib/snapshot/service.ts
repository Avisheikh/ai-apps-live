import Database from "better-sqlite3";
import { getDb } from "@/lib/db/index";
import { Repository } from "@/lib/db/repo";
import { deriveDisplayStatus, DisplayStatus, Freshness } from "@/lib/status/derive";

export interface ProvenanceInfo {
  metricName: string;
  sourceName: string;
  sourceUrl: string;
  geography: string;
  reportingPeriod: string;
  sourceTimestamp: string | null;
  collectionTimestamp: string;
  verificationStatus: string;
  freshnessStatus: string;
  databaseRef: {
    table: string;
    id: number;
  };
}

export interface ChartItem {
  rank: number;
  appleAppId: string;
  name: string;
  artist: string | null;
  downloadUrl: string;
  verifiedDownloads: string | null;
  isTracked: boolean;
  trackedAppSlug?: string | null;
}

export interface AppStoreItem {
  appId: number | null;
  slug: string | null;
  displayName: string;
  vendor: string | null;
  appleAppId: string;
  rank: number;
  previousRank: number | null;
  rankChange: string; // "+3", "-2", "0", "NEW", "—"
  iconUrl: string | null;
  sourceTime: string;
  badge: DisplayStatus;
  provenance: ProvenanceInfo;
}

export interface SearchInterestSeries {
  appId: number;
  slug: string;
  displayName: string;
  termLabel: string;
  data: Array<{
    date: string;
    valueRaw: string;
    valueIndex: number | null;
    isPartial: boolean;
  }>;
  latestValue: {
    raw: string;
    index: number | null;
  } | null;
}

export interface OfficialUserItem {
  disclosureId: number;
  appId: number;
  slug: string;
  displayName: string;
  valueNumeric: number;
  valueFormatted: string;
  valueQualifier: string;
  metricType: string;
  metricLabel: string;
  period: string;
  reportingPeriodEnd: string;
  disclosedAt: string;
  sourceKind: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceLocator: string;
  badge: DisplayStatus;
  freshness: Freshness;
  provenance: ProvenanceInfo;
}

export interface PublicSnapshot {
  generatedAt: string;
  timestamps: {
    lastCollectionAt: string | null;
    sourceUpdatedAt: string | null;
    dashboardRefreshAt: string;
  };
  appStore: {
    country: string;
    chart: string;
    sourceUpdatedAt: string | null;
    collectedAt: string | null;
    status: DisplayStatus;
    freshness: Freshness;
    attribution: string;
    items: AppStoreItem[];
    topChart: ChartItem[];
    notInTop100: Array<{
      appId: number;
      slug: string;
      displayName: string;
      vendor: string;
    }>;
  };
  searchInterest: {
    available: boolean;
    importId: number | null;
    geo: string;
    geoLabel: string;
    searchType: string;
    entityMode: string;
    timeRangeLabel: string;
    exportedAt: string | null;
    status: DisplayStatus;
    freshness: Freshness;
    attribution: string;
    disclaimer: string;
    terms: string[];
    series: SearchInterestSeries[];
  };
  rankMovement: {
    available: boolean;
    hours: number;
    items: Array<{
      appId: number | null;
      slug: string;
      displayName: string;
      points: Array<{
        timestamp: string;
        rank: number | null;
      }>;
    }>;
  };
  officialUsers: {
    available: boolean;
    status: DisplayStatus;
    items: OfficialUserItem[];
    unreportedApps: Array<{
      appId: number;
      slug: string;
      displayName: string;
    }>;
  };
  concurrentUsers: {
    available: false;
    message: "Concurrent user data unavailable.";
    explanation: "No public source reports this.";
  };
  sourceHealth: Array<{
    sourceKey: string;
    sourceName: string;
    state: string;
    badge: DisplayStatus;
    ageSeconds: number | null;
    lastSuccessAt: string | null;
  }>;
  controls: Array<{
    metricKey: string;
    enabled: boolean;
    reason: string | null;
  }>;
}

export function formatUserCount(numeric: number, qualifier: string): string {
  let numStr = "";
  if (numeric >= 1_000_000_000) {
    const val = numeric / 1_000_000_000;
    numStr = Number.isInteger(val) ? `${val}B` : `${val.toFixed(1)}B`;
  } else if (numeric >= 1_000_000) {
    const val = numeric / 1_000_000;
    numStr = Number.isInteger(val) ? `${val}M` : `${val.toFixed(1)}M`;
  } else if (numeric >= 1_000) {
    const val = numeric / 1_000;
    numStr = Number.isInteger(val) ? `${val}K` : `${val.toFixed(1)}K`;
  } else {
    numStr = String(numeric);
  }

  if (qualifier === "AT_LEAST") return `${numStr}+`;
  if (qualifier === "ABOUT") return `~${numStr}`;
  return numStr;
}

export class SnapshotService {
  private repo: Repository;

  constructor(private db: Database.Database = getDb()) {
    this.repo = new Repository(this.db);
  }

  getSnapshot(country = "us", nowIso?: string): PublicSnapshot {
    const now = nowIso || new Date().toISOString();
    const activeApps = this.repo.getApps(true);
    const sources = this.repo.getDataSources();
    const metricControls = this.repo.getMetricControls();

    const appStoreControl = metricControls.find((c) => c.metric_key === "APP_STORE_RANK");
    const appStoreSource = sources.find((s) => s.key === "apple_rss");

    const trendsControl = metricControls.find((c) => c.metric_key === "SEARCH_INTEREST");
    const trendsSource = sources.find((s) => s.key === "google_trends_csv");

    const disclosuresControl = metricControls.find((c) => c.metric_key === "OFFICIAL_USERS");
    const disclosuresSource = sources.find((s) => s.key === "company_disclosure");

    // ───────────── 1. App Store Popularity ─────────────
    const latestSnapshot = this.db
      .prepare(
        `SELECT cs.*, so.request_url
         FROM chart_snapshots cs
         JOIN source_observations so ON so.id = cs.observation_id
         WHERE cs.country = ? AND cs.chart = 'top-free'
         ORDER BY cs.source_updated_at DESC
         LIMIT 1`
      )
      .get(country.toLowerCase()) as
      | {
          id: number;
          country: string;
          chart: string;
          source_updated_at: string;
          collected_at: string;
          list_size: number;
          request_url: string;
        }
      | undefined;

    // Previous snapshot with a DIFFERENT source_updated_at for rank change comparison
    let prevSnapshot: { id: number } | undefined;
    if (latestSnapshot) {
      prevSnapshot = this.db
        .prepare(
          `SELECT id FROM chart_snapshots
           WHERE country = ? AND chart = 'top-free' AND source_updated_at <> ?
           ORDER BY source_updated_at DESC
           LIMIT 1`
        )
        .get(country.toLowerCase(), latestSnapshot.source_updated_at) as { id: number } | undefined;
    }

    const prevRankMap = new Map<string, number>();
    if (prevSnapshot) {
      const prevRows = this.db
        .prepare("SELECT apple_app_id, rank FROM app_store_rankings WHERE snapshot_id = ?")
        .all(prevSnapshot.id) as Array<{ apple_app_id: string; rank: number }>;
      for (const r of prevRows) prevRankMap.set(r.apple_app_id, r.rank);
    }

    const appStoreStatus = deriveDisplayStatus({
      metric: "APP_STORE_RANK",
      metricEnabled: !!appStoreControl?.enabled,
      sourceEnabled: !!appStoreSource?.enabled,
      disabledReason: appStoreControl?.reason || appStoreSource?.disabled_reason,
      record: latestSnapshot ? { referenceTime: latestSnapshot.source_updated_at } : null,
      now,
      staleAfterSeconds: appStoreSource?.stale_after_seconds || 86400,
    });

    const appStoreItems: AppStoreItem[] = [];
    const topChart: ChartItem[] = [];
    const seenAppIdsInTop = new Set<number>();

    if (latestSnapshot) {
      const rankings = this.db
        .prepare(
          `SELECT r.*, a.slug, a.display_name, a.vendor
           FROM app_store_rankings r
           LEFT JOIN apps a ON a.id = r.app_id
           WHERE r.snapshot_id = ?
           ORDER BY r.rank ASC`
        )
        .all(latestSnapshot.id) as Array<{
        id: number;
        apple_app_id: string;
        app_id: number | null;
        rank: number;
        name_in_feed: string;
        artist_in_feed: string | null;
        slug: string | null;
        display_name: string | null;
        vendor: string | null;
      }>;

      // Filter to tracked apps (either confirmed app_id or matching apple_app_id in apps table)
      const trackedAppleIds = new Map<string, { id: number; slug: string; display_name: string; vendor: string }>();
      for (const app of activeApps) {
        if (app.apple_app_id) {
          trackedAppleIds.set(app.apple_app_id, {
            id: app.id,
            slug: app.slug,
            display_name: app.display_name,
            vendor: app.vendor,
          });
        }
      }

      for (const r of rankings) {
        const tracked = (r.app_id ? activeApps.find((a) => a.id === r.app_id) : null) || trackedAppleIds.get(r.apple_app_id);
        if (!tracked) continue;

        seenAppIdsInTop.add(tracked.id);
        const prevRank = prevRankMap.get(r.apple_app_id) ?? null;

        let rankChange = "—";
        if (prevSnapshot) {
          if (prevRank === null) {
            rankChange = "NEW";
          } else {
            const diff = prevRank - r.rank;
            if (diff > 0) rankChange = `+${diff}`;
            else if (diff < 0) rankChange = `-${Math.abs(diff)}`;
            else rankChange = "0";
          }
        }

        appStoreItems.push({
          appId: r.app_id, // NULL if UNCONFIRMED, integer if CONFIRMED
          slug: tracked.slug,
          displayName: tracked.display_name,
          vendor: tracked.vendor,
          appleAppId: r.apple_app_id,
          rank: r.rank,
          previousRank: prevRank,
          rankChange,
          iconUrl: null, // Artwork URL can be hotlinked from feed or locally generated monogram
          sourceTime: latestSnapshot.source_updated_at,
          badge: appStoreStatus.status,
          provenance: {
            metricName: "App Store Popularity",
            sourceName: "Apple App Store charts",
            sourceUrl: latestSnapshot.request_url,
            geography: country.toUpperCase(),
            reportingPeriod: "Real-time chart snapshot",
            sourceTimestamp: latestSnapshot.source_updated_at,
            collectionTimestamp: latestSnapshot.collected_at,
            verificationStatus: "AUTOMATIC_SOURCE",
            freshnessStatus: appStoreStatus.freshness.state,
            databaseRef: {
              table: "app_store_rankings",
              id: r.id,
            },
          },
        });
      }

      for (const r of rankings.slice(0, 50)) {
        const tracked = (r.app_id ? activeApps.find((a) => a.id === r.app_id) : null) || trackedAppleIds.get(r.apple_app_id);
        const downloadUrl = `https://apps.apple.com/${country.toLowerCase()}/app/id${r.apple_app_id}`;
        topChart.push({
          rank: r.rank,
          appleAppId: r.apple_app_id,
          name: r.name_in_feed,
          artist: r.artist_in_feed,
          downloadUrl,
          verifiedDownloads: null,
          isTracked: !!tracked,
          trackedAppSlug: tracked?.slug || null,
        });
      }
    }

    const notInTop100 = activeApps
      .filter((a) => !seenAppIdsInTop.has(a.id))
      .map((a) => ({
        appId: a.id,
        slug: a.slug,
        displayName: a.display_name,
        vendor: a.vendor,
      }));

    // ───────────── 2. Search Interest ─────────────
    const currentImport = this.db
      .prepare(
        `SELECT * FROM search_interest_imports
         WHERE is_current = 1 AND status = 'ACCEPTED' AND geo = ?
         ORDER BY imported_at DESC LIMIT 1`
      )
      .get(country.toUpperCase()) as
      | {
          id: number;
          geo: string;
          geo_label: string;
          search_type: string;
          entity_mode: string;
          time_range_label: string;
          exported_at: string;
          imported_at: string;
          header_terms_json: string;
        }
      | undefined;

    const trendsStatus = deriveDisplayStatus({
      metric: "SEARCH_INTEREST",
      metricEnabled: !!trendsControl?.enabled,
      sourceEnabled: !!trendsSource?.enabled,
      disabledReason: trendsControl?.reason || trendsSource?.disabled_reason,
      record: currentImport ? { referenceTime: currentImport.exported_at } : null,
      now,
      staleAfterSeconds: trendsSource?.stale_after_seconds || 1209600,
    });

    const trendsSeries: SearchInterestSeries[] = [];
    let trendsTerms: string[] = [];

    if (currentImport) {
      try {
        trendsTerms = JSON.parse(currentImport.header_terms_json);
      } catch {
        trendsTerms = [];
      }

      const rows = this.db
        .prepare(
          `SELECT si.*, a.slug, a.display_name
           FROM search_interest si
           JOIN apps a ON a.id = si.app_id
           WHERE si.import_id = ?
           ORDER BY si.bucket_start ASC`
        )
        .all(currentImport.id) as Array<{
        app_id: number;
        slug: string;
        display_name: string;
        term_label: string;
        bucket_start: string;
        value_raw: string;
        value_index: number | null;
        is_partial: number;
      }>;

      // Group by app_id
      const byApp = new Map<number, typeof rows>();
      for (const r of rows) {
        const arr = byApp.get(r.app_id) || [];
        arr.push(r);
        byApp.set(r.app_id, arr);
      }

      for (const [appId, appRows] of byApp.entries()) {
        const first = appRows[0];
        const data = appRows.map((r) => ({
          date: r.bucket_start,
          valueRaw: r.value_raw,
          valueIndex: r.value_index,
          isPartial: r.is_partial === 1,
        }));
        const lastRow = appRows[appRows.length - 1];

        trendsSeries.push({
          appId,
          slug: first.slug,
          displayName: first.display_name,
          termLabel: first.term_label,
          data,
          latestValue: lastRow
            ? {
                raw: lastRow.value_raw,
                index: lastRow.value_index,
              }
            : null,
        });
      }
    }

    // ───────────── 3. Rank Movement (24h) ─────────────
    const twentyFourHoursAgo = new Date(new Date(now).getTime() - 24 * 3600 * 1000).toISOString();
    const snapshots24h = this.db
      .prepare(
        `SELECT id, source_updated_at FROM chart_snapshots
         WHERE country = ? AND chart = 'top-free' AND source_updated_at >= ?
         ORDER BY source_updated_at ASC`
      )
      .all(country.toLowerCase(), twentyFourHoursAgo) as Array<{ id: number; source_updated_at: string }>;

    const rankMovementItems: PublicSnapshot["rankMovement"]["items"] = [];
    if (snapshots24h.length > 0) {
      const snapshotIds = snapshots24h.map((s) => s.id);
      const query = `SELECT r.snapshot_id, r.apple_app_id, r.app_id, r.rank, a.slug, a.display_name
                     FROM app_store_rankings r
                     LEFT JOIN apps a ON a.id = r.app_id
                     WHERE r.snapshot_id IN (${snapshotIds.join(",")})`;
      const rows = this.db.prepare(query).all() as Array<{
        snapshot_id: number;
        apple_app_id: string;
        app_id: number | null;
        rank: number;
        slug: string | null;
        display_name: string | null;
      }>;

      // Group by tracked apps
      for (const app of activeApps) {
        if (!app.apple_app_id) continue;
        const appRows = rows.filter((r) => r.apple_app_id === app.apple_app_id);
        const rankBySnap = new Map<number, number>();
        for (const r of appRows) rankBySnap.set(r.snapshot_id, r.rank);

        const points = snapshots24h.map((s) => ({
          timestamp: s.source_updated_at,
          rank: rankBySnap.get(s.id) || null, // null for gaps
        }));

        rankMovementItems.push({
          appId: app.id,
          slug: app.slug,
          displayName: app.display_name,
          points,
        });
      }
    }

    // ───────────── 4. Official Company Disclosures ─────────────
    const officialStatus = deriveDisplayStatus({
      metric: "OFFICIAL_USERS",
      metricEnabled: !!disclosuresControl?.enabled,
      sourceEnabled: !!disclosuresSource?.enabled,
      disabledReason: disclosuresControl?.reason || disclosuresSource?.disabled_reason,
      record: null, // Evaluated per row
      now,
      staleAfterSeconds: disclosuresSource?.stale_after_seconds || 15552000,
    });

    const verifiedDisclosures = this.db
      .prepare(
        `SELECT cd.*, a.slug as app_slug, a.display_name as app_name
         FROM company_disclosures cd
         JOIN apps a ON a.id = cd.app_id
         WHERE cd.verification_status = 'VERIFIED' AND cd.is_current = 1
         ORDER BY a.sort_order ASC, cd.disclosed_at DESC`
      )
      .all() as Array<{
      id: number;
      app_id: number;
      metric_type: string;
      metric_label: string;
      value_numeric: number;
      value_qualifier: string;
      unit: string;
      geography: string;
      reporting_period_start: string | null;
      reporting_period_end: string;
      disclosed_at: string;
      source_kind: string;
      source_url: string;
      source_locator: string;
      entered_at: string;
      verification_status: "VERIFIED";
      verified_by: string;
      verified_at: string;
      app_slug: string;
      app_name: string;
    }>;

    const reportedAppIds = new Set<number>();
    const officialUserItems: OfficialUserItem[] = [];

    for (const d of verifiedDisclosures) {
      reportedAppIds.add(d.app_id);

      // Link verified metrics to topChart if charting
      const chartMatch = topChart.find((t) => t.trackedAppSlug === d.app_slug);
      if (chartMatch && !chartMatch.verifiedDownloads) {
        const formatted = formatUserCount(d.value_numeric, d.value_qualifier);
        chartMatch.verifiedDownloads = `${formatted} ${d.metric_label}`;
      }

      const itemStatus = deriveDisplayStatus({
        metric: "OFFICIAL_USERS",
        metricEnabled: !!disclosuresControl?.enabled,
        sourceEnabled: !!disclosuresSource?.enabled,
        record: {
          verificationStatus: "VERIFIED",
          isCurrent: true,
          referenceTime: d.reporting_period_end,
        },
        now,
        staleAfterSeconds: disclosuresSource?.stale_after_seconds || 15552000,
      });

      let domain = "";
      try {
        domain = new URL(d.source_url).hostname;
      } catch {
        domain = d.source_url;
      }

      officialUserItems.push({
        disclosureId: d.id,
        appId: d.app_id,
        slug: d.app_slug,
        displayName: d.app_name,
        valueNumeric: d.value_numeric,
        valueFormatted: formatUserCount(d.value_numeric, d.value_qualifier),
        valueQualifier: d.value_qualifier,
        metricType: d.metric_type,
        metricLabel: d.metric_label,
        period: `as of ${d.reporting_period_end}`,
        reportingPeriodEnd: d.reporting_period_end,
        disclosedAt: d.disclosed_at,
        sourceKind: d.source_kind,
        sourceUrl: d.source_url,
        sourceDomain: domain,
        sourceLocator: d.source_locator,
        badge: itemStatus.status,
        freshness: itemStatus.freshness,
        provenance: {
          metricName: "Officially Reported Users",
          sourceName: d.source_kind,
          sourceUrl: d.source_url,
          geography: d.geography,
          reportingPeriod: `as of ${d.reporting_period_end}`,
          sourceTimestamp: d.disclosed_at,
          collectionTimestamp: d.entered_at,
          verificationStatus: "VERIFIED",
          freshnessStatus: itemStatus.freshness.state,
          databaseRef: {
            table: "company_disclosures",
            id: d.id,
          },
        },
      });
    }

    const unreportedApps = activeApps
      .filter((a) => !reportedAppIds.has(a.id))
      .map((a) => ({
        appId: a.id,
        slug: a.slug,
        displayName: a.display_name,
      }));

    // ───────────── 5. Source Health List ─────────────
    const healthRows = this.repo.getSourceHealthList();
    const sourceHealth = healthRows.map((sh) => {
      let ageSeconds: number | null = null;
      if (sh.last_success_at) {
        const ms = new Date(now).getTime() - new Date(sh.last_success_at).getTime();
        ageSeconds = Math.max(0, Math.floor(ms / 1000));
      }

      let badge: DisplayStatus = "SOURCE_DATA";
      if (sh.state === "DISABLED") badge = "UNAVAILABLE";
      else if (sh.state === "DOWN" || sh.state === "DEGRADED") badge = "STALE";

      return {
        sourceKey: sh.source_key,
        sourceName: sh.source_name,
        state: sh.state,
        badge,
        ageSeconds,
        lastSuccessAt: sh.last_success_at,
      };
    });

    // Controls
    const controls = metricControls.map((c) => ({
      metricKey: c.metric_key,
      enabled: c.enabled === 1,
      reason: c.reason,
    }));

    return {
      generatedAt: now,
      timestamps: {
        lastCollectionAt: latestSnapshot?.collected_at || null,
        sourceUpdatedAt: latestSnapshot?.source_updated_at || null,
        dashboardRefreshAt: now,
      },
      appStore: {
        country: country.toLowerCase(),
        chart: "top-free",
        sourceUpdatedAt: latestSnapshot?.source_updated_at || null,
        collectedAt: latestSnapshot?.collected_at || null,
        status: appStoreStatus.status,
        freshness: appStoreStatus.freshness,
        attribution: "Source: Apple App Store charts",
        items: appStoreItems,
        topChart,
        notInTop100,
      },
      searchInterest: {
        available: !!currentImport && !!trendsControl?.enabled && !!trendsSource?.enabled,
        importId: currentImport?.id || null,
        geo: currentImport?.geo || country.toUpperCase(),
        geoLabel: currentImport?.geo_label || country.toUpperCase(),
        searchType: currentImport?.search_type || "web",
        entityMode: currentImport?.entity_mode || "search_term",
        timeRangeLabel: currentImport?.time_range_label || "",
        exportedAt: currentImport?.exported_at || null,
        status: trendsStatus.status,
        freshness: trendsStatus.freshness,
        attribution: "Data source: Google Trends (https://www.google.com/trends)",
        disclaimer: "Relative index 0–100, not search volume",
        terms: trendsTerms,
        series: trendsSeries,
      },
      rankMovement: {
        available: rankMovementItems.length > 0,
        hours: 24,
        items: rankMovementItems,
      },
      officialUsers: {
        available: officialUserItems.length > 0 && !!disclosuresControl?.enabled && !!disclosuresSource?.enabled,
        status: officialStatus.status,
        items: officialUserItems,
        unreportedApps,
      },
      concurrentUsers: {
        available: false,
        message: "Concurrent user data unavailable.",
        explanation: "No public source reports this.",
      },
      sourceHealth,
      controls,
    };
  }
}
