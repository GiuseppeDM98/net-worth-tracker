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
 * Thin wrapper over the shared `CompositionBar` primitive: this file owns only the
 * asset-class-specific segment derivation (byAssetClass -> segments). Colors come from
 * `useChartColors()` at the same per-class index the History "Patrimonio per Asset Class"
 * chart uses (`ASSET_CLASS_CHART_INDEX`), so a class is the same color across the app.
 */
'use client';

import { useMemo } from 'react';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { formatPercentage } from '@/lib/services/chartService';
import {
  ASSET_CLASS_CHART_INDEX,
  ASSET_CLASS_LABELS,
} from '@/lib/utils/allocationUtils';
import { CHART_COLORS } from '@/lib/constants/colors';
import { CompositionBar, type CompositionBarSegment } from '@/components/ui/composition-bar';
import type { AllocationData } from '@/types/assets';

interface AllocationCompositionBarProps {
  byAssetClass: Record<string, AllocationData>;
  /** NOTIONAL exposure total — the denominator the segment WIDTHS (the mix) are relative to. */
  totalValue: number;
  /** Market total of the investable base — only needed for the "leva X×" caption. */
  marketValue?: number;
  /** When true, the legend labels show the LEVERAGED % (sums to leverage×100) and a caption is added. */
  hasLeveragedExposure?: boolean;
}

export function AllocationCompositionBar({
  byAssetClass,
  totalValue,
  marketValue,
  hasLeveragedExposure = false,
}: AllocationCompositionBarProps) {
  const chartColors = useChartColors();

  // Width = notional SHARE of the mix (currentValue / notionalTotal → sums to 100), computed from
  // value/total (not the stored %) so the segments fill the bar even if rounding is off. The legend
  // LABEL is the leverage-aware `currentPercentage` (notional over MARKET base → sums to
  // leverage×100). Without leverage the two coincide, so the bar is identical to before.
  const segments = useMemo<CompositionBarSegment[]>(() => {
    if (totalValue <= 0) return [];
    return Object.entries(byAssetClass)
      .map(([assetClass, data]) => {
        const index = ASSET_CLASS_CHART_INDEX[assetClass] ?? 0;
        return {
          key: assetClass,
          label: ASSET_CLASS_LABELS[assetClass] ?? assetClass,
          pct: (data.currentValue / totalValue) * 100,
          displayPct: hasLeveragedExposure ? data.currentPercentage : undefined,
          color: chartColors[index] ?? CHART_COLORS[index] ?? CHART_COLORS[0],
        };
      })
      .filter((s) => s.pct > 0)
      .sort((a, b) => b.pct - a.pct);
  }, [byAssetClass, totalValue, hasLeveragedExposure, chartColors]);

  if (segments.length === 0) return null;

  const leverage = hasLeveragedExposure && marketValue && marketValue > 0 ? totalValue / marketValue : 1;

  return (
    <div>
      <CompositionBar
        segments={segments}
        ariaLabel={`Composizione del portafoglio: ${segments
          .map((s) => `${s.label} ${formatPercentage(s.displayPct ?? s.pct)}`)
          .join(', ')}`}
      />
      {hasLeveragedExposure && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          % sul capitale investito · leva {leverage.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×
        </p>
      )}
    </div>
  );
}
