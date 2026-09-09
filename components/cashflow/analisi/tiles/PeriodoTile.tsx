import type { Narrative } from '@/lib/utils/narrative';
import type { PeriodCashflowTotals } from '@/lib/utils/tracciamentoSummary';
import type { TotalsPacing } from '@/lib/utils/comparisonDeltas';
import type { SpendingPoint } from '@/lib/utils/analisiSummary';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { CashflowKpiTrio } from '@/components/cashflow/tiles/CashflowKpiTrio';
import { SpendingBarsChart } from './SpendingBarsChart';

interface PeriodoTileProps {
  eyebrow: string;
  aside: Narrative | null;
  reading: Narrative | null;
  totals: PeriodCashflowTotals;
  /** Against the same window of the previous year; null when there is none. */
  pacing: TotalsPacing | null;
  points: SpendingPoint[];
  chartKind: 'month' | 'year';
  /** The chart's sub-eyebrow («Spese per mese · 2026 e 2025»). */
  chartLabel: Narrative;
  /** Why a bar is at half tone and what the baseline is — pinned under the chart. */
  chartFooter: Narrative | null;
  className?: string;
}

/** A percentage delta only when its baseline exists — the trio prints nothing for a zero base. */
const pacedDelta = (side: TotalsPacing['expenses'] | undefined): number | null => (side && side.previous > 0 ? side.deltaPercent : null);

/**
 * «Come è andato il periodo?» in figures — the dominant tile of Analisi: the three KPIs with
 * their year-over-year pacing (ONE caption for both, verbatim from `comparisonDeltas`, so the
 * page cannot disagree with the Confronto on what the baseline is), then the spending bars —
 * the element that stretches when the tile spans two rows.
 */
export function PeriodoTile({ eyebrow, aside, reading, totals, pacing, points, chartKind, chartLabel, chartFooter, className }: PeriodoTileProps) {
  const hasBaseline = points.some((point) => point.prevYearValue !== null);
  const currentYear = points[0]?.key.slice(0, 4);

  return (
    <Tile
      eyebrow={eyebrow}
      aside={aside ? <NarrativeText segments={aside} className="text-[10px]" figureClassName="font-medium" /> : undefined}
      reading={reading}
      className={className}
      ariaLabel="Periodo"
    >
      <CashflowKpiTrio
        totals={totals}
        incomeDelta={pacedDelta(pacing?.income)}
        expensesDelta={pacedDelta(pacing?.expenses)}
        previousLabel={null}
        className="mt-4"
      />
      {pacing && (pacing.income.previous > 0 || pacing.expenses.previous > 0) && (
        <p className="mt-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">{pacing.baselineLabel}</p>
      )}

      {points.length >= 2 && (
        <>
          <div className="mt-5 flex items-center justify-between gap-3">
            <NarrativeText segments={chartLabel} className={TILE_SUB_EYEBROW_CLASS} figureClassName="font-semibold" />
            <div className="flex gap-3 font-mono text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: 'var(--chart-1)' }} />
                {chartKind === 'month' ? currentYear : 'Spese'}
              </span>
              {hasBaseline && currentYear && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: 'var(--muted-foreground)' }} />
                  {Number(currentYear) - 1}
                </span>
              )}
            </div>
          </div>
          <SpendingBarsChart points={points} kind={chartKind} className="mt-2.5 flex-1" />
        </>
      )}

      {/* The footer explains the bars: without bars (a single bucket) it has nothing to explain. */}
      {points.length >= 2 && chartFooter && (
        <div className="mt-auto border-t border-border pt-3.5">
          <NarrativeText segments={chartFooter} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
        </div>
      )}
    </Tile>
  );
}
