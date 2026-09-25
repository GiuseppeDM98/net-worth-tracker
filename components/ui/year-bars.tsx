'use client';

/**
 * A histogram of calendar years — the FIRE year of the Calcolatore's paths, the ruin year of the
 * Monte Carlo's simulations — as bars (`HistogramBars`): one bar per bin of `binYears`, labelled
 * with its first year, captioned with its range, the reference bin outlined. An optional last bar
 * in the muted ink holds what is not a year at all: the paths that never get there («oltre»).
 */

import type { YearHistogramBin } from '@/lib/utils/yearHistogram';
import { formatPercentage } from '@/lib/services/chartService';
import { HistogramBars, type HistogramBar } from '@/components/ui/histogram-bars';

export interface BeyondBar {
  /** Under the bar («oltre»). */
  axisLabel: string;
  /** The bar's meaning in words («oltre il 2066»). */
  caption: string;
  count: number;
  sharePct: number;
}

interface YearBarsProps {
  bins: YearHistogramBin[];
  /** The last bar, for what lies past the horizon; omitted when nothing does. */
  beyond?: BeyondBar | null;
  /** The plural noun the figures count («percorsi», «simulazioni»). */
  subject: string;
  /** What the outlined bin is («anno del base», «mediana»), for the hover tip. */
  referenceLabel: string;
  ariaLabel: string;
  minHeight?: number;
  className?: string;
}

export function YearBars({ bins, beyond, subject, referenceLabel, ariaLabel, minHeight = 120, className }: YearBarsProps) {
  const bars: HistogramBar[] = bins.map((bin) => {
    const share = formatPercentage(bin.sharePct, 1);
    return {
      key: String(bin.fromYear),
      axisLabel: String(bin.fromYear),
      caption: bin.toYear > bin.fromYear ? `${bin.fromYear}–${bin.toYear}` : String(bin.fromYear),
      figures: `${bin.count.toLocaleString('it-IT')} ${subject} (${share})`,
      count: bin.count,
      hoverDetail: `${share} dei ${subject}${bin.isReference ? ` · ${referenceLabel}` : ''}`,
      outlined: bin.isReference,
    };
  });
  if (beyond && beyond.count > 0) {
    const share = formatPercentage(beyond.sharePct, 1);
    bars.push({
      key: 'beyond',
      axisLabel: beyond.axisLabel,
      caption: beyond.caption,
      figures: `${beyond.count.toLocaleString('it-IT')} ${subject} (${share})`,
      count: beyond.count,
      hoverDetail: `${share} dei ${subject}`,
      neutral: true,
    });
  }
  return <HistogramBars bars={bars} ariaLabel={ariaLabel} minHeight={minHeight} className={className} />;
}
