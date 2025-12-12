import { NextRequest, NextResponse } from 'next/server';
import { calculateDividendStats } from '@/lib/services/dividendService';

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

    // Calculate statistics
    const stats = await calculateDividendStats(userId, startDate, endDate);

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
