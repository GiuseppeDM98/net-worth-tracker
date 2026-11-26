'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { CeilingSummary, IncomeTargetSummary, SpendingHistory, TettoLiftedBlock } from '@/lib/utils/budgetSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { describeDailyCaption, describeOverCaption, describeProjectionCaption, describeRemainingCaption } from '@/lib/utils/budgetNarrative';
import { LIFTED_FIGURE_CLASS, Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { BudgetTrack } from '@/components/cashflow/budget/BudgetTrack';
import { progressFillColor } from '@/components/cashflow/budget/budgetProgressStyle';
import { SpendingBarsChart } from './SpendingBarsChart';

const TETTO_LIFTED_BLOCKS: readonly TettoLiftedBlock[] = ['fine-mese', 'restano', 'oltre'];

/** Narrows `liftedBlocks(strip, id)` at the call site (the convention of `LIFTED_FIGURE_CLASS`). */
export function isTettoLiftedBlock(block: string): block is TettoLiftedBlock {
  return (TETTO_LIFTED_BLOCKS as readonly string[]).includes(block);
}

interface TettoTileProps {
  /** THE tile's anchor (`bud-tetto`): open at every width, never a row (The First-Screen Rule). */
  id?: string;
  summary: CeilingSummary;
  aside: Narrative;
  reading: Narrative;
  history: SpendingHistory;
  /** The caption beside the chart's sub-eyebrow ("Nessun mese oltre il tetto attuale…"). */
  historyCaption: Narrative;
  /** The month's income targets; null without any, and the footer is absent. */
  income: IncomeTargetSummary | null;
  incomeReading: Narrative | null;
  /**
   * The KPI blocks the phone's strip already prints (`liftedBlocks(strip, id).filter(
   * isTettoLiftedBlock)`): each hides WHOLE below `desktop:` — label, value and caption, because
   * the caption («tolte le spese in calendario») qualified a figure the verdict already qualifies
   * (The Lifted-Figure Rule; doc/guide/cashflow-budget.md § Composizione mobile). «Al giorno» is never lifted.
   */
  liftedFigures?: readonly TettoLiftedBlock[];
  className?: string;
}

/**
 * The KPI's value scales to ITS cell (a per-cell `@container`, AGENTS.md § Tailwind): «~11.274 €»
 * at 22px in Geist Mono is ~120px, and a third of a 390px tile is ~97 — on the fixture the
 * exceeded ceiling's «Fine mese» ran under «Oltre» (seen by the census on 2026-10-10; since
 * 2026-10-12 those two KPIs are lifted into the strip below `desktop:` — the tablet too since
 * 2026-10-16 — and the shrink below guards the widths where they are drawn: at 1440, and a KPI
 * that is not lifted on a narrow tile). A figure is never truncated: it shrinks until it fits.
 */
const KPI_VALUE_CLASS = 'font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums @max-[120px]:text-[18px] @max-[104px]:text-[16px]';

function Kpi({ label, value, valueClass, caption, className }: { label: string; value: string; valueClass?: string; caption: Narrative; className?: string }) {
  return (
    <div className={cn('@container flex min-w-0 flex-col gap-1.5', className)}>
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <p className={cn(KPI_VALUE_CLASS, valueClass ?? 'text-foreground')}>{value}</p>
      <NarrativeText segments={caption} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
    </div>
  );
}

/**
 * "Sto dentro il tetto?" in figures — the dominant tile of Budget: what is SPENT against the
 * ceiling (the hero), the rows still in the calendar beside it as their own figure, the two
 * on one 3px track with today's mark (booked full, scheduled lighter), the three KPIs (where
 * the month lands at the current pace, what is left, what that is per day), the trailing
 * months against today's ceiling (the element that stretches with the tile, up to a cap),
 * and the month's income targets as the footer. Every figure is the `CeilingSummary`'s; the
 * tile computes nothing. The hero used to print `spent` (scheduled rows included) over the
 * word «speso» — say 1500 € for 500 € actually spent (seen live, 2026-09-14).
 */
export function TettoTile({ id, summary, aside, reading, history, historyCaption, income, incomeReading, liftedFigures = [], className }: TettoTileProps) {
  const lifted = (block: TettoLiftedBlock) => (liftedFigures.includes(block) ? LIFTED_FIGURE_CLASS : undefined);
  const totalRatio = summary.spent / summary.ceiling;
  const bookedRatio = summary.spentToDate / summary.ceiling;
  const scheduledRatio = summary.scheduled / summary.ceiling;
  const projectionOver = summary.projection !== null && Math.round(summary.projection) > summary.ceiling;
  const calendarPct = Math.round(summary.calendarPct);
  const trackValueText = summary.exceeded
    ? `${formatPercentage(summary.usedPct, 0)}, oltre di ${cachedFormatCurrencyEUR(summary.overBy, true)}`
    : summary.scheduled > 0
      ? `${formatPercentage(summary.spentToDatePct, 0)} speso, ${formatPercentage(summary.usedPct, 0)} con le spese in calendario`
      : `${formatPercentage(summary.usedPct, 0)} speso`;

  return (
    <Tile
      id={id}
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
            {cachedFormatCurrencyEUR(summary.spentToDate, true)}
          </p>
          <p className="text-[13px] text-muted-foreground">
            su <span className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(summary.ceiling, true)}</span>
          </p>
          {summary.scheduled > 0 && (
            <p className="text-[13px] text-muted-foreground">
              + <span className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(summary.scheduled, true)}</span> in calendario
            </p>
          )}
        </div>
        <BudgetTrack
          ratio={bookedRatio}
          scheduledRatio={scheduledRatio}
          calendarPct={summary.calendarPct}
          color={progressFillColor(totalRatio)}
          label="Tetto del mese usato"
          valueText={trackValueText}
        />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{summary.scheduled > 0 ? 'speso · in calendario' : 'speso'}</span>
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
            className={lifted('fine-mese')}
          />
        ) : (
          <Kpi label="Fine mese" value="—" valueClass="text-muted-foreground" caption={[{ text: 'dal quarto giorno' }]} className={lifted('fine-mese')} />
        )}
        {/* The second and third KPIs have two faces: under the ceiling they say what is left
            and what that is per day; over it, by how much and since when, and the real daily
            pace against the one the ceiling would hold — «0 € al giorno» told nothing. */}
        {summary.exceeded ? (
          <Kpi label="Oltre" value={cachedFormatCurrencyEUR(summary.overBy, true)} valueClass="text-destructive" caption={describeOverCaption(summary)} className={lifted('oltre')} />
        ) : (
          <Kpi label="Restano" value={cachedFormatCurrencyEUR(summary.remaining, true)} caption={describeRemainingCaption(summary)} className={lifted('restano')} />
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
