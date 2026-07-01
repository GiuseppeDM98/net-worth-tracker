/**
 * PerformanceHero — the Rendimenti page's single answer (A1 + A2 + B1 + B3).
 *
 * The old page opened with four co-equal text-4xl hero blocks (TWR, Sharpe, Contributi,
 * YOC), so there was no one answer to "how is the portfolio doing?". This replaces them
 * with one dominant number and a supporting cast:
 *   - DOMINANT: Time-Weighted Return (the recommended metric), text-[44px], with the
 *     verdict (B1, summarizePerformance) beside it and the "vs benchmark" delta (A1)
 *     and current drawdown status (B3) as chips below.
 *   - VITAL SIGNS (A2): Sharpe · Max Drawdown · Contributi netti · YOC as a sub-hero
 *     strip — the other three former heroes demoted to peers of the secondary metrics.
 *
 * Pure presentation: every value (verdict, benchmark delta, drawdown status) is computed
 * by the page from the pure layer and passed in. The TWR count-up is isolated in the
 * `HeroValue` leaf so each animation frame re-renders only that span (DESIGN.md rule).
 */
'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useCountUp } from '@/lib/utils/useCountUp';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { getMetricValueColor } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import type { PerformanceVerdict, DrawdownStatus } from '@/lib/utils/performanceSummary';

interface PerformanceHeroProps {
  timeWeightedReturn: number | null;
  periodLabel: string;
  verdict: PerformanceVerdict;
  /** Reference benchmark name (e.g. "Portafoglio 60/40") for the delta chip. */
  benchmarkLabel: string;
  /** Signed gap vs benchmark in p.p.; null = not yet loaded or unavailable. */
  benchmarkDelta: number | null;
  benchmarkLoading: boolean;
  drawdown: DrawdownStatus | null;
  // Vital signs — the three demoted heroes plus drawdown's sibling.
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  netCashFlow: number;
  yocNet: number | null;
}

/**
 * Tailwind text-color class per verdict tone. positive/destructive come from the page's
 * sign-color tokens; the middle "caution" tone uses the Amber Watch convention
 * (text-amber-600 dark:text-amber-400) — legible on the card background in both modes,
 * unlike text-warning-foreground which is designed to sit on a bg-warning fill.
 */
const TONE_TEXT: Record<PerformanceVerdict['tone'], string> = {
  strong: 'text-positive',
  solid: 'text-positive',
  fragile: 'text-amber-600 dark:text-amber-400',
  weak: 'text-destructive',
  neutral: 'text-muted-foreground',
};

/** Leaf so the rAF count-up re-renders only this span, not the whole hero. */
function HeroValue({ value }: { value: number }) {
  const animated = useCountUp(value, { duration: 620, once: true });
  return <>{formatPercentage(animated ?? value)}</>;
}

function formatSignedPp(pp: number): string {
  const sign = pp > 0 ? '+' : pp < 0 ? '−' : '';
  return `${sign}${Math.abs(pp).toFixed(1)} p.p.`;
}

function VitalSign({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass?: string;
}) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-1 font-mono text-[22px] font-bold leading-none tabular-nums', colorClass)}>
        {value}
      </p>
    </div>
  );
}

export function PerformanceHero({
  timeWeightedReturn,
  periodLabel,
  verdict,
  benchmarkLabel,
  benchmarkDelta,
  benchmarkLoading,
  drawdown,
  sharpeRatio,
  maxDrawdown,
  netCashFlow,
  yocNet,
}: PerformanceHeroProps) {
  const DeltaIcon =
    benchmarkDelta == null ? Minus : benchmarkDelta > 0 ? TrendingUp : benchmarkDelta < 0 ? TrendingDown : Minus;

  return (
    <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">
      {/* Dominant: TWR + verdict + benchmark/drawdown chips */}
      <div className="flex flex-col rounded-2xl border border-border bg-card p-[22px]">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Rendimento (TWR)
          </p>
          <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {periodLabel}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p
            className={cn(
              'font-mono text-[44px] font-bold leading-none tracking-[-0.03em] desktop:text-[54px]',
              getMetricValueColor(timeWeightedReturn, 'percentage')
            )}
          >
            {timeWeightedReturn === null ? 'N/D' : <HeroValue value={timeWeightedReturn} />}
          </p>
          <span className="text-[11px] text-muted-foreground">annualizzato</span>
        </div>

        {/* Verdict (B1) */}
        <p className="mt-3 text-sm">
          <span className={cn('font-semibold', TONE_TEXT[verdict.tone])}>{verdict.headline}.</span>{' '}
          <span className="text-muted-foreground">{verdict.detail}</span>
        </p>

        {/* Chips: vs benchmark (A1) + drawdown status (B3) */}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          {benchmarkLoading ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              vs {benchmarkLabel}…
            </span>
          ) : (
            benchmarkDelta != null && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium tabular-nums"
                title={`Differenza di rendimento annualizzato rispetto a ${benchmarkLabel}`}
              >
                <DeltaIcon
                  className={cn('h-3.5 w-3.5', getMetricValueColor(benchmarkDelta, 'number'))}
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">vs {benchmarkLabel}</span>
                <span className={getMetricValueColor(benchmarkDelta, 'number')}>
                  {formatSignedPp(benchmarkDelta)}
                </span>
              </span>
            )
          )}

          {drawdown && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs">
              {drawdown.atPeak ? (
                <span className="font-medium text-positive">Massimo del periodo</span>
              ) : (
                <>
                  <span className="text-muted-foreground">dal massimo</span>
                  <span className="font-mono font-medium tabular-nums text-destructive">
                    {formatPercentage(drawdown.current)}
                  </span>
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Companion: vital signs (A2) — the demoted heroes */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-3">
        <VitalSign
          label="Sharpe"
          value={sharpeRatio === null ? 'N/D' : sharpeRatio.toFixed(2)}
          colorClass={getMetricValueColor(sharpeRatio, 'number')}
        />
        <VitalSign
          label="Max Drawdown"
          value={maxDrawdown === null ? 'N/D' : formatPercentage(maxDrawdown)}
          colorClass={getMetricValueColor(maxDrawdown, 'percentage')}
        />
        <VitalSign
          label="Contributi netti"
          value={formatCurrency(netCashFlow)}
        />
        <VitalSign
          label="YOC netto"
          value={yocNet === null ? 'N/D' : formatPercentage(yocNet)}
        />
      </div>
    </div>
  );
}
