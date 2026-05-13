import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { getUserAssetsAdmin } from '@/lib/server/assetAdminRepository';
import { computePortfolioExposure } from '@/lib/server/portfolioExposureService';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { PortfolioExposureData, PortfolioExposureResponse } from '@/types/exposure';

const EXPOSURE_CACHE_COLLECTION = 'exposure-cache';
// Cache ETF holdings for 24h — fund compositions change rarely (typically monthly).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/portfolio/exposure
 *
 * Returns a breakdown of the user's portfolio exposure by:
 * - Top company holdings (cross-ETF aggregated, direct stocks at 100%)
 * - Sector weights (from Yahoo Finance topHoldings)
 * - ETF fund families/issuers
 *
 * Data is computed server-side from Yahoo Finance quoteSummary and cached
 * in Firestore `exposure-cache/{userId}` for 24h (Admin SDK write only).
 *
 * The cache key encodes the ETF composition + total portfolio value so it
 * auto-invalidates when the user adds/removes ETFs or makes significant trades.
 *
 * Auth: authenticated user — returns only their own exposure data.
 */
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = decodedToken.uid;

    const assets = await getUserAssetsAdmin(userId);

    // Build the expected cache key before reading cache, so we can validate staleness
    const activeAssets = assets.filter((a) => a.quantity > 0);
    const etfAssets = activeAssets.filter((a) => a.type === 'etf');
    const totalPortfolioValue = activeAssets.reduce((sum, a) => {
      const isGBp = a.currency === 'GBp';
      const normalised = isGBp ? a.currentPrice / 100 : a.currentPrice;
      const priceEur =
        a.currency?.toUpperCase() !== 'EUR' && a.currentPriceEur != null
          ? a.currentPriceEur
          : normalised;
      const base = a.quantity * priceEur;
      return sum + (a.type === 'realestate' && a.outstandingDebt ? base - a.outstandingDebt : base);
    }, 0);
    const expectedCacheKey = `${etfAssets.length}-${etfAssets.map((a) => a.ticker).sort().join(',')}-${Math.round(totalPortfolioValue)}`;

    // Attempt to serve from cache
    const cacheRef = adminDb.collection(EXPOSURE_CACHE_COLLECTION).doc(userId);
    const cacheSnap = await cacheRef.get();

    if (cacheSnap.exists) {
      const cached = cacheSnap.data()!;
      const cachedAt: Timestamp = cached.cachedAt;
      const ageMs = Date.now() - cachedAt.toMillis();

      if (ageMs < CACHE_TTL_MS && cached.cacheKey === expectedCacheKey) {
        const response: PortfolioExposureResponse = {
          exposure: cached.exposure as PortfolioExposureData,
          cached: true,
        };
        return NextResponse.json(response);
      }
    }

    // Cache miss or stale — recompute from Yahoo Finance
    const exposure = await computePortfolioExposure(assets);

    // Persist to Firestore (fire-and-forget — cache failure must never break the response)
    cacheRef.set({
      cachedAt: Timestamp.now(),
      cacheKey: exposure.cacheKey,
      exposure,
    }).catch((err: unknown) => {
      console.error('[exposure] Failed to write cache for', userId, err);
    });

    const response: PortfolioExposureResponse = { exposure, cached: false };
    return NextResponse.json(response);

  } catch (error) {
    const authError = getApiAuthErrorResponse(error);
    if (authError) return authError;

    console.error('[exposure] Error computing portfolio exposure:', error);
    return NextResponse.json(
      { error: 'Failed to compute portfolio exposure' },
      { status: 500 }
    );
  }
}
