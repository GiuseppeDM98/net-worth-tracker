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
import { formatPercentage } from '@/lib/services/chartService';
import { Tile } from '@/components/ui/tile';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';

// 20% is the commonly cited minimum savings target for Italian households.
// Above this line = "on track"; below = "needs attention" (red zone).
const SAVINGS_TARGET = 20;

// ── SavingsRateLineChart ──────────────────────────────────────────────────────
// Module-level component required by React Compiler (never define inside render).

/**
 * LineChart for savings rate with target reference line and red zone below 20%.
 *
 * connectNulls={false} creates visible gaps for months without income —
 * this correctly represents "no data" rather than "zero savings".
 *
 * YAxis domain={['auto', 'auto']} scales to the actual data range to prevent
 * the flat-line problem (AGENTS.md § Recharts — sparkline flat-line on large
 * absolute numbers").
 */
function SavingsRateLineChart({
  data,
  colors,
}: {
  data: Array<{ label: string; rate: number | null }>;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v: number) => formatPercentage(v, 0)}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          domain={['auto', 'auto']}
        />

        {/* CSS vars for tooltip — never hardcoded hex (AGENTS.md § Recharts — tooltip style props) */}
        <Tooltip
          formatter={(value) =>
            value != null ? [formatPercentage(Number(value), 1), 'Tasso di risparmio'] : ['—', '']
          }
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--card-foreground)',
            fontSize: 12,
            borderRadius: 8,
          }}
          labelStyle={{ fontWeight: 600, color: 'var(--card-foreground)' }}
        />

        {/* Red tint below target — signals "needs improvement" zone */}
        <ReferenceArea y1={-100} y2={SAVINGS_TARGET} fill="var(--destructive)" fillOpacity={0.06} />

        {/* Dashed green reference line at 20% target */}
        <ReferenceLine
          y={SAVINGS_TARGET}
          stroke="var(--positive)"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{
            value: `${SAVINGS_TARGET}% obiettivo`,
            position: 'insideTopRight',
            fontSize: 10,
            fill: 'var(--positive)',
          }}
        />

        <Line
          type="monotone"
          dataKey="rate"
          stroke={colors[0] ?? '#6366f1'}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0 }}
          // Gap at months with null income rather than connecting to zero
          connectNulls={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

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
          <SavingsRateLineChart data={trendData} colors={chartColors} />
        )}
      </div>
    </Tile>
  );
}
