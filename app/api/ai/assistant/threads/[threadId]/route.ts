import { NextRequest, NextResponse } from 'next/server';
import {
  assertSameUser,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import {
  getAssistantThreadDetail,
  isAssistantStoreError,
} from '@/lib/server/assistant/store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = request.nextUrl.searchParams.get('userId');

    assertSameUser(decodedToken, userId);

    const { threadId } = await params;
    const detail = await getAssistantThreadDetail(threadId, userId as string);

    return NextResponse.json(detail);
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (isAssistantStoreError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[API /ai/assistant/threads/[threadId]] GET error:', error);
    return NextResponse.json(
      { error: 'Impossibile recuperare il thread richiesto' },
      { status: 500 }
    );
  }
}
