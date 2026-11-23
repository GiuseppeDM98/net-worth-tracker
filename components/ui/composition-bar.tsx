/**
 * CompositionBar — a single stacked bar showing full composition (part-of-whole,
 * many segments) plus an optional inline legend.
 *
 * Extracted from Allocazione's composition bar so the same "one-glance shape" pattern is
 * reusable outside Allocazione (e.g. the Overview asset-class/per-asset breakdowns,
 * which previously used a compact Recharts pie). Purely presentational: the caller
 * resolves segment colors (useChartColors()) and ordering — this component only
 * renders what it's given.
 */
'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { formatPercentage } from '@/lib/services/chartService';
import { COSTUME_PILL_RADIUS_CLASS } from '@/lib/constants/themeCostume';

export interface CompositionBarSegment {
  key: string;
  label: string;
  /** Segment WIDTH, 0-100; segments are expected to sum to ~100. */
  pct: number;
  /** Optional label shown in the legend/tooltip INSTEAD of `pct`, when it must differ from the
   *  width (e.g. leverage-aware allocation: width = notional share, label = leveraged % which sums
   *  to leverage×100). Defaults to `pct` — unchanged for every existing caller. */
  displayPct?: number;
  /** Printed in the legend and the tooltip INSTEAD of the formatted percentage, when the page has
   *  its own words for a share («<1%» for one that holds money and rounds to zero). */
  displayText?: string;
  color: string;
}

/**
 * A dashed line across the bar where a limit falls — Analisi's «entrate» line, where the income
 * ends and the wealth starts paying. Drawn in the destructive token: the only limit a composition
 * marks is one it ran past.
 */
export interface CompositionBarEdge {
  /** Position along the bar, 0-100. */
  at: number;
  /** A word under the line («entrate»). */
  label: string;
}

interface CompositionBarProps {
  /** Already ordered and filtered (pct > 0) by the caller. */
  segments: CompositionBarSegment[];
  ariaLabel: string;
  /** Hide the built-in legend when the caller renders its own (default true). */
  showLegend?: boolean;
  /** Reference ticks over the bar, each a 0-100 position with its number above it (the 50/30/20's 50 and 80). */
  ticks?: readonly number[];
  /** A limit marked on the bar; see CompositionBarEdge. */
  edge?: CompositionBarEdge | null;
  /** Decimals of the legend's (and the tooltip's) percentages; default 2. Whole percents when the page prints them so. */
  legendDecimals?: number;
  /** Names the legend list, when a page's other words refer to it. */
  legendAriaLabel?: string;
}

/**
 * Below this position the edge's label sits to the RIGHT of its line, above it to the left: the
 * label always takes the side with more room, so it never paints past the bar's own ends — and a
 * bar is never narrower than twice a one-word label.
 */
const EDGE_LABEL_FLIP_AT = 50;

/*
 * The four optional props above, and a segment's `displayText`, are ADDITIVE (2026-09-27,
 * Analisi's phone Flusso): a caller that passes none of them renders exactly the markup it
 * rendered before — the bar is not wrapped, the
 * legend keeps its classes and carries no aria-label. Keep it that way; Bilanciamento, Previdenza,
 * Composizione and the goals' Allocazione derivata never asked for ticks.
 */
export function CompositionBar({ segments, ariaLabel, showLegend = true, ticks, edge, legendDecimals, legendAriaLabel }: CompositionBarProps) {
  const reducedMotion = useReducedMotion();

  if (segments.length === 0) return null;

  const decimals = legendDecimals ?? 2;
  const printed = (seg: CompositionBarSegment): string => seg.displayText ?? formatPercentage(seg.displayPct ?? seg.pct, decimals);
  const tickList = ticks ?? [];
  const marked = tickList.length > 0 || (edge !== null && edge !== undefined);

  const bar = (
    <div
      className={`flex h-2.5 w-full overflow-hidden ${COSTUME_PILL_RADIUS_CLASS} bg-muted`}
      role="img"
      aria-label={ariaLabel}
    >
      {segments.map((seg, i) => (
        <motion.div
          key={seg.key}
          className="h-full first:rounded-l-[var(--costume-control-pill-radius,calc(infinity*1px))] last:rounded-r-[var(--costume-control-pill-radius,calc(infinity*1px))]"
          style={{ backgroundColor: seg.color }}
          title={`${seg.label} · ${printed(seg)}`}
          initial={reducedMotion ? false : { width: 0 }}
          animate={{ width: `${seg.pct}%` }}
          transition={
            reducedMotion
              ? undefined
              : { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.05 * i }
          }
        />
      ))}
    </div>
  );

  return (
    <div>
      {marked ? (
        // The marks live beside the bar, not in it: the bar clips its rounded ends (overflow-hidden).
        // Ticks carry their number above the bar, the edge its word below it.
        <div className={tickList.length > 0 ? 'relative mt-6' : 'relative mt-2'}>
          {bar}
          {tickList.map((tick) => (
            <div
              key={tick}
              className="absolute -bottom-1.5 -top-5 border-l border-dashed border-foreground/50"
              style={{ left: `${tick}%` }}
              aria-hidden="true"
            >
              <span className="absolute left-1 top-0 font-mono text-[10.5px] text-muted-foreground">{tick}</span>
            </div>
          ))}
          {edge && (
            <div
              className="absolute -bottom-1.5 -top-2 border-l-[1.5px] border-dashed border-destructive"
              style={{ left: `${edge.at}%` }}
              aria-hidden="true"
            >
              <span
                className={
                  edge.at < EDGE_LABEL_FLIP_AT
                    ? 'absolute -bottom-4 left-1 font-mono text-[10.5px] text-destructive'
                    : 'absolute -bottom-4 right-1 font-mono text-[10.5px] text-destructive'
                }
              >
                {edge.label}
              </span>
            </div>
          )}
        </div>
      ) : (
        bar
      )}

      {showLegend && (
        <ul className={edge ? 'mt-6 flex flex-wrap gap-x-4 gap-y-1.5' : 'mt-3 flex flex-wrap gap-x-4 gap-y-1.5'} aria-label={legendAriaLabel}>
          {segments.map((seg) => (
            <li key={seg.key} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: seg.color }}
                aria-hidden="true"
              />
              <span className="text-[11px] text-muted-foreground">{seg.label}</span>
              <span className="font-mono text-[11px] tabular-nums text-foreground">
                {printed(seg)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
