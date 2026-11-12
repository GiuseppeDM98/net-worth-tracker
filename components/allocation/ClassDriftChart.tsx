'use client';

/**
 * ClassDriftChart — the classes' drift from target, month by month (doc/pac-ate.md §10.6, D11).
 *
 * Hand-written SVG (DESIGN.md → In-tile Bars) in the approved render's form (render-accumulo.html,
 * view 1): y axis in pp with a grid, month ticks under the plot, a dotted «oggi» line, no label on the
 * lines — the colours are named by the legend row under the chart (one chip per class with its drift at
 * the cursor month) and by the key (measured · projected · band). One polyline per asset class, solid where both its
 * endpoints are `measured` points, dashed where either is `projected` — the plan's own baseline
 * and closed installments on one side, its calendar-driven forecast on the other. A shaded band
 * around zero shows the rebalance band; under `rule525` the band differs per class, so the chart
 * shades the TIGHTEST one and the caption names it (§10.6: "usa la banda del target più piccolo").
 * Colour is the class's own chart slot (`ASSET_CLASS_CHART_INDEX`), so a class reads the same hue
 * here and on Allocazione/Storico. No library: `role="img"` + `aria-label` carry every figure for
 * a reader who cannot see the plot.
 */
import { useMemo } from 'react';
import type { AssetClass } from '@/types/assets';
import type { ClassTrajectoryPoint } from '@/lib/utils/accumulationPlanUtils';
import { ASSET_CLASS_CHART_INDEX, ASSET_CLASS_LABELS, bandForTarget, type RebalanceBand } from '@/lib/utils/allocationUtils';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { CHART_COLORS } from '@/lib/constants/colors';
import {
  describeClassDriftChartAriaLabel,
  describeDriftChartBand,
  describeDriftReading,
  trajectoryPointLabel,
} from '@/lib/utils/accumulationNarrative';
import { stepTrajectoryCursor } from '@/lib/utils/accumuloSummary';
import { cn } from '@/lib/utils';

interface ClassDriftChartProps {
  points: ClassTrajectoryPoint[];
  band: RebalanceBand;
  /** Minimum height of the plot; the tile's flex column lets it stretch past it. */
  height?: number;
  className?: string;
  /**
   * The month the cursor sits on (RV5, PO15). Absent = no cursor: the chart is the plain plot the
   * Calendario and the editor already had. Present with `onSelect`, the plot answers the pointer
   * and the left/right arrows (ONE Tab stop for the whole chart) and a reading row names the month.
   */
  selectedIndex?: number;
  onSelect?: (index: number) => void;
}

const VIEW_W = 600;
const PAD_L = 34;
const PAD_R = 8;
const PAD_T = 14;
const PAD_B = 20;
const MAX_AXIS_LABELS = 5;

/** Evenly spaced indices, the first and the last always included — mirrors the Rendimenti chart. */
function pickAxisIndices(count: number, max = MAX_AXIS_LABELS): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => Math.round(i * step));
}

function signedAxisLabel(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;
}

/** The drift axis: the band and every drift, widened to whole points (module level — the React Compiler cannot lower `Math.ceil(Math.max(...spread))` inside the component). */
function driftExtent(drifts: number[], bandPp: number): { lo: number; hi: number } {
  return {
    lo: Math.floor(Math.min(-bandPp, ...drifts, 0) - 1),
    hi: Math.ceil(Math.max(bandPp, ...drifts, 0) + 1),
  };
}

export function ClassDriftChart({ points, band, height = 160, className, selectedIndex, onSelect }: ClassDriftChartProps) {
  const chartColors = useChartColors();
  const colorOf = (assetClass: AssetClass): string => {
    const idx = ASSET_CLASS_CHART_INDEX[assetClass] ?? 0;
    return chartColors[idx] ?? CHART_COLORS[idx] ?? CHART_COLORS[0];
  };
  const viewH = height + 30;

  // Every class ANY point names — a point missing one (e.g. a class with no notional that month)
  // leaves a gap in that class's line rather than a false zero.
  const classes = useMemo(() => {
    const set = new Set<AssetClass>();
    for (const point of points) {
      for (const key of Object.keys(point.byClass)) set.add(key as AssetClass);
    }
    return Array.from(set).sort((a, b) => (ASSET_CLASS_CHART_INDEX[a] ?? 99) - (ASSET_CLASS_CHART_INDEX[b] ?? 99));
  }, [points]);

  // The shaded band: the TIGHTEST one among the shown classes' current targets (rule525 varies by
  // target size); `null` label when the band is uniform (the `fixed` case, or every target equal).
  const bandInfo = useMemo(() => {
    const last = points[points.length - 1];
    if (!last) return null;
    let tightestPp = Infinity;
    let tightestLabel: string | null = null;
    let firstPp: number | null = null;
    let uniform = true;
    for (const assetClass of classes) {
      const targetPct = last.byClass[assetClass]?.targetPct;
      if (targetPct === undefined) continue;
      const pp = bandForTarget(band, targetPct);
      if (firstPp === null) firstPp = pp;
      else if (Math.abs(pp - firstPp) > 1e-6) uniform = false;
      if (pp < tightestPp) {
        tightestPp = pp;
        tightestLabel = ASSET_CLASS_LABELS[assetClass] ?? assetClass;
      }
    }
    if (!Number.isFinite(tightestPp)) return null;
    return { pp: tightestPp, label: uniform ? null : tightestLabel };
  }, [points, classes, band]);

  const allDrifts = points.flatMap((point) =>
    classes.map((assetClass) => point.byClass[assetClass]?.driftPp).filter((v): v is number => v !== undefined),
  );
  const bandPp = bandInfo?.pp ?? 0;
  const { lo, hi } = driftExtent(allDrifts, bandPp);
  const sx = (i: number) => PAD_L + (points.length > 1 ? ((VIEW_W - PAD_L - PAD_R) * i) / (points.length - 1) : (VIEW_W - PAD_L - PAD_R) / 2);
  const sy = (v: number) => PAD_T + ((viewH - PAD_T - PAD_B) * (hi - v)) / (hi - lo);
  const gridStep = hi - lo > 12 ? 4 : 2;
  const gridValues: number[] = [];
  for (let g = Math.ceil(lo / gridStep) * gridStep; g <= hi; g += gridStep) gridValues.push(g);

  // «oggi» sits on the last measured point when the plan also has a forecast after it.
  let todayPosition = -1;
  for (let i = 0; i < points.length; i++) if (points[i].source === 'measured') todayPosition = i;
  const hasProjected = points.some((point) => point.source !== 'measured');
  const showToday = hasProjected && todayPosition > 0;
  const hasMeasuredSegment = points.some((point, i) => i > 0 && point.source === 'measured');

  const ariaLabel = describeClassDriftChartAriaLabel({
    classLines: classes.map((assetClass) => ({
      label: ASSET_CLASS_LABELS[assetClass] ?? assetClass,
      startDriftPp: points[0]?.byClass[assetClass]?.driftPp ?? 0,
      finalDriftPp: points[points.length - 1]?.byClass[assetClass]?.driftPp ?? 0,
    })),
  });

  const hasCursor = selectedIndex !== undefined && !!onSelect && points.length > 0;
  const cursorPosition = hasCursor ? Math.min(Math.max(points.findIndex((point) => point.index === selectedIndex), 0), points.length - 1) : -1;
  const cursorPoint = cursorPosition >= 0 ? points[cursorPosition] : undefined;
  // Without a cursor the legend names the classes at the end of the plan.
  const legendPoint = cursorPoint ?? points[points.length - 1];

  const selectPosition = (position: number) => {
    const clamped = Math.min(Math.max(position, 0), points.length - 1);
    onSelect?.(points[clamped].index);
  };
  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (!hasCursor) return;
    const next = stepTrajectoryCursor(cursorPosition, event.key, points.length);
    if (next === null) return;
    event.preventDefault();
    selectPosition(next);
  };
  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!hasCursor || points.length < 2) return;
    // A mouse only moves the cursor while it is pressed; a finger drags it.
    if (event.type === 'pointermove' && event.buttons === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const px = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    selectPosition(Math.round(((px - PAD_L) / (VIEW_W - PAD_L - PAD_R)) * (points.length - 1)));
  };
  const reading = legendPoint ? describeDriftReading(legendPoint, band) : null;

  return (
    <div className={cn('flex flex-col', className)}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${viewH}`}
        className={cn('w-full', hasCursor && 'touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring')}
        role="img"
        aria-label={hasCursor ? `${ariaLabel} Frecce sinistra e destra per scorrere i mesi.` : ariaLabel}
        {...(hasCursor
          ? {
              tabIndex: 0,
              onKeyDown: handleKeyDown,
              onPointerDown: handlePointer,
              onPointerMove: handlePointer,
            }
          : {})}
      >
        {bandInfo && (
          <rect
            x={PAD_L}
            y={sy(bandInfo.pp)}
            width={VIEW_W - PAD_L - PAD_R}
            height={Math.max(0, sy(-bandInfo.pp) - sy(bandInfo.pp))}
            fill="var(--foreground)"
            fillOpacity={0.06}
          />
        )}
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={PAD_L}
              x2={VIEW_W - PAD_R}
              y1={sy(value)}
              y2={sy(value)}
              stroke="var(--border)"
              strokeWidth={value === 0 ? 1.2 : 0.6}
            />
            <text x={PAD_L - 6} y={sy(value) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted-foreground)" className="font-mono">
              {signedAxisLabel(value)}
            </text>
          </g>
        ))}
        {pickAxisIndices(points.length).map((i) => (
          <text
            key={i}
            x={sx(i)}
            y={viewH - 6}
            textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            fontSize={10}
            fill="var(--muted-foreground)"
          >
            {trajectoryPointLabel(points[i].month)}
          </text>
        ))}
        {showToday && (
          <g>
            <line x1={sx(todayPosition)} x2={sx(todayPosition)} y1={PAD_T} y2={viewH - PAD_B} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="2 3" />
            <text x={sx(todayPosition) + 4} y={PAD_T + 9} fontSize={10} fill="var(--muted-foreground)">
              oggi
            </text>
          </g>
        )}
        {points.length > 1 &&
          classes.map((assetClass) => {
            const color = colorOf(assetClass);
            const segments = [];
            for (let i = 0; i < points.length - 1; i++) {
              const from = points[i].byClass[assetClass];
              const to = points[i + 1].byClass[assetClass];
              if (from === undefined || to === undefined) continue;
              const solid = points[i].source === 'measured' && points[i + 1].source === 'measured';
              segments.push(
                <line
                  key={i}
                  x1={sx(i)}
                  y1={sy(from.driftPp)}
                  x2={sx(i + 1)}
                  y2={sy(to.driftPp)}
                  stroke={color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray={solid ? undefined : '5 4'}
                />,
              );
            }
            return <g key={assetClass}>{segments}</g>;
          })}
        {cursorPoint && (
          <g aria-hidden="true">
            <line x1={sx(cursorPosition)} x2={sx(cursorPosition)} y1={PAD_T} y2={viewH - PAD_B} stroke="var(--foreground)" strokeWidth={1} opacity={0.55} />
            {classes.map((assetClass) => {
              const entry = cursorPoint.byClass[assetClass];
              if (!entry) return null;
              return <circle key={assetClass} cx={sx(cursorPosition)} cy={sy(entry.driftPp)} r={3.5} fill={colorOf(assetClass)} stroke="var(--card)" strokeWidth={1.5} />;
            })}
          </g>
        )}
      </svg>

      {reading && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px]" aria-live="polite">
          <span className="font-semibold text-foreground">{reading.when}</span>
          {classes.map((assetClass) => {
            const item = reading.items.find((entry) => entry.label === (ASSET_CLASS_LABELS[assetClass] ?? assetClass));
            if (!item) return null;
            return (
              <span key={assetClass} className={cn('font-mono tabular-nums', item.outOfBand ? 'text-warning-foreground' : 'text-muted-foreground')}>
                <span className="mr-1 inline-block h-2 w-2 rounded-[2px] align-baseline" style={{ backgroundColor: colorOf(assetClass) }} />
                {item.text}
              </span>
            );
          })}
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {hasMeasuredSegment && (
          <span className="inline-flex items-center gap-1">
            <i className="inline-block w-4 border-t-2 border-muted-foreground" aria-hidden="true" />
            misurato
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <i className="inline-block w-4 border-t-2 border-dashed border-muted-foreground" aria-hidden="true" />
          previsto a prezzi di oggi
        </span>
        {bandInfo && (
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-4 bg-foreground/10" aria-hidden="true" />
            {describeDriftChartBand(bandInfo.pp, bandInfo.label)}
          </span>
        )}
      </div>
    </div>
  );
}
