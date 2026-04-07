import { NextRequest, NextResponse } from 'next/server';
import {
  assertSameUser,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import {
  buildAssistantMonthContext,
  buildAssistantYearContext,
  buildAssistantYtdContext,
  buildAssistantHistoryContext,
} from '@/lib/services/assistantMonthContextService';

/**
 * GET /api/ai/assistant/context
 *
 * Reconstructs the numeric context bundle for a given period synchronously,
 * without streaming. Used to repopulate the context panel when opening an
 * existing analysis thread that has a pinned period but no active SSE stream.
 *
 * The server always rebuilds the bundle from source data rather than caching it
 * on the thread document — keeps the streaming and storage layers independent.
 *
 * Query params by mode:
 *   month_analysis: ?userId=&year=&month=
 *   year_analysis:  ?userId=&mode=year_analysis&year=
 *   ytd_analysis:   ?userId=&mode=ytd_analysis
 *   history_analysis: ?userId=&mode=history_analysis (reads startYear from settings)
 */
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const mode = searchParams.get('mode') ?? 'month_analysis';

    const authError = getApiAuthErrorResponse(assertSameUser(decodedToken, userId));
    if (authError) return authError;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    let bundle;

    if (mode === 'ytd_analysis') {
      bundle = await buildAssistantYtdContext(userId);
    } else if (mode === 'history_analysis') {
      // Read cashflowHistoryStartYear from settings; fall back to 5 years ago
      const { adminDb } = await import('@/lib/firebase/admin');
      const settingsSnap = await adminDb.collection('assetAllocationTargets').doc(userId).get();
      const startYear = settingsSnap.data()?.cashflowHistoryStartYear ?? new Date().getFullYear() - 5;
      bundle = await buildAssistantHistoryContext(userId, startYear);
    } else if (mode === 'year_analysis') {
      const yearParam = searchParams.get('year');
      if (!yearParam) {
        return NextResponse.json({ error: 'year is required for year_analysis' }, { status: 400 });
      }
      const year = parseInt(yearParam, 10);
      if (isNaN(year)) {
        return NextResponse.json({ error: 'year must be a valid integer' }, { status: 400 });
      }
      bundle = await buildAssistantYearContext(userId, year);
    } else {
      // Default: month_analysis
      const yearParam = searchParams.get('year');
      const monthParam = searchParams.get('month');
      if (!yearParam || !monthParam) {
        return NextResponse.json(
          { error: 'year and month are required for month_analysis' },
          { status: 400 }
        );
      }
      const year = parseInt(yearParam, 10);
      const month = parseInt(monthParam, 10);
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return NextResponse.json(
          { error: 'year and month must be valid integers (month 1–12)' },
          { status: 400 }
        );
      }
      bundle = await buildAssistantMonthContext(userId, { year, month });
    }

    return NextResponse.json({ bundle });
  } catch (error) {
    const authError = getApiAuthErrorResponse(error);
    if (authError) return authError;

    console.error('[assistant/context] GET failed:', error);
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 });
  }
}
