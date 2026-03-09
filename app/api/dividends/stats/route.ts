import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import {
  calculateDividendStats,
  getUpcomingDividends,
  getAllDividends
} from '@/lib/services/dividendService';
import { adminDb } from '@/lib/firebase/admin';
import { AssetDividendGrowth, DividendGrowthData, TotalReturnAsset, YieldOnCostAsset } from '@/types/dividend';

/**
 * GET /api/dividends/stats
 * Query params: userId (required), startDate (optional), endDate (optional)
 * Returns dividend statistics for a user, optionally filtered by date range
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const assetId = searchParams.get('assetId') || undefined;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    // Parse dates if provided
    if (startDateStr && endDateStr) {
      startDate = new Date(startDateStr);
      endDate = new Date(endDateStr);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format' },
          { status: 400 }
        );
      }
    }

    // Calculate period statistics (filtered by date range and optionally by asset)
    const periodStats = await calculateDividendStats(userId, startDate, endDate, assetId);

    // Calculate all-time statistics (also filtered by asset if provided)
    const allTimeStats = await calculateDividendStats(userId, undefined, undefined, assetId);

    // Get upcoming dividends and filter by asset ownership
    const upcomingDividends = await getUpcomingDividends(userId);

    // Fetch user assets to filter out dividends for sold assets (quantity = 0)
    // Using admin SDK to bypass Firestore Security Rules (server-side)
    const assetsSnapshot = await adminDb
      .collection('assets')
      .where('userId', '==', userId)
      .get();

    const userAssets = assetsSnapshot.docs.map(doc => ({
      id: doc.id,
      ticker: doc.data().ticker || '',
      name: doc.data().name || '',
      quantity: doc.data().quantity || 0,
      currentPrice: doc.data().currentPrice || 0,
      averageCost: doc.data().averageCost,
    }));
    const assetsMap = new Map(userAssets.map(a => [a.id, a]));

    // Only show upcoming dividends for assets still owned
    const activeUpcomingDividends = upcomingDividends.filter(div => {
      const asset = assetsMap.get(div.assetId);
      return asset && asset.quantity > 0;
    });

    const upcomingTotal = activeUpcomingDividends.reduce((sum, div) => sum + div.netAmount, 0);

    // Convert byAsset object to array
    const byAsset = Object.values(periodStats.byAsset).map(asset => ({
      assetTicker: asset.assetTicker,
      assetName: asset.assetName,
      totalNet: asset.totalNet,
      count: asset.count,
    })).sort((a, b) => b.totalNet - a.totalNet);

    // Get all dividends for year and month grouping
    const allDividends = await getAllDividends(userId);

    // Helper function to convert Date | Timestamp to Date
    const toDate = (date: Date | Timestamp): Date => {
      return date instanceof Date ? date : date.toDate();
    };

    // Filter out future dividends for charts (only show paid dividends)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const paidDividends = allDividends.filter(div => {
      const paymentDate = toDate(div.paymentDate);
      return paymentDate <= today;
    });

    // Group all-time paid dividends by asset using EUR amounts for multi-currency consistency.
    // averageCost is always stored in EUR, so dividends must also be in EUR for a meaningful %.
    // Also group raw records per asset for per-payment historical cost basis (YOC v3 approach).
    const allTimeNetEurByAsset = new Map<string, number>();
    const dividendsByAsset = new Map<string, typeof paidDividends>();
    paidDividends.forEach(div => {
      const current = allTimeNetEurByAsset.get(div.assetId) || 0;
      // Prefer EUR-converted amount; fall back to original currency if conversion was not available
      allTimeNetEurByAsset.set(div.assetId, current + (div.netAmountEur ?? div.netAmount));
      // Group raw records to compute per-payment contribution using historical cost basis
      const arr = dividendsByAsset.get(div.assetId) ?? [];
      arr.push(div);
      dividendsByAsset.set(div.assetId, arr);
    });

    // Compute total return per asset: unrealized capital gain % + all-time dividend return %.
    // Excludes sold assets (quantity = 0) since we don't track the actual realized sell price,
    // and assets without averageCost (e.g. cash) since cost basis is required for % calculation.
    const totalReturnAssets: TotalReturnAsset[] = userAssets
      .filter(asset =>
        asset.averageCost &&
        asset.averageCost > 0 &&
        asset.quantity > 0 &&
        (allTimeNetEurByAsset.get(asset.id) ?? 0) > 0
      )
      .map(asset => {
        const costBasis = asset.quantity * asset.averageCost!;
        const currentValue = asset.quantity * asset.currentPrice;
        const allTimeNetDividends = allTimeNetEurByAsset.get(asset.id) ?? 0;
        const capitalGainAbsolute = currentValue - costBasis;
        const capitalGainPercentage = (capitalGainAbsolute / costBasis) * 100;
        // Use historical cost basis per payment (costPerShare snapshot stored at dividend creation,
        // YOC v3). Fallback to current averageCost for legacy records without costPerShare.
        // This prevents dilution: buying new shares after a dividend does not reduce past return %.
        const assetDividends = dividendsByAsset.get(asset.id) ?? [];
        const dividendReturnPercentage = assetDividends.reduce((sum, div) => {
          const effectiveCostPerShare = div.costPerShare ?? asset.averageCost!;
          const costBasisAtTime = div.quantity * effectiveCostPerShare;
          if (costBasisAtTime <= 0) return sum;
          return sum + (div.netAmountEur ?? div.netAmount) / costBasisAtTime * 100;
        }, 0);
        return {
          assetId: asset.id,
          assetTicker: asset.ticker,
          assetName: asset.name,
          quantity: asset.quantity,
          averageCost: asset.averageCost!,
          currentPrice: asset.currentPrice,
          costBasis,
          currentValue,
          allTimeNetDividends,
          capitalGainAbsolute,
          capitalGainPercentage,
          dividendReturnPercentage,
          totalReturnPercentage: capitalGainPercentage + dividendReturnPercentage,
        };
      })
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
    paidDividends.forEach(div => {
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
    paidDividends.forEach(div => {
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

    // Calculate average yield based on TTM (Trailing Twelve Months) dividends
    // DEPRECATED: Moved to Performance page as Current Yield (uses selected period, not fixed TTM)
    // Kept for backward compatibility - do not remove until all dependencies are verified
    let averageYield = 0;

    // 1. Calculate date 12 months ago
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

    // 2. Filter dividends from last 12 months
    const ttmDividends = allDividends.filter(div => {
      const exDate = toDate(div.exDate);
      return exDate >= twelveMonthsAgo;
    });

    // 3. Calculate total gross dividends TTM
    const ttmTotalGross = ttmDividends.reduce((sum, div) => sum + div.grossAmount, 0);

    // 4. Calculate value of assets that paid dividends in TTM period
    const assetIdsWithDividends = new Set(ttmDividends.map(div => div.assetId));
    const portfolioValueWithDividends = userAssets
      .filter(asset => assetIdsWithDividends.has(asset.id) && asset.quantity > 0)
      .reduce((sum, asset) => sum + (asset.currentPrice * asset.quantity), 0);

    // 5. Calculate yield only if portfolio value > 0
    if (portfolioValueWithDividends > 0 && ttmTotalGross > 0) {
      averageYield = (ttmTotalGross / portfolioValueWithDividends) * 100;
    }

    // Calculate Yield on Cost (YOC) for assets with cost basis
    let portfolioYieldOnCost: number | undefined;
    let totalCostBasis: number | undefined;
    let yieldOnCostAssets: YieldOnCostAsset[] | undefined;

    if (ttmDividends.length > 0) {
      // 1. Group TTM dividends by asset
      const ttmByAsset = new Map<string, number>();
      ttmDividends.forEach(div => {
        const current = ttmByAsset.get(div.assetId) || 0;
        ttmByAsset.set(div.assetId, current + div.grossAmount);
      });

      // 2. Calculate per-asset YOC for assets with cost basis
      const yocAssetsList: YieldOnCostAsset[] = [];

      userAssets.forEach(asset => {
        const ttmGross = ttmByAsset.get(asset.id);

        // Only include assets with: averageCost, quantity > 0, and TTM dividends
        if (
          asset.averageCost &&
          asset.averageCost > 0 &&
          asset.quantity > 0 &&
          ttmGross &&
          ttmGross > 0
        ) {
          const costBasis = asset.quantity * asset.averageCost;
          const currentValue = asset.quantity * asset.currentPrice;

          const yocPercentage = (ttmGross / costBasis) * 100;
          const currentYieldPercentage = currentValue > 0
            ? (ttmGross / currentValue) * 100
            : 0;
          const difference = yocPercentage - currentYieldPercentage;

          yocAssetsList.push({
            assetId: asset.id,
            assetTicker: asset.ticker,
            assetName: asset.name,
            quantity: asset.quantity,
            averageCost: asset.averageCost,
            currentPrice: asset.currentPrice,
            ttmGrossDividends: ttmGross,
            yocPercentage,
            currentYieldPercentage,
            difference,
          });
        }
      });

      // 3. Calculate portfolio-level YOC if we have valid assets
      if (yocAssetsList.length > 0) {
        yocAssetsList.sort((a, b) => b.yocPercentage - a.yocPercentage);

        const portfolioCostBasis = yocAssetsList.reduce(
          (sum, asset) => sum + (asset.quantity * asset.averageCost),
          0
        );
        const portfolioTtmDividends = yocAssetsList.reduce(
          (sum, asset) => sum + asset.ttmGrossDividends,
          0
        );

        if (portfolioCostBasis > 0) {
          portfolioYieldOnCost = (portfolioTtmDividends / portfolioCostBasis) * 100;
          totalCostBasis = portfolioCostBasis;
          yieldOnCostAssets = yocAssetsList;
        }
      }
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
    console.error('Error calculating dividend stats:', error);
    return NextResponse.json(
      { error: 'Failed to calculate dividend statistics', details: (error as Error).message },
      { status: 500 }
    );
  }
}
