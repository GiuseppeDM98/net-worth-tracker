/**
 * AllocationCompositionBar — the page's visual anchor (A1).
 *
 * The Allocazione page used to be entirely numbers and rows: it told you the math but
 * never showed you the SHAPE of the portfolio. This is the one-glance shape — a single
 * stacked bar of the current weight of each asset class, in the active theme's chart
 * hues, with a compact legend below. It answers "what does my portfolio look like" before
 * the user reads a single breakdown row. Distance-from-target is the gauge's job
 * (BalanceScoreGauge); this bar is composition only, so it stays calm and uncluttered.
 *
 * Pure presentation over `byAssetClass`. Colors come from `useChartColors()` at the same
 * per-class index the History "Patrimonio per Asset Class" chart uses
 * (`ASSET_CLASS_CHART_INDEX`), so a class is the same color across the app.
 */
'use client';

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { formatPercentage } from '@/lib/services/chartService';
import {
  ASSET_CLASS_CHART_INDEX,
  ASSET_CLASS_LABELS,
} from '@/lib/utils/allocationUtils';
import { CHART_COLORS } from '@/lib/constants/colors';
import type { AllocationData } from '@/types/assets';

interface AllocationCompositionBarProps {
  byAssetClass: Record<string, AllocationData>;
  /** Total allocated wealth — the denominator the segment widths are relative to. */
  totalValue: number;
}

interface Segment {
  assetClass: string;
  label: string;
  pct: number;
  color: string;
}

export function AllocationCompositionBar({
  byAssetClass,
  totalValue,
}: AllocationCompositionBarProps) {
  const reducedMotion = useReducedMotion();
  const chartColors = useChartColors();

  // Widths are computed from value/total (not the stored currentPercentage) so the
  // segments always sum to the full bar even if rounding left the percentages off 100.
  const segments = useMemo<Segment[]>(() => {
    if (totalValue <= 0) return [];
    return Object.entries(byAssetClass)
      .map(([assetClass, data]) => {
        const index = ASSET_CLASS_CHART_INDEX[assetClass] ?? 0;
        return {
          assetClass,
          label: ASSET_CLASS_LABELS[assetClass] ?? assetClass,
          pct: (data.currentValue / totalValue) * 100,
          color: chartColors[index] ?? CHART_COLORS[index] ?? CHART_COLORS[0],
        };
      })
      .filter((s) => s.pct > 0)
      .sort((a, b) => b.pct - a.pct);
  }, [byAssetClass, totalValue, chartColors]);

  if (segments.length === 0) return null;

  return (
    <div>
      {/* Stacked bar: each class a segment, widths summing to 100%. */}
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Composizione del portafoglio: ${segments
          .map((s) => `${s.label} ${formatPercentage(s.pct)}`)
          .join(', ')}`}
      >
        {segments.map((seg, i) => (
          <motion.div
            key={seg.assetClass}
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

      {/* Legend: swatch · class · weight. */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((seg) => (
          <li key={seg.assetClass} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
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
    </div>
  );
}
