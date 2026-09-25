'use client';

/**
 * The histogram of the final values: the Monte Carlo's ten bins as bars (`HistogramBars`, the
 * one in-tile histogram since 2026-09-24), the bin that holds the median of all simulations
 * outlined. This file only names the bins — the range in euros, the count and its share.
 */

import type { HistogramBin } from '@/lib/utils/monteCarloSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { HistogramBars, type HistogramBar } from '@/components/ui/histogram-bars';

interface FinalValueBarsProps {
  bins: HistogramBin[];
  ariaLabel: string;
  minHeight?: number;
  className?: string;
}

/** «0», «420k», «1,3M» — the bin's lower bound, short enough for ten labels in a 4-column tile. */
function shortAmount(value: number): string {
  if (value < 1000) return '0';
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
  return `${(value / 1_000_000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}M`;
}

function toBar(bin: HistogramBin): HistogramBar {
  const share = formatPercentage(bin.sharePct, 1);
  return {
    key: String(bin.from),
    axisLabel: shortAmount(bin.from),
    caption: `${cachedFormatCurrencyEUR(bin.from, true)} – ${cachedFormatCurrencyEUR(bin.to, true)}`,
    figures: `${bin.count.toLocaleString('it-IT')} simulazioni (${share})`,
    count: bin.count,
    hoverDetail: `${share} delle simulazioni${bin.containsMedian ? ' · contiene la mediana' : ''}`,
    outlined: bin.containsMedian,
  };
}

export function FinalValueBars({ bins, ariaLabel, minHeight = 120, className }: FinalValueBarsProps) {
  return <HistogramBars bars={bins.map(toBar)} ariaLabel={ariaLabel} minHeight={minHeight} className={className} />;
}
