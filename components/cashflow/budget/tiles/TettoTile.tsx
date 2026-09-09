'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { CeilingSummary, IncomeTargetSummary, SpendingHistory } from '@/lib/utils/budgetSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { describeDailyCaption, describeOverCaption, describeProjectionCaption } from '@/lib/utils/budgetNarrative';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { BudgetTrack } from '@/components/cashflow/budget/BudgetTrack';
import { progressFillColor } from '@/components/cashflow/budget/budgetProgressStyle';
import { SpendingBarsChart } from './SpendingBarsChart';

interface TettoTileProps {
  summary: CeilingSummary;
  aside: Narrative;
  reading: Narrative;
  history: SpendingHistory;
  /** The caption beside the chart's sub-eyebrow ("Nessun mese oltre il tetto attuale…"). */
  historyCaption: Narrative;
  /** The month's income targets; null without any, and the footer is absent. */
  income: IncomeTargetSummary | null;
  incomeReading: Narrative | null;
  className?: string;
}

const KPI_VALUE_CLASS = 'font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums';

function Kpi({ label, value, valueClass, caption }: { label: string; value: string; valueClass?: string; caption: Narrative }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <p className={cn(KPI_VALUE_CLASS, valueClass ?? 'text-foreground')}>{value}</p>
      <NarrativeText segments={caption} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
    </div>
  );
}

/**
 * "Sto dentro il tetto?" in figures — the dominant tile of Budget: what is used against the
 * ceiling (the hero), the same two shares on one 3px track with today's mark, the three KPIs
 * (where the month lands at the current pace, what is left, what that is per day), the
 * trailing months against today's ceiling (the element that stretches when the tile spans
 * two rows), and the month's income targets as the footer. Every figure is the
 * `CeilingSummary`'s; the tile computes nothing.
 */
export function TettoTile({ summary, aside, reading, history, historyCaption, income, incomeReading, className }: TettoTileProps) {
  const ratio = summary.spent / summary.ceiling;
  const projectionOver = summary.projection !== null && Math.round(summary.projection) > summary.ceiling;
  const calendarPct = Math.round(summary.calendarPct);

  return (
    <Tile
      eyebrow="Tetto del mese"
      aside={<NarrativeText segments={aside} figureClassName="font-medium" />}
      reading={reading}
      className={className}
      ariaLabel="Tetto del mese"
    >
      <div className="mt-4 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <p
            className={cn(
              'font-mono text-[44px] font-bold leading-none tracking-[-0.03em] tabular-nums',
              summary.exceeded ? 'text-destructive' : 'text-foreground',
            )}
          >
            {cachedFormatCurrencyEUR(summary.spent, true)}
          </p>
          <p className="text-[13px] text-muted-foreground">
            su <span className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(summary.ceiling, true)}</span>
          </p>
        </div>
        <BudgetTrack ratio={ratio} calendarPct={summary.calendarPct} color={progressFillColor(ratio)} label="Tetto del mese usato" />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>speso</span>
          <span>
            <span aria-hidden="true">│ </span>oggi, <span className="font-mono tabular-nums">{formatPercentage(calendarPct, 0)}</span> del mese
          </span>
        </div>
      </div>

      <div className="mt-[18px] grid grid-cols-3 gap-3.5">
        {/* No pace in the first days: the KPI says so instead of printing a number it cannot back. */}
        {summary.projection !== null ? (
          <Kpi
            label="Fine mese"
            value={`~${cachedFormatCurrencyEUR(summary.projection, true)}`}
            valueClass={projectionOver ? 'text-destructive' : 'text-foreground'}
            caption={describeProjectionCaption(summary)}
          />
        ) : (
          <Kpi label="Fine mese" value="—" valueClass="text-muted-foreground" caption={[{ text: 'dal quarto giorno' }]} />
        )}
        {/* The second and third KPIs have two faces: under the ceiling they say what is left
            and what that is per day; over it, by how much and since when, and the real daily
            pace against the one the ceiling would hold — «0 € al giorno» told nothing. */}
        {summary.exceeded ? (
          <Kpi label="Oltre" value={cachedFormatCurrencyEUR(summary.overBy, true)} valueClass="text-destructive" caption={describeOverCaption(summary)} />
        ) : (
          <Kpi
            label="Restano"
            value={cachedFormatCurrencyEUR(summary.remaining, true)}
            caption={
              summary.calendar.daysLeft > 0
                ? [{ text: 'per ' }, { text: String(summary.calendar.daysLeft), mono: true }, { text: summary.calendar.daysLeft === 1 ? ' giorno' : ' giorni' }]
                : [{ text: 'ultimo giorno' }]
            }
          />
        )}
        {summary.exceeded ? (
          <Kpi
            label="Al giorno"
            value={cachedFormatCurrencyEUR(summary.dailyPace, true)}
            valueClass={summary.dailyPace > summary.sustainablePace ? 'text-destructive' : 'text-foreground'}
            caption={describeDailyCaption(summary)}
          />
        ) : summary.dailyAllowance !== null ? (
          <Kpi label="Al giorno" value={cachedFormatCurrencyEUR(summary.dailyAllowance, true)} caption={describeDailyCaption(summary)} />
        ) : (
          <Kpi label="Al giorno" value="—" valueClass="text-muted-foreground" caption={[{ text: 'il mese è finito' }]} />
        )}
      </div>

      {history.months.length >= 2 && (
        <>
          <div className="mt-5 flex items-baseline justify-between gap-3">
            <p className={TILE_SUB_EYEBROW_CLASS}>Ultimi {history.months.length} mesi</p>
            <NarrativeText segments={historyCaption} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
          </div>
          <SpendingBarsChart months={history.months} className="mt-2.5 flex-1" />
        </>
      )}

      {income && incomeReading && (
        <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3.5">
          <p className={TILE_SUB_EYEBROW_CLASS}>Entrate del mese</p>
          <div className="flex items-center justify-between gap-3">
            <NarrativeText segments={incomeReading} className="text-[13px] text-muted-foreground" figureClassName="font-medium" />
            <span
              className={cn(
                'shrink-0 font-mono text-[13px] tabular-nums',
                income.registered >= income.expected ? 'text-positive' : 'text-muted-foreground',
              )}
            >
              {formatPercentage((income.registered / income.expected) * 100, 0)}
            </span>
          </div>
        </div>
      )}
    </Tile>
  );
}
