import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { FxMonthlyRate, FxRatesResponse } from '@/types/benchmarks';

const FX_CACHE_COLLECTION = 'fx-rate-cache';
const FX_CACHE_DOC = 'usd-eur';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FRANKFURTER_API_BASE = 'https://api.frankfurter.app';

/**
 * GET /api/benchmarks/fx-rates
 *
 * Returns historical monthly EUR/USD exchange rates (EUR per 1 USD, end-of-month).
 * Used by the benchmark comparison chart to convert USD benchmark returns to EUR.
 *
 * Data is sourced from the Frankfurter API (free, no key required) and cached in
 * Firestore `fx-rate-cache/usd-eur` (shared across all users, Admin SDK write only).
 *
 * Auth: any authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    await requireFirebaseAuth(request);

    const cacheRef = adminDb.collection(FX_CACHE_COLLECTION).doc(FX_CACHE_DOC);
    const cacheSnap = await cacheRef.get();

    if (cacheSnap.exists) {
      const cached = cacheSnap.data()!;
      const cachedAt: Timestamp = cached.cachedAt;
      const ageMs = Date.now() - cachedAt.toMillis();

      if (ageMs < CACHE_TTL_MS) {
        const response: FxRatesResponse = {
          monthlyRates: cached.monthlyRates as FxMonthlyRate[],
          cachedAt: cachedAt.toDate().toISOString(),
        };
        return NextResponse.json(response);
      }
    }

    // Cache miss or stale — fetch from Frankfurter
    const monthlyRates = await fetchMonthlyFxRates();

    cacheRef.set({
      cachedAt: Timestamp.now(),
      monthlyRates,
    }).catch((err: unknown) => {
      console.error('[fx-rates] Failed to write cache:', err);
    });

    const response: FxRatesResponse = {
      monthlyRates,
      cachedAt: new Date().toISOString(),
    };
    return NextResponse.json(response);

  } catch (error) {
    const authError = getApiAuthErrorResponse(error);
    if (authError) return authError;
    console.error('[fx-rates] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Fetch daily USD→EUR rates from Frankfurter for [2000-01-01, today], then
 * collapse to monthly by keeping the last available rate of each calendar month.
 * End-of-month rates align with the month-end prices used by Yahoo Finance ETF data.
 */
async function fetchMonthlyFxRates(): Promise<FxMonthlyRate[]> {
  const today = new Date().toISOString().slice(0, 10);
  const url = `${FRANKFURTER_API_BASE}/2000-01-01..${today}?from=USD&to=EUR`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Frankfurter API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as {
    rates: Record<string, { EUR: number }>;
  };

  // Collapse daily rates to monthly by keeping the last date per YYYY-MM
  const monthMap = new Map<string, { date: string; eurPerUsd: number }>();
  for (const [dateStr, rateObj] of Object.entries(data.rates)) {
    const ym = dateStr.slice(0, 7); // "YYYY-MM"
    const existing = monthMap.get(ym);
    if (!existing || dateStr > existing.date) {
      monthMap.set(ym, { date: dateStr, eurPerUsd: rateObj.EUR });
    }
  }

  const monthlyRates: FxMonthlyRate[] = [];
  for (const [ym, { eurPerUsd }] of monthMap.entries()) {
    const [year, month] = ym.split('-').map(Number);
    monthlyRates.push({ year, month, eurPerUsd });
  }

  return monthlyRates.sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );
}
