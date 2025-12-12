import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * GET /api/cron/daily-dividend-processing
 * Vercel cron job that processes dividends with payment date = today
 * Creates expense entries for paid dividends if user has configured dividend income category
 * Runs daily at 00:00 UTC
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

    // Calculate today's date range (00:00 to 23:59)
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
        // Get user settings
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

          // Skip if already has linked expense
          if (dividend.expenseId) {
            console.log(`Dividend ${dividendId} already has linked expense, skipping`);
            continue;
          }

          try {
            // Create expense entry
            const expensesRef = adminDb.collection('expenses');
            const now = Timestamp.now();

            const expenseData = {
              userId,
              type: 'income',
              categoryId: dividendIncomeCategoryId,
              categoryName,
              subCategoryId: settings.dividendIncomeSubCategoryId || null,
              subCategoryName: subCategoryName || null,
              amount: dividend.netAmount, // Positive for income
              currency: dividend.currency,
              date: dividend.paymentDate,
              notes: `Dividendo ${dividend.assetTicker} - ${dividend.assetName}${
                dividend.notes ? ` | ${dividend.notes}` : ''
              }`,
              createdAt: now,
              updatedAt: now,
            };

            const expenseRef = await expensesRef.add(expenseData);

            // Update dividend with expense reference
            await dividendDoc.ref.update({
              expenseId: expenseRef.id,
              updatedAt: now,
            });

            processedCount++;
            processedDividends.push({
              userId,
              dividendId,
              expenseId: expenseRef.id,
              amount: dividend.netAmount,
              asset: dividend.assetTicker,
            });

            console.log(`Created expense ${expenseRef.id} for dividend ${dividendId} (${dividend.assetTicker})`);
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

    console.log(`Daily dividend processing completed: ${processedCount} processed, ${errorCount} errors`);

    return NextResponse.json({
      success: true,
      message: 'Daily dividend processing job completed',
      timestamp: new Date().toISOString(),
      processedCount,
      errorCount,
      processedDividends,
      errors,
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
