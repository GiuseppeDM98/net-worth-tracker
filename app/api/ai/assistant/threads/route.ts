import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { isAssistantStoreError, listAssistantThreads } from '@/lib/server/assistant/store';
import { startTiming } from '@/lib/server/serverTiming';
import { assistantThreadCursorSchema, parseOr400 } from '@/lib/server/validation';

// Threads are created server-side inside the stream route (it calls `createAssistantThread`
// directly when the request carries no `threadId`), so this resource is read-only: there is no
// POST handler by design. A client-side "create empty thread" flow would need one added back.

/**
 * GET /api/ai/assistant/threads?userId=<ownerId>[&after=<threadId>]
 *
 * One page of the owner's threads, most recent first: `{ threads, nextCursor }`, `nextCursor` being
 * the `after` of the next page and `null` on the last (PERF-10: the list was read whole). The
 * Conversazioni list pages through it with «Mostra altre» (`useAssistantThreads`). Answers with
 * `Server-Timing: auth, db, total`.
 */
export async function GET(request: NextRequest) {
  const timing = startTiming();
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = request.nextUrl.searchParams.get('userId');
    const afterParam = request.nextUrl.searchParams.get('after');

    await assertCanAccessAccount(decodedToken, userId);
    timing.mark('auth');

    let after: string | undefined;
    if (afterParam !== null) {
      const parsed = parseOr400(assistantThreadCursorSchema, afterParam);
      if (!parsed.ok) return parsed.response;
      after = parsed.data;
    }

    const page = await listAssistantThreads(userId as string, { after });
    timing.mark('db');
    return NextResponse.json(page, { headers: { 'Server-Timing': timing.toHeader() } });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (isAssistantStoreError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[API /ai/assistant/threads] GET error:', error);
    return NextResponse.json(
      { error: 'Impossibile recuperare i thread dell’assistente' },
      { status: 500 }
    );
  }
}
