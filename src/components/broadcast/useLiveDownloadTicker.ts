"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { getRankVelocity, getInitialCountToday } from "@/lib/ticker/velocity";

export interface LiveTickerState {
  counts: Record<number, number>;
  totalToday: number;
  recentIncrements: Set<number>;
  ratesPerMinute: Record<number, number>;
}

export function useLiveDownloadTicker(maxRank: number = 50) {
  const mountTimeRef = useRef<number>(Date.now());
  const previousCountsRef = useRef<Record<number, number>>({});

  // Compute baseline velocities and starting counts once
  const baselines = useMemo(() => {
    const baseMap: Record<number, { initial: number; ratePerMs: number; ratePerMinute: number }> = {};
    const now = new Date();

    for (let rank = 1; rank <= maxRank; rank++) {
      const { ratePerSecond, ratePerMinute } = getRankVelocity(rank);
      const jitter = 1 + (((rank * 17) % 11) - 5) * 0.02;
      const initial = getInitialCountToday(rank, now);
      baseMap[rank] = {
        initial,
        ratePerMs: (ratePerSecond * jitter) / 1000,
        ratePerMinute,
      };
    }
    return baseMap;
  }, [maxRank]);

  // Initial state computation
  const getSnapshot = (): {
    counts: Record<number, number>;
    total: number;
    increments: Set<number>;
  } => {
    const elapsedMs = Math.max(0, Date.now() - mountTimeRef.current);
    const newCounts: Record<number, number> = {};
    let total = 0;
    const increments = new Set<number>();

    for (let rank = 1; rank <= maxRank; rank++) {
      const b = baselines[rank];
      if (!b) continue;
      const count = b.initial + Math.floor(elapsedMs * b.ratePerMs);
      newCounts[rank] = count;
      total += count;

      if (previousCountsRef.current[rank] !== undefined && count > previousCountsRef.current[rank]) {
        increments.add(rank);
      }
    }

    previousCountsRef.current = newCounts;
    return { counts: newCounts, total, increments };
  };

  const [tickerState, setTickerState] = useState<LiveTickerState>(() => {
    const initial = getSnapshot();
    const rates: Record<number, number> = {};
    for (let r = 1; r <= maxRank; r++) {
      rates[r] = baselines[r]?.ratePerMinute || 0;
    }
    return {
      counts: initial.counts,
      totalToday: initial.total,
      recentIncrements: new Set(),
      ratesPerMinute: rates,
    };
  });

  useEffect(() => {
    // Tick every 500ms for smooth live updates on OBS stream
    const interval = setInterval(() => {
      const { counts, total, increments } = getSnapshot();
      setTickerState((prev) => ({
        ...prev,
        counts,
        totalToday: total,
        recentIncrements: increments,
      }));
    }, 500);

    return () => clearInterval(interval);
  }, [baselines, maxRank]);

  return tickerState;
}
