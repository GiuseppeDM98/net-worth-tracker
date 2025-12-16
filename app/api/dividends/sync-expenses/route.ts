import { NextRequest, NextResponse } from 'next/server';
import { syncDividendExpenses } from '@/lib/services/dividendIncomeService';
import { Dividend } from '@/types/dividend';

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
