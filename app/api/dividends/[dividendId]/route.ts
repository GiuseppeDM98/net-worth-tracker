import { NextRequest, NextResponse } from 'next/server';
import {
  getDividendById,
  updateDividend,
  deleteDividend,
} from '@/lib/services/dividendService';
import {
  updateExpenseFromDividend,
  deleteExpenseForDividend,
} from '@/lib/services/dividendIncomeService';
import { getCategoryById } from '@/lib/services/expenseCategoryService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { DividendFormData } from '@/types/dividend';

/**
 * PUT /api/dividends/[dividendId]
 *
 * Update dividend with automatic linked expense synchronization
 *
 * Request Body:
 *   {
 *     updates: Partial<DividendFormData>  // Fields to update
 *   }
 *
 * Expense Synchronization:
 *   If dividend has linked expense (expenseId exists):
 *     - Automatically updates corresponding expense entry
 *     - Synchronizes amount, date, and description
 *     - Non-blocking: expense update failure doesn't fail dividend update
 *
 * Response:
 *   {
 *     success: boolean,
 *     message: string
 *   }
 *
 * Related:
 *   - dividendIncomeService.ts: Expense synchronization logic
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ dividendId: string }> }
) {
  try {
    const { dividendId } = await params;
    const body = await request.json();
    const { updates } = body as { updates: Partial<DividendFormData> };

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      );
    }

    // Get existing dividend to check for linked expense
    const existingDividend = await getDividendById(dividendId);

    if (!existingDividend) {
      return NextResponse.json(
        { error: 'Dividend not found' },
        { status: 404 }
      );
    }

    // Update dividend
    await updateDividend(dividendId, updates);

    // If dividend has linked expense, update it too
    if (existingDividend.expenseId) {
      try {
        // Get updated dividend data
        const updatedDividend = await getDividendById(dividendId);

        if (updatedDividend) {
          // Get user settings for category info
          const settings = await getSettings(updatedDividend.userId);

          if (settings?.dividendIncomeCategoryId) {
            const category = await getCategoryById(settings.dividendIncomeCategoryId);

            if (category) {
              let subCategoryName: string | undefined;
              if (settings.dividendIncomeSubCategoryId) {
                const subCategory = category.subCategories.find(
                  (sub) => sub.id === settings.dividendIncomeSubCategoryId
                );
                subCategoryName = subCategory?.name;
              }

              await updateExpenseFromDividend(
                updatedDividend,
                existingDividend.expenseId,
                category.name,
                subCategoryName
              );
            }
          }
        }
      } catch (expenseError) {
        console.error('Error updating linked expense:', expenseError);
        // Don't fail the dividend update if expense update fails
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Dividend updated successfully',
    });
  } catch (error) {
    console.error('Error updating dividend:', error);
    return NextResponse.json(
      { error: 'Failed to update dividend', details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/dividends/[dividendId]
 *
 * Delete dividend with cascading linked expense deletion
 *
 * Cascade Logic:
 *   If dividend has linked expense (expenseId exists):
 *     - Deletes the linked expense first
 *     - Then deletes the dividend
 *     - Non-blocking: expense deletion failure doesn't prevent dividend deletion
 *
 * Response:
 *   {
 *     success: boolean,
 *     message: string
 *   }
 *
 * Related:
 *   - dividendIncomeService.ts: Expense deletion logic
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ dividendId: string }> }
) {
  try {
    const { dividendId } = await params;

    // Get dividend to check for linked expense
    const dividend = await getDividendById(dividendId);

    if (!dividend) {
      return NextResponse.json(
        { error: 'Dividend not found' },
        { status: 404 }
      );
    }

    // If dividend has linked expense, delete it first
    if (dividend.expenseId) {
      try {
        await deleteExpenseForDividend(dividendId, dividend.expenseId);
      } catch (expenseError) {
        console.error('Error deleting linked expense:', expenseError);
        // Continue with dividend deletion even if expense deletion fails
      }
    }

    // Delete dividend
    await deleteDividend(dividendId);

    return NextResponse.json({
      success: true,
      message: 'Dividend deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting dividend:', error);
    return NextResponse.json(
      { error: 'Failed to delete dividend', details: (error as Error).message },
      { status: 500 }
    );
  }
}
