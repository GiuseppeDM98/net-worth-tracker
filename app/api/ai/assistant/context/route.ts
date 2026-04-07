import { NextRequest, NextResponse } from 'next/server';
import {
  assertSameUser,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { buildAssistantMonthContext } from '@/lib/services/assistantMonthContextService';

/**
 * GET /api/ai/assistant/context?userId=&year=&month=
 *
 * Reconstructs the numeric context bundle for a given month synchronously,
 * without streaming. Used to repopulate the context panel when opening an
 * existing month_analysis thread that has a pinnedMonth but no active SSE stream.
 *
 * The server always rebuilds the bundle from source data rather than caching it
 * on the thread document — keeps the streaming and storage layers independent.
 */
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    const authError = getApiAuthErrorResponse(assertSameUser(decodedToken, userId));
    if (authError) return authError;

    if (!userId || !yearParam || !monthParam) {
      return NextResponse.json(
        { error: 'userId, year, and month are required' },
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

    const bundle = await buildAssistantMonthContext(userId, { year, month });
    return NextResponse.json({ bundle });
  } catch (error) {
    const authError = getApiAuthErrorResponse(error);
    if (authError) return authError;

    console.error('[assistant/context] GET failed:', error);
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 });
  }
}
