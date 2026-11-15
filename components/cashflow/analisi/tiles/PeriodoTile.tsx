import type { Narrative } from '@/lib/utils/narrative';
import type { PeriodCashflowTotals } from '@/lib/utils/tracciamentoSummary';
import type { TotalsPacing } from '@/lib/utils/comparisonDeltas';
import type { SpendingPoint } from '@/lib/utils/analisiSummary';
import { cn } from '@/lib/utils';
import { cachedFormatCurrencyEUR, formatEuroMinus } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { printedDelta } from '@/lib/utils/cashflowNarrative';
import { LIFTED_FIGURE_CLASS, Tile, TILE_SUB_EYEBROW_CLASS, type TileCollapse } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { deltaClass } from '@/components/cashflow/tiles/CashflowKpiTrio';
import { SpendingBarsChart } from './SpendingBarsChart';

interface PeriodoTileProps {
  eyebrow: string;
  aside: Narrative | null;
  /** `describePeriodoSavings`: what the period put aside. */
  reading: Narrative | null;
  totals: PeriodCashflowTotals;
  /** Against the same window of the previous year; null when there is none. */
  pacing: TotalsPacing | null;
  /** Why there is no pacing although the baseline window exists («Nessun movimento nei primi 14 giorni di settembre 2025: nessun confronto.»); null with a pacing or without a window. */
  missingBaseline?: string | null;
  points: SpendingPoint[];
  chartKind: 'month' | 'year';
  /** The chart's sub-eyebrow («Spese per mese · 2026 e 2025»). */
  chartLabel: Narrative;
  /** Why a bar is at half tone and what the baseline is — pinned under the chart. */
  chartFooter: Narrative | null;
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow, in words (The Closed-Row Rule). */
  asideWhenClosed?: string;
  /**
   * The blocks the page's strip prints, hidden below `desktop:` (The Lifted-Figure Rule): `'trio'` —
   * the three amounts (the strip's «Entrate» and «Risparmio», the first sentence's spending), the
   * spending delta (the first sentence's pacing, owner's call 2026-10-14) and the caption that names
   * the deltas' baseline, which the first sentence names too. The income delta stays. Default none.
   */
  liftedFigures?: readonly PeriodoLiftedBlock[];
  className?: string;
}

/** The blocks of the Periodo tile a phone's strip repeats (since 2026-10-14). */
export type PeriodoLiftedBlock = 'trio';

/** Narrows the `string[]` of `liftedBlocks(strip, section)` to this tile's blocks at the call site. */
export function isPeriodoLiftedBlock(block: string): block is PeriodoLiftedBlock {
  return block === 'trio';
}

/** A percentage delta only when its baseline exists — the trio prints nothing for a zero base. */
const pacedDelta = (side: TotalsPacing['expenses'] | undefined): number | null => (side && side.previous > 0 ? side.deltaPercent : null);

/** «↑ 5,3%» in its sign class, «invariate» when it prints 0,0%; nothing without a baseline. */
function RowDelta({ delta, positiveGood, lifted }: { delta: number | null; positiveGood: boolean; lifted?: boolean }) {
  if (delta === null) return <span className="w-[64px] shrink-0" />;
  const printed = printedDelta(delta);
  return (
    <span className={cn('w-[64px] shrink-0 text-right font-mono text-[11px] tabular-nums', printed === 0 ? 'text-muted-foreground' : deltaClass(delta, positiveGood), lifted && LIFTED_FIGURE_CLASS)}>
      {printed === 0 ? 'invariate' : `${delta > 0 ? '↑' : '↓'} ${formatPercentage(printed, 1)}`}
    </span>
  );
}

/**
 * «Come è andato il periodo?» in figures (2026-11-12: a minor tile beside «Cosa è cambiato»): three
 * rows — Entrate, Spese with their year-over-year pacing (ONE caption for both, verbatim from
 * `comparisonDeltas`, so the page cannot disagree with the Confronto on what the baseline is),
 * Risparmio without one — then the spending bars. The rows print neither the savings rate (the
 * reading's) nor the coverage ratio.
 */
export function PeriodoTile({ eyebrow, aside, reading, totals, pacing, missingBaseline = null, points, chartKind, chartLabel, chartFooter, collapse, asideWhenClosed, liftedFigures = [], className }: PeriodoTileProps) {
  const hasBaseline = points.some((point) => point.prevYearValue !== null);
  const trioLifted = liftedFigures.includes('trio');
  const currentYear = points[0]?.key.slice(0, 4);
  const amountClass = cn('shrink-0 text-right font-mono text-[13px] tabular-nums text-foreground', trioLifted && LIFTED_FIGURE_CLASS);
  const rows = [
    { label: 'Entrate', amount: cachedFormatCurrencyEUR(totals.income, true), delta: <RowDelta delta={pacedDelta(pacing?.income)} positiveGood={true} /> },
    // The spending delta is the first sentence's pacing, printed again a hand lower (owner's call 2026-10-14).
    { label: 'Spese', amount: cachedFormatCurrencyEUR(totals.expenses, true), delta: <RowDelta delta={pacedDelta(pacing?.expenses)} positiveGood={false} lifted={trioLifted} /> },
    // The strip's cell repeats this figure on a phone: ONE formatter decides the «−» (AGENTS.md § Layout and Color Tokens).
    { label: 'Risparmio', amount: formatEuroMinus(totals.net), delta: <span className="w-[64px] shrink-0" /> },
  ];
  // A text aside beside a row's eyebrow (`Tile`): the narrative as plain words there.
  const asideNode = aside ? (collapse ? aside.map((segment) => segment.text).join('') : <NarrativeText segments={aside} className="text-[10px]" figureClassName="font-medium" />) : undefined;

  return (
    <Tile
      eyebrow={eyebrow}
      aside={asideNode}
      asideWhenClosed={asideWhenClosed}
      reading={reading}
      collapse={collapse}
      className={className}
      ariaLabel="Periodo"
    >
      <ul className="mt-3 flex flex-col divide-y divide-border" aria-label="Entrate, spese e risparmio">
        {rows.map((row) => (
          <li key={row.label} className="flex items-baseline gap-3 py-[7px]">
            <span className="min-w-0 flex-1 text-[13px] text-foreground">{row.label}</span>
            <span className={amountClass}>{row.amount}</span>
            {row.delta}
          </li>
        ))}
      </ul>
      {pacing && (pacing.income.previous > 0 || pacing.expenses.previous > 0) && (
        <p className={cn('mt-1.5 font-mono text-[11px] tabular-nums text-muted-foreground', trioLifted && LIFTED_FIGURE_CLASS)}>{pacing.baselineLabel}</p>
      )}
      {/* The baseline window exists but is empty: said in the caption's place, never a silent gap. */}
      {!pacing && missingBaseline && <p className="mt-1.5 text-[11px] text-muted-foreground">{missingBaseline}</p>}

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
          {/* Below `desktop:` the bars yield to 120px — the chart shortens, never the reading (The First-Screen Rule). */}
          <SpendingBarsChart points={points} kind={chartKind} plotClassName="max-desktop:min-h-[120px] desktop:min-h-[72px]" className="mt-2.5 flex-1" />
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
