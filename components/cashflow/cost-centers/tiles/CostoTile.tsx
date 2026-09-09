'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { CenterMonthStack, CenterSummary } from '@/lib/utils/costCenterSummary';
import type { KpiReading } from '@/lib/utils/costCenterNarrative';
import { describeBudgetCaptions, describeBudgetLabel, describeBudgetUsed } from '@/lib/utils/costCenterNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { resolveHeroValueClass } from '@/components/dashboard/overview/PatrimonioTile';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { BudgetTrack } from '@/components/cashflow/budget/BudgetTrack';
import { progressFillColor, progressTextClass } from '@/components/cashflow/budget/budgetProgressStyle';
import { CenterStackBars } from './CenterStackBars';

interface CostoTileProps {
  summary: CenterSummary;
  /** The center's own trailing months (a one-series stack). */
  stack: CenterMonthStack;
  stackCaption: Narrative;
  aside: Narrative;
  reading: Narrative;
  footer: Narrative;
  kpis: { monthEnd: KpiReading; yearEnd: KpiReading; average: KpiReading };
  palette: string[];
  now: Date;
  className?: string;
}

const KPI_VALUE_CLASS = 'font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums';
const KPI_TONE_CLASS: Record<KpiReading['tone'], string> = {
  neutral: 'text-foreground',
  negative: 'text-destructive',
  muted: 'text-muted-foreground',
};

function Kpi({ label, reading }: { label: string; reading: KpiReading }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <p className={cn(KPI_VALUE_CLASS, KPI_TONE_CLASS[reading.tone])}>{reading.value}</p>
      <NarrativeText segments={reading.caption} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
    </div>
  );
}

/**
 * «Quanto mi è costato?» in figures — the dominant tile of the detail: the lifetime cost
 * (the hero), the ceiling on its own window with today's mark on the track (the Budget
 * Track, when a ceiling is set), three KPIs that name their window (month end, year end,
 * the monthly average), the trailing months in the center's colour (the element that
 * stretches when the tile spans two rows), and the fixed/one-off split as the footer.
 * Every figure is the `CenterSummary`'s; the tile computes nothing.
 */
export function CostoTile({ summary, stack, stackCaption, aside, reading, footer, kpis, palette, now, className }: CostoTileProps) {
  const budget = summary.budget;
  const ratio = budget ? budget.spent / budget.amount : 0;

  return (
    <Tile eyebrow="Costo" aside={<NarrativeText segments={aside} figureClassName="font-medium" />} reading={reading} className={className} ariaLabel={`Costo di ${summary.center.name}`}>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <p className={resolveHeroValueClass(summary.total)}>{cachedFormatCurrencyEUR(summary.total, true)}</p>
        {summary.monthsSpan > 0 && (
          <p className="text-[13px] text-muted-foreground">
            da <span className="font-mono tabular-nums text-foreground">{summary.monthsSpan}</span> {summary.monthsSpan === 1 ? 'mese' : 'mesi'}
          </p>
        )}
      </div>

      {budget && (
        <div className="mt-[18px] flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className={TILE_SUB_EYEBROW_CLASS}>{describeBudgetLabel(budget, now)}</p>
            <NarrativeText segments={describeBudgetUsed(budget)} className="text-[11px] text-muted-foreground" figureClassName={cn('font-semibold', progressTextClass(ratio))} />
          </div>
          <BudgetTrack ratio={ratio} calendarPct={budget.calendarPct} color={progressFillColor(ratio)} label={describeBudgetLabel(budget, now)} />
          <div className="flex justify-between gap-3 text-[11px] text-muted-foreground">
            <NarrativeText segments={describeBudgetCaptions(budget).left} figureClassName="font-medium" />
            <NarrativeText segments={describeBudgetCaptions(budget).right} figureClassName="font-medium" />
          </div>
        </div>
      )}

      <div className="mt-[18px] grid grid-cols-3 gap-3.5">
        <Kpi label="Fine mese" reading={kpis.monthEnd} />
        <Kpi label="Fine anno" reading={kpis.yearEnd} />
        <Kpi label="Al mese" reading={kpis.average} />
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-3">
        <p className={TILE_SUB_EYEBROW_CLASS}>Ultimi {stack.months.length} mesi</p>
        <NarrativeText segments={stackCaption} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
      </div>
      <CenterStackBars stack={stack} palette={palette} legend={false} className="mt-2.5 flex-1" />

      <div className="mt-auto border-t border-border pt-3.5">
        <NarrativeText segments={footer} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
      </div>
    </Tile>
  );
}
