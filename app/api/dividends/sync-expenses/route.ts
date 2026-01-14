import { NextRequest, NextResponse } from 'next/server';
import { syncDividendExpenses } from '@/lib/services/dividendIncomeService';
import { Dividend } from '@/types/dividend';

/**
 * POST /api/dividends/sync-expenses
 *
 * Bulk synchronize dividend entries with expense entries
 *
 * Use Case:
 *   - User enables dividend income tracking after creating dividends
 *   - User changes dividend income category settings
 *   - Manual reconciliation of dividend-expense linkage
 *
 * Request Body:
 *   {
 *     userId: string,
 *     dividends: Dividend[],          // Dividends to process
 *     categoryId: string,             // Expense category to use
 *     categoryName: string,
 *     subCategoryId?: string,         // Optional
 *     subCategoryName?: string        // Optional
 *   }
 *
 * Response:
 *   {
 *     success: boolean,
 *     result: {
 *       created: number,    // New expenses created
 *       updated: number,    // Existing expenses updated
 *       skipped: number     // Already synced
 *     }
 *   }
 *
 * Related:
 *   - dividendIncomeService.ts: Sync implementation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, dividends, categoryId, categoryName, subCategoryId, subCategoryName } = body;

    if (!userId || !dividends || !categoryId || !categoryName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await syncDividendExpenses(
      userId,
      dividends as Dividend[],
      categoryId,
      categoryName,
      subCategoryId,
      subCategoryName
    );

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Error in sync-expenses API:', error);
    return NextResponse.json(
      { error: 'Failed to sync dividend expenses' },
      { status: 500 }
    );
  }
}
