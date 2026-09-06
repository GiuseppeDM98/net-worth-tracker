import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { AssistantMonthContextBundle } from '@/types/assistant';
import type { streamAssistantResponse } from '@/lib/server/assistant/anthropicStream';

const {
  verifyIdTokenMock,
  buildAssistantMonthContextMock,
  buildAssistantYearContextMock,
  buildAssistantYtdContextMock,
  buildAssistantHistoryContextMock,
  listAssistantThreadsMock,
  createAssistantThreadMock,
  getAssistantThreadDetailMock,
  getAssistantThreadMock,
  getAssistantMemoryDocumentMock,
  updateAssistantMemoryDocumentMock,
  applyAssistantMemoryMutationsMock,
  deleteAssistantMemoryDocumentMock,
  setAssistantGoalEvaluationMock,
  appendAssistantMessageMock,
  updateAssistantThreadMetadataMock,
  streamAssistantResponseMock,
  extractMemoryCandidatesMock,
  extractStructuredGoalFromTextMock,
  accountAccessDocGetMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  buildAssistantMonthContextMock: vi.fn(),
  buildAssistantYearContextMock: vi.fn(),
  buildAssistantYtdContextMock: vi.fn(),
  buildAssistantHistoryContextMock: vi.fn(),
  listAssistantThreadsMock: vi.fn(),
  createAssistantThreadMock: vi.fn(),
  getAssistantThreadDetailMock: vi.fn(),
  getAssistantThreadMock: vi.fn(),
  getAssistantMemoryDocumentMock: vi.fn(),
  updateAssistantMemoryDocumentMock: vi.fn(),
  applyAssistantMemoryMutationsMock: vi.fn(),
  deleteAssistantMemoryDocumentMock: vi.fn(),
  setAssistantGoalEvaluationMock: vi.fn(),
  appendAssistantMessageMock: vi.fn(),
  updateAssistantThreadMetadataMock: vi.fn(),
  streamAssistantResponseMock: vi.fn(),
  extractMemoryCandidatesMock: vi.fn(),
  extractStructuredGoalFromTextMock: vi.fn(),
  accountAccessDocGetMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));

// Allow all requests — rate limiting is unit-tested separately in rateLimit.test.ts
vi.mock('@/lib/server/rateLimit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: verifyIdTokenMock,
  },
  adminDb: {
    collection: vi.fn((name: string) => {
      // Delegated-access lookup performed by assertCanAccessAccount when the
      // caller's uid differs from the requested owner.
      if (name === 'account-access') {
        return { doc: vi.fn(() => ({ get: accountAccessDocGetMock })) };
      }
      throw new Error(`Unexpected collection: ${name}`);
    }),
  },
}));

vi.mock('@/lib/services/assistantMonthContextService', () => ({
  buildAssistantMonthContext: buildAssistantMonthContextMock,
  buildAssistantYearContext: buildAssistantYearContextMock,
  buildAssistantYtdContext: buildAssistantYtdContextMock,
  buildAssistantHistoryContext: buildAssistantHistoryContextMock,
}));

vi.mock('@/lib/server/assistant/store', () => ({
  listAssistantThreads: listAssistantThreadsMock,
  createAssistantThread: createAssistantThreadMock,
  getAssistantThreadDetail: getAssistantThreadDetailMock,
  getAssistantThread: getAssistantThreadMock,
  getAssistantMemoryDocument: getAssistantMemoryDocumentMock,
  updateAssistantMemoryDocument: updateAssistantMemoryDocumentMock,
  applyAssistantMemoryMutations: applyAssistantMemoryMutationsMock,
  deleteAssistantMemoryDocument: deleteAssistantMemoryDocumentMock,
  setAssistantGoalEvaluation: setAssistantGoalEvaluationMock,
  appendAssistantMessage: appendAssistantMessageMock,
  updateAssistantThreadMetadata: updateAssistantThreadMetadataMock,
  buildThreadTitleFromPrompt: vi.fn(() => 'Titolo server'),
  isAssistantStoreError: vi.fn(() => false),
}));

vi.mock('@/lib/server/assistant/anthropicStream', () => ({
  streamAssistantResponse: streamAssistantResponseMock,
}));

// Keeps the fire-and-forget memory extraction off the network, and lets the goal
// structuring path of PATCH be asserted without a real Haiku call.
vi.mock('@/lib/server/assistant/memoryExtraction', () => ({
  extractMemoryCandidates: extractMemoryCandidatesMock,
  extractStructuredGoalFromText: extractStructuredGoalFromTextMock,
  dedupeMemoryItems: vi.fn((candidates: unknown[]) => candidates),
}));

import { GET as getThreadsRoute } from '@/app/api/ai/assistant/threads/route';
import { GET as getThreadRoute } from '@/app/api/ai/assistant/threads/[threadId]/route';
import {
  GET as getMemoryRoute,
  PATCH as patchMemoryRoute,
  DELETE as deleteMemoryRoute,
} from '@/app/api/ai/assistant/memory/route';
import { POST as streamRoute } from '@/app/api/ai/assistant/stream/route';

function createJsonRequest(
  url: string,
  {
    method = 'GET',
    body,
    headers,
  }: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('Assistant private API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';

    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    // Default: no delegated-access grant, so cross-account calls are denied (403).
    accountAccessDocGetMock.mockResolvedValue({ exists: false, data: () => undefined });
    // `satisfies` is load-bearing: the mock is an untyped vi.fn(), so without it a
    // renamed or dropped bundle field leaves this fixture green while it no longer
    // resembles what the route actually receives.
    buildAssistantMonthContextMock.mockResolvedValue({
      selector: { year: 2026, month: 3 },
      currentSnapshot: null,
      previousSnapshot: null,
      cashflow: {
        totalIncome: 0,
        totalExpenses: 0,
        totalDividends: 0,
        netCashFlow: 0,
        transactionCount: 0,
        expenseTransactionCount: 0,
      },
      netWorth: {
        start: null,
        end: null,
        delta: null,
        deltaPct: null,
      },
      allocationChanges: [],
      expensesByCategory: [],
      incomeByCategory: [],
      expensesByType: [],
      topIndividualExpenses: [],
      bySubCategoryAllocation: {},
      targetAllocation: null,
      targetAllocationSource: 'manual',
      goals: null,
      expenseCategories: [],
      dataQuality: {
        hasSnapshot: false,
        hasPreviousBaseline: false,
        hasCashflowData: false,
        isPartialMonth: true,
        notes: [],
      },
    } satisfies AssistantMonthContextBundle);
    buildAssistantYearContextMock.mockResolvedValue(null);
    buildAssistantYtdContextMock.mockResolvedValue(null);
    buildAssistantHistoryContextMock.mockResolvedValue(null);
    listAssistantThreadsMock.mockResolvedValue([]);
    createAssistantThreadMock.mockResolvedValue({
      id: 'thread-1',
      userId: 'user-1',
      title: 'Titolo server',
      createdAt: new Date(2026, 3, 5),
      updatedAt: new Date(2026, 3, 5),
      lastMessagePreview: '',
      mode: 'chat',
      pinnedMonth: null,
    });
    getAssistantThreadDetailMock.mockResolvedValue({
      thread: {
        id: 'thread-1',
        userId: 'user-1',
        title: 'Titolo server',
        createdAt: new Date(2026, 3, 5),
        updatedAt: new Date(2026, 3, 5),
        lastMessagePreview: 'ciao',
        mode: 'chat',
        pinnedMonth: null,
      },
      messages: [],
    });
    getAssistantThreadMock.mockResolvedValue({
      id: 'thread-1',
      userId: 'user-1',
      title: 'Titolo server',
      createdAt: new Date(2026, 3, 5),
      updatedAt: new Date(2026, 3, 5),
      lastMessagePreview: '',
      mode: 'chat',
      pinnedMonth: null,
    });
    getAssistantMemoryDocumentMock.mockResolvedValue({
      preferences: {
        responseStyle: 'balanced',
        includeMacroContext: false,
        memoryEnabled: true,
        includeDummySnapshots: false,
      },
      items: [],
      suggestions: [],
      updatedAt: null,
      hasDummySnapshots: false,
    });
    updateAssistantMemoryDocumentMock.mockResolvedValue({
      preferences: {
        responseStyle: 'deep',
        includeMacroContext: true,
        memoryEnabled: true,
        includeDummySnapshots: false,
      },
      items: [],
      suggestions: [],
      updatedAt: new Date(2026, 3, 5),
      hasDummySnapshots: false,
    });
    deleteAssistantMemoryDocumentMock.mockResolvedValue({
      preferences: {
        responseStyle: 'balanced',
        includeMacroContext: false,
        memoryEnabled: true,
        includeDummySnapshots: false,
      },
      items: [],
      suggestions: [],
      updatedAt: new Date(2026, 3, 5),
      hasDummySnapshots: false,
    });
    setAssistantGoalEvaluationMock.mockResolvedValue(undefined);
    applyAssistantMemoryMutationsMock.mockResolvedValue({
      preferences: {
        responseStyle: 'balanced',
        includeMacroContext: false,
        memoryEnabled: true,
        includeDummySnapshots: false,
      },
      items: [],
      suggestions: [],
      updatedAt: new Date(2026, 3, 5),
    });
    extractMemoryCandidatesMock.mockResolvedValue([]);
    extractStructuredGoalFromTextMock.mockResolvedValue(undefined);
    appendAssistantMessageMock
      .mockResolvedValueOnce({
        id: 'user-msg-1',
        threadId: 'thread-1',
        userId: 'user-1',
        role: 'user',
        content: 'Analizza il mio mese',
        createdAt: new Date(2026, 3, 5),
        mode: 'month_analysis',
        monthContext: { year: 2026, month: 3 },
        webSearchUsed: false,
      })
      .mockResolvedValueOnce({
        id: 'assistant-msg-1',
        threadId: 'thread-1',
        userId: 'user-1',
        role: 'assistant',
        content: 'Risposta',
        createdAt: new Date(2026, 3, 5),
        mode: 'month_analysis',
        monthContext: { year: 2026, month: 3 },
        webSearchUsed: true,
      });
    updateAssistantThreadMetadataMock.mockResolvedValue(undefined);
    streamAssistantResponseMock.mockImplementation(
      async ({ onStatus, onText }: Parameters<typeof streamAssistantResponse>[0]) => {
        onStatus('writing');
        onText('Risposta');
        onStatus('saving');
        return { text: 'Risposta', webSearchUsed: true };
      }
    );
  });

  it('returns 401 for threads route without Authorization header', async () => {
    const response = await getThreadsRoute(
      createJsonRequest('http://localhost/api/ai/assistant/threads?userId=user-1')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Authorization bearer token',
    });
    expect(listAssistantThreadsMock).not.toHaveBeenCalled();
  });

  it('returns 403 for threads route when token and userId do not match', async () => {
    const response = await getThreadsRoute(
      createJsonRequest('http://localhost/api/ai/assistant/threads?userId=user-2', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Authenticated user does not have access to requested account',
    });
    expect(listAssistantThreadsMock).not.toHaveBeenCalled();
  });

  it('returns a thread detail for the authenticated user', async () => {
    const response = await getThreadRoute(
      createJsonRequest('http://localhost/api/ai/assistant/threads/thread-1?userId=user-1', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      }),
      { params: Promise.resolve({ threadId: 'thread-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      thread: {
        id: 'thread-1',
      },
    });
    expect(getAssistantThreadDetailMock).toHaveBeenCalledWith('thread-1', 'user-1');
  });

  it('returns 401 for memory route without Authorization header', async () => {
    const response = await getMemoryRoute(
      createJsonRequest('http://localhost/api/ai/assistant/memory?userId=user-1')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Authorization bearer token',
    });
  });

  it('patches memory only for the authenticated user', async () => {
    const response = await patchMemoryRoute(
      createJsonRequest('http://localhost/api/ai/assistant/memory', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: {
          userId: 'user-1',
          preferences: {
            responseStyle: 'deep',
            includeMacroContext: true,
          },
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      preferences: {
        responseStyle: 'deep',
      },
    });
    expect(updateAssistantMemoryDocumentMock).toHaveBeenCalledWith('user-1', {
      preferences: {
        responseStyle: 'deep',
        includeMacroContext: true,
      },
      item: undefined,
    });
  });

  it('structures a goal written by hand in the memory panel', async () => {
    // The panel sends id/text/category only, so without this the goal would never
    // be auto-trackable — exactly what the structured-goals rework set out to fix.
    extractStructuredGoalFromTextMock.mockResolvedValueOnce({
      kind: 'cash_target',
      targetValue: 20000,
      unit: 'eur',
      direction: 'at_most',
    });

    const response = await patchMemoryRoute(
      createJsonRequest('http://localhost/api/ai/assistant/memory', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer valid-token' },
        body: {
          userId: 'user-1',
          item: { id: 'goal-1', text: 'Ridurre il cash a 20k', category: 'goal' },
        },
      })
    );

    expect(response.status).toBe(200);
    expect(extractStructuredGoalFromTextMock).toHaveBeenCalledWith(
      'Ridurre il cash a 20k',
      expect.anything()
    );
    expect(updateAssistantMemoryDocumentMock).toHaveBeenCalledWith('user-1', {
      preferences: undefined,
      item: {
        id: 'goal-1',
        text: 'Ridurre il cash a 20k',
        category: 'goal',
        structuredGoal: {
          kind: 'cash_target',
          targetValue: 20000,
          unit: 'eur',
          direction: 'at_most',
        },
      },
      suggestion: undefined,
    });
  });

  it('does not spend a model call when only the status of a goal changes', async () => {
    getAssistantMemoryDocumentMock.mockResolvedValueOnce({
      preferences: {
        responseStyle: 'balanced',
        includeMacroContext: false,
        memoryEnabled: true,
        includeDummySnapshots: false,
      },
      items: [{
        id: 'goal-1',
        userId: 'user-1',
        category: 'goal',
        text: 'Ridurre il cash a 20k',
        structuredGoal: { kind: 'cash_target', targetValue: 20000, unit: 'eur', direction: 'at_most' },
        createdAt: new Date(2026, 3, 5),
        updatedAt: new Date(2026, 3, 5),
        status: 'active',
      }],
      suggestions: [],
      updatedAt: null,
      hasDummySnapshots: false,
    });

    const response = await patchMemoryRoute(
      createJsonRequest('http://localhost/api/ai/assistant/memory', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer valid-token' },
        body: {
          userId: 'user-1',
          item: {
            id: 'goal-1',
            text: 'Ridurre il cash a 20k',
            category: 'goal',
            status: 'archived',
          },
        },
      })
    );

    expect(response.status).toBe(200);
    expect(extractStructuredGoalFromTextMock).not.toHaveBeenCalled();
    // The stored structure survives an archive — it is not re-derived, nor dropped
    expect(updateAssistantMemoryDocumentMock.mock.calls[0][1].item.structuredGoal).toEqual({
      kind: 'cash_target',
      targetValue: 20000,
      unit: 'eur',
      direction: 'at_most',
    });
  });

  it('deletes memory data only for the authenticated user', async () => {
    const response = await deleteMemoryRoute(
      createJsonRequest('http://localhost/api/ai/assistant/memory', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: {
          userId: 'user-1',
          itemId: 'memory-1',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(deleteAssistantMemoryDocumentMock).toHaveBeenCalledWith('user-1', {
      itemId: 'memory-1',
      resetAll: undefined,
    });
  });

  it('accepts a goal completion suggestion only for the authenticated user', async () => {
    getAssistantMemoryDocumentMock.mockResolvedValueOnce({
      preferences: {
        responseStyle: 'balanced',
        includeMacroContext: false,
        memoryEnabled: true,
        includeDummySnapshots: false,
      },
      items: [{
        id: 'goal-1',
        userId: 'user-1',
        category: 'goal',
        text: 'Liquidità a 40k',
        createdAt: new Date(2026, 3, 5),
        updatedAt: new Date(2026, 3, 5),
        status: 'active',
      }],
      suggestions: [{
        id: 'suggestion-1',
        userId: 'user-1',
        itemId: 'goal-1',
        type: 'complete_goal',
        status: 'pending',
        createdAt: new Date(2026, 3, 5),
        updatedAt: new Date(2026, 3, 5),
        evidenceSummary: 'Liquidità attuale 45000 EUR su target 40000 EUR',
        evaluation: {
          matched: true,
          metricValue: 45000,
          targetValue: 40000,
          unit: 'eur',
          evaluatedAgainst: 'liquid_net_worth',
          summary: 'Liquidità attuale 45000 EUR su target 40000 EUR',
        },
      }],
      updatedAt: null,
      hasDummySnapshots: false,
    });

    const response = await patchMemoryRoute(
      createJsonRequest('http://localhost/api/ai/assistant/memory', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: {
          userId: 'user-1',
          action: 'acceptSuggestion',
          suggestionId: 'suggestion-1',
          itemId: 'goal-1',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(updateAssistantMemoryDocumentMock).toHaveBeenCalled();
  });

  it('streams assistant data for the authenticated user', async () => {
    const response = await streamRoute(
      createJsonRequest('http://localhost/api/ai/assistant/stream', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: {
          userId: 'user-1',
          mode: 'month_analysis',
          prompt: 'Analizza il mio mese',
          month: { year: 2026, month: 3 },
          preferences: {
            responseStyle: 'balanced',
            includeMacroContext: true,
            memoryEnabled: true,
          },
        },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');

    const streamText = await response.text();
    expect(streamText).toContain('"type":"meta"');
    expect(streamText).toContain('"type":"text"');
    expect(streamText).toContain('"type":"done"');
    expect(streamAssistantResponseMock).toHaveBeenCalled();
  });

  it('returns 403 on stream route when token and userId do not match', async () => {
    const response = await streamRoute(
      createJsonRequest('http://localhost/api/ai/assistant/stream', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: {
          userId: 'user-2',
          mode: 'chat',
          prompt: 'Ciao',
        },
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Authenticated user does not have access to requested account',
    });
  });
});
