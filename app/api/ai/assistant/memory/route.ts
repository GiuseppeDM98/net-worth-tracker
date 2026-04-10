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
  setAssistantGoalEvaluation,
  updateAssistantMemoryDocument,
} from '@/lib/server/assistant/store';
import {
  AssistantMemoryItem,
  AssistantMemorySuggestion,
  AssistantPreferences,
} from '@/types/assistant';

export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = request.nextUrl.searchParams.get('userId');

    assertSameUser(decodedToken, userId);

    const { adminDb } = await import('@/lib/firebase/admin');

    // Run memory fetch and dummy-snapshot check in parallel.
    // hasDummySnapshots drives conditional UI — the toggle is only shown when relevant.
    const [memory, dummySnap] = await Promise.all([
      getAssistantMemoryDocument(userId as string),
      adminDb
        .collection('monthly-snapshots')
        .where('userId', '==', userId)
        .where('isDummy', '==', true)
        .limit(1)
        .get(),
    ]);

    return NextResponse.json({ ...memory, hasDummySnapshots: !dummySnap.empty });
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
      suggestion?: Partial<AssistantMemorySuggestion> & Pick<AssistantMemorySuggestion, 'id' | 'itemId' | 'type' | 'status' | 'evidenceSummary' | 'evaluation'>;
      action?: 'acceptSuggestion' | 'ignoreSuggestion' | 'reactivateGoal';
      suggestionId?: string;
      itemId?: string;
    };

    assertSameUser(decodedToken, body.userId);

    let memory;

    if (body.action === 'acceptSuggestion') {
      if (!body.suggestionId || !body.itemId) {
        return NextResponse.json({ error: 'suggestionId e itemId sono obbligatori' }, { status: 400 });
      }

      const current = await getAssistantMemoryDocument(body.userId);
      const suggestion = current.suggestions.find((entry) => entry.id === body.suggestionId);
      const item = current.items.find((entry) => entry.id === body.itemId);

      if (!suggestion || !item) {
        return NextResponse.json({ error: 'Suggerimento o obiettivo non trovato' }, { status: 404 });
      }

      await setAssistantGoalEvaluation(body.userId, item.id, suggestion.evaluation);
      await updateAssistantMemoryDocument(body.userId, {
        item: {
          ...item,
          status: 'completed',
          completedAt: new Date(),
          evidenceSummary: suggestion.evidenceSummary,
          derivedFromContext: true,
        },
      });
      memory = await updateAssistantMemoryDocument(body.userId, {
        suggestion: {
          ...suggestion,
          status: 'accepted',
        },
      });
    } else if (body.action === 'ignoreSuggestion') {
      if (!body.suggestionId) {
        return NextResponse.json({ error: 'suggestionId obbligatorio' }, { status: 400 });
      }

      const current = await getAssistantMemoryDocument(body.userId);
      const suggestion = current.suggestions.find((entry) => entry.id === body.suggestionId);
      if (!suggestion) {
        return NextResponse.json({ error: 'Suggerimento non trovato' }, { status: 404 });
      }

      memory = await updateAssistantMemoryDocument(body.userId, {
        suggestion: {
          ...suggestion,
          status: 'ignored',
        },
      });
    } else if (body.action === 'reactivateGoal') {
      if (!body.itemId) {
        return NextResponse.json({ error: 'itemId obbligatorio' }, { status: 400 });
      }

      const current = await getAssistantMemoryDocument(body.userId);
      const item = current.items.find((entry) => entry.id === body.itemId);
      if (!item) {
        return NextResponse.json({ error: 'Obiettivo non trovato' }, { status: 404 });
      }

      memory = await updateAssistantMemoryDocument(body.userId, {
        item: {
          ...item,
          status: 'active',
          completedAt: undefined,
        },
      });
    } else {
      memory = await updateAssistantMemoryDocument(body.userId, {
        preferences: body.preferences,
        item: body.item,
        suggestion: body.suggestion,
      });
    }

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
