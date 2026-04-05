import { NextRequest, NextResponse } from 'next/server';
import {
  assertSameUser,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import {
  deleteAssistantMemoryDocument,
  getAssistantMemoryDocument,
  isAssistantStoreError,
  updateAssistantMemoryDocument,
} from '@/lib/server/assistant/store';
import { AssistantMemoryItem, AssistantPreferences } from '@/types/assistant';

export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = request.nextUrl.searchParams.get('userId');

    assertSameUser(decodedToken, userId);

    const memory = await getAssistantMemoryDocument(userId as string);
    return NextResponse.json(memory);
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (isAssistantStoreError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[API /ai/assistant/memory] GET error:', error);
    return NextResponse.json(
      { error: 'Impossibile recuperare memoria e preferenze dell’assistente' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const body = (await request.json()) as {
      userId: string;
      preferences?: Partial<AssistantPreferences>;
      item?: Partial<AssistantMemoryItem> & Pick<AssistantMemoryItem, 'id' | 'text' | 'category'>;
    };

    assertSameUser(decodedToken, body.userId);

    const memory = await updateAssistantMemoryDocument(body.userId, {
      preferences: body.preferences,
      item: body.item,
    });

    return NextResponse.json(memory);
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (isAssistantStoreError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[API /ai/assistant/memory] PATCH error:', error);
    return NextResponse.json(
      { error: 'Impossibile aggiornare memoria e preferenze dell’assistente' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const body = (await request.json()) as {
      userId: string;
      itemId?: string;
      resetAll?: boolean;
    };

    assertSameUser(decodedToken, body.userId);

    const memory = await deleteAssistantMemoryDocument(body.userId, {
      itemId: body.itemId,
      resetAll: body.resetAll,
    });

    return NextResponse.json(memory);
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (isAssistantStoreError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[API /ai/assistant/memory] DELETE error:', error);
    return NextResponse.json(
      { error: 'Impossibile eliminare dati dalla memoria dell’assistente' },
      { status: 500 }
    );
  }
}
