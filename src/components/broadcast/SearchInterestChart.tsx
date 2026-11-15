import React from "react";
import { SearchInterestSeries } from "@/lib/snapshot/service";

interface SearchInterestChartProps {
  series: SearchInterestSeries[];
  width?: number;
  height?: number;
}

const SERIES_COLORS = [
  "#2D7BFF", // Electric Blue
  "#22D3EE", // Cyan
  "#8B5CF6", // Restrained Purple
  "#EAF2FF", // White/Bright
  "#F5A524", // Amber
];

export function SearchInterestChart({
  series,
  width = 512,
  height = 200,
}: SearchInterestChartProps) {
  if (!series || series.length === 0) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-xs text-broadcast-secondary font-mono border border-hairline/50 rounded bg-canvas/40"
      >
        Awaiting Google Trends import
      </div>
    );
  }

  const paddingLeft = 32;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 24;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  // Find all distinct dates across series
  const allDates = Array.from(
    new Set(series.flatMap((s) => s.data.map((d) => d.date)))
  ).sort();

  if (allDates.length < 2) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-xs text-broadcast-secondary font-mono border border-hairline/50 rounded"
      >
        Insufficient time series points
      </div>
    );
  }

  const getX = (idx: number) => paddingLeft + (idx / (allDates.length - 1)) * chartW;
  const getY = (val: number) => paddingTop + chartH - (val / 100) * chartH;

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs font-mono">
        {series.map((s, idx) => {
          const color = SERIES_COLORS[idx % SERIES_COLORS.length];
          const latestRaw = s.latestValue?.raw || "—";
          return (
            <div key={s.appId} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-broadcast-secondary">{s.termLabel}:</span>
              <span className="font-bold text-broadcast-text">{latestRaw}</span>
            </div>
          );
        })}
      </div>

      {/* SVG Canvas */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible select-none"
        style={{ maxHeight: `${height}px` }}
      >
        {/* Y Axis Grid lines: 0, 25, 50, 75, 100 */}
        {[0, 25, 50, 75, 100].map((v) => {
          const y = getY(v);
          return (
            <g key={v}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={paddingLeft + chartW}
                y2={y}
                stroke="#16233D"
                strokeWidth="1"
                strokeDasharray={v === 0 ? "none" : "2 2"}
              />
              <text
                x={paddingLeft - 6}
                y={y + 3}
                fill="#5B6B86"
                fontSize="9"
                fontFamily="JetBrains Mono"
                textAnchor="end"
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* X Axis Labels: First and Last Date */}
        <text
          x={paddingLeft}
          y={height - 6}
          fill="#5B6B86"
          fontSize="9"
          fontFamily="JetBrains Mono"
          textAnchor="start"
        >
          {allDates[0]}
        </text>
        <text
          x={paddingLeft + chartW}
          y={height - 6}
          fill="#5B6B86"
          fontSize="9"
          fontFamily="JetBrains Mono"
          textAnchor="end"
        >
          {allDates[allDates.length - 1]}
        </text>

        {/* Series paths */}
        {series.map((s, idx) => {
          const color = SERIES_COLORS[idx % SERIES_COLORS.length];
          const dateMap = new Map(s.data.map((d) => [d.date, d]));

          // Build point coordinates
          const points: Array<{ x: number; y: number; isPartial: boolean }> = [];
          allDates.forEach((d, dIdx) => {
            const pt = dateMap.get(d);
            if (pt && pt.valueIndex !== null) {
              points.push({
                x: getX(dIdx),
                y: getY(pt.valueIndex),
                isPartial: pt.isPartial,
              });
            }
          });

          if (points.length < 2) return null;

          // Split path segments into solid and dashed (for partial last bucket)
          const segments: Array<{ path: string; dashed: boolean }> = [];
          for (let p = 0; p < points.length - 1; p++) {
            const p1 = points[p];
            const p2 = points[p + 1];
            const isLast = p === points.length - 2;
            const isDashed = isLast && p2.isPartial;

            segments.push({
              path: `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
              dashed: isDashed,
            });
          }

          return (
            <g key={s.appId}>
              {segments.map((seg, sIdx) => (
                <path
                  key={sIdx}
                  d={seg.path}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeDasharray={seg.dashed ? "4 4" : "none"}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {/* Point dots */}
              {points.map((pt, pIdx) => (
                <circle
                  key={pIdx}
                  cx={pt.x}
                  cy={pt.y}
                  r="2.5"
                  fill={color}
                  stroke="#0A1020"
                  strokeWidth="1"
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
