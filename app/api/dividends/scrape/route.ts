import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Asset } from '@/types/assets';
import { ExpenseCategory } from '@/types/expenses';
import {
  createDividend,
  isDuplicateDividend,
  getDividendById,
} from '@/lib/services/dividendService';
import { scrapeDividendsByIsin } from '@/lib/services/borsaItalianaScraperService';
import { createExpenseFromDividend } from '@/lib/services/dividendIncomeService';
import { DividendFormData } from '@/types/dividend';
import { toDate } from '@/lib/utils/dateHelpers';
import { isDividendEligible, resolveDividendFloor } from '@/lib/utils/dividendEligibility';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';

/**
 * POST /api/dividends/scrape
 * Body: { userId, assetId }
 * Scrapes dividend data from Borsa Italiana and creates dividend entries
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const body = await request.json();
    const { userId, assetId } = body as {
      userId: string;
      assetId: string;
    };

    await assertCanAccessAccount(decodedToken, userId);

    // Validate required fields
    if (!userId || !assetId) {
      return NextResponse.json(
        { error: 'userId and assetId are required' },
        { status: 400 }
      );
    }

    // Fetch asset using admin SDK and verify ISIN exists
    const assetDoc = await adminDb.collection('assets').doc(assetId).get();

    if (!assetDoc.exists) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    const assetData = assetDoc.data();
    const asset: Asset = {
      id: assetDoc.id,
      ...assetData,
      lastPriceUpdate: assetData?.lastPriceUpdate?.toDate() || new Date(),
      createdAt: assetData?.createdAt?.toDate() || new Date(),
      updatedAt: assetData?.updatedAt?.toDate() || new Date(),
      // The ledger's first real BUY, when there is one: the floor under a scraped dividend.
      holdingStartDate: assetData?.holdingStartDate?.toDate(),
    } as Asset;

    // Verify asset belongs to user
    if (asset.userId !== userId) {
      return NextResponse.json(
        { error: 'Asset does not belong to user' },
        { status: 403 }
      );
    }

    if (!asset.isin) {
      return NextResponse.json(
        { error: 'Asset does not have an ISIN code. Please add ISIN to enable scraping.' },
        { status: 400 }
      );
    }

    // Scrape dividend data
    console.log(`Scraping dividends for asset ${asset.ticker} (ISIN: ${asset.isin}, Type: ${asset.type})`);
    const scrapedDividends = await scrapeDividendsByIsin(asset.isin, asset.type);

    if (scrapedDividends.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No dividends found for this asset',
        scraped: 0,
        created: 0,
        skipped: 0,
      });
    }

    console.log(`Found ${scrapedDividends.length} dividends from Borsa Italiana`);

    // Only the dividends the user could have received: ex-date on or after the asset's floor
    // (holding start from the ledger, else the creation date — lib/utils/dividendEligibility.ts).
    // What falls under it is COUNTED and returned with the floor, so the tab can say why a
    // history-rich instrument produced nothing and how to recover (record the purchase with
    // its real date); a silent filter read as «no dividends exist» until 2026-09-13.
    const floor = resolveDividendFloor(asset);
    const relevantDividends = scrapedDividends.filter((div) => isDividendEligible(div.exDate, asset));

    const filteredOut = scrapedDividends.length - relevantDividends.length;
    if (filteredOut > 0) {
      console.log(
        `Filtered out ${filteredOut} dividends with ex-date before the asset's floor (${floor.source}: ${toDate(floor.date).toLocaleDateString('it-IT')})`
      );
    }

    console.log(`Processing ${relevantDividends.length} relevant dividends`);

    // Get user settings for expense creation using admin SDK
    const settingsDoc = await adminDb.collection('assetAllocationTargets').doc(userId).get();
    const settings = settingsDoc.exists ? settingsDoc.data() : null;
    let categoryInfo: { categoryId: string; categoryName: string; subCategoryId?: string; subCategoryName?: string } | null = null;

    if (settings?.dividendIncomeCategoryId) {
      // Get category using admin SDK
      const categoryDoc = await adminDb.collection('expenseCategories').doc(settings.dividendIncomeCategoryId).get();
      if (categoryDoc.exists) {
        const category = categoryDoc.data() as ExpenseCategory;
        categoryInfo = {
          categoryId: settings.dividendIncomeCategoryId,
          categoryName: category.name,
          subCategoryId: settings.dividendIncomeSubCategoryId,
        };

        if (settings.dividendIncomeSubCategoryId) {
          const subCategory = category.subCategories?.find(
            (sub) => sub.id === settings.dividendIncomeSubCategoryId
          );
          if (subCategory) {
            categoryInfo.subCategoryName = subCategory.name;
          }
        }
      }
    }

    // Filter and create dividends
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let created = 0;
    let skipped = 0;
    const createdIds: string[] = [];

    for (const scrapedDiv of relevantDividends) {
      try {
        // Check for duplicates
        const isDuplicate = await isDuplicateDividend(userId, assetId, scrapedDiv.exDate);

        if (isDuplicate) {
          console.log(`Skipping duplicate dividend with ex-date: ${scrapedDiv.exDate.toLocaleDateString('it-IT')}`);
          skipped++;
          continue;
        }

        // Calculate amounts (assume user holds current quantity)
        const grossAmount = scrapedDiv.dividendPerShare * asset.quantity;
        const taxAmount = grossAmount * 0.26; // Italian withholding tax (26%)
        const netAmount = grossAmount - taxAmount;

        // Create dividend data
        const dividendData: DividendFormData = {
          assetId,
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
          // Snapshot of current averageCost — best approximation for historical scrapes
          costPerShare: asset.averageCost,
        };

        // Create dividend entry
        const dividendId = await createDividend(
          userId,
          dividendData,
          asset.ticker,
          asset.name,
          asset.isin,
          true // isAutoGenerated
        );

        createdIds.push(dividendId);
        created++;

        console.log(`Created dividend: ${scrapedDiv.dividendType} - ${scrapedDiv.dividendPerShare} ${scrapedDiv.currency} on ${scrapedDiv.paymentDate.toLocaleDateString('it-IT')}`);

        // Create expense entry if payment date is in the past and category is configured
        if (scrapedDiv.paymentDate <= today && categoryInfo) {
          try {
            const dividend = await getDividendById(dividendId);
            if (dividend) {
              await createExpenseFromDividend(
                dividend,
                categoryInfo.categoryId,
                categoryInfo.categoryName,
                categoryInfo.subCategoryId,
                categoryInfo.subCategoryName
              );
              console.log(`Created expense entry for dividend ${dividendId}`);
            }
          } catch (expenseError) {
            console.error(`Error creating expense for dividend ${dividendId}:`, expenseError);
            // Don't fail the scraping if expense creation fails
          }
        }
      } catch (error) {
        console.error('Error creating dividend:', error);
        // Continue processing other dividends
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully scraped and imported dividends for ${asset.ticker}`,
      scraped: scrapedDividends.length,
      filtered: filteredOut,
      floorDate: toDate(floor.date).toISOString(),
      floorSource: floor.source,
      created,
      skipped,
      createdIds,
    });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Error scraping dividends:', error);
    return NextResponse.json(
      { error: 'Failed to scrape dividends', details: (error as Error).message },
      { status: 500 }
    );
  }
}
