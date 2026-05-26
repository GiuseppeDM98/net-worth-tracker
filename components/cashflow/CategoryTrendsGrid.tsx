/**
 * Category trends grid — sparkline cards for each expense category.
 *
 * Shows the last N months of spending per category in a compact grid.
 * Each card has a sparkline for quick trend recognition, and expands inline
 * to a full bar chart on click.
 *
 * PATTERNS USED:
 * - Radix Collapsible for expand/collapse per AGENTS.md recommendation
 *   ("prefer Radix Collapsible for large/variable-height content")
 * - Only one card expanded at a time via parent-controlled state
 * - Module-level sub-components (React Compiler: no nested components)
 * - YAxis hide domain={['auto','auto']} on sparkline (AGENTS.md: flat-line fix)
 * - Tooltip via CSS vars (AGENTS.md: never hardcode hex in tooltips)
 */
'use client';

import { useMemo, useState } from 'react';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { Expense } from '@/types/expenses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CategoryTrendData {
  name: string;
  /** Sum of absolute expense amounts over the window */
  total: number;
  /** One entry per month in the window — amount=0 for months with no spending */
  monthlyData: Array<{ label: string; amount: number }>;
  /** How many months in the window have at least one expense in this category */
  monthsWithData: number;
}

// ── SparklineChart ────────────────────────────────────────────────────────────
// Module-level component required by React Compiler.

/**
 * Minimal area sparkline — no axes, no labels, just the trend shape.
 *
 * YAxis hide with domain={['auto','auto']} is MANDATORY to prevent flat-line
 * rendering when the value range is small relative to the absolute scale.
 * (AGENTS.md: "Recharts Sparkline — flat line on large absolute numbers")
 *
 * Uses ResponsiveContainer to fill the card width regardless of screen size.
 * isAnimationActive={false} for performance — sparklines are decorative.
 */
function SparklineChart({
  data,
  color,
}: {
  data: Array<{ label: string; amount: number }>;
  color: string;
}) {
  // Sanitize color for use in SVG gradient ID (remove non-alphanumeric chars)
  const gradientId = `spark-${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        {/* YAxis hidden but required — prevents flat-line when range is small */}
        <YAxis hide domain={['auto', 'auto']} />
        <Area
          type="monotone"
          dataKey="amount"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── FullCategoryBarChart ──────────────────────────────────────────────────────
// Module-level component required by React Compiler.

/**
 * Full bar chart shown when a category card is expanded.
 * Shows monthly spend with X/Y axes and tooltip.
 */
function FullCategoryBarChart({
  data,
  color,
}: {
  data: Array<{ label: string; amount: number }>;
  color: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        {/* CSS vars for tooltip — never hardcoded hex (AGENTS.md) */}
        <Tooltip
          formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Spese']}
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--card-foreground)',
            fontSize: 11,
            borderRadius: 8,
          }}
          labelStyle={{ fontWeight: 600, color: 'var(--card-foreground)' }}
          cursor={{ fill: 'rgba(128,128,128,0.1)' }}
        />
        <Bar
          dataKey="amount"
          fill={color}
          animationDuration={400}
          animationEasing="ease-out"
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── CategoryTrendCard ─────────────────────────────────────────────────────────
// Module-level component required by React Compiler.

/**
 * Individual category trend card.
 *
 * Collapsed state: category name + total + sparkline.
 * Expanded state: category name + full bar chart (sparkline hidden).
 *
 * Uses Radix Collapsible (controlled from parent) for expand/collapse.
 * CollapsibleTrigger asChild with a plain div avoids nested-button error
 * (AGENTS.md: "Radix CollapsibleTrigger Nested Button").
 *
 * Chevron rotation controlled by the isExpanded prop since we're using
 * parent-controlled state rather than Radix data-state
 * (AGENTS.md: "Chevron rotation for manual useState open/close").
 */
function CategoryTrendCard({
  category,
  colorIndex,
  colors,
  isExpanded,
  onToggle,
}: {
  category: CategoryTrendData;
  colorIndex: number;
  colors: string[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const color = colors[colorIndex % colors.length] ?? '#6366f1';

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        {/*
         * Plain div (not Button) to avoid nested-button hydration error.
         * AGENTS.md: "CollapsibleTrigger asChild — use plain div, not Button".
         */}
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
          className="group rounded-xl border border-border bg-card p-3 cursor-pointer hover:bg-muted/30 transition-colors"
          aria-expanded={isExpanded}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate text-foreground">
                {category.name}
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                {formatCurrency(category.total)}{' '}
                <span className="text-muted-foreground/60">
                  / {category.monthlyData.length}m
                </span>
              </p>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ml-2',
                isExpanded && 'rotate-180'
              )}
            />
          </div>

          {/* Sparkline — hidden when expanded to avoid double chart */}
          {!isExpanded && <SparklineChart data={category.monthlyData} color={color} />}
        </div>
      </CollapsibleTrigger>

      {/* Expanded full bar chart — Radix handles the height transition */}
      <CollapsibleContent>
        <div className="rounded-b-xl border border-t-0 border-border bg-card px-3 pb-3">
          <FullCategoryBarChart data={category.monthlyData} color={color} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── CategoryTrendsGrid ────────────────────────────────────────────────────────

interface CategoryTrendsGridProps {
  allExpenses: Expense[];
  historyStartYear: number;
  /** Number of months to include per category. Defaults to 12. */
  monthsToShow?: number;
}

/**
 * Grid of expense categories with sparkline trends.
 *
 * Shows categories that have data in at least 3 of the last N months,
 * sorted by total spend descending (most costly category first).
 *
 * Only one category card can be expanded at a time — clicking a second card
 * closes the first. This prevents cognitive overload on dense grids.
 *
 * Always rendered — shows "Dati insufficienti" placeholder when no categories
 * have enough data.
 */
export function CategoryTrendsGrid({
  allExpenses,
  historyStartYear,
  monthsToShow = 12,
}: CategoryTrendsGridProps) {
  const chartColors = useChartColors();

  // Only one card expanded at a time — null means all collapsed
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const categoryData = useMemo((): CategoryTrendData[] => {
    const today = new Date();
    const italyToday = new Date(today.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    const currentMonth = italyToday.getMonth() + 1;
    const currentYear = italyToday.getFullYear();

    // Build the ordered month window (oldest first)
    const months: Array<{ year: number; month: number; label: string }> = [];
    let m = currentMonth;
    let y = currentYear;
    for (let i = 0; i < monthsToShow; i++) {
      months.unshift({
        year: y,
        month: m,
        label: `${MONTH_NAMES[m - 1].slice(0, 3)} ${y.toString().slice(2)}`,
      });
      m--;
      if (m < 1) {
        m = 12;
        y--;
      }
    }

    // Filter to non-income expenses within the time window, respecting historyStartYear
    const windowExpenses = allExpenses.filter(e => {
      if (e.type === 'income') return false;
      const d = toDate(e.date);
      const ey = getItalyYear(d);
      const em = getItalyMonth(d);
      if (ey < historyStartYear) return false;
      return months.some(mo => mo.year === ey && mo.month === em);
    });

    // Group categories from the window
    const categories = new Set(windowExpenses.map(e => e.categoryName));

    const result: CategoryTrendData[] = [];

    categories.forEach(catName => {
      const catExpenses = windowExpenses.filter(e => e.categoryName === catName);

      const monthlyData = months.map(mo => ({
        label: mo.label,
        amount: catExpenses
          .filter(e => {
            const d = toDate(e.date);
            return getItalyYear(d) === mo.year && getItalyMonth(d) === mo.month;
          })
          .reduce((s, e) => s + Math.abs(e.amount), 0),
      }));

      const monthsWithData = monthlyData.filter(d => d.amount > 0).length;

      // Skip categories with sparse data — not enough for trend interpretation
      if (monthsWithData < 3) return;

      const total = monthlyData.reduce((s, d) => s + d.amount, 0);
      result.push({ name: catName, total, monthlyData, monthsWithData });
    });

    // Highest total first — users care most about where money goes
    return result.sort((a, b) => b.total - a.total);
  }, [allExpenses, historyStartYear, monthsToShow]);

  const emptyState = (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Trend per Categoria
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground py-8 text-center">
          Registra almeno 3 mesi di spese per vedere il trend per categoria
        </p>
      </CardContent>
    </Card>
  );

  if (categoryData.length === 0) return emptyState;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Trend per Categoria
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Ultimi {monthsToShow} mesi · clicca per espandere
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 desktop:grid-cols-3 gap-3">
          {categoryData.map((cat, index) => (
            <CategoryTrendCard
              key={cat.name}
              category={cat}
              colorIndex={index}
              colors={chartColors}
              isExpanded={expandedCategory === cat.name}
              onToggle={() =>
                setExpandedCategory(expandedCategory === cat.name ? null : cat.name)
              }
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
