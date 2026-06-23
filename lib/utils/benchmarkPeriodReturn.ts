/**
 * Pure helpers for indexing a monthly return series and annualizing it over a period.
 *
 * Extracted from BenchmarkComparisonChart so the Rendimenti hero's "vs benchmark" delta
 * is computed with the EXACT same math as the benchmark comparison table — one source of
 * truth, no rounding drift between the two surfaces (Rule of Three, DEVELOPMENT_GUIDELINES).
 * The chart re-imports these; this module imports nothing from React/Firebase so it is
 * unit-tested directly.
 */

import type { FxMonthlyRate } from '@/types/benchmarks';

/** A single month of decimal return (e.g. 0.02 = +2%). */
export interface MonthlyReturnPoint {
  year: number;
  month: number; // 1-12
  return: number; // decimal
}

export interface IndexedPoint {
  year: number;
  month: number;
  /** Growth-of-100 index value at this month. */
  indexed: number;
}

/**
 * Filter a monthly return series to the [startDate, endDate] window and re-index it to
 * 100 at the first included month. Returns [] when no month falls in the window.
 */
export function buildIndexedSeries(
  returns: MonthlyReturnPoint[],
  startDate: Date,
  endDate: Date
): IndexedPoint[] {
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth() + 1;
  const endYear = endDate.getFullYear();
  const endMonth = endDate.getMonth() + 1;

  const filtered = returns.filter((r) => {
    if (r.year < startYear || r.year > endYear) return false;
    if (r.year === startYear && r.month < startMonth) return false;
    if (r.year === endYear && r.month > endMonth) return false;
    return true;
  });

  if (filtered.length === 0) return [];

  let index = 100;
  return filtered.map((r) => {
    index = index * (1 + r.return);
    return { year: r.year, month: r.month, indexed: Math.round(index * 100) / 100 };
  });
}

/**
 * Annualize a cumulative growth-of-100 index over a known number of months. Uses the
 * same `numberOfMonths` denominator as the main performance metric so benchmark and
 * portfolio TWR are comparable on an equal-period basis. Null when months ≤ 0.
 */
export function annualizeTWR(cumulativeIndexed: number, numberOfMonths: number): number | null {
  if (numberOfMonths <= 0) return null;
  const cumulativeReturn = cumulativeIndexed / 100; // e.g. 1.5891 for +58.91%
  const years = numberOfMonths / 12;
  if (years === 0) return (cumulativeReturn - 1) * 100;
  const annualized = (Math.pow(cumulativeReturn, 1 / years) - 1) * 100;
  return isFinite(annualized) ? annualized : null;
}

/**
 * Convert a USD monthly return series to EUR using end-of-month FX rates.
 *
 * Formula: R_EUR[t] = (1 + R_USD[t]) * (eurPerUsd[t] / eurPerUsd[t-1]) - 1
 *
 * Months where the FX rate is unavailable are passed through unchanged (USD return).
 * Shared by the benchmark comparison table and the Rendimenti hero "vs benchmark" delta
 * so both compare the EUR-denominated portfolio against an EUR-converted benchmark.
 */
export function applyFxConversion(
  returns: MonthlyReturnPoint[],
  fxRates: FxMonthlyRate[]
): MonthlyReturnPoint[] {
  const fxMap = new Map<string, number>(
    fxRates.map(r => [`${r.year}-${String(r.month).padStart(2, '0')}`, r.eurPerUsd])
  );

  return returns.map(r => {
    const currKey = `${r.year}-${String(r.month).padStart(2, '0')}`;
    const prevDate = new Date(r.year, r.month - 2, 1); // month - 2 because Date month is 0-indexed
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const currRate = fxMap.get(currKey);
    const prevRate = fxMap.get(prevKey);

    if (currRate == null || prevRate == null || prevRate === 0) {
      return r; // FX data unavailable for this month — pass through unchanged
    }

    const returnEur = (1 + r.return) * (currRate / prevRate) - 1;
    return { ...r, return: returnEur };
  });
}

/**
 * End-to-end: annualized TWR (%) of a monthly return series over [startDate, endDate].
 * Convenience used by the hero to get one benchmark number; null when the window holds
 * no months. The portfolio TWR it is compared against is annualized the same way.
 */
export function computeBenchmarkAnnualizedReturn(
  returns: MonthlyReturnPoint[],
  startDate: Date,
  endDate: Date,
  numberOfMonths: number
): number | null {
  const indexed = buildIndexedSeries(returns, startDate, endDate);
  if (indexed.length === 0) return null;
  return annualizeTWR(indexed[indexed.length - 1].indexed, numberOfMonths);
}
