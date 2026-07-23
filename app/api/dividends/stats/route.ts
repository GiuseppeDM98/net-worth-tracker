import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import {
  calculateDividendStats,
  getUpcomingDividends,
  getAllDividends
} from '@/lib/services/dividendService';
import { adminDb } from '@/lib/firebase/admin';
import { AssetDividendGrowth, Dividend, DividendGrowthData, TotalReturnAsset, YieldOnCostAsset } from '@/types/dividend';
import { computeDividendYieldMetrics } from '@/lib/utils/yieldOnCost';
import { getUserSnapshotsAdmin, getAssetTransactionsAdmin } from '@/lib/server/assetAdminRepository';
import { deriveHoldingStartDates } from '@/lib/utils/snapshotAssetBreakdown';
import {
  replayTransactions,
  computeAssetTotalReturn,
  type LedgerPositionState,
} from '@/lib/utils/assetTransactionUtils';
import type { AssetTransaction } from '@/types/assetTransactions';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';

// Mirror of calculateAssetValue() (lib/services/assetService.ts) for ledger-based total return —
// assetService.ts imports the client Firebase SDK and cannot be used in this Admin route (same
// reasoning as resolveAssetValueEur in portfolioExposureService.ts). Ledger asset types
// (stock/etf/bond/crypto/commodity) never carry outstandingDebt, so that branch is omitted.
function resolveLedgerAssetValueEur(asset: {
  quantity: number;
  currentPrice: number;
  currentPriceEur?: number;
  currency?: string;
}): number {
  const isGBp = asset.currency === 'GBp';
  const normalizedPrice = isGBp ? asset.currentPrice / 100 : asset.currentPrice;
  const priceEur =
    asset.currency && asset.currency.toUpperCase() !== 'EUR' && asset.currentPriceEur !== undefined
      ? asset.currentPriceEur
      : normalizedPrice;
  return asset.quantity * priceEur;
}

/**
 * Per-payment dividend return %, summing (net ÷ cost-basis-AT-PAYMENT-TIME) for each dividend —
 * the YOC v3 approach: uses `Dividend.costPerShare` (the historical PMC snapshot at creation time)
 * so a later purchase never dilutes an earlier payment's yield. `fallbackAverageCost` covers legacy
 * records without the stamp. Shared by BOTH the ledger and static totalReturnAssets paths below —
 * `costPerShare` is stamped from `asset.averageCost` at dividend-creation time regardless of asset
 * type, and for ledger assets that field is kept authoritative by the trade replay, so the exact
 * same per-payment math applies without any ledger-specific branching.
 */
function computeDividendReturnPercentage(
  assetDividends: Dividend[],
  fallbackAverageCost: number
): number {
  return assetDividends.reduce((sum, div) => {
    const effectiveCostPerShare = div.costPerShare ?? fallbackAverageCost;
    const costBasisAtTime = div.quantity * effectiveCostPerShare;
    if (costBasisAtTime <= 0) return sum;
    return sum + (div.netAmountEur ?? div.netAmount) / costBasisAtTime * 100;
  }, 0);
}

/**
 * GET /api/dividends/stats
 * Query params: userId (required), startDate (optional), endDate (optional)
 * Returns dividend statistics for a user, optionally filtered by date range
 */
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const assetId = searchParams.get('assetId') || undefined;

    await assertCanAccessAccount(decodedToken, userId);
    const authenticatedUserId = userId as string;

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    // Parse each date independently — a single bound is valid (e.g. "from 2026-01-01" with no end)
    if (startDateStr) {
      startDate = new Date(startDateStr);
      if (isNaN(startDate.getTime())) {
        return NextResponse.json({ error: 'Invalid startDate format' }, { status: 400 });
      }
    }
    if (endDateStr) {
      endDate = new Date(endDateStr);
      if (isNaN(endDate.getTime())) {
        return NextResponse.json({ error: 'Invalid endDate format' }, { status: 400 });
      }
    }

    // getDividendsByDateRange (and calculateDividendStats) require both bounds.
    // Fill in the missing bound with a sensible default so a single date still filters correctly.
    if (startDate && !endDate) endDate = new Date('9999-12-31');
    if (endDate && !startDate) startDate = new Date(0);

    // Calculate period statistics (filtered by date range and optionally by asset)
    const periodStats = await calculateDividendStats(authenticatedUserId, startDate, endDate, assetId);

    // Calculate all-time statistics (also filtered by asset if provided)
    const allTimeStats = await calculateDividendStats(authenticatedUserId, undefined, undefined, assetId);

    // Get upcoming dividends and filter by asset ownership
    const upcomingDividends = await getUpcomingDividends(authenticatedUserId);

    // Fetch user assets to filter out dividends for sold assets (quantity = 0)
    // Using admin SDK to bypass Firestore Security Rules (server-side)
    const assetsSnapshot = await adminDb
      .collection('assets')
      .where('userId', '==', authenticatedUserId)
      .get();

    // Holding-start per asset (from snapshots): lets the per-share engine ignore dividends from a
    // previous, discontinuous holding when an instrument was sold and later rebought (same id).
    const holdingStarts = deriveHoldingStartDates(await getUserSnapshotsAdmin(authenticatedUserId));

    const userAssets = assetsSnapshot.docs.map(doc => ({
      id: doc.id,
      ticker: doc.data().ticker || '',
      name: doc.data().name || '',
      quantity: doc.data().quantity || 0,
      currentPrice: doc.data().currentPrice || 0,
      currentPriceEur: doc.data().currentPriceEur as number | undefined,
      currency: doc.data().currency as string | undefined,
      averageCost: doc.data().averageCost,
      // Prefer the exact start stamped at (re)purchase; fall back to the snapshot-derived value.
      holdingStartDate: doc.data().holdingStartDate?.toDate() ?? holdingStarts.get(doc.id),
    }));
    const assetsMap = new Map(userAssets.map(a => [a.id, a]));

    // Trade-ledger transactions, grouped by asset (Fase D §6): assets WITH ledger entries get a
    // date-exact total return via replayTransactions; assets without one keep the static fallback
    // below (only possible for a position opened and never migrated/re-bought).
    const allTrades = await getAssetTransactionsAdmin(authenticatedUserId);
    const tradesByAssetId = new Map<string, AssetTransaction[]>();
    allTrades.forEach(t => {
      const arr = tradesByAssetId.get(t.assetId) ?? [];
      arr.push(t);
      tradesByAssetId.set(t.assetId, arr);
    });

    // Only show upcoming dividends for assets still owned
    const activeUpcomingDividends = upcomingDividends.filter(div => {
      const asset = assetsMap.get(div.assetId);
      return asset && asset.quantity > 0;
    });

    // When an asset filter is active, show only upcoming dividends for that asset
    const visibleUpcomingDividends = assetId
      ? activeUpcomingDividends.filter(d => d.assetId === assetId)
      : activeUpcomingDividends;
    const upcomingTotal = visibleUpcomingDividends.reduce((sum, div) => sum + div.netAmount, 0);

    // Convert byAsset object to array
    const byAsset = Object.values(periodStats.byAsset).map(asset => ({
      assetTicker: asset.assetTicker,
      assetName: asset.assetName,
      totalNet: asset.totalNet,
      count: asset.count,
    })).sort((a, b) => b.totalNet - a.totalNet);

    // Get all dividends for year and month grouping
    const allDividends = await getAllDividends(authenticatedUserId);

    // Helper function to convert Date | Timestamp to Date
    const toDate = (date: Date | Timestamp): Date => {
      return date instanceof Date ? date : date.toDate();
    };

    // Filter out future dividends for charts (only show paid dividends)
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const paidDividends = allDividends.filter(div => {
      const paymentDate = toDate(div.paymentDate);
      return paymentDate <= today;
    });

    // Apply active filters to paid dividends for byYear/byMonth chart computation.
    // paidDividends is all-time/all-asset by design (needed for totalReturn and dividendGrowth
    // which are intentionally all-time metrics). Charts must respect the same scope as cards.
    let chartDividends = paidDividends;
    if (assetId) {
      chartDividends = chartDividends.filter(d => d.assetId === assetId);
    }
    if (startDate && endDate) {
      chartDividends = chartDividends.filter(d => {
        const pd = toDate(d.paymentDate);
        return pd >= startDate! && pd <= endDate!;
      });
    }

    // Group raw paid-dividend records per asset, for per-payment contribution using the historical
    // cost basis (YOC v3 approach). The records are scoped to the current holding in the map below.
    const dividendsByAsset = new Map<string, typeof paidDividends>();
    paidDividends.forEach(div => {
      const arr = dividendsByAsset.get(div.assetId) ?? [];
      arr.push(div);
      dividendsByAsset.set(div.assetId, arr);
    });

    // Compute total return per asset: capital gain % + dividend return % on cost.
    // Dividends are scoped to the CURRENT holding (paymentDate >= holdingStartDate): a rebought
    // asset's prior-holding dividends must not be credited to the new position — the capital-gain
    // term is already current-holding only, so the dividend term must match (consistent with YOC).
    //
    // Two paths (Fase D, spec 04 §6) SHARE the dividend-return method (computeDividendReturnPercentage,
    // per-payment historical cost basis) and diverge only on the capital-gain term:
    //   - LEDGER-BASED (asset has trade-ledger entries): replayTransactions + computeAssetTotalReturn
    //     is authoritative — includes CLOSED positions (quantity 0, isClosed: true) and partial
    //     sells, which the static path below cannot represent (it has no realized-sell price).
    //   - STATIC fallback (no ledger doc for this asset — never migrated/re-bought): unchanged
    //     unrealized price-vs-PMC calculation, gated on averageCost > 0 && quantity > 0 && dividends.
    const totalReturnAssets: TotalReturnAsset[] = userAssets
      .map((asset): TotalReturnAsset | null => {
        // Scope to the current holding. holdingStartDate = exact stamp at (re)purchase ?? snapshot-
        // derived; absent for continuously-held assets (then all dividends count, as before).
        const assetDividends = (dividendsByAsset.get(asset.id) ?? []).filter(div =>
          !asset.holdingStartDate || toDate(div.paymentDate) >= asset.holdingStartDate
        );
        const netDividends = assetDividends.reduce(
          (sum, div) => sum + (div.netAmountEur ?? div.netAmount),
          0
        );

        const trades = tradesByAssetId.get(asset.id);
        if (trades && trades.length > 0) {
          let state: LedgerPositionState;
          try {
            state = replayTransactions(trades);
          } catch {
            // A corrupted/invalid stored sequence should not crash the whole stats route — skip it.
            return null;
          }
          if (state.investedEur <= 0) return null; // nothing ever bought (shouldn't happen)

          const currentValueEur = state.quantity > 0 ? resolveLedgerAssetValueEur(asset) : 0;
          const totalReturn = computeAssetTotalReturn(state, currentValueEur, netDividends);
          // Capital gain = the price-driven component (realized + unrealized), symmetric with the
          // static path below where capitalGainPercentage + dividendReturnPercentage = total.
          const capitalGainAbsolute = totalReturn.realizedPnlEur + totalReturn.unrealizedPnlEur;
          const capitalGainPercentage = (capitalGainAbsolute / totalReturn.investedEur) * 100;
          // Same per-payment method as the static path (see computeDividendReturnPercentage) — NOT
          // a flat netDividends/investedEur ratio, which would silently lose the anti-dilution
          // property the static path has always had. Fallback is NATIVE currency (state.averageCost,
          // not averageCostEur) to match the unit div.costPerShare was stamped in (asset.averageCost
          // is native — see the helper's doc comment).
          const dividendReturnPercentage = computeDividendReturnPercentage(
            assetDividends,
            state.averageCost ?? asset.averageCost ?? 0
          );

          return {
            assetId: asset.id,
            assetTicker: asset.ticker,
            assetName: asset.name,
            quantity: asset.quantity,
            averageCost: state.averageCostEur ?? asset.averageCost ?? 0,
            currentPrice: asset.currentPrice,
            costBasis: state.costBasisEur,
            currentValue: currentValueEur,
            netDividends,
            capitalGainAbsolute,
            capitalGainPercentage,
            dividendReturnPercentage,
            totalReturnPercentage: capitalGainPercentage + dividendReturnPercentage,
            realizedPnlEur: totalReturn.realizedPnlEur,
            isClosed: totalReturn.isClosed,
          };
        }

        // Static fallback: no ledger doc for this asset (never migrated/re-bought at quantity 0).
        // Excludes sold assets (quantity = 0) since we don't track the actual realized sell price,
        // and assets without averageCost (e.g. cash) since cost basis is required for % calculation.
        if (!asset.averageCost || asset.averageCost <= 0 || asset.quantity <= 0) return null;
        // Dividend-return card: an asset with no dividends in the current holding has no story here.
        if (netDividends <= 0) return null;

        const costBasis = asset.quantity * asset.averageCost;
        const currentValue = asset.quantity * asset.currentPrice;
        const capitalGainAbsolute = currentValue - costBasis;
        const capitalGainPercentage = (capitalGainAbsolute / costBasis) * 100;
        const dividendReturnPercentage = computeDividendReturnPercentage(assetDividends, asset.averageCost!);
        return {
          assetId: asset.id,
          assetTicker: asset.ticker,
          assetName: asset.name,
          quantity: asset.quantity,
          averageCost: asset.averageCost!,
          currentPrice: asset.currentPrice,
          costBasis,
          currentValue,
          netDividends,
          capitalGainAbsolute,
          capitalGainPercentage,
          dividendReturnPercentage,
          totalReturnPercentage: capitalGainPercentage + dividendReturnPercentage,
        };
      })
      .filter((asset): asset is TotalReturnAsset => asset !== null)
      .sort((a, b) => b.totalReturnPercentage - a.totalReturnPercentage);

    // Compute DPS growth for equity assets only (excludes coupons and finalPremium).
    // Bond coupons have a fixed rate by contract — they don't grow organically, so they
    // would dilute this metric without providing meaningful information on dividend growth.
    // Groups paid dividends by assetId → calendar year → sums dividendPerShare (gross).
    // Only active assets (quantity > 0) with at least 1 year of data are included.
    const equityPaidDividends = paidDividends.filter(
      div => div.dividendType !== 'coupon' && div.dividendType !== 'finalPremium'
    );

    // When assetId filter is active, scope growth data to that single asset
    const growthDividends = assetId
      ? equityPaidDividends.filter(div => div.assetId === assetId)
      : equityPaidDividends;

    // Group by assetId → year → sum DPS
    const dpsByAsset = new Map<string, Map<number, number>>();
    growthDividends.forEach(div => {
      const paymentDate = toDate(div.paymentDate);
      const year = paymentDate.getFullYear();
      if (!dpsByAsset.has(div.assetId)) dpsByAsset.set(div.assetId, new Map());
      const yearMap = dpsByAsset.get(div.assetId)!;
      yearMap.set(year, (yearMap.get(year) ?? 0) + div.dividendPerShare);
    });

    // Build per-asset growth objects — only for active assets
    const assetGrowthList: AssetDividendGrowth[] = [];
    dpsByAsset.forEach((yearMap, aid) => {
      const asset = assetsMap.get(aid);
      if (!asset || asset.quantity <= 0) return;

      const yearlyDps = Array.from(yearMap.entries())
        .map(([year, totalDps]) => ({ year, totalDps }))
        .sort((a, b) => a.year - b.year);

      // Compute YoY growth for each year that has a predecessor in the data
      const yoyGrowth: Record<number, number> = {};
      for (let i = 1; i < yearlyDps.length; i++) {
        const prev = yearlyDps[i - 1].totalDps;
        if (prev > 0) {
          yoyGrowth[yearlyDps[i].year] =
            ((yearlyDps[i].totalDps - prev) / prev) * 100;
        }
      }

      // CAGR uses calendar-year span so gaps (e.g. no dividend in 2023) are handled correctly
      const firstEntry = yearlyDps[0];
      const lastEntry = yearlyDps[yearlyDps.length - 1];
      const yearSpan = lastEntry.year - firstEntry.year;
      const cagr =
        yearSpan > 0 && firstEntry.totalDps > 0
          ? (Math.pow(lastEntry.totalDps / firstEntry.totalDps, 1 / yearSpan) - 1) * 100
          : undefined;

      // Most recent YoY growth where a prior data-year exists
      const latestYoyGrowth =
        yearlyDps.length >= 2 ? yoyGrowth[lastEntry.year] : undefined;

      // Inherit currency from a sample dividend for this asset
      const sampleDiv = growthDividends.find(d => d.assetId === aid);

      assetGrowthList.push({
        assetId: aid,
        assetTicker: asset.ticker,
        assetName: asset.name,
        currency: sampleDiv?.currency ?? 'EUR',
        yearlyDps,
        yoyGrowth,
        cagr,
        latestYoyGrowth,
      });
    });

    // Stable alphabetical order by asset name
    assetGrowthList.sort((a, b) => a.assetName.localeCompare(b.assetName));

    // Compute portfolio median of most-recent YoY growths across assets with >= 2 data years
    const validGrowths = assetGrowthList
      .map(a => a.latestYoyGrowth)
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);

    let portfolioMedianGrowth: number | undefined;
    let portfolioAvgGrowth: number | undefined;
    if (validGrowths.length > 0) {
      const mid = Math.floor(validGrowths.length / 2);
      portfolioMedianGrowth =
        validGrowths.length % 2 !== 0
          ? validGrowths[mid]
          : (validGrowths[mid - 1] + validGrowths[mid]) / 2;
      portfolioAvgGrowth =
        validGrowths.reduce((s, v) => s + v, 0) / validGrowths.length;
    }

    const dividendGrowthData: DividendGrowthData | undefined =
      assetGrowthList.length > 0
        ? { byAsset: assetGrowthList, portfolioMedianGrowth, portfolioAvgGrowth }
        : undefined;

    // Group by year
    const byYearMap = new Map<number, { totalGross: number; totalTax: number; totalNet: number }>();
    chartDividends.forEach(div => {
      const paymentDate = toDate(div.paymentDate);
      const year = paymentDate.getFullYear();
      if (!byYearMap.has(year)) {
        byYearMap.set(year, { totalGross: 0, totalTax: 0, totalNet: 0 });
      }
      const yearData = byYearMap.get(year)!;
      yearData.totalGross += div.grossAmount;
      yearData.totalTax += div.taxAmount;
      yearData.totalNet += div.netAmount;
    });
    const byYear = Array.from(byYearMap.entries())
      .map(([year, data]) => ({ year, ...data }))
      .sort((a, b) => a.year - b.year);

    // Group by month (last 12 months)
    const byMonthMap = new Map<string, number>();
    chartDividends.forEach(div => {
      const paymentDate = toDate(div.paymentDate);
      const monthKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonthMap.has(monthKey)) {
        byMonthMap.set(monthKey, 0);
      }
      byMonthMap.set(monthKey, byMonthMap.get(monthKey)! + div.netAmount);
    });
    const byMonth = Array.from(byMonthMap.entries())
      .map(([month, totalNet]) => ({ month, totalNet }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // YOC, Current Yield & average yield over the Trailing Twelve Months (TTM).
    // Uses the same per-share engine as the Performance page so both surfaces report a
    // single consistent number; dividends from fully-sold positions are excluded
    // (see lib/utils/yieldOnCost.ts).
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

    const ttmMetrics = computeDividendYieldMetrics(allDividends, userAssets, twelveMonthsAgo, today, 12);

    // averageYield = portfolio current yield (gross dividends on current market value).
    // DEPRECATED: superseded by the Performance page Current Yield (selected period).
    const averageYield = ttmMetrics.portfolioCurrentYieldGross ?? 0;

    let portfolioYieldOnCost: number | undefined;
    let totalCostBasis: number | undefined;
    let yieldOnCostAssets: YieldOnCostAsset[] | undefined;

    if (ttmMetrics.portfolioYocGross !== null) {
      yieldOnCostAssets = ttmMetrics.assets
        .map<YieldOnCostAsset>(a => ({
          assetId: a.assetId,
          assetTicker: a.assetTicker,
          assetName: a.assetName,
          quantity: a.quantity,
          averageCost: a.averageCost,
          currentPrice: a.currentPrice,
          ttmGrossDividends: a.realizedGross,
          yocPercentage: a.yocGrossPct,
          currentYieldPercentage: a.currentYieldGrossPct,
          difference: a.yocGrossPct - a.currentYieldGrossPct,
        }))
        .sort((a, b) => b.yocPercentage - a.yocPercentage);
      portfolioYieldOnCost = ttmMetrics.portfolioYocGross;
      totalCostBasis = ttmMetrics.totalCostBasis;
    }

    const stats = {
      period: {
        totalGross: periodStats.totalGross,
        totalTax: periodStats.totalTax,
        totalNet: periodStats.totalNet,
        count: periodStats.count,
      },
      allTime: {
        totalGross: allTimeStats.totalGross,
        totalTax: allTimeStats.totalTax,
        totalNet: allTimeStats.totalNet,
        count: allTimeStats.count,
      },
      averageYield,
      upcomingTotal,
      byAsset,
      byYear,
      byMonth,
      // Include YOC data only if available
      ...(portfolioYieldOnCost !== undefined && {
        portfolioYieldOnCost,
        totalCostBasis,
        yieldOnCostAssets,
      }),
      // Include total return breakdown only when data exists
      ...(totalReturnAssets.length > 0 && { totalReturnAssets }),
      // Include DPS growth data only when equity dividends exist
      ...(dividendGrowthData && { dividendGrowthData }),
    };

    return NextResponse.json({
      success: true,
      stats,
      period: startDate && endDate ? {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      } : 'all_time',
    });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Error calculating dividend stats:', error);
    return NextResponse.json(
      { error: 'Failed to calculate dividend statistics', details: (error as Error).message },
      { status: 500 }
    );
  }
}
