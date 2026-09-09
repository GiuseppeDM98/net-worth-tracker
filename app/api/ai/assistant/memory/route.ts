import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import {
  computeHasDummySnapshots,
  deleteAssistantMemoryDocument,
  getAssistantMemoryDocument,
  isAssistantStoreError,
  setAssistantGoalEvaluation,
  updateAssistantMemoryDocument,
} from '@/lib/server/assistant/store';
import { extractStructuredGoalFromText } from '@/lib/server/assistant/memoryExtraction';
import {
  AssistantMemoryItem,
  AssistantMemorySuggestion,
  AssistantPreferences,
} from '@/types/assistant';

type AssistantMemoryItemPatch = Partial<AssistantMemoryItem> &
  Pick<AssistantMemoryItem, 'id' | 'text' | 'category'>;

/**
 * Gives a hand-written goal the same machine-readable structure a goal learned in
 * chat gets, using the same Haiku tool call on a single item. Without this, goals
 * typed into the memory panel were never auto-trackable — the panel sends only
 * id/text/category/status.
 *
 * Runs on creation, on a text edit, and on a goal that has no structure yet (so a
 * transient API failure repairs itself at the next panel action). It deliberately
 * does NOT run when only the status changed: archiving a goal must not spend a
 * model call, nor rewrite a structure the user never touched.
 *
 * A failed or unconfigured call leaves an edited goal WITHOUT a structure rather
 * than keeping the previous one: a stale structure would silently measure a target
 * the user no longer has, while an unstructured goal announces itself as
 * "non tracciabile automaticamente" in the panel.
 */
async function withStructuredGoal(
  item: AssistantMemoryItemPatch,
  existingItems: AssistantMemoryItem[]
): Promise<AssistantMemoryItemPatch> {
  if (item.category !== 'goal' || item.structuredGoal) {
    return item;
  }

  const existing = existingItems.find((entry) => entry.id === item.id);
  const needsStructuring = !existing || existing.text !== item.text || !existing.structuredGoal;
  if (!needsStructuring) {
    return { ...item, structuredGoal: existing.structuredGoal };
  }

  // Without a key there is nothing to preserve either: the goal is new, or its
  // text changed, or it never had a structure.
  if (!process.env.ANTHROPIC_API_KEY) {
    return item;
  }

  try {
    // Lazy import: a module-level `new Anthropic()` breaks test environments
    // where ANTHROPIC_API_KEY is absent.
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const structuredGoal = await extractStructuredGoalFromText(item.text, anthropicClient);
    return { ...item, structuredGoal };
  } catch (error) {
    // Non-fatal: the goal is still saved, just not auto-trackable
    console.error('[API /ai/assistant/memory] goal structuring failed:', error);
    return item;
  }
}

export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = request.nextUrl.searchParams.get('userId');

    await assertCanAccessAccount(decodedToken, userId);

    // Run memory fetch and dummy-snapshot check in parallel.
    // hasDummySnapshots drives conditional UI — the toggle is only shown when relevant.
    const [memory, hasDummySnapshots] = await Promise.all([
      getAssistantMemoryDocument(userId as string),
      computeHasDummySnapshots(userId as string),
    ]);

    return NextResponse.json({ ...memory, hasDummySnapshots });
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
      item?: AssistantMemoryItemPatch;
      suggestion?: Partial<AssistantMemorySuggestion> & Pick<AssistantMemorySuggestion, 'id' | 'itemId' | 'type' | 'status' | 'evidenceSummary' | 'evaluation'>;
      action?: 'acceptSuggestion' | 'ignoreSuggestion' | 'reactivateGoal';
      suggestionId?: string;
      itemId?: string;
    };

    await assertCanAccessAccount(decodedToken, body.userId);

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
      // The stored items are needed only to decide whether the goal must be
      // (re)structured — a status-only patch must not spend a model call.
      const currentItems = body.item?.category === 'goal'
        ? (await getAssistantMemoryDocument(body.userId)).items
        : [];

      memory = await updateAssistantMemoryDocument(body.userId, {
        preferences: body.preferences,
        item: body.item ? await withStructuredGoal(body.item, currentItems) : undefined,
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

    await assertCanAccessAccount(decodedToken, body.userId);

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
