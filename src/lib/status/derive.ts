export type DisplayStatus =
  | "VERIFIED"
  | "SOURCE_DATA"
  | "MANUAL_IMPORT"
  | "STALE"
  | "UNAVAILABLE";

export interface Freshness {
  state: "FRESH" | "STALE" | "UNKNOWN";
  ageSeconds: number | null;
  staleAfterSeconds: number;
}

export interface DeriveStatusInput {
  metric:
    | "APP_STORE_RANK"
    | "SEARCH_INTEREST"
    | "OFFICIAL_USERS"
    | "SERVICE_STATUS"
    | "DNS_POPULARITY";
  metricEnabled: boolean;
  sourceEnabled: boolean;
  disabledReason?: string | null;
  record: null | {
    verificationStatus?: "DRAFT" | "VERIFIED" | "REJECTED" | "WITHDRAWN";
    isCurrent?: boolean;
    referenceTime: string; // ISO timestamp
  };
  now: string; // ISO timestamp
  staleAfterSeconds: number;
}

export interface DerivedStatusResult {
  status: DisplayStatus;
  reason: string;
  freshness: Freshness;
}

/**
 * Single source of truth for display status derivation.
 * Used identically across UI, API, and test suites.
 */
export function deriveDisplayStatus(input: DeriveStatusInput): DerivedStatusResult {
  const { metric, metricEnabled, sourceEnabled, disabledReason, record, now, staleAfterSeconds } = input;

  // Rule 1: Metric or Source disabled -> UNAVAILABLE
  if (!metricEnabled || !sourceEnabled) {
    const reason = disabledReason || "Disabled by administrator";
    return {
      status: "UNAVAILABLE",
      reason,
      freshness: {
        state: "UNKNOWN",
        ageSeconds: null,
        staleAfterSeconds,
      },
    };
  }

  // Rule 2: No record, or OFFICIAL_USERS record that is not (VERIFIED and isCurrent) -> UNAVAILABLE
  if (!record) {
    const reason = metric === "OFFICIAL_USERS" ? "No verified disclosure" : "Awaiting first collection";
    return {
      status: "UNAVAILABLE",
      reason,
      freshness: {
        state: "UNKNOWN",
        ageSeconds: null,
        staleAfterSeconds,
      },
    };
  }

  if (metric === "OFFICIAL_USERS") {
    if (record.verificationStatus !== "VERIFIED" || record.isCurrent === false) {
      return {
        status: "UNAVAILABLE",
        reason: "No verified disclosure",
        freshness: {
          state: "UNKNOWN",
          ageSeconds: null,
          staleAfterSeconds,
        },
      };
    }
  }

  // Rule 3: Age calculation and STALE check
  const nowMs = new Date(now).getTime();
  const refMs = new Date(record.referenceTime).getTime();
  const ageSeconds = !isNaN(nowMs) && !isNaN(refMs) ? Math.max(0, Math.floor((nowMs - refMs) / 1000)) : null;

  const isStale = ageSeconds !== null && ageSeconds > staleAfterSeconds;
  const freshness: Freshness = {
    state: isStale ? "STALE" : ageSeconds !== null ? "FRESH" : "UNKNOWN",
    ageSeconds,
    staleAfterSeconds,
  };

  if (isStale) {
    return {
      status: "STALE",
      reason: `Data exceeds freshness threshold (${Math.floor(ageSeconds / 86400)}d ago)`,
      freshness,
    };
  }

  // Rule 4: Canonical category mapping
  // Green VERIFIED is strictly reserved for OFFICIAL_USERS.
  if (metric === "OFFICIAL_USERS") {
    return {
      status: "VERIFIED",
      reason: "Officially disclosed and human verified",
      freshness,
    };
  }

  if (metric === "SEARCH_INTEREST") {
    return {
      status: "MANUAL_IMPORT",
      reason: "Operator imported from Google Trends",
      freshness,
    };
  }

  if (metric === "APP_STORE_RANK" || metric === "SERVICE_STATUS" || metric === "DNS_POPULARITY") {
    return {
      status: "SOURCE_DATA",
      reason: "Automated public source data",
      freshness,
    };
  }

  return {
    status: "UNAVAILABLE",
    reason: "Unknown metric family",
    freshness,
  };
}
