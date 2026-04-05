import { NextRequest, NextResponse } from 'next/server';
import {
  assertSameUser,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import {
  createAssistantThread,
  isAssistantStoreError,
  listAssistantThreads,
} from '@/lib/server/assistant/store';
import { AssistantCreateThreadInput } from '@/types/assistant';

export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = request.nextUrl.searchParams.get('userId');

    assertSameUser(decodedToken, userId);

    const threads = await listAssistantThreads(userId as string);
    return NextResponse.json({ threads });
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

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const body = (await request.json()) as AssistantCreateThreadInput;

    assertSameUser(decodedToken, body.userId);

    const thread = await createAssistantThread({
      userId: body.userId,
      mode: body.mode ?? 'chat',
      pinnedMonth: body.pinnedMonth ?? null,
    });

    return NextResponse.json({ thread });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (isAssistantStoreError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[API /ai/assistant/threads] POST error:', error);
    return NextResponse.json(
      { error: 'Impossibile creare il thread dell’assistente' },
      { status: 500 }
    );
  }
}
