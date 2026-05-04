import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { BENCHMARK_MAP } from '@/lib/constants/benchmarks';
import { BenchmarkMonthlyReturn, BenchmarkReturnsResponse } from '@/types/benchmarks';

const BENCHMARK_CACHE_COLLECTION = 'benchmark-cache';
// Cache TTL: 7 days. Benchmark data changes only when new monthly closes are available.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * GET /api/benchmarks/returns?benchmarkId=60-40
 *
 * Returns historical monthly returns for a model portfolio benchmark.
 *
 * Data is computed server-side from Yahoo Finance ETF proxies and cached in
 * Firestore `benchmark-cache/{benchmarkId}` (shared across all users, Admin SDK write only).
 *
 * The full historical series is returned; clients filter to the selected period.
 *
 * Auth: any authenticated user (benchmark data is global, not per-user).
 */
export async function GET(request: NextRequest) {
  try {
    await requireFirebaseAuth(request);

    const benchmarkId = request.nextUrl.searchParams.get('benchmarkId');
    if (!benchmarkId) {
      return NextResponse.json({ error: 'benchmarkId is required' }, { status: 400 });
    }

    const benchmark = BENCHMARK_MAP[benchmarkId];
    if (!benchmark) {
      return NextResponse.json({ error: `Unknown benchmarkId: ${benchmarkId}` }, { status: 404 });
    }

    // Attempt to serve from cache
    const cacheRef = adminDb.collection(BENCHMARK_CACHE_COLLECTION).doc(benchmarkId);
    const cacheSnap = await cacheRef.get();

    if (cacheSnap.exists) {
      const cached = cacheSnap.data()!;
      const cachedAt: Timestamp = cached.cachedAt;
      const ageMs = Date.now() - cachedAt.toMillis();

      if (ageMs < CACHE_TTL_MS) {
        const response: BenchmarkReturnsResponse = {
          benchmarkId,
          name: benchmark.name,
          monthlyReturns: cached.monthlyReturns as BenchmarkMonthlyReturn[],
          cachedAt: cachedAt.toDate().toISOString(),
        };
        return NextResponse.json(response);
      }
    }

    // Cache miss or stale — recompute from Yahoo Finance
    const monthlyReturns = await computeBenchmarkReturns(benchmarkId);

    // Persist to Firestore (fire-and-forget, cache failure must never break the response)
    cacheRef.set({
      benchmarkId,
      cachedAt: Timestamp.now(),
      monthlyReturns,
    }).catch((err: unknown) => {
      console.error(`[benchmarks] Failed to write cache for ${benchmarkId}:`, err);
    });

    const response: BenchmarkReturnsResponse = {
      benchmarkId,
      name: benchmark.name,
      monthlyReturns,
      cachedAt: new Date().toISOString(),
    };
    return NextResponse.json(response);

  } catch (error) {
    const authError = getApiAuthErrorResponse(error);
    if (authError) return authError;

    console.error('[benchmarks] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Fetch monthly price history for each ETF component, compute weighted monthly
 * returns for the benchmark, and return the merged series.
 *
 * Monthly return formula per component: (adjClose[t] - adjClose[t-1]) / adjClose[t-1]
 * Benchmark return for month t: sum(component.weight * componentReturn[t])
 *
 * Only months where ALL components have data are included, which determines the
 * effective start date of the benchmark series (the ETF with the latest inception date
 * sets the floor).
 */
async function computeBenchmarkReturns(benchmarkId: string): Promise<BenchmarkMonthlyReturn[]> {
  const benchmark = BENCHMARK_MAP[benchmarkId];
  const yahooFinance = new YahooFinance();

  // Fetch historical monthly closes for every component ETF in parallel.
  // We request from 2000-01-01 so the ETF's own inception date acts as the natural floor.
  const etfSeriesResults = await Promise.allSettled(
    benchmark.components.map(async (component) => {
      const result = await yahooFinance.chart(component.ticker, {
        period1: '2000-01-01',
        interval: '1mo',
      });

      // Build YYYY-MM → adjClose map from the chart quotes
      const priceMap = new Map<string, number>();
      for (const quote of result.quotes) {
        const adjClose = (quote as { adjclose?: number | null }).adjclose ?? quote.close;
        if (adjClose == null || adjClose <= 0) continue;
        const d = new Date(quote.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        priceMap.set(key, adjClose);
      }

      return { ticker: component.ticker, weight: component.weight, priceMap };
    })
  );

  // Collect successfully fetched series; log any failures
  const etfSeries: Array<{ ticker: string; weight: number; priceMap: Map<string, number> }> = [];
  for (const result of etfSeriesResults) {
    if (result.status === 'fulfilled') {
      etfSeries.push(result.value);
    } else {
      console.error(`[benchmarks/${benchmarkId}] Failed to fetch ETF data:`, result.reason);
    }
  }

  if (etfSeries.length === 0) {
    throw new Error(`No ETF data available for benchmark ${benchmarkId}`);
  }

  // Collect all months present across all ETF series
  const allMonths = new Set<string>();
  for (const series of etfSeries) {
    for (const key of series.priceMap.keys()) {
      allMonths.add(key);
    }
  }

  // Sort chronologically
  const sortedMonths = Array.from(allMonths).sort();

  // For each consecutive month pair, compute the weighted benchmark return.
  // A month is included only if every component has both the current and prior month's price.
  const monthlyReturns: BenchmarkMonthlyReturn[] = [];

  for (let i = 1; i < sortedMonths.length; i++) {
    const prevKey = sortedMonths[i - 1];
    const currKey = sortedMonths[i];

    // Skip if this is not a true consecutive month pair (gap in data)
    const [prevYear, prevMonth] = prevKey.split('-').map(Number);
    const [currYear, currMonth] = currKey.split('-').map(Number);
    const expectedNext = new Date(prevYear, prevMonth - 1 + 1, 1); // add 1 month
    const actual = new Date(currYear, currMonth - 1, 1);
    if (expectedNext.getFullYear() !== actual.getFullYear() || expectedNext.getMonth() !== actual.getMonth()) {
      continue; // Gap in data — skip this pair
    }

    let benchmarkReturn = 0;
    let totalWeight = 0;

    for (const series of etfSeries) {
      const prevPrice = series.priceMap.get(prevKey);
      const currPrice = series.priceMap.get(currKey);
      if (prevPrice == null || currPrice == null || prevPrice === 0) continue;

      const componentReturn = (currPrice - prevPrice) / prevPrice;
      benchmarkReturn += series.weight * componentReturn;
      totalWeight += series.weight;
    }

    // Skip months where not all components have data (totalWeight well below 1 means missing ETFs)
    if (totalWeight < 0.95) continue;

    const [year, month] = currKey.split('-').map(Number);
    monthlyReturns.push({ year, month, return: benchmarkReturn });
  }

  return monthlyReturns;
}
