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
import { resolveDividendIncomeCategory } from '@/lib/server/dividendUseCase';
import { DividendFormData } from '@/types/dividend';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { dividendDataSchema, parseOr400 } from '@/lib/server/validation';

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
    const decodedToken = await requireFirebaseAuth(request);
    const { dividendId } = await params;
    const body = await request.json();

    if (!body.updates || Object.keys(body.updates).length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      );
    }

    const updatesResult = parseOr400(dividendDataSchema.partial(), body.updates);
    if (!updatesResult.ok) return updatesResult.response;
    const updates = updatesResult.data as Partial<DividendFormData>;

    // Get existing dividend to check for linked expense
    const existingDividend = await getDividendById(dividendId);

    if (!existingDividend) {
      return NextResponse.json(
        { error: 'Dividend not found' },
        { status: 404 }
      );
    }

    await assertCanAccessAccount(decodedToken, existingDividend.userId);

    // Update dividend
    await updateDividend(dividendId, updates);

    // If dividend has linked expense, update it too
    if (existingDividend.expenseId) {
      try {
        // Get updated dividend data
        const updatedDividend = await getDividendById(dividendId);

        // The landing category, read server-side (the client readers are refused in a route).
        const landing = updatedDividend ? await resolveDividendIncomeCategory(updatedDividend.userId) : undefined;
        if (updatedDividend && landing) {
          await updateExpenseFromDividend(
            updatedDividend,
            existingDividend.expenseId,
            landing.categoryName,
            landing.subCategoryName
          );
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
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

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
    const decodedToken = await requireFirebaseAuth(request);
    const { dividendId } = await params;

    // Get dividend to check for linked expense
    const dividend = await getDividendById(dividendId);

    if (!dividend) {
      return NextResponse.json(
        { error: 'Dividend not found' },
        { status: 404 }
      );
    }

    await assertCanAccessAccount(decodedToken, dividend.userId);

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
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Error deleting dividend:', error);
    return NextResponse.json(
      { error: 'Failed to delete dividend', details: (error as Error).message },
      { status: 500 }
    );
  }
}
