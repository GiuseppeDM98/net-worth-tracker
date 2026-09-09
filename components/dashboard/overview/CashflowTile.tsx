import type { DashboardOverviewExpenseStats } from '@/types/dashboardOverview';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { describeCashflow, projectMonthEndSpending } from '@/lib/utils/overviewNarrative';
import { MONTH_NAMES } from '@/lib/constants/months';
import { cn } from '@/lib/utils';
import { OverviewTile, TILE_SUB_EYEBROW_CLASS } from './OverviewTile';

interface CashflowTileProps {
  expenseStats: DashboardOverviewExpenseStats;
  /** Current Italy month (1-12) and its day, for the header and the reading. */
  month: number;
  dayOfMonth: number;
  daysInMonth: number;
  /** Current-month savings rate in percent; null when there is no income. */
  savingsRate: number | null;
  /** income / expenses; null when there are no expenses. */
  coverageRatio: number | null;
  className?: string;
}

/**
 * Colour of a month-over-month delta: a rise in income is good, a rise in spending is not —
 * `positiveGood` flips the reading for the Spese KPI.
 */
function deltaClass(delta: number, positiveGood: boolean): string {
  if (delta === 0) return 'text-muted-foreground';
  return (delta > 0) === positiveGood ? 'text-positive' : 'text-destructive';
}

function DeltaLine({ delta, positiveGood, month }: { delta: number; positiveGood: boolean; month: number }) {
  const previousMonth = MONTH_NAMES[(month + 10) % 12].toLowerCase();
  if (delta === 0) return <p className="text-[11px] text-muted-foreground">come a {previousMonth}</p>;
  return (
    <p className="text-[11px] text-muted-foreground">
      <span className={cn('font-mono tabular-nums', deltaClass(delta, positiveGood))}>
        {delta > 0 ? '↑' : '↓'} {formatPercentage(Math.abs(delta), 1)}
      </span>{' '}
      vs {previousMonth}
    </p>
  );
}

/**
 * "Come sta andando il mese?" — the three cashflow figures, then where spending lands at the
 * current pace next to last month's figure. The top categories deliberately live ONLY in the
 * "Spese per categoria" tile: the same three rows in two tiles read as a layout mistake.
 */
export function CashflowTile({
  expenseStats,
  month,
  dayOfMonth,
  daysInMonth,
  savingsRate,
  coverageRatio,
  className,
}: CashflowTileProps) {
  const { income, expenses, net, expensesScheduled = 0 } = expenseStats.currentMonth;
  const previousMonth = MONTH_NAMES[(month + 10) % 12].toLowerCase();
  // The same rule as Tracciamento: pace what is booked to date, add what is already scheduled.
  const pacedExpenses = projectMonthEndSpending(expenses - expensesScheduled, dayOfMonth, daysInMonth);
  const projectedExpenses = pacedExpenses === null ? null : pacedExpenses + expensesScheduled;
  const previousExpenses = expenseStats.previousMonth.expenses;

  return (
    <OverviewTile
      eyebrow={`Cashflow · ${MONTH_NAMES[month - 1].toLowerCase()}`}
      aside={
        <span className="font-mono tabular-nums">
          giorno {dayOfMonth} di {daysInMonth}
        </span>
      }
      reading={describeCashflow(savingsRate, expenseStats.delta.expenses, month)}
      className={className}
    >
      <div className="mt-4 grid grid-cols-3 gap-3.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className={TILE_SUB_EYEBROW_CLASS}>Entrate</p>
          <p className={cn('font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums', income > 0 ? 'text-positive' : 'text-muted-foreground')}>
            {cachedFormatCurrencyEUR(income, true)}
          </p>
          <DeltaLine delta={expenseStats.delta.income} positiveGood={true} month={month} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className={TILE_SUB_EYEBROW_CLASS}>Spese</p>
          <p className={cn('font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums', expenses > 0 ? 'text-destructive' : 'text-muted-foreground')}>
            {cachedFormatCurrencyEUR(expenses, true)}
          </p>
          <DeltaLine delta={expenseStats.delta.expenses} positiveGood={false} month={month} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className={TILE_SUB_EYEBROW_CLASS}>Risparmio</p>
          <p className="font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">
            {net < 0 ? '−' : ''}
            {cachedFormatCurrencyEUR(Math.abs(net), true)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {savingsRate !== null ? (
              <span className="font-mono tabular-nums text-foreground">{formatPercentage(savingsRate, 1)}</span>
            ) : (
              <span>—</span>
            )}
            {coverageRatio !== null && (
              <>
                {' '}
                · <span className="font-mono tabular-nums">{coverageRatio.toFixed(2).replace('.', ',')}×</span>
              </>
            )}
          </p>
        </div>
      </div>

      {projectedExpenses !== null && (
        <div className="mt-auto flex flex-col border-t border-border pt-3.5">
          <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-0.5')}>Spese a fine mese</p>
          <div className="flex flex-col divide-y divide-border">
            <div className="flex items-center justify-between gap-3 py-[8px]">
              <span className="text-[13px] text-muted-foreground">Al ritmo attuale</span>
              <span
                className={cn(
                  'font-mono text-[13px] tabular-nums',
                  previousExpenses > 0 ? deltaClass(projectedExpenses - previousExpenses, false) : 'text-foreground',
                )}
              >
                ~{cachedFormatCurrencyEUR(projectedExpenses, true)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 py-[8px]">
              <span className="text-[13px] text-muted-foreground">A {previousMonth}</span>
              <span className="font-mono text-[13px] tabular-nums text-foreground">
                {previousExpenses > 0 ? cachedFormatCurrencyEUR(previousExpenses, true) : '–'}
              </span>
            </div>
          </div>
        </div>
      )}
    </OverviewTile>
  );
}
