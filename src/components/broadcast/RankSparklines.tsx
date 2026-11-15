import React from "react";
import { Monogram } from "./Monogram";

export interface RankSparklineItem {
  appId: number | null;
  slug: string;
  displayName: string;
  points: Array<{
    timestamp: string;
    rank: number | null;
  }>;
}

interface RankSparklinesProps {
  items: RankSparklineItem[];
}

export function RankSparklines({ items }: RankSparklinesProps) {
  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-broadcast-secondary font-mono border border-hairline/40 rounded bg-canvas/30 h-48">
        <span>No 24-hour rank history available yet.</span>
        <span className="text-hairline mt-1">Requires at least 2 snapshot collection cycles</span>
      </div>
    );
  }

  // Filter to apps that have at least one non-null rank or are active tracked apps
  const activeItems = items.filter((item) => item.points.some((p) => p.rank !== null));

  if (activeItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-broadcast-secondary font-mono border border-hairline/40 rounded bg-canvas/30 h-48">
        <span>No tracked apps currently ranked in Top 100 snapshots.</span>
        <span className="text-hairline mt-1">History will appear as apps enter the charts</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-2 overflow-hidden">
      {activeItems.map((item) => {
        const validPoints = item.points.filter((p) => p.rank !== null);
        const latestPoint = item.points[item.points.length - 1];
        const latestRank = latestPoint?.rank ?? null;
        const firstPoint = validPoints[0];
        const rankChange =
          firstPoint && latestRank !== null ? firstPoint.rank! - latestRank : 0; // positive means improved rank

        return (
          <div
            key={item.slug || item.displayName}
            className="flex items-center justify-between px-3 py-2 rounded bg-panel/60 border border-hairline/40"
          >
            <div className="flex items-center space-x-3 w-40 shrink-0">
              <Monogram name={item.displayName} slug={item.slug} size={28} />
              <div className="truncate">
                <div className="text-xs font-semibold text-broadcast-text truncate">
                  {item.displayName}
                </div>
                <div className="text-[10px] font-mono text-broadcast-secondary">
                  {latestRank !== null ? `#${latestRank}` : "Not in Top 100"}
                </div>
              </div>
            </div>

            {/* Sparkline SVG */}
            <div className="flex-1 px-4 flex items-center justify-center">
              <SparklineSvg points={item.points} />
            </div>

            {/* Delta pill */}
            <div className="w-16 text-right font-mono text-xs shrink-0">
              {latestRank === null ? (
                <span className="text-broadcast-gray text-[11px]">—</span>
              ) : rankChange > 0 ? (
                <span className="text-broadcast-green font-bold">+{rankChange}</span>
              ) : rankChange < 0 ? (
                <span className="text-broadcast-red font-bold">{rankChange}</span>
              ) : (
                <span className="text-broadcast-secondary">0</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SparklineSvg({
  points,
  width = 240,
  height = 30,
}: {
  points: Array<{ timestamp: string; rank: number | null }>;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-[10px] font-mono text-hairline"
      >
        Single snapshot
      </div>
    );
  }

  const paddingTop = 4;
  const paddingBottom = 4;
  const chartH = height - paddingTop - paddingBottom;
  const stepX = width / (points.length - 1);

  // Determine min/max ranks for scaling (1 is best/top, 100 is worst/bottom)
  const validRanks = points.map((p) => p.rank).filter((r): r is number => r !== null);
  if (validRanks.length === 0) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-[10px] font-mono text-hairline"
      >
        No rank points
      </div>
    );
  }

  const minRank = Math.min(...validRanks);
  const maxRank = Math.max(...validRanks);
  const rankRange = maxRank === minRank ? 10 : maxRank - minRank;

  // Inverted Y: rank 1 is at top (paddingTop), higher rank numbers are lower
  const getY = (r: number) => {
    const norm = (r - minRank) / rankRange;
    return paddingTop + norm * chartH;
  };

  // Group continuous non-null segments to render explicit gaps
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let currentSegment: Array<{ x: number; y: number }> = [];

  points.forEach((p, idx) => {
    const x = idx * stepX;
    if (p.rank !== null) {
      currentSegment.push({ x, y: getY(p.rank) });
    } else {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }
  });
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  // Find the last valid point to draw an end dot
  const lastPointIdx = points.map((p) => p.rank !== null).lastIndexOf(true);
  const lastX = lastPointIdx !== -1 ? lastPointIdx * stepX : null;
  const lastY = lastPointIdx !== -1 ? getY(points[lastPointIdx].rank!) : null;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Reference hairline at midpoint */}
      <line
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke="#16233D"
        strokeWidth={1}
        strokeDasharray="2,3"
      />

      {/* Render contiguous line segments */}
      {segments.map((seg, sIdx) => {
        if (seg.length === 1) {
          // Single isolated point
          return (
            <circle
              key={sIdx}
              cx={seg[0].x}
              cy={seg[0].y}
              r={2}
              fill="#2D7BFF"
            />
          );
        }
        const d = seg.reduce(
          (acc, pt, i) => (i === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`),
          ""
        );
        return (
          <path
            key={sIdx}
            d={d}
            fill="none"
            stroke="#2D7BFF"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}

      {/* Terminal dot on the latest valid observation */}
      {lastX !== null && lastY !== null && (
        <circle cx={lastX} cy={lastY} r={3} fill="#22D3EE" />
      )}
    </svg>
  );
}
