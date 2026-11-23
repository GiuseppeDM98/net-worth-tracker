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
import { RankedRows } from '@/components/ui/ranked-rows';
import { RING_LAYOUT_CLASS, RING_ROWS_CLASS, RingChart } from '@/components/ui/ring-chart';
import type { RingSegment } from '@/lib/utils/ringChart';

interface CostoTileProps {
  /** THE tile's anchor (`cdc-centro-costo`): open at every width, never a row (The First-Screen Rule). */
  id?: string;
  summary: CenterSummary;
  /** The center's own trailing months (a one-series stack). */
  stack: CenterMonthStack;
  stackCaption: Narrative;
  aside: Narrative;
  reading: Narrative;
  footer: Narrative;
  kpis: { month: KpiReading; year: KpiReading; average: KpiReading };
  /** Fixed and one-off as ring parts (`costCenterRingSegments`); null keeps the footer sentence. */
  ring: RingSegment[] | null;
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
 * Every figure is the `CenterSummary`'s; the tile only turns the ring's two parts into shares for their rows.
 */
export function CostoTile({ id, summary, stack, stackCaption, aside, reading, footer, kpis, ring, palette, now, className }: CostoTileProps) {
  const budget = summary.budget;
  const ratio = budget ? budget.spent / budget.amount : 0;

  return (
    <Tile id={id} eyebrow="Costo" aside={<NarrativeText segments={aside} figureClassName="font-medium" />} reading={reading} className={className} ariaLabel={`Costo di ${summary.center.name}`}>
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
        <Kpi label="Questo mese" reading={kpis.month} />
        <Kpi label="Quest'anno" reading={kpis.year} />
        <Kpi label="Al mese" reading={kpis.average} />
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-3">
        <p className={TILE_SUB_EYEBROW_CLASS}>Ultimi {stack.months.length} mesi</p>
        <NarrativeText segments={stackCaption} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
      </div>
      <CenterStackBars stack={stack} palette={palette} legend={false} className="mt-2.5 flex-1" />

      <div className="mt-auto border-t border-border pt-3.5">
        {ring ? (
          // The two rows say what the sentence says, with figures and shares (The Ring Rule, 2026-11-12).
          <div className="@container">
            <div className={RING_LAYOUT_CLASS}>
              <RingChart
                segments={ring}
                centerValue={summary.total}
                centerLabel="in tutto"
                ariaLabel={`Costo di ${summary.center.name}, fisso e una tantum`}
                size={96}
              />
              <div className={RING_ROWS_CLASS}>
                <RankedRows
                  bars={false}
                  color={ring[0].color}
                  ariaLabel="Fisso e una tantum"
                  rows={ring.map((part) => ({
                    key: part.key,
                    label: part.label,
                    caption: part.key === 'recurring' ? 'ricorrenti e rate' : undefined,
                    amount: part.value,
                    percentage: (part.value / summary.total) * 100,
                    swatch: part.color,
                  }))}
                />
              </div>
            </div>
          </div>
        ) : (
          <NarrativeText segments={footer} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
        )}
      </div>
    </Tile>
  );
}
