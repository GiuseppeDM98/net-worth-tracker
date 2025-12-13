import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import {
  calculateDividendStats,
  getUpcomingDividends,
  getAllDividends
} from '@/lib/services/dividendService';
import { adminDb } from '@/lib/firebase/admin';

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

    // Calculate period statistics (filtered or all-time)
    const periodStats = await calculateDividendStats(userId, startDate, endDate);

    // Calculate all-time statistics
    const allTimeStats = await calculateDividendStats(userId);

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
      quantity: doc.data().quantity || 0,
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

    // Calculate average yield (placeholder - would need asset data to calculate properly)
    const averageYield = 0;

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
