import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { scrapeDividendsByIsin } from '@/lib/services/borsaItalianaScraperService';
import { createDividend, isDuplicateDividend } from '@/lib/services/dividendService';
import { createExpenseFromDividend } from '@/lib/services/dividendIncomeService';
import { DividendFormData } from '@/types/dividend';
import { isDateOnOrAfter } from '@/lib/utils/dateHelpers';
import { Asset } from '@/types/assets';

/**
 * GET /api/cron/daily-dividend-processing
 *
 * Daily automated dividend processing cron job
 * Scheduled execution: 00:00 UTC via Vercel Cron
 *
 * Two-Phase Architecture:
 *   Phase 1: Dividend Discovery (Scraping)
 *     - Scrapes Borsa Italiana for dividend announcements
 *     - Creates dividend entries for all users with equity assets
 *     - 60-day lookback window to catch recent ex-dates
 *
 *   Phase 2: Expense Creation (Accounting)
 *     - Finds dividends with paymentDate = today
 *     - Creates cashflow expense entries for paid dividends
 *     - Requires user to have dividendIncomeCategoryId configured
 *
 * Security:
 *   - Requires CRON_SECRET via Authorization header
 *   - Uses Admin SDK for cross-user operations
 *
 * Error Handling:
 *   - Non-blocking: failures for one user/asset don't stop processing
 *   - All errors logged but not returned to client
 *   - Returns summary statistics for monitoring
 *
 * Related:
 *   - dividends/scrape/route.ts: Manual per-asset scraping
 *   - dividendIncomeService.ts: Expense creation logic
 *   - borsaItalianaScraperService.ts: Scraping implementation
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('Starting daily dividend processing cron job...');

    // Get all users
    const usersRef = adminDb.collection('users');
    const usersSnapshot = await usersRef.get();

    if (usersSnapshot.empty) {
      return NextResponse.json({
        success: true,
        message: 'No users found',
        processedCount: 0,
        errorCount: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // ==================== PHASE 1: AUTOMATIC DIVIDEND SCRAPING ====================
    console.log('Phase 1: Starting automatic dividend scraping for recent dividends...');

    let scrapedAssetsCount = 0;
    let scrapingErrorsCount = 0;
    let newDividendsCount = 0;

    // 60-day lookback window: balance between catching recent dividends
    // and avoiding excessive scraping of historical data
    // Rationale:
    //   - Most dividend announcements appear 30-60 days before payment
    //   - Covers quarterly dividends with typical 45-day ex-date to payment gap
    //   - Reduces scraping load vs. all-time historical scraping
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      try {
        // Get user's equity assets with ISIN
        const assetsRef = adminDb.collection('assets');
        const assetsQuery = assetsRef
          .where('userId', '==', userId)
          .where('assetClass', '==', 'equity');

        const assetsSnapshot = await assetsQuery.get();

        // Filter for assets with non-empty ISIN
        const assetsWithIsin = assetsSnapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date(),
          } as Asset))
          .filter((asset) => asset.isin && asset.isin.trim() !== '');

        if (assetsWithIsin.length === 0) {
          continue;
        }

        console.log(`User ${userId}: Found ${assetsWithIsin.length} equity assets with ISIN`);

        // Scrape dividends for each asset
        for (const asset of assetsWithIsin) {
          try {
            console.log(`Scraping dividends for ${asset.ticker} (ISIN: ${asset.isin}, Type: ${asset.type})`);

            const scrapedDividends = await scrapeDividendsByIsin(asset.isin!, asset.type);

            if (scrapedDividends.length === 0) {
              continue;
            }

            // Dividend Eligibility Filter (Two-Part Test)
            //
            // Part 1: 60-day recency check (div.exDate >= sixtyDaysAgo)
            //   Ensures we only import recent announcements, not full history
            //
            // Part 2: Asset ownership check (div.exDate >= asset.createdAt)
            //   Critical: Only track dividends for assets owned before/on ex-date
            //   Example: If you buy AAPL today, you're NOT eligible for dividends
            //   with ex-dates last week (you didn't own it then)
            //
            //   Financial concept: Ex-dividend date = ownership cutoff
            //   Own stock on ex-date → eligible for dividend
            //   Buy after ex-date → not eligible
            const relevantDividends = scrapedDividends.filter((div) => {
              return div.exDate >= sixtyDaysAgo && isDateOnOrAfter(div.exDate, asset.createdAt);
            });

            console.log(`Found ${scrapedDividends.length} total, ${relevantDividends.length} relevant dividends for ${asset.ticker}`);

            // Create dividend entries
            for (const scrapedDiv of relevantDividends) {
              try {
                // Check for duplicates
                const isDuplicate = await isDuplicateDividend(userId, asset.id, scrapedDiv.exDate);

                if (isDuplicate) {
                  continue;
                }

                // Calculate amounts
                const grossAmount = scrapedDiv.dividendPerShare * asset.quantity;
                // Italian capital gains withholding tax rate (26%)
                // Applied to dividend gross amounts for Italian tax residents
                // Reference: Italian Legislative Decree 461/1997, Art. 27
                const taxAmount = grossAmount * 0.26;
                const netAmount = grossAmount - taxAmount;

                // Create dividend data
                const dividendData: DividendFormData = {
                  assetId: asset.id,
                  exDate: scrapedDiv.exDate,
                  paymentDate: scrapedDiv.paymentDate,
                  dividendPerShare: scrapedDiv.dividendPerShare,
                  quantity: asset.quantity,
                  grossAmount,
                  taxAmount,
                  netAmount,
                  currency: scrapedDiv.currency,
                  dividendType: scrapedDiv.dividendType,
                  isAutoGenerated: true,
                };

                // Create dividend entry
                await createDividend(
                  userId,
                  dividendData,
                  asset.ticker,
                  asset.name,
                  asset.isin!,
                  true // isAutoGenerated
                );

                newDividendsCount++;
                console.log(`Created dividend: ${asset.ticker} - ${scrapedDiv.dividendPerShare} ${scrapedDiv.currency} on ${scrapedDiv.exDate.toLocaleDateString('it-IT')}`);
              } catch (dividendError) {
                console.error(`Error creating dividend for ${asset.ticker}:`, dividendError);
                // Continue with next dividend
              }
            }

            scrapedAssetsCount++;
          } catch (assetError) {
            console.error(`Error scraping dividends for asset ${asset.ticker}:`, assetError);
            scrapingErrorsCount++;
          }
        }
      } catch (userError) {
        console.error(`Error processing user ${userId} for dividend scraping:`, userError);
        scrapingErrorsCount++;
      }
    }

    console.log(`Phase 1 completed: Scraped ${scrapedAssetsCount} assets, created ${newDividendsCount} new dividends, ${scrapingErrorsCount} errors`);

    // ==================== PHASE 2: EXPENSE CREATION FOR PAID DIVIDENDS ====================
    console.log('Phase 2: Starting expense creation for paid dividends...');

    // ========== Phase 2: Date Range Setup ==========
    //
    // Goal: Find dividends with paymentDate exactly matching today
    //
    // Strategy: Create Firestore Timestamp range covering full day
    //   todayStart:  2024-01-15T00:00:00.000Z
    //   todayEnd:    2024-01-15T23:59:59.999Z
    //
    // This ensures we catch dividends regardless of time component
    // and process each dividend exactly once (yesterday's run won't catch it,
    // tomorrow's run won't catch it)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const todayStartTimestamp = Timestamp.fromDate(today);
    const todayEndTimestamp = Timestamp.fromDate(todayEnd);

    let processedCount = 0;
    let errorCount = 0;
    const processedDividends: any[] = [];
    const errors: any[] = [];

    // Process each user
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      try {
        // Check if user has configured dividend income tracking
        //
        // User settings (stored in assetAllocationTargets collection):
        //   - dividendIncomeCategoryId: Which expense category to use
        //   - dividendIncomeSubCategoryId: Optional subcategory
        //
        // Why stored in assetAllocationTargets?
        //   - Historical: This was the first user settings collection
        //   - Contains other portfolio configuration (target allocations)
        //   - TODO: Consider migrating to dedicated userSettings collection
        //
        // If not configured: Skip expense creation (dividends still tracked)
        const settingsRef = adminDb.collection('assetAllocationTargets').doc(userId);
        const settingsDoc = await settingsRef.get();

        if (!settingsDoc.exists) {
          console.log(`No settings found for user ${userId}, skipping`);
          continue;
        }

        const settings = settingsDoc.data();
        const dividendIncomeCategoryId = settings?.dividendIncomeCategoryId;

        if (!dividendIncomeCategoryId) {
          console.log(`No dividend income category configured for user ${userId}, skipping`);
          continue;
        }

        // Get category details
        const categoryRef = adminDb.collection('expenseCategories').doc(dividendIncomeCategoryId);
        const categoryDoc = await categoryRef.get();

        if (!categoryDoc.exists) {
          console.log(`Category ${dividendIncomeCategoryId} not found for user ${userId}, skipping`);
          continue;
        }

        const category = categoryDoc.data();
        const categoryName = category?.name || 'Dividendi';

        // Get subcategory details if configured
        let subCategoryName: string | undefined;
        if (settings.dividendIncomeSubCategoryId) {
          const subCategories = category?.subCategories || [];
          const subCategory = subCategories.find(
            (sub: any) => sub.id === settings.dividendIncomeSubCategoryId
          );
          if (subCategory) {
            subCategoryName = subCategory.name;
          }
        }

        // Query dividends with payment date = today AND no linked expense
        const dividendsRef = adminDb.collection('dividends');
        const dividendsQuery = dividendsRef
          .where('userId', '==', userId)
          .where('paymentDate', '>=', todayStartTimestamp)
          .where('paymentDate', '<=', todayEndTimestamp);

        const dividendsSnapshot = await dividendsQuery.get();

        if (dividendsSnapshot.empty) {
          console.log(`No dividends due today for user ${userId}`);
          continue;
        }

        console.log(`Found ${dividendsSnapshot.size} dividends due today for user ${userId}`);

        // Process each dividend
        for (const dividendDoc of dividendsSnapshot.docs) {
          const dividend = dividendDoc.data();
          const dividendId = dividendDoc.id;

          // Idempotency check: Skip if expense already created
          //
          // Prevents duplicate expense creation if:
          //   - Cron job runs multiple times on same day (Vercel retry)
          //   - User manually created expense via UI
          //   - Previous run partially failed and is being retried
          //
          // The expenseId field acts as a processing flag
          if (dividend.expenseId) {
            console.log(`Dividend ${dividendId} already has linked expense, skipping`);
            continue;
          }

          try {
            // Transform raw Firestore document to typed Dividend object
            //
            // Required because Admin SDK returns Firestore-native types:
            //   - Timestamp objects (not Date)
            //   - DocumentReference (not string IDs)
            //   - Undefined for missing fields (not null)
            //
            // The .toDate() calls convert Firestore Timestamp → JavaScript Date
            // so dividendIncomeService can work with standard Date objects
            const dividendData = {
              id: dividendId,
              userId,
              assetId: dividend.assetId,
              assetTicker: dividend.assetTicker,
              assetName: dividend.assetName,
              isin: dividend.isin,
              exDate: dividend.exDate?.toDate(),
              paymentDate: dividend.paymentDate?.toDate(),
              dividendPerShare: dividend.dividendPerShare,
              quantity: dividend.quantity,
              grossAmount: dividend.grossAmount,
              taxAmount: dividend.taxAmount,
              netAmount: dividend.netAmount,
              currency: dividend.currency,
              dividendType: dividend.dividendType,
              grossAmountEur: dividend.grossAmountEur,
              taxAmountEur: dividend.taxAmountEur,
              netAmountEur: dividend.netAmountEur,
              exchangeRate: dividend.exchangeRate,
              notes: dividend.notes,
              isAutoGenerated: dividend.isAutoGenerated,
              createdAt: dividend.createdAt?.toDate(),
              updatedAt: dividend.updatedAt?.toDate(),
            };

            // Use dividendIncomeService for EUR-aware expense creation
            const expenseId = await createExpenseFromDividend(
              dividendData,
              dividendIncomeCategoryId,
              categoryName,
              settings.dividendIncomeSubCategoryId,
              subCategoryName
            );

            processedCount++;
            processedDividends.push({
              userId,
              dividendId,
              expenseId,
              amount: dividendData.netAmountEur || dividendData.netAmount, // Show EUR if available
              asset: dividend.assetTicker,
            });

            console.log(`Created expense ${expenseId} for dividend ${dividendId} (${dividend.assetTicker})`);
          } catch (dividendError) {
            console.error(`Error processing dividend ${dividendId}:`, dividendError);
            errorCount++;
            errors.push({
              userId,
              dividendId,
              error: (dividendError as Error).message,
            });
          }
        }
      } catch (userError) {
        console.error(`Error processing user ${userId}:`, userError);
        errorCount++;
        errors.push({
          userId,
          error: (userError as Error).message,
        });
      }
    }

    console.log(`Daily dividend processing completed: ${processedCount} expenses created, ${errorCount} errors`);
    console.log(`Total summary: ${scrapedAssetsCount} assets scraped, ${newDividendsCount} new dividends, ${processedCount} expense entries`);

    return NextResponse.json({
      success: true,
      message: 'Daily dividend processing job completed',
      timestamp: new Date().toISOString(),
      scraping: {
        assetsScraped: scrapedAssetsCount,
        newDividends: newDividendsCount,
        errors: scrapingErrorsCount,
      },
      expenseCreation: {
        processedCount,
        errorCount,
        processedDividends,
        errors,
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
