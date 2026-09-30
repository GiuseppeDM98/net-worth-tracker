/**
 * Savings rate trend section — monthly line chart over the last N months.
 *
 * Shows how the savings rate evolves over time with a 20% target reference line.
 * ReferenceArea fills below 20% with a red tint to highlight deficit zones.
 *
 * Always rendered — shows "Dati insufficienti" placeholder when fewer than
 * 3 months have income data (< 3 non-null data points).
 *
 * Savings rate formula: ((totalIncome - totalExpenses) / totalIncome) * 100
 * Months without income → null → rendered as a gap in the line (connectNulls=false).
 */
'use client';

import { useMemo, useState } from 'react';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { Expense } from '@/types/expenses';
import { AsideToggle } from '@/components/cashflow/analisi/AsideToggle';
import { Tile } from '@/components/ui/tile';
import { Skeleton } from '@/components/ui/skeleton';
import { lazyComponent } from '@/components/ui/lazy-component';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';

/** The plot's height: the chart draws at it and its placeholder holds it, so it lands in place. */
const SAVINGS_CHART_HEIGHT = 200;

// The plot is not in the page's initial JavaScript (PERF-04, 2026-09-30): `lazyComponent` at module level,
// preloaded when the page is idle by `DettaglioDisclosure` (`SAVINGS_LAZY_CHARTS`).
const SavingsRateLineChart = lazyComponent(() => import('@/components/cashflow/SavingsRateLineChart').then((m) => m.SavingsRateLineChart));
export const SAVINGS_LAZY_CHARTS = [SavingsRateLineChart];

// ── Range toggle ──────────────────────────────────────────────────────────────
// 'all' shows the entire history (default) so the long-term savings trend isn't
// truncated; 12m/24m give a focused recent window.

type TrendRange = '12m' | '24m' | 'all';

const RANGE_OPTIONS: ReadonlyArray<{ value: TrendRange; label: string }> = [
  { value: '12m', label: '12m' },
  { value: '24m', label: '24m' },
  { value: 'all', label: 'Tutto' },
];

// ── SavingsRateTrendSection ───────────────────────────────────────────────────

interface SavingsRateTrendSectionProps {
  allExpenses: Expense[];
  historyStartYear: number;
  /**
   * When set, the chart is restricted to a single calendar year (Jan → Dec, or
   * Jan → current month for the current year) and the range toggle is hidden.
   * null/undefined → full-history behavior with the 12m/24m/Tutto toggle.
   */
  scopeYear?: number | null;
}

/**
 * Renders the "Andamento Risparmio" card with a savings rate trend.
 *
 * When `scopeYear` is set the window is locked to that calendar year and the
 * toggle is hidden. Otherwise a 12m/24m/Tutto range toggle (default Tutto)
 * controls the window; 'Tutto' spans the full history from historyStartYear to
 * the current month.
 *
 * The section is always present in the DOM — it shows a placeholder message
 * when fewer than 3 months of income data are available.
 */
export function SavingsRateTrendSection({
  allExpenses,
  historyStartYear,
  scopeYear,
}: SavingsRateTrendSectionProps) {
  const chartColors = useChartColors();
  const [range, setRange] = useState<TrendRange>('all');
  const isScoped = scopeYear != null;

  const trendData = useMemo(() => {
    const today = new Date();
    // Convert to Italy timezone to get the correct current month
    const italyToday = new Date(today.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    const currentMonth = italyToday.getMonth() + 1; // 1-12
    const currentYear = italyToday.getFullYear();

    // When scoped to a single year, walk back from December of that year (or the
    // current month if it's the ongoing year) down to January; the range toggle
    // is irrelevant. Otherwise 'all' walks back to January of historyStartYear;
    // the loop already skips months before that floor, so no empty leading
    // buckets appear.
    const refYear = isScoped ? (scopeYear as number) : currentYear;
    const refMonth = isScoped
      ? (scopeYear as number) === currentYear
        ? currentMonth
        : 12
      : currentMonth;
    const floorYear = isScoped ? (scopeYear as number) : historyStartYear;

    const effectiveMonthsToShow = isScoped
      ? refMonth
      : range === '12m'
      ? 12
      : range === '24m'
      ? 24
      : (currentYear - historyStartYear) * 12 + currentMonth;

    const result: Array<{ label: string; rate: number | null; month: number; year: number }> = [];

    let m = refMonth;
    let y = refYear;

    for (let i = 0; i < effectiveMonthsToShow; i++) {
      const month = m;
      const year = y;

      // Respect the floor year — skip months before the active data window
      if (year >= floorYear) {
        const monthExpenses = allExpenses.filter(e => {
          const d = toDate(e.date);
          return getItalyYear(d) === year && getItalyMonth(d) === month;
        });

        const income = monthExpenses
          .filter(e => e.type === 'income')
          .reduce((s, e) => s + e.amount, 0);

        const expenses = monthExpenses
          .filter(e => e.type !== 'income' && e.type !== 'transfer')
          .reduce((s, e) => s + Math.abs(e.amount), 0);

        // No income in this month → null (gap in chart, not zero)
        const rate = income > 0 ? ((income - expenses) / income) * 100 : null;

        result.unshift({
          label: `${MONTH_NAMES[month - 1].slice(0, 3)} ${year.toString().slice(2)}`,
          rate,
          month,
          year,
        });
      }

      // Walk backward one month
      m--;
      if (m < 1) {
        m = 12;
        y--;
      }
    }

    return result;
  }, [allExpenses, historyStartYear, range, isScoped, scopeYear]);

  // Need at least 3 months with actual income data to show a meaningful trend
  const hasEnoughData = trendData.filter(d => d.rate !== null).length >= 3;

  const currentYear = getItalyYear(new Date());
  const subtitle = isScoped
    ? scopeYear === currentYear
      ? 'anno corrente'
      : `anno ${scopeYear}`
    : range === '12m'
    ? 'ultimi 12 mesi'
    : range === '24m'
    ? 'ultimi 24 mesi'
    : 'intero storico';

  return (
    <Tile
      eyebrow="Andamento risparmio"
      aside={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span>tasso di risparmio mensile · {subtitle}</span>
          {!isScoped && (
            <AsideToggle ariaLabel="Finestra temporale" value={range} onChange={setRange} options={RANGE_OPTIONS} />
          )}
        </div>
      }
    >
      <div className="mt-3">
        {!hasEnoughData ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">Servono almeno 3 mesi di entrate per il trend</p>
        ) : (
          <SavingsRateLineChart data={trendData} colors={chartColors} height={SAVINGS_CHART_HEIGHT} fallback={<Skeleton className="w-full" style={{ height: SAVINGS_CHART_HEIGHT }} />} />
        )}
      </div>
    </Tile>
  );
}
