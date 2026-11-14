import type { PeriodCashflowTotals } from '@/lib/utils/tracciamentoSummary';
import { cachedFormatCurrencyEUR, formatEuroMinus, withTypographicMinus } from '@/lib/utils/formatters';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { printedDelta } from '@/lib/utils/cashflowNarrative';
import { cn } from '@/lib/utils';
import { LIFTED_FIGURE_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';

const KPI_VALUE_CLASS = 'font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums';

/**
 * Colour of a period-over-period delta: a rise in income is good, a rise in spending is not —
 * `positiveGood` flips the reading for the Spese KPI (DESIGN.md → Delta Annotation).
 */
export function deltaClass(delta: number, positiveGood: boolean): string {
  if (delta === 0) return 'text-muted-foreground';
  return (delta > 0) === positiveGood ? 'text-positive' : 'text-destructive';
}

function DeltaLine({ delta, positiveGood, previousLabel, lifted = false }: { delta: number | null; positiveGood: boolean; previousLabel: string | null; lifted?: boolean }) {
  // No previous period, or a zero base: the line is absent rather than a placeholder.
  if (delta === null) return null;
  const lineClass = cn('text-[11px] text-muted-foreground', lifted && LIFTED_FIGURE_CLASS);
  // Decided on the printed figure: a 0,04% change prints as 0,0% and reads as no change.
  const printed = printedDelta(delta);
  if (printed === 0) return <p className={lineClass}>{previousLabel ? `come ${previousLabel}` : 'invariate'}</p>;
  return (
    <p className={lineClass}>
      <span className={cn('font-mono tabular-nums', deltaClass(delta, positiveGood))}>
        {delta > 0 ? '↑' : '↓'} {formatPercentage(printed, 1)}
      </span>
      {previousLabel && <> vs {previousLabel}</>}
    </p>
  );
}

interface CashflowKpiTrioProps {
  totals: PeriodCashflowTotals;
  /** Income and spending against the previous window, in percent; null when there is no baseline. */
  incomeDelta: number | null;
  expensesDelta: number | null;
  /**
   * The caption of a delta («luglio», «2025»), printed after each arrow; null when the caller
   * prints ONE caption for both under the trio (Analisi, whose baseline is a long window name).
   */
  previousLabel: string | null;
  /**
   * The three values are the phone's strip (The Lifted-Figure Rule; doc/guide/cashflow-tracciamento.md
   * § Composizione mobile): hidden below `desktop:` by `LIFTED_FIGURE_CLASS`; the labels, the deltas,
   * the savings rate and the coverage stay — only the figure the strip repeats goes.
   */
  lifted?: boolean;
  /**
   * The spending delta a page's verdict already prints (Analisi: «−1,5% su 2025» in its first
   * sentence, owner's call 2026-10-14), hidden below `desktop:` like a lifted value.
   * Default false: Tracciamento's verdict names no delta.
   */
  expensesDeltaLifted?: boolean;
  className?: string;
}

/**
 * Entrate · Spese · Risparmio at 22px with their deltas — the same trio on Tracciamento's hero
 * and on Analisi's Periodo tile, one component so the two cannot drift. The savings rate and
 * the coverage ratio sit together on purpose: same relationship, two units.
 */
export function CashflowKpiTrio({ totals, incomeDelta, expensesDelta, previousLabel, lifted = false, expensesDeltaLifted = false, className }: CashflowKpiTrioProps) {
  const { income, expenses, net, savingsRate, coverageRatio } = totals;
  const valueClass = cn(KPI_VALUE_CLASS, lifted && LIFTED_FIGURE_CLASS);
  return (
    <div className={cn('grid grid-cols-3 gap-3.5', className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className={TILE_SUB_EYEBROW_CLASS}>Entrate</p>
        <p className={cn(valueClass, income > 0 ? 'text-positive' : 'text-muted-foreground')}>
          {cachedFormatCurrencyEUR(income, true)}
        </p>
        <DeltaLine delta={incomeDelta} positiveGood={true} previousLabel={previousLabel} />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className={TILE_SUB_EYEBROW_CLASS}>Spese</p>
        <p className={cn(valueClass, expenses > 0 ? 'text-destructive' : 'text-muted-foreground')}>
          {cachedFormatCurrencyEUR(expenses, true)}
        </p>
        <DeltaLine delta={expensesDelta} positiveGood={false} previousLabel={previousLabel} lifted={expensesDeltaLifted} />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className={TILE_SUB_EYEBROW_CLASS}>Risparmio</p>
        {/* The strip's cell repeats this figure on a phone: ONE formatter decides the «−», and a
            net that prints as zero takes none (AGENTS.md § Layout and Color Tokens, 2026-10-12). */}
        <p className={cn(valueClass, 'text-foreground')}>{formatEuroMinus(net)}</p>
        <p className="text-[11px] text-muted-foreground">
          {savingsRate !== null ? (
            <span className="font-mono tabular-nums text-foreground">{withTypographicMinus(savingsRate, formatPercentage(Math.abs(savingsRate), 1))}</span>
          ) : (
            <span>—</span>
          )}
          {coverageRatio !== null && (
            <>
              {' '}
              · <span className="font-mono tabular-nums">{formatNumber(coverageRatio, 2)}×</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
