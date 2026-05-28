'use client';

/**
 * HERO SPARKLINE — net worth trend over historical snapshots.
 *
 * Intentionally minimal: no axes, no grid, no tooltip, no legend.
 * The variation chips above already carry the numeric context; this
 * chart adds the visual shape of the trend.
 *
 * Props:
 *   filled  — renders an area chart with gradient fill (edge-to-edge in hero card via parent -mx)
 *   color   — stroke and gradient color; accepts CSS vars like "var(--chart-1)"
 *   height  — SVG height in px (default 48)
 *
 * When filled=true, start/end labels are NOT rendered internally — the parent
 * is expected to render them outside the component (below the -mx container).
 * When filled=false (default), labels are rendered inline as before.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { DashboardOverviewSparklinePoint } from '@/types/dashboardOverview';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

interface NetWorthSparklineProps {
  data: DashboardOverviewSparklinePoint[];
  filled?: boolean;   // default false — add area gradient when true
  color?: string;     // default "var(--chart-2)"
  height?: number;    // default 48
}

/**
 * Catmull-Rom → cubic Bézier conversion.
 * Produces a smooth SVG path through all data points.
 */
function catmullRomPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  const d: string[] = [`M ${pts[0][0]},${pts[0][1]}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d.push(`C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`);
  }
  return d.join(' ');
}

export function NetWorthSparkline({
  data,
  filled = false,
  color = 'var(--chart-2)',
  height = 48,
}: NetWorthSparklineProps) {
  const [ready, setReady] = useState(false);
  const rafRef = useRef<number | null>(null);
  // useId gives a stable per-instance ID so multiple sparklines don't conflict on gradient IDs
  const uid = useId();
  const gradId = `spark-grad-${uid.replace(/:/g, '')}`;

  useEffect(() => {
    // Defer one rAF tick so the browser finishes layout before we paint SVG.
    rafRef.current = requestAnimationFrame(() => setReady(true));
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!ready || data.length < 2) return null;

  const values = data.map(d => d.totalNetWorth);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  // Coordinate space: W=100 (percentage), H=height (px)
  const W = 100;
  const H = height;
  const padT = 4;
  const padB = 4;
  const innerH = H - padT - padB;

  const pts: [number, number][] = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    padT + innerH - ((v - minVal) / range) * innerH,
  ]);

  const linePath = catmullRomPath(pts);
  const isPositive = values[values.length - 1] >= values[0];
  // When filled, use the caller-provided CSS-var color for stroke.
  // When unfilled (the unfilled path is unused in production — the hero always passes filled=true),
  // fall back to semantic green/red hex that matches Tailwind's green-600/red-600, which are the
  // same values used by text-green-500/text-red-500 financial-signal classes across the app.
  // These are intentionally hardcoded: they represent universal positive/negative semantics,
  // not chart palette entries, so they must not vary with the active color theme.
  const strokeColor = filled ? color : isPositive ? '#16a34a' : '#dc2626';

  const areaPath = filled
    ? `${linePath} L ${pts[pts.length - 1][0]},${H} L ${pts[0][0]},${H} Z`
    : null;

  return (
    <div>
      {/* preserveAspectRatio="none" lets the SVG stretch to fill the container width
          while keeping the specified height — important for edge-to-edge area fill. */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
        style={{ display: 'block' }}
      >
        {filled && (
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              {/* CSS variables work in SVG stopColor in all modern browsers */}
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
        )}
        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
        <path d={linePath} stroke={strokeColor} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      </svg>
      {/* Labels only when not filled — filled mode expects the parent to render labels outside */}
      {!filled && (
        <div className="flex justify-between mt-0.5">
          <span className="text-[10px] text-muted-foreground">
            {cachedFormatCurrencyEUR(values[0], true)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {cachedFormatCurrencyEUR(values[values.length - 1], true)}
          </span>
        </div>
      )}
    </div>
  );
}
