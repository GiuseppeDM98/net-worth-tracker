import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import {
  readEcbRatesFromFirestore,
  writeEcbRatesToFirestore,
  fetchAndBuildEcbRates,
  isEcbCacheStale,
} from '@/lib/server/ecbRatesService';
import { EcbRatesResponse } from '@/types/benchmarks';

/**
 * GET /api/benchmarks/ecb-rates
 *
 * Returns historical monthly ECB deposit facility rates (annual %) from 1999-01
 * to the current month. Used by the benchmark comparison chart to compute
 * period-accurate Sharpe/Sortino ratios instead of the user's static setting.
 *
 * Data is sourced from FRED series ECBDFR (requires FRED_API_KEY env var) and
 * cached in Firestore `ecb-rate-cache/deposit-rate` (shared, Admin SDK only, TTL 7d).
 *
 * Degradation: FRED failure with stale cache → returns stale data.
 *              FRED failure with no cache   → 503.
 *
 * Auth: any authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    await requireFirebaseAuth(request);

    const cached = await readEcbRatesFromFirestore();

    if (cached && !isEcbCacheStale(cached.cachedAt)) {
      const response: EcbRatesResponse = {
        monthlyRates: cached.rates,
        cachedAt: cached.cachedAt.toISOString(),
      };
      return NextResponse.json(response);
    }

    if (!process.env.FRED_API_KEY) {
      if (cached) {
        return NextResponse.json({
          monthlyRates: cached.rates,
          cachedAt: cached.cachedAt.toISOString(),
        } as EcbRatesResponse);
      }
      return NextResponse.json({ error: 'ECB rates unavailable' }, { status: 503 });
    }

    // Cache miss or stale — fetch from FRED
    let rates;
    try {
      rates = await fetchAndBuildEcbRates();
    } catch (fredError) {
      console.error('[ecb-rates] FRED fetch failed:', fredError);
      if (cached) {
        return NextResponse.json({
          monthlyRates: cached.rates,
          cachedAt: cached.cachedAt.toISOString(),
        } as EcbRatesResponse);
      }
      return NextResponse.json({ error: 'ECB rates unavailable' }, { status: 503 });
    }

    // Write async — don't block the response
    writeEcbRatesToFirestore(rates).catch((err: unknown) => {
      console.error('[ecb-rates] Failed to write cache:', err);
    });

    const response: EcbRatesResponse = {
      monthlyRates: rates,
      cachedAt: new Date().toISOString(),
    };
    return NextResponse.json(response);

  } catch (error) {
    const authError = getApiAuthErrorResponse(error);
    if (authError) return authError;
    console.error('[ecb-rates] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
