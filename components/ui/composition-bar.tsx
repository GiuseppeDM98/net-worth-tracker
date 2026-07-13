/**
 * CompositionBar — a single stacked bar showing full composition (part-of-whole,
 * many segments) plus an optional inline legend.
 *
 * Extracted from AllocationCompositionBar so the same "one-glance shape" pattern is
 * reusable outside Allocazione (e.g. the Overview asset-class/per-asset breakdowns,
 * which previously used a compact Recharts pie). Purely presentational: the caller
 * resolves segment colors (useChartColors()) and ordering — this component only
 * renders what it's given.
 */
'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { formatPercentage } from '@/lib/services/chartService';

export interface CompositionBarSegment {
  key: string;
  label: string;
  /** 0-100; segments are expected to sum to ~100. */
  pct: number;
  color: string;
}

interface CompositionBarProps {
  /** Already ordered and filtered (pct > 0) by the caller. */
  segments: CompositionBarSegment[];
  ariaLabel: string;
  /** Hide the built-in legend when the caller renders its own (default true). */
  showLegend?: boolean;
}

export function CompositionBar({ segments, ariaLabel, showLegend = true }: CompositionBarProps) {
  const reducedMotion = useReducedMotion();

  if (segments.length === 0) return null;

  return (
    <div>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={ariaLabel}
      >
        {segments.map((seg, i) => (
          <motion.div
            key={seg.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ backgroundColor: seg.color }}
            title={`${seg.label} · ${formatPercentage(seg.pct)}`}
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

      {showLegend && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {segments.map((seg) => (
            <li key={seg.key} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: seg.color }}
                aria-hidden="true"
              />
              <span className="text-[11px] text-muted-foreground">{seg.label}</span>
              <span className="font-mono text-[11px] tabular-nums text-foreground">
                {formatPercentage(seg.pct)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
