/**
 * Real-time App Store download velocity model.
 * Based on empirical power-law distribution for US App Store Top Free chart.
 */

export interface AppVelocityInfo {
  dailyRate: number; // Estimated downloads per 24 hours
  ratePerSecond: number; // Downloads per second
  ratePerMinute: number; // Downloads per minute
  initialCountToday: number; // Downloads accumulated today since 00:00 UTC
}

/**
 * Calculates estimated daily downloads and download rate for an App Store rank (1-100).
 */
export function getRankVelocity(rank: number): {
  dailyRate: number;
  ratePerSecond: number;
  ratePerMinute: number;
} {
  const boundedRank = Math.max(1, Math.min(100, rank));
  // Power law: Rank 1 ~180k/day, decaying with rank^0.58
  const dailyRate = Math.round(180_000 / Math.pow(boundedRank, 0.58));
  const ratePerSecond = dailyRate / 86_400;
  const ratePerMinute = Math.round(dailyRate / 1440);

  return {
    dailyRate,
    ratePerSecond,
    ratePerMinute,
  };
}

/**
 * Calculates initial today count based on UTC elapsed time since midnight.
 */
export function getInitialCountToday(rank: number, now: Date = new Date()): number {
  const { ratePerSecond } = getRankVelocity(rank);
  const midnightUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const elapsedSeconds = Math.max(0, (now.getTime() - midnightUtc.getTime()) / 1000);
  
  // Deterministic jitter based on rank so numbers don't look completely flat
  const jitter = 1 + (((rank * 17) % 11) - 5) * 0.02; // ±10% jitter
  return Math.floor(elapsedSeconds * ratePerSecond * jitter);
}
