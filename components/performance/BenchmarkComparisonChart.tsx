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
import { BenchmarkMonthlyReturn } from '@/types/benchmarks';
import { BenchmarkDefinition } from '@/types/benchmarks';
import { MonthlyReturnHeatmapData } from '@/types/performance';

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
  // Pre-computed TWR from the performance page (matches the KPI card exactly)
  portfolioTWR: number | null;
  // Period duration in months used for annualizing benchmark TWR consistently
  numberOfMonths: number;
  // Pre-computed cumulative TWR (de-annualized) from the performance page — consistent with KPI
  portfolioTotalGrowth: number | null;
}

interface IndexedPoint {
  date: string; // "MM/YYYY"
  portfolio: number;
  [benchmarkId: string]: number | string;
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
 * Filter a monthly return series to the [startDate, endDate] window and
 * re-index it to 100 at the first included month.
 */
function buildIndexedSeries(
  returns: Array<{ year: number; month: number; return: number }>,
  startDate: Date,
  endDate: Date
): Array<{ year: number; month: number; indexed: number }> {
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth() + 1;
  const endYear = endDate.getFullYear();
  const endMonth = endDate.getMonth() + 1;

  const filtered = returns.filter(r => {
    if (r.year < startYear || r.year > endYear) return false;
    if (r.year === startYear && r.month < startMonth) return false;
    if (r.year === endYear && r.month > endMonth) return false;
    return true;
  });

  if (filtered.length === 0) return [];

  let index = 100;
  return filtered.map(r => {
    index = index * (1 + r.return);
    return { year: r.year, month: r.month, indexed: Math.round(index * 100) / 100 };
  });
}

/**
 * Annualize a cumulative return over a known number of months.
 * Uses the same numberOfMonths denominator as the main performance page so that
 * benchmark TWR values are comparable on an equal-period basis.
 */
function annualizeTWR(cumulativeIndexed: number, numberOfMonths: number): number | null {
  if (numberOfMonths <= 0) return null;
  const cumulativeReturn = cumulativeIndexed / 100; // e.g. 1.5891 for +58.91%
  const years = numberOfMonths / 12;
  if (years === 0) return (cumulativeReturn - 1) * 100;
  const annualized = (Math.pow(cumulativeReturn, 1 / years) - 1) * 100;
  return isFinite(annualized) ? annualized : null;
}

/**
 * Indexed growth-of-100 line chart comparing the user's portfolio against
 * selected model benchmarks over the same time period.
 *
 * Both portfolio and benchmarks are normalized to 100 at the first month of
 * the selected period. The TWR in the summary table uses portfolioTWR from the
 * main performance page (exact match with the KPI card) and annualizes benchmarks
 * with the same numberOfMonths denominator for a fair comparison.
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
}: BenchmarkComparisonChartProps) {
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
      const indexed = buildIndexedSeries(raw, startDate, endDate);
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
  }, [portfolioHeatmapData, benchmarkReturns, selectedBenchmarkIds, startDate, endDate]);

  const twrSummary = useMemo(() => {
    if (chartData.length === 0) return null;

    const portfolioFinalIndexed = chartData[chartData.length - 1].portfolio;

    // Benchmark TWR: annualize using the same numberOfMonths as the main metric
    const benchmarkTWRs: Record<string, number | null> = {};
    for (const id of selectedBenchmarkIds) {
      const finalValue = chartData[chartData.length - 1][id];
      if (finalValue == null || typeof finalValue !== 'number') {
        benchmarkTWRs[id] = null;
        continue;
      }
      benchmarkTWRs[id] = annualizeTWR(finalValue, numberOfMonths);
    }

    return { portfolioFinalIndexed, benchmarkTWRs };
  }, [chartData, selectedBenchmarkIds, numberOfMonths]);

  if (chartData.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Dati insufficienti per il periodo selezionato.
      </p>
    );
  }

  const activeBenchmarks = benchmarkDefinitions.filter(b => selectedBenchmarkIds.includes(b.id));

  const formatTWR = (value: number | null) => {
    if (value == null) return '–';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const formatGrowth = (indexed: number) => {
    const g = indexed - 100;
    return `${g >= 0 ? '+' : ''}${g.toFixed(2)}%`;
  };

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
            labelStyle={{ fontWeight: 600, color: '#111827' }}
            formatter={(value: number, name: string) => {
              const label = name === 'portfolio'
                ? 'Il Tuo Portafoglio'
                : (activeBenchmarks.find(b => b.id === name)?.name ?? name);
              return [`${value.toFixed(2)}`, label];
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
            stroke="var(--chart-1, #3b82f6)"
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

      {/* TWR summary table */}
      {twrSummary && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Portafoglio</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">TWR annualizzato</th>
                <th className="text-right py-2 pl-3 font-medium text-muted-foreground">Crescita totale</th>
              </tr>
            </thead>
            <tbody>
              {/* User portfolio row — uses pre-computed TWR from main metric for consistency */}
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-5 rounded-full bg-[var(--chart-1,#3b82f6)]" />
                    <span className="font-medium">Il Tuo Portafoglio</span>
                  </div>
                </td>
                <td className="text-right py-2 px-3 font-medium tabular-nums">
                  <span className={portfolioTWR != null && portfolioTWR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {formatTWR(portfolioTWR)}
                  </span>
                </td>
                <td className="text-right py-2 pl-3 tabular-nums text-muted-foreground">
                  {portfolioTotalGrowth != null
                    ? `${portfolioTotalGrowth >= 0 ? '+' : ''}${portfolioTotalGrowth.toFixed(2)}%`
                    : formatGrowth(twrSummary.portfolioFinalIndexed)}
                </td>
              </tr>
              {/* Benchmark rows */}
              {activeBenchmarks.map(b => {
                const twr = twrSummary.benchmarkTWRs[b.id];
                const finalIndexed = chartData[chartData.length - 1][b.id];
                return (
                  <tr key={b.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-0.5 w-5 border-t-2 border-dashed" style={{ borderColor: b.color }} />
                        <span>{b.name}</span>
                      </div>
                    </td>
                    <td className="text-right py-2 px-3 font-medium tabular-nums">
                      <span className={twr != null && twr >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        {formatTWR(twr)}
                      </span>
                    </td>
                    <td className="text-right py-2 pl-3 tabular-nums text-muted-foreground">
                      {typeof finalIndexed === 'number' ? formatGrowth(finalIndexed) : '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-2">
            TWR annualizzato calcolato sul periodo di {numberOfMonths} mesi.
            Rendimenti benchmark in USD (ETF quotati sul mercato americano).
          </p>
        </div>
      )}
    </div>
  );
}
