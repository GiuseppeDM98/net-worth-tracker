import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  runDividendScraping,
  runExpenseCreation,
  runNextCouponScheduling,
} from '@/lib/server/dividendProcessor';

/**
 * GET /api/cron/daily-dividend-processing
 *
 * Daily automated dividend processing cron job
 * Scheduled execution: 00:00 UTC via Vercel Cron
 *
 * Three-Phase Architecture (see dividendProcessor.ts for implementation):
 *   Phase 1: Dividend Discovery — scrapes Borsa Italiana, 60-day lookback
 *   Phase 2: Expense Creation  — creates cashflow entries for dividends paid today
 *   Phase 3: Coupon Scheduling — schedules next coupon for bonds paid today
 *
 * Security: requires CRON_SECRET via Authorization header
 * Error handling: non-blocking per-user; returns summary statistics for monitoring
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting daily dividend processing cron job...');

    const usersSnapshot = await adminDb.collection('users').get();

    if (usersSnapshot.empty) {
      return NextResponse.json({
        success: true,
        message: 'No users found',
        processedCount: 0,
        errorCount: 0,
        timestamp: new Date().toISOString(),
      });
    }

    const users = usersSnapshot.docs;

    // Phase 1: Scrape recent dividends (60-day lookback)
    console.log('Phase 1: Starting automatic dividend scraping...');
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const scrapingResult = await runDividendScraping(users, sixtyDaysAgo);
    console.log(`Phase 1 completed: Scraped ${scrapingResult.assetsScraped} assets, created ${scrapingResult.newDividends} new dividends, ${scrapingResult.errors} errors`);

    // Phase 2: Create cashflow expenses for dividends paid today
    console.log('Phase 2: Starting expense creation for paid dividends...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const todayStart = Timestamp.fromDate(today);
    const todayEndTimestamp = Timestamp.fromDate(todayEnd);

    const expenseResult = await runExpenseCreation(users, todayStart, todayEndTimestamp);
    console.log(`Phase 2 completed: ${expenseResult.processedCount} expenses created, ${expenseResult.errorCount} errors`);

    // Phase 3: Schedule next coupon for bonds paid today
    console.log('Phase 3: Scheduling next coupons for bonds paid today...');
    const couponResult = await runNextCouponScheduling(users, todayStart, todayEndTimestamp);
    console.log(`Phase 3 completed: ${couponResult.scheduled} next coupons scheduled, ${couponResult.skipped} skipped, ${couponResult.errors} errors`);

    console.log(`Total summary: ${scrapingResult.assetsScraped} assets scraped, ${scrapingResult.newDividends} new dividends, ${expenseResult.processedCount} expense entries`);

    return NextResponse.json({
      success: true,
      message: 'Daily dividend processing job completed',
      timestamp: new Date().toISOString(),
      scraping: {
        assetsScraped: scrapingResult.assetsScraped,
        newDividends: scrapingResult.newDividends,
        errors: scrapingResult.errors,
      },
      expenseCreation: {
        processedCount: expenseResult.processedCount,
        errorCount: expenseResult.errorCount,
        processedDividends: expenseResult.processedDividends,
        errors: expenseResult.errors,
      },
      couponScheduling: {
        scheduled: couponResult.scheduled,
        skipped: couponResult.skipped,
        errors: couponResult.errors,
      },
    });
  } catch (error) {
    console.error('Error in daily dividend processing cron job:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to execute daily dividend processing job',
        details: (error as Error).message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
