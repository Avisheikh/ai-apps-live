import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { z } from "zod";
import { Collector, CollectContext, CollectResult } from "../types";

export const AppleFeedItemSchema = z.object({
  id: z.string().regex(/^\d+$/, "Apple App ID must be numeric string"),
  name: z.string().min(1, "App name must not be empty"),
  artistName: z.string().optional(),
  artworkUrl100: z.string().optional(),
  url: z.string().optional(),
});

export const AppleFeedResponseSchema = z.object({
  feed: z.object({
    title: z.string(),
    country: z.string(),
    updated: z.string(),
    results: z.array(AppleFeedItemSchema).min(1).max(100),
  }),
});

export type AppleFeedResponse = z.infer<typeof AppleFeedResponseSchema>;

export class AppleRssCollector implements Collector {
  key = "apple_rss";

  constructor(
    private baseUrl: string = "https://rss.marketingtools.apple.com",
    private retryDelayMs: number = 500
  ) {}

  scopes(): string[] {
    return ["us/top-free/100"];
  }

  async collect(scope: string, ctx: CollectContext): Promise<CollectResult> {
    const [country, chart, limitStr] = scope.split("/");
    const limit = parseInt(limitStr || "100", 10);

    if (!country || !chart || isNaN(limit)) {
      return {
        status: "FAILED",
        errorCode: "INVALID_SCOPE",
        errorMessage: `Invalid scope format: ${scope}. Expected {country}/{chart}/{limit}`,
      };
    }

    const dataSource = ctx.repo.getDataSourceByKey(this.key);
    if (!dataSource || !dataSource.enabled) {
      return {
        status: "SKIPPED",
        errorMessage: "Apple RSS data source is disabled",
      };
    }

    // SSRF Guard: Strictly constrain outbound hostname in production
    const targetUrl = new URL(`${this.baseUrl}/api/v2/${country}/apps/${chart}/${limit}/apps.json`);
    if (this.baseUrl === "https://rss.marketingtools.apple.com" && targetUrl.hostname !== "rss.marketingtools.apple.com") {
      return {
        status: "FAILED",
        errorCode: "SSRF_GUARD_REJECTION",
        errorMessage: `Outbound host ${targetUrl.hostname} rejected by security allowlist`,
      };
    }

    const version = "1.0.0";
    const userAgent = `AIAppsLive/${version} (local broadcast dashboard; contact: ${ctx.operatorContact || "operator@localhost"})`;

    const startedAt = new Date().toISOString();

    let response: Response | undefined;
    let rawText = "";
    let httpStatus: number | undefined;
    let serverDateHeader: string | undefined;
    let clockSkewMs: number | undefined;
    let lastError: Error | null = null;

    // Retry transient CDN failures (e.g. 502/503/504) up to 2 times
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 20000);

      try {
        response = await fetch(targetUrl.toString(), {
          headers: {
            "User-Agent": userAgent,
            Accept: "application/json",
          },
          signal: abortController.signal,
        });

        httpStatus = response.status;
        serverDateHeader = response.headers.get("date") || undefined;
        if (serverDateHeader) {
          const serverDate = new Date(serverDateHeader).getTime();
          if (!isNaN(serverDate)) {
            clockSkewMs = Date.now() - serverDate;
          }
        }

        if (response.status >= 500 && attempt < maxAttempts) {
          // Transient CDN error (e.g., Apple edge node 502/504) -> short delay and retry next round-robin node
          await new Promise((r) => setTimeout(r, this.retryDelayMs));
          continue;
        }

        rawText = await response.text();
        break;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, this.retryDelayMs));
          continue;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (!response) {
      const isAbort = lastError?.name === "AbortError";
      return {
        status: "FAILED",
        httpStatus,
        serverDateHeader,
        clockSkewMs,
        errorCode: isAbort ? "TIMEOUT_EXCEEDED" : "NETWORK_ERROR",
        errorMessage: lastError?.message || "Network request failed after retries",
      };
    }

    if (!response.ok) {
      return {
        status: "FAILED",
        httpStatus,
        serverDateHeader,
        clockSkewMs,
        errorCode: `HTTP_${response.status}`,
        errorMessage: `Server returned HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return {
        status: "FAILED",
        httpStatus,
        serverDateHeader,
        clockSkewMs,
        errorCode: "INVALID_CONTENT_TYPE",
        errorMessage: `Expected application/json, received ${contentType}`,
      };
    }

    // SHA256 of raw response body
    const bodySha256 = createHash("sha256").update(rawText).digest("hex");
    const bodyGzip = gzipSync(Buffer.from(rawText, "utf-8"));

    // Check if the body hash is identical to latest observation for this scope (NO_CHANGE)
    const latestObs = ctx.db
      .prepare(
        "SELECT body_sha256, source_updated_at FROM source_observations WHERE source_id = ? AND scope = ? ORDER BY collected_at DESC LIMIT 1"
      )
      .get(dataSource.id, scope) as { body_sha256: string; source_updated_at: string | null } | undefined;

    if (latestObs && latestObs.body_sha256 === bodySha256) {
      return {
        status: "NO_CHANGE",
        httpStatus,
        serverDateHeader,
        clockSkewMs,
        sourceUpdatedAt: latestObs.source_updated_at || undefined,
        rawBodySha256: bodySha256,
      };
    }

    // Parse and validate with Zod
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch (e) {
      return {
        status: "FAILED",
        httpStatus,
        serverDateHeader,
        clockSkewMs,
        errorCode: "MALFORMED_JSON",
        errorMessage: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
        rawBodySha256: bodySha256,
      };
    }

    const parseResult = AppleFeedResponseSchema.safeParse(parsedJson);
    if (!parseResult.success) {
      return {
        status: "FAILED",
        httpStatus,
        serverDateHeader,
        clockSkewMs,
        errorCode: "SCHEMA_VALIDATION_FAILED",
        errorMessage: parseResult.error.message,
        rawBodySha256: bodySha256,
      };
    }

    const feedData = parseResult.data.feed;

    // Validate country match
    if (feedData.country.toLowerCase() !== country.toLowerCase()) {
      return {
        status: "FAILED",
        httpStatus,
        serverDateHeader,
        clockSkewMs,
        errorCode: "COUNTRY_MISMATCH",
        errorMessage: `Feed country '${feedData.country}' does not match requested scope country '${country}'`,
        rawBodySha256: bodySha256,
      };
    }

    // Validate unique IDs
    const seenIds = new Set<string>();
    for (const item of feedData.results) {
      if (seenIds.has(item.id)) {
        return {
          status: "FAILED",
          httpStatus,
          serverDateHeader,
          clockSkewMs,
          errorCode: "DUPLICATE_ITEM_ID",
          errorMessage: `Duplicate item id found in feed: ${item.id}`,
          rawBodySha256: bodySha256,
        };
      }
      seenIds.add(item.id);
    }

    // Parse feed.updated timestamp and validate plausibility
    const feedUpdatedDate = new Date(feedData.updated);
    if (isNaN(feedUpdatedDate.getTime())) {
      return {
        status: "FAILED",
        httpStatus,
        serverDateHeader,
        clockSkewMs,
        errorCode: "INVALID_SOURCE_TIMESTAMP",
        errorMessage: `Failed to parse feed.updated: ${feedData.updated}`,
        rawBodySha256: bodySha256,
      };
    }

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const fiveMinutesFuture = now + 5 * 60 * 1000;
    const feedUpdatedMs = feedUpdatedDate.getTime();
    const sourceUpdatedAtIso = feedUpdatedDate.toISOString();

    if (feedUpdatedMs < sevenDaysAgo || feedUpdatedMs > fiveMinutesFuture) {
      // Store observation, mark run FAILED with error_code=SOURCE_TIMESTAMP_IMPLAUSIBLE, do not publish snapshot
      ctx.db
        .prepare(
          `INSERT INTO source_observations (source_id, scope, request_url, collected_at, source_updated_at, content_type, body_sha256, body_gzip)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          dataSource.id,
          scope,
          targetUrl.toString(),
          startedAt,
          sourceUpdatedAtIso,
          contentType,
          bodySha256,
          bodyGzip
        );

      return {
        status: "FAILED",
        httpStatus,
        serverDateHeader,
        clockSkewMs,
        errorCode: "SOURCE_TIMESTAMP_IMPLAUSIBLE",
        errorMessage: `feed.updated '${feedData.updated}' is outside plausible bounds (now-7d to now+5m)`,
        sourceUpdatedAt: sourceUpdatedAtIso,
        rawBodySha256: bodySha256,
      };
    }

    // Check if (country, chart, source_updated_at) already exists in chart_snapshots
    const existingSnapshot = ctx.db
      .prepare(
        "SELECT id FROM chart_snapshots WHERE country = ? AND chart = ? AND source_updated_at = ?"
      )
      .get(country.toLowerCase(), chart.toLowerCase(), sourceUpdatedAtIso);

    if (existingSnapshot) {
      return {
        status: "NO_CHANGE",
        httpStatus,
        serverDateHeader,
        clockSkewMs,
        sourceUpdatedAt: sourceUpdatedAtIso,
        rawBodySha256: bodySha256,
      };
    }

    // Single transaction to persist observation, snapshot, rankings, and stream event
    let snapshotId = 0;
    const recordsSeen = feedData.results.length;
    let recordsInserted = 0;

    const commitBatch = ctx.db.transaction(() => {
      // 1. Insert observation
      const obsInfo = ctx.db
        .prepare(
          `INSERT INTO source_observations (source_id, scope, request_url, collected_at, source_updated_at, content_type, body_sha256, body_gzip)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          dataSource.id,
          scope,
          targetUrl.toString(),
          startedAt,
          sourceUpdatedAtIso,
          contentType,
          bodySha256,
          bodyGzip
        );
      const observationId = Number(obsInfo.lastInsertRowid);

      // 2. Insert chart_snapshots
      const snapInfo = ctx.db
        .prepare(
          `INSERT INTO chart_snapshots (observation_id, country, chart, source_updated_at, collected_at, list_size)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          observationId,
          country.toLowerCase(),
          chart.toLowerCase(),
          sourceUpdatedAtIso,
          startedAt,
          recordsSeen
        );
      snapshotId = Number(snapInfo.lastInsertRowid);

      // 3. Insert rankings
      // Lookup confirmed apps mapping
      const confirmedApps = ctx.db
        .prepare("SELECT id, apple_app_id FROM apps WHERE apple_identity_status = 'CONFIRMED' AND apple_app_id IS NOT NULL")
        .all() as Array<{ id: number; apple_app_id: string }>;
      const appMap = new Map<string, number>();
      for (const a of confirmedApps) {
        appMap.set(a.apple_app_id, a.id);
      }

      const insertRanking = ctx.db.prepare(
        `INSERT INTO app_store_rankings (snapshot_id, apple_app_id, app_id, rank, name_in_feed, artist_in_feed)
         VALUES (?, ?, ?, ?, ?, ?)`
      );

      let rank = 1;
      for (const item of feedData.results) {
        const matchedAppId = appMap.get(item.id) || null;
        insertRanking.run(
          snapshotId,
          item.id,
          matchedAppId,
          rank,
          item.name,
          item.artistName || null
        );
        recordsInserted++;
        rank++;
      }

      // 4. Emit stream event
      ctx.repo.insertStreamEvent("ranking_update", {
        snapshotId,
        country: country.toLowerCase(),
        chart: chart.toLowerCase(),
        sourceUpdatedAt: sourceUpdatedAtIso,
        collectedAt: startedAt,
        listSize: recordsSeen,
      });
    });

    commitBatch();

    return {
      status: "SUCCESS",
      httpStatus,
      serverDateHeader,
      clockSkewMs,
      recordsSeen,
      recordsInserted,
      sourceUpdatedAt: sourceUpdatedAtIso,
      rawBodySha256: bodySha256,
    };
  }
}
