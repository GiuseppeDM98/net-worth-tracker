'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { BenchmarkMonthlyReturn, BenchmarkDefinition, FxMonthlyRate, EcbMonthlyRate } from '@/types/benchmarks';
import { MonthlyReturnHeatmapData } from '@/types/performance';
import { useChartColors } from '@/lib/hooks/useChartColors';
// Indexing + annualization live in a shared pure util so the hero's "vs benchmark"
// delta uses the exact same math as this table (no rounding drift).
import { buildIndexedSeries, annualizeTWR, applyFxConversion } from '@/lib/utils/benchmarkPeriodReturn';

interface BenchmarkComparisonChartProps {
  // User portfolio monthly returns (from prepareMonthlyReturnsHeatmap)
  portfolioHeatmapData: MonthlyReturnHeatmapData[];
  benchmarkDefinitions: BenchmarkDefinition[];
  // Map of benchmarkId → full historical monthly returns (already fetched)
  benchmarkReturns: Record<string, BenchmarkMonthlyReturn[]>;
  selectedBenchmarkIds: string[];
  startDate: Date;
  endDate: Date;
  height: number;
  // Pre-computed from the performance page — matches the KPI card exactly
  portfolioTWR: number | null;
  // Same denominator used by the main metric for annualization
  numberOfMonths: number;
  // Cumulative TWR (de-annualized) — consistent with KPI card
  portfolioTotalGrowth: number | null;
  // Pre-computed risk metrics from performance page (cashflow-adjusted)
  portfolioVolatility: number | null;
  portfolioSharpe: number | null;
  portfolioMaxDrawdown: number | null;
  // Risk-free rate from user settings (%) for Sharpe/Sortino calculation
  riskFreeRate: number;
  // When true, benchmark USD returns are converted to EUR using monthly FX rates
  convertToEur: boolean;
  fxRates: FxMonthlyRate[];
  // Historical ECB deposit facility rates for period-accurate risk-free rate
  ecbRates: EcbMonthlyRate[];
  ecbError: boolean;
}

interface IndexedPoint {
  date: string; // "MM/YYYY"
  portfolio: number;
  [benchmarkId: string]: number | string;
}

// All computed risk/return metrics for a single series (portfolio or benchmark)
interface BenchmarkMetrics {
  volatility: number | null;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  maxDrawdown: number | null;
  bestMonth: number | null;
  worstMonth: number | null;
  positiveMonths: number;
  negativeMonths: number;
  // Total months with return data — may differ from numberOfMonths because the
  // portfolio baseline month generates no return observation.
  totalMonths: number;
}

/**
 * Flatten heatmap data (grouped by year) into a sorted [{year, month, return}] array.
 */
function flattenHeatmap(heatmapData: MonthlyReturnHeatmapData[]): Array<{ year: number; month: number; return: number }> {
  const flat: Array<{ year: number; month: number; return: number }> = [];
  for (const yearRow of heatmapData) {
    for (const monthData of yearRow.months) {
      if (monthData.return !== null) {
        flat.push({ year: yearRow.year, month: monthData.month, return: monthData.return / 100 });
      }
    }
  }
  return flat.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
}

/**
 * Annualized volatility (%) from decimal monthly return series.
 * Filters extreme outliers (>±50%) that would distort the calculation.
 */
function computeVolatility(returns: number[]): number | null {
  const filtered = returns.filter(r => Math.abs(r) <= 0.5);
  if (filtered.length < 2) return null;
  const mean = filtered.reduce((sum, r) => sum + r, 0) / filtered.length;
  const variance = filtered.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (filtered.length - 1);
  return Math.sqrt(variance) * Math.sqrt(12) * 100; // annualized %
}

/**
 * Annualized downside deviation (%) — only negative months contribute.
 * Uses 0 as the minimum acceptable return (MAR).
 */
function computeDownsideDeviation(returns: number[]): number | null {
  if (returns.length < 2) return null;
  const squaredDownside = returns.map(r => Math.pow(Math.min(r, 0), 2));
  const meanSquared = squaredDownside.reduce((sum, v) => sum + v, 0) / returns.length;
  const monthlyDD = Math.sqrt(meanSquared);
  return monthlyDD * Math.sqrt(12) * 100; // annualized %
}

/** Compute Sharpe ratio: (twr - riskFreeRate) / volatility */
function computeSharpe(twr: number, riskFreeRate: number, volatility: number): number | null {
  if (volatility === 0) return null;
  return (twr - riskFreeRate) / volatility;
}

/** Compute Sortino ratio: (twr - riskFreeRate) / downsideDeviation */
function computeSortino(twr: number, riskFreeRate: number, downsideDeviation: number): number | null {
  if (downsideDeviation === 0) return null;
  return (twr - riskFreeRate) / downsideDeviation;
}

/**
 * Calmar ratio: annualized TWR (%) / |maxDrawdown (%)|.
 * maxDrawdown is expected as a negative number (e.g. -15.5).
 */
function computeCalmar(twr: number, maxDrawdown: number): number | null {
  if (maxDrawdown >= 0) return null; // no drawdown occurred
  return twr / Math.abs(maxDrawdown);
}

/**
 * Maximum peak-to-trough drawdown from a decimal monthly return series.
 * Builds a running indexed series and tracks the deepest valley from any prior peak.
 * Returns a negative percentage (e.g. -15.5 means -15.5%).
 */
function computeMaxDrawdownFromReturns(returns: number[]): number | null {
  if (returns.length === 0) return null;
  let peak = 100;
  let index = 100;
  let maxDD = 0;
  for (const r of returns) {
    index = index * (1 + r);
    if (index > peak) peak = index;
    const dd = ((index - peak) / peak) * 100;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD === 0 ? null : maxDD;
}

function computePositiveNegative(returns: number[]): { positive: number; negative: number } {
  let positive = 0;
  let negative = 0;
  for (const r of returns) {
    if (r > 0) positive++;
    else if (r < 0) negative++;
  }
  return { positive, negative };
}

/**
 * Compute all risk/return metrics from a decimal monthly return series and an
 * annualized TWR. Portfolio and benchmarks share the same methodology so that
 * all values in the comparison table are apples-to-apples.
 *
 * NOTE: Portfolio max drawdown, volatility, and Sharpe in the first column use
 * cashflow-adjusted pre-computed values from the performance page (passed as
 * props) for consistency with the KPI cards. All other metrics are derived here.
 */
function computeAllMetrics(
  returns: number[],
  twr: number | null,
  riskFreeRate: number
): BenchmarkMetrics {
  const volatility = computeVolatility(returns);
  const downsideDeviation = computeDownsideDeviation(returns);
  const maxDrawdown = computeMaxDrawdownFromReturns(returns);
  const { positive, negative } = computePositiveNegative(returns);
  const bestMonth = returns.length > 0 ? Math.max(...returns) * 100 : null;
  const worstMonth = returns.length > 0 ? Math.min(...returns) * 100 : null;

  const sharpe =
    twr != null && volatility != null ? computeSharpe(twr, riskFreeRate, volatility) : null;
  const sortino =
    twr != null && downsideDeviation != null
      ? computeSortino(twr, riskFreeRate, downsideDeviation)
      : null;
  const calmar =
    twr != null && maxDrawdown != null ? computeCalmar(twr, maxDrawdown) : null;

  return {
    volatility,
    sharpe,
    sortino,
    calmar,
    maxDrawdown,
    bestMonth,
    worstMonth,
    positiveMonths: positive,
    negativeMonths: negative,
    totalMonths: returns.length,
  };
}

/**
 * Filters ECB rates to [startDate, endDate] and returns the arithmetic mean
 * of the annual rate (rounded to 2 dp), or null if fewer than 2 data points.
 * Used to derive a period-accurate risk-free rate for Sharpe/Sortino.
 */
function computePeriodAverageRiskFreeRate(
  ecbRates: EcbMonthlyRate[],
  startDate: Date,
  endDate: Date
): number | null {
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth() + 1;
  const endYear = endDate.getFullYear();
  const endMonth = endDate.getMonth() + 1;

  const filtered = ecbRates.filter(r => {
    if (r.year < startYear || r.year > endYear) return false;
    if (r.year === startYear && r.month < startMonth) return false;
    if (r.year === endYear && r.month > endMonth) return false;
    return true;
  });

  if (filtered.length < 2) return null;
  const sum = filtered.reduce((acc, r) => acc + r.rate, 0);
  return Math.round((sum / filtered.length) * 100) / 100;
}

/**
 * Indexed growth-of-100 line chart comparing the user's portfolio against
 * selected model benchmarks over the same time period.
 *
 * Both portfolio and benchmarks are normalized to 100 at the first month of
 * the selected period. The summary table shows a full set of risk/return metrics
 * computed from the same filtered monthly return series for apples-to-apples
 * comparison. Portfolio TWR/volatility/sharpe/maxDrawdown use pre-computed
 * cashflow-adjusted values from the performance page (KPI consistency).
 */
export function BenchmarkComparisonChart({
  portfolioHeatmapData,
  benchmarkDefinitions,
  benchmarkReturns,
  selectedBenchmarkIds,
  startDate,
  endDate,
  height,
  portfolioTWR,
  numberOfMonths,
  portfolioTotalGrowth,
  portfolioVolatility,
  portfolioSharpe,
  portfolioMaxDrawdown,
  riskFreeRate,
  convertToEur,
  fxRates,
  ecbRates,
  ecbError,
}: BenchmarkComparisonChartProps) {
  // chartColors[0] makes the portfolio line theme-aware (matches rolling charts on the same page).
  const chartColors = useChartColors();
  // Period-accurate risk-free rate: arithmetic mean of ECB deposit facility rates
  // over the evaluation window. Falls back to user setting if ECB data unavailable.
  const effectiveRiskFreeRate = useMemo(
    () => computePeriodAverageRiskFreeRate(ecbRates, startDate, endDate) ?? riskFreeRate,
    [ecbRates, startDate, endDate, riskFreeRate]
  );
  const usingEcbRate = ecbRates.length >= 2 && effectiveRiskFreeRate !== riskFreeRate;

  const chartData = useMemo<IndexedPoint[]>(() => {
    const portfolioFlat = flattenHeatmap(portfolioHeatmapData);
    const portfolioIndexed = buildIndexedSeries(portfolioFlat, startDate, endDate);

    if (portfolioIndexed.length === 0) return [];

    const portfolioMap = new Map<string, number>(
      portfolioIndexed.map(p => [`${p.year}-${String(p.month).padStart(2, '0')}`, p.indexed])
    );

    const benchmarkMaps: Record<string, Map<string, number>> = {};
    for (const id of selectedBenchmarkIds) {
      const raw = benchmarkReturns[id];
      if (!raw) continue;
      const converted = convertToEur && fxRates.length > 0 ? applyFxConversion(raw, fxRates) : raw;
      const indexed = buildIndexedSeries(converted, startDate, endDate);
      benchmarkMaps[id] = new Map(
        indexed.map(p => [`${p.year}-${String(p.month).padStart(2, '0')}`, p.indexed])
      );
    }

    return portfolioIndexed.map(p => {
      const key = `${p.year}-${String(p.month).padStart(2, '0')}`;
      const point: IndexedPoint = {
        date: `${String(p.month).padStart(2, '0')}/${p.year}`,
        portfolio: portfolioMap.get(key) ?? 100,
      };
      for (const id of selectedBenchmarkIds) {
        point[id] = benchmarkMaps[id]?.get(key) ?? null as unknown as number;
      }
      return point;
    });
  }, [portfolioHeatmapData, benchmarkReturns, selectedBenchmarkIds, startDate, endDate, convertToEur, fxRates]);

  // Metrics summary: TWR + full risk metrics for portfolio and each active benchmark
  const metricsSummary = useMemo(() => {
    if (chartData.length === 0) return null;

    const portfolioFinalIndexed = chartData[chartData.length - 1].portfolio;

    // Portfolio: derive Sortino, Calmar, pos/neg months, best/worst from heatmap returns
    const portfolioFlat = flattenHeatmap(portfolioHeatmapData);
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth() + 1;
    const portfolioFiltered = portfolioFlat
      .filter(r => {
        if (r.year < startYear || r.year > endYear) return false;
        if (r.year === startYear && r.month < startMonth) return false;
        if (r.year === endYear && r.month > endMonth) return false;
        return true;
      })
      .map(r => r.return);

    const portfolioMetricsComputed = computeAllMetrics(portfolioFiltered, portfolioTWR, effectiveRiskFreeRate);

    // For portfolio we override the cashflow-adjusted values with pre-computed ones
    const portfolioMetrics: BenchmarkMetrics = {
      ...portfolioMetricsComputed,
      // Pre-computed values are cashflow-adjusted and match the KPI cards
      volatility: portfolioVolatility,
      sharpe: portfolioSharpe,
      maxDrawdown: portfolioMaxDrawdown,
    };

    // Benchmark TWR and metrics
    const benchmarkTWRs: Record<string, number | null> = {};
    const benchmarkFinalIndexed: Record<string, number | null> = {};
    const benchmarkMetrics: Record<string, BenchmarkMetrics> = {};

    for (const id of selectedBenchmarkIds) {
      const raw = benchmarkReturns[id];
      if (!raw) {
        benchmarkTWRs[id] = null;
        benchmarkFinalIndexed[id] = null;
        continue;
      }
      const converted = convertToEur && fxRates.length > 0 ? applyFxConversion(raw, fxRates) : raw;

      // Final index value = the benchmark's OWN last available month, NOT the portfolio's
      // last month. When the period ends in the current, still-incomplete month (e.g. today
      // is July 1), Yahoo has no return for that month yet, so the portfolio-keyed chartData
      // cell would be null and TWR/Crescita/Sharpe/Sortino/Calmar would all show "–".
      // Falling back to the benchmark's last available month keeps them populated, matching
      // the hero's shared computeBenchmarkAnnualizedReturn semantics.
      const indexedSeries = buildIndexedSeries(converted, startDate, endDate);
      const finalIndexed =
        indexedSeries.length > 0 ? indexedSeries[indexedSeries.length - 1].indexed : null;
      const twr = finalIndexed != null ? annualizeTWR(finalIndexed, numberOfMonths) : null;
      benchmarkTWRs[id] = twr;
      benchmarkFinalIndexed[id] = finalIndexed;

      const filtered = converted
        .filter(r => {
          if (r.year < startYear || r.year > endYear) return false;
          if (r.year === startYear && r.month < startMonth) return false;
          if (r.year === endYear && r.month > endMonth) return false;
          return true;
        })
        .map(r => r.return);
      benchmarkMetrics[id] = computeAllMetrics(filtered, twr, effectiveRiskFreeRate);
    }

    return { portfolioFinalIndexed, portfolioMetrics, benchmarkTWRs, benchmarkFinalIndexed, benchmarkMetrics };
  }, [
    chartData,
    selectedBenchmarkIds,
    numberOfMonths,
    portfolioHeatmapData,
    portfolioTWR,
    portfolioVolatility,
    portfolioSharpe,
    portfolioMaxDrawdown,
    effectiveRiskFreeRate,
    benchmarkReturns,
    convertToEur,
    fxRates,
    startDate,
    endDate,
  ]);

  if (chartData.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Dati insufficienti per il periodo selezionato.
      </p>
    );
  }

  const activeBenchmarks = benchmarkDefinitions.filter(b => selectedBenchmarkIds.includes(b.id));

  // Recompute portfolio Sharpe with the period-accurate ECB rate for the table.
  // The KPI card keeps using the pre-computed user-rate value for consistency.
  const portfolioSharpeEffective =
    portfolioTWR != null && portfolioVolatility != null && portfolioVolatility !== 0
      ? (portfolioTWR - effectiveRiskFreeRate) / portfolioVolatility
      : portfolioSharpe;

  // Unified rows for the metrics table, sorted by TWR descending so the ranking
  // (highest TWR first) is visible at a glance. The portfolio is sorted in alongside
  // the benchmarks — kept visually distinct by its solid marker + bold name — so the
  // user immediately sees where they stand. Rows with no TWR (benchmark missing the
  // current incomplete month, etc.) always sort last.
  type TableRow = {
    key: string;
    name: string;
    color: string;
    isPortfolio: boolean;
    twr: number | null;
    totalGrowth: number | null;
    volatility: number | null;
    sharpe: number | null;
    sortino: number | null;
    calmar: number | null;
    maxDrawdown: number | null;
    bestMonth: number | null;
    worstMonth: number | null;
    positiveMonths: number;
    negativeMonths: number;
    totalMonths: number;
  };

  const sortedTableRows: TableRow[] = metricsSummary
    ? [
        {
          key: 'portfolio',
          name: 'Il Tuo Portafoglio',
          color: chartColors[0],
          isPortfolio: true,
          twr: portfolioTWR,
          totalGrowth: portfolioTotalGrowth ?? metricsSummary.portfolioFinalIndexed - 100,
          volatility: portfolioVolatility,
          sharpe: portfolioSharpeEffective,
          sortino: metricsSummary.portfolioMetrics.sortino,
          calmar: metricsSummary.portfolioMetrics.calmar,
          maxDrawdown: portfolioMaxDrawdown,
          bestMonth: metricsSummary.portfolioMetrics.bestMonth,
          worstMonth: metricsSummary.portfolioMetrics.worstMonth,
          positiveMonths: metricsSummary.portfolioMetrics.positiveMonths,
          negativeMonths: metricsSummary.portfolioMetrics.negativeMonths,
          totalMonths: metricsSummary.portfolioMetrics.totalMonths,
        },
        ...activeBenchmarks.map((b): TableRow => {
          const m = metricsSummary.benchmarkMetrics[b.id];
          const finalIndexed = metricsSummary.benchmarkFinalIndexed[b.id];
          return {
            key: b.id,
            name: b.name,
            color: b.color,
            isPortfolio: false,
            twr: metricsSummary.benchmarkTWRs[b.id] ?? null,
            totalGrowth: finalIndexed != null ? finalIndexed - 100 : null,
            volatility: m?.volatility ?? null,
            sharpe: m?.sharpe ?? null,
            sortino: m?.sortino ?? null,
            calmar: m?.calmar ?? null,
            maxDrawdown: m?.maxDrawdown ?? null,
            bestMonth: m?.bestMonth ?? null,
            worstMonth: m?.worstMonth ?? null,
            positiveMonths: m?.positiveMonths ?? 0,
            negativeMonths: m?.negativeMonths ?? 0,
            totalMonths: m?.totalMonths ?? 0,
          };
        }),
      ].sort((a, b) => {
        // TWR descending; null TWR (missing data) always last.
        if (a.twr == null && b.twr == null) return 0;
        if (a.twr == null) return 1;
        if (b.twr == null) return -1;
        return b.twr - a.twr;
      })
    : [];

  const fmtPct = (value: number | null, decimals = 2) => {
    if (value == null) return '–';
    return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
  };

  const fmtRatio = (value: number | null) => {
    if (value == null) return '–';
    return value.toFixed(2);
  };

  const fmtInt = (value: number) => value.toString();

  // Use design tokens instead of hardcoded tailwind color classes so that all 6
  // themes render consistent semantic colors without manual dark: overrides.
  const colorClass = (value: number | null) =>
    value != null && value >= 0 ? 'text-positive' : 'text-destructive';

  const negColorClass = (value: number | null) =>
    value != null && value < 0 ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            stroke="var(--border)"
          />
          <YAxis
            tickFormatter={(v: number) => `${v.toFixed(0)}`}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            stroke="var(--border)"
            label={{ value: 'Crescita di €100', angle: -90, position: 'insideLeft', fill: 'var(--muted-foreground)', fontSize: 11, dy: 50 }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--card-foreground)' }}
            labelStyle={{ fontWeight: 600, color: 'var(--card-foreground)' }}
            formatter={(value, name) => {
              const num = value as number;
              const label = name === 'portfolio'
                ? 'Il Tuo Portafoglio'
                : (activeBenchmarks.find(b => b.id === String(name))?.name ?? name);
              return [`${num.toFixed(2)}`, label];
            }}
          />
          <Legend
            formatter={(value: string) =>
              value === 'portfolio' ? 'Il Tuo Portafoglio' : (activeBenchmarks.find(b => b.id === value)?.name ?? value)
            }
          />
          <Line
            type="monotone"
            dataKey="portfolio"
            stroke={chartColors[0]}
            strokeWidth={2.5}
            dot={false}
            animationDuration={800}
            animationEasing="ease-out"
            connectNulls={false}
          />
          {activeBenchmarks.map(b => (
            <Line
              key={b.id}
              type="monotone"
              dataKey={b.id}
              stroke={b.color}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              animationDuration={800}
              animationEasing="ease-out"
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Metrics summary table */}
      {metricsSummary && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: '700px' }}>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="text-left py-2 pr-3 font-medium text-muted-foreground whitespace-nowrap">Portafoglio</th>
                <th scope="col" className="text-right py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">TWR ann.</th>
                <th scope="col" className="text-right py-2 px-2 font-medium text-muted-foreground whitespace-nowrap hidden sm:table-cell">Crescita tot.</th>
                <th scope="col" className="text-right py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">Volatilità</th>
                <th scope="col" className="text-right py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">Sharpe</th>
                <th scope="col" className="text-right py-2 px-2 font-medium text-muted-foreground whitespace-nowrap hidden md:table-cell">Sortino</th>
                <th scope="col" className="text-right py-2 px-2 font-medium text-muted-foreground whitespace-nowrap hidden md:table-cell">Calmar</th>
                <th scope="col" className="text-right py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">Max DD</th>
                <th scope="col" className="text-right py-2 px-2 font-medium text-muted-foreground whitespace-nowrap hidden sm:table-cell">Miglior mese</th>
                <th scope="col" className="text-right py-2 px-2 font-medium text-muted-foreground whitespace-nowrap hidden sm:table-cell">Peggior mese</th>
                <th scope="col" className="text-right py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">Mesi +</th>
                <th scope="col" className="text-right py-2 pl-2 font-medium text-muted-foreground whitespace-nowrap hidden sm:table-cell">Mesi -</th>
              </tr>
            </thead>
            <tbody>
              {/* One row per portfolio/benchmark, pre-sorted by TWR desc (sortedTableRows).
                  The portfolio keeps a solid marker + bold name; benchmarks use a dashed marker. */}
              {sortedTableRows.map(row => (
                <tr key={row.key} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      {row.isPortfolio ? (
                        <div className="h-2 w-5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                      ) : (
                        <div className="h-0.5 w-5 border-t-2 border-dashed shrink-0" style={{ borderColor: row.color }} />
                      )}
                      <span className={`whitespace-nowrap${row.isPortfolio ? ' font-medium' : ''}`}>{row.name}</span>
                    </div>
                  </td>
                  <td className="text-right py-2 px-2 font-medium tabular-nums">
                    {row.twr != null ? <span className={colorClass(row.twr)}>{fmtPct(row.twr)}</span> : '–'}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums text-muted-foreground hidden sm:table-cell">
                    {fmtPct(row.totalGrowth)}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums text-muted-foreground">
                    {row.volatility != null ? `${row.volatility.toFixed(1)}%` : '–'}
                  </td>
                  <td className="text-right py-2 px-2 font-medium tabular-nums">
                    {row.sharpe != null ? <span className={colorClass(row.sharpe)}>{fmtRatio(row.sharpe)}</span> : '–'}
                  </td>
                  <td className="text-right py-2 px-2 font-medium tabular-nums hidden md:table-cell">
                    {row.sortino != null ? <span className={colorClass(row.sortino)}>{fmtRatio(row.sortino)}</span> : '–'}
                  </td>
                  <td className="text-right py-2 px-2 font-medium tabular-nums hidden md:table-cell">
                    {row.calmar != null ? <span className={colorClass(row.calmar)}>{fmtRatio(row.calmar)}</span> : '–'}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums">
                    {row.maxDrawdown != null ? <span className={negColorClass(row.maxDrawdown)}>{fmtPct(row.maxDrawdown)}</span> : '–'}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums hidden sm:table-cell">
                    {row.bestMonth != null ? <span className="text-positive">{fmtPct(row.bestMonth)}</span> : '–'}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums hidden sm:table-cell">
                    {row.worstMonth != null ? <span className={negColorClass(row.worstMonth)}>{fmtPct(row.worstMonth)}</span> : '–'}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums text-positive">
                    {row.totalMonths > 0 ? <>{fmtInt(row.positiveMonths)}<span className="text-muted-foreground font-normal">/{fmtInt(row.totalMonths)}</span></> : '–'}
                  </td>
                  <td className="text-right py-2 pl-2 tabular-nums text-destructive hidden sm:table-cell">
                    {row.totalMonths > 0 ? <>{fmtInt(row.negativeMonths)}<span className="text-muted-foreground font-normal">/{fmtInt(row.totalMonths)}</span></> : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-2">
            TWR annualizzato sul periodo di {numberOfMonths} mesi.{' '}
            {usingEcbRate
              ? `Sharpe e Sortino calcolati con tasso risk-free medio del periodo ${effectiveRiskFreeRate.toFixed(2)}% (BCE deposit facility rate, media ${numberOfMonths} mesi). Il tasso del portafoglio KPI usa il valore configurato in Impostazioni (${riskFreeRate}%).`
              : `Sharpe e Sortino calcolati con tasso risk-free ${riskFreeRate}% (impostazione utente${ecbError ? ' — dati BCE non disponibili' : ''}).`}
            {convertToEur
              ? ' Benchmark convertiti in EUR (tasso di cambio mensile USD/EUR, fonte: Frankfurter API).'
              : ' Rendimenti benchmark in USD (ETF quotati sul mercato americano).'}
            {' '}Volatilità, Sharpe e Max Drawdown del portafoglio sono cashflow-adjusted (metodo TWR).
            {' '}Mesi +/- mostrati su totale mesi con rendimento disponibile: il portafoglio usa il primo snapshot come baseline (nessun rendimento per quel mese), i benchmark hanno un rendimento per ogni mese del periodo.
          </p>
        </div>
      )}
    </div>
  );
}
