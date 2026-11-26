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
  buildAssistantTodayContextMock,
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
  fetchCashflowBlockInputsMock,
  fetchRegisterInputsMock,
  fetchCostCentersMock,
  fetchBudgetConfigMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  buildAssistantMonthContextMock: vi.fn(),
  buildAssistantYearContextMock: vi.fn(),
  buildAssistantYtdContextMock: vi.fn(),
  buildAssistantHistoryContextMock: vi.fn(),
  buildAssistantTodayContextMock: vi.fn(),
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
  fetchCashflowBlockInputsMock: vi.fn(),
  fetchRegisterInputsMock: vi.fn(),
  fetchCostCentersMock: vi.fn(),
  fetchBudgetConfigMock: vi.fn(),
}));

// The router (2026-11) is never called for real: `mode: 'auto'` reads whatever the test hands it.
const { routeAssistantMessageMock, createRouterClientMock } = vi.hoisted(() => ({
  routeAssistantMessageMock: vi.fn(),
  createRouterClientMock: vi.fn(() => ({ messages: {} })),
}));

vi.mock('@/lib/server/assistant/router', () => ({
  routeAssistantMessage: routeAssistantMessageMock,
  createRouterClient: createRouterClientMock,
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
      // The history analysis reads its start year from the settings (fetchHistoryStartYear).
      if (name === 'assetAllocationTargets') {
        return { doc: vi.fn(() => ({ get: vi.fn(async () => ({ data: () => ({ cashflowHistoryStartYear: 2025 }) })) })) };
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
  buildAssistantTodayContext: buildAssistantTodayContextMock,
  fetchCashflowBlockInputs: fetchCashflowBlockInputsMock,
  fetchRegisterInputs: fetchRegisterInputsMock,
  fetchCostCenters: fetchCostCentersMock,
  fetchBudgetConfig: fetchBudgetConfigMock,
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
vi.mock('@/lib/server/assistant/memoryExtraction', async () => ({
  extractMemoryCandidates: extractMemoryCandidatesMock,
  extractStructuredGoalFromText: extractStructuredGoalFromTextMock,
  dedupeMemoryItems: vi.fn((candidates: unknown[]) => candidates),
  // The real rule: the route archives what it supersedes (2026-11).
  supersedesCategorizationRule: (await vi.importActual<typeof import('@/lib/server/assistant/memoryExtraction')>('@/lib/server/assistant/memoryExtraction')).supersedesCategorizationRule,
}));

import { GET as getThreadsRoute } from '@/app/api/ai/assistant/threads/route';
import { GET as getThreadRoute } from '@/app/api/ai/assistant/threads/[threadId]/route';
import {
  GET as getMemoryRoute,
  PATCH as patchMemoryRoute,
  DELETE as deleteMemoryRoute,
} from '@/app/api/ai/assistant/memory/route';
import { POST as streamRoute } from '@/app/api/ai/assistant/stream/route';
import { GET as getContextRoute } from '@/app/api/ai/assistant/context/route';
import { emptyAssistantPortfolioContext } from '@/lib/utils/assistantPortfolioContext';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { FALLBACK_ROUTE } from '@/lib/utils/assistantRoute';
import type { AssistantRoute, AssistantRouteReading, AssistantStreamEvent } from '@/types/assistant';

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
    fetchCashflowBlockInputsMock.mockResolvedValue({
      expenses: [], todayIso: '2026-10-20', categories: [], assets: [], settings: null, assetValueOf: () => 0,
    });
    // The tools' side reads (DATI-09): no centre, no budget.
    fetchCostCentersMock.mockResolvedValue([]);
    fetchBudgetConfigMock.mockResolvedValue(null);
    // What Registra reads: one category, no account, no row, the month unread.
    fetchRegisterInputsMock.mockImplementation(async (_userId: string, now: Date) => ({
      now,
      categories: [{ id: 'cat-cibo', userId: 'user-1', name: 'Cibo', type: 'variable', subCategories: [], createdAt: now, updatedAt: now }],
      assets: [], settings: null, costCenters: [], recentExpenses: [],
      month: { stats: null, budget: null, budgetFailed: false },
      assetValueOf: () => 0,
    }));
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
      portfolio: emptyAssistantPortfolioContext(),
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
    buildAssistantTodayContextMock.mockResolvedValue({ portfolio: 'today-portfolio' });
    listAssistantThreadsMock.mockResolvedValue({ threads: [], nextCursor: null });
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

  // The list is paged. The store's own page arithmetic (60 → 50 + 10, the cursor never
  // repeated) is pinned in __tests__/assistantThreadsStore.test.ts; here the route's wiring.
  // The header's stages were seen RED on 2026-10-05 with the route's `mark('db')` removed
  // («auth, total»).
  it('answers one page with its cursor, passes «after» to the store, and times the read', async () => {
    listAssistantThreadsMock.mockResolvedValue({ threads: [], nextCursor: 'thread-50' });
    const response = await getThreadsRoute(
      createJsonRequest('http://localhost/api/ai/assistant/threads?userId=user-1&after=thread-49', {
        headers: { Authorization: 'Bearer valid-token' },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ threads: [], nextCursor: 'thread-50' });
    expect(listAssistantThreadsMock).toHaveBeenCalledWith('user-1', { after: 'thread-49' });
    expect((response.headers.get('server-timing') ?? '').split(', ').map((entry) => entry.split(';')[0])).toEqual(['auth', 'db', 'total']);
  });

  it('reads the first page without a cursor, and refuses an empty or path-shaped one with 400', async () => {
    const authorized = { headers: { Authorization: 'Bearer valid-token' } };
    await getThreadsRoute(createJsonRequest('http://localhost/api/ai/assistant/threads?userId=user-1', authorized));
    expect(listAssistantThreadsMock).toHaveBeenLastCalledWith('user-1', { after: undefined });

    for (const cursor of ['', 'threads%2Fx']) {
      listAssistantThreadsMock.mockClear();
      const response = await getThreadsRoute(
        createJsonRequest(`http://localhost/api/ai/assistant/threads?userId=user-1&after=${cursor}`, authorized)
      );
      expect(response.status).toBe(400);
      expect(listAssistantThreadsMock).not.toHaveBeenCalled();
    }
  });

  // The page already holds the preference (it reads the memory at mount), so the context route
  // takes it from the request instead of reading the memory document a second time per opening.
  // Seen RED on the route that always read it (2026-10-05): the memory read once, the builder
  // called with the STORED `false` under a request saying `true`.
  describe('GET /api/ai/assistant/context — the dummy-snapshot preference', () => {
    const contextUrl = (extra = '') => `http://localhost/api/ai/assistant/context?userId=user-1&year=2026&month=3${extra}`;
    const authorized = { headers: { Authorization: 'Bearer valid-token' } };

    it.each([
      ['true', true],
      ['false', false],
    ])('takes includeDummy=%s from the request and does not read the memory', async (param, expected) => {
      const response = await getContextRoute(createJsonRequest(contextUrl(`&includeDummy=${param}`), authorized));

      expect(response.status).toBe(200);
      expect(getAssistantMemoryDocumentMock).not.toHaveBeenCalled();
      expect(buildAssistantMonthContextMock).toHaveBeenCalledWith('user-1', { year: 2026, month: 3 }, expected);
    });

    it('reads the stored preference when the request carries none', async () => {
      getAssistantMemoryDocumentMock.mockResolvedValue({
        preferences: { responseStyle: 'balanced', includeMacroContext: false, memoryEnabled: true, includeDummySnapshots: true },
        items: [],
        suggestions: [],
        updatedAt: null,
      });

      const response = await getContextRoute(createJsonRequest(contextUrl(), authorized));

      expect(response.status).toBe(200);
      expect(getAssistantMemoryDocumentMock).toHaveBeenCalledTimes(1);
      expect(buildAssistantMonthContextMock).toHaveBeenCalledWith('user-1', { year: 2026, month: 3 }, true);
    });

    it('refuses a value that is neither «true» nor «false» with 400, reading and building nothing', async () => {
      const response = await getContextRoute(createJsonRequest(contextUrl('&includeDummy=yes'), authorized));

      expect(response.status).toBe(400);
      expect(getAssistantMemoryDocumentMock).not.toHaveBeenCalled();
      expect(buildAssistantMonthContextMock).not.toHaveBeenCalled();
    });
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

  it('archives the categorisation rule a new one supersedes, in the turn’s one write (2026-11)', async () => {
    const OLD_RULE = { id: 'mem-old', userId: 'user-1', category: 'preference' as const, text: 'Categorizzazione: palestra → Salute › Palestra', createdAt: new Date(2026, 3, 1), updatedAt: new Date(2026, 3, 1), status: 'active' as const };
    const OTHER = { ...OLD_RULE, id: 'mem-other', text: 'Categorizzazione: cinema → Svago' };
    getAssistantMemoryDocumentMock.mockResolvedValue({
      preferences: { responseStyle: 'balanced', includeMacroContext: false, memoryEnabled: true, includeDummySnapshots: false },
      items: [OLD_RULE, OTHER], suggestions: [], updatedAt: null, hasDummySnapshots: false,
    });
    extractMemoryCandidatesMock.mockResolvedValue([{ category: 'preference', text: 'Categorizzazione: palestra → Sport' }]);
    const response = await streamRoute(
      createJsonRequest('http://localhost/api/ai/assistant/stream', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
        body: { userId: 'user-1', mode: 'chat', chatContext: 'none', prompt: 'D’ora in poi la palestra la metto in Sport' },
      })
    );
    await response.text();
    // The extraction runs after the stream has closed.
    await vi.waitFor(() => expect(applyAssistantMemoryMutationsMock).toHaveBeenCalled());
    const [userId, mutations] = applyAssistantMemoryMutationsMock.mock.calls.at(-1)!;
    expect(userId).toBe('user-1');
    const items = mutations.filter((m: { kind: string }) => m.kind === 'item').map((m: { item: { id: string; text: string; status: string } }) => m.item);
    expect(items.find((item: { text: string }) => item.text === 'Categorizzazione: palestra → Sport')).toMatchObject({ status: 'active' });
    expect(items.find((item: { id: string }) => item.id === 'mem-old')).toMatchObject({ status: 'archived', text: OLD_RULE.text });
    expect(items.some((item: { id: string }) => item.id === 'mem-other')).toBe(false);
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

  // ── A free question with NO context still gets the portfolio of today (2026-10-20) ──────

  it('builds the portfolio of today for a free question with no context, and sends no context event', async () => {
    const response = await streamRoute(
      createJsonRequest('http://localhost/api/ai/assistant/stream', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
        body: { userId: 'user-1', mode: 'chat', chatContext: 'none', prompt: 'Quali strumenti ho liberi da obiettivi?' },
      })
    );

    expect(response.status).toBe(200);
    const streamText = await response.text();
    expect(buildAssistantTodayContextMock).toHaveBeenCalledWith('user-1');
    expect(buildAssistantMonthContextMock).not.toHaveBeenCalled();
    // The page's tiles are a period's: no bundle travels on the stream.
    expect(streamText).not.toContain('"type":"context"');
    expect(streamAssistantResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({ contextBundle: null, todayContext: { portfolio: 'today-portfolio' } })
    );
  });

  it('builds the period bundle, not the portfolio of today, when a context is chosen', async () => {
    const response = await streamRoute(
      createJsonRequest('http://localhost/api/ai/assistant/stream', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
        body: { userId: 'user-1', mode: 'chat', chatContext: 'month', month: { year: 2026, month: 3 }, prompt: 'Come è andato marzo?' },
      })
    );

    expect(response.status).toBe(200);
    await response.text();
    expect(buildAssistantMonthContextMock).toHaveBeenCalledWith('user-1', { year: 2026, month: 3 }, false);
    expect(buildAssistantTodayContextMock).not.toHaveBeenCalled();
    expect(streamAssistantResponseMock).toHaveBeenCalledWith(expect.objectContaining({ todayContext: null }));
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

  describe('POST /api/ai/assistant/stream — the CASHFLOW 12 MESI block (2026-11)', () => {
    const PERIOD_BUNDLE = { selector: { year: 2026, month: -1 } };

    function streamRequest(body: Record<string, unknown>) {
      return streamRoute(
        createJsonRequest('http://localhost/api/ai/assistant/stream', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-token' },
          body: { userId: 'user-1', prompt: 'Come va?', ...body },
        })
      );
    }

    beforeEach(() => {
      buildAssistantYearContextMock.mockResolvedValue(PERIOD_BUNDLE);
      buildAssistantYtdContextMock.mockResolvedValue(PERIOD_BUNDLE);
      buildAssistantHistoryContextMock.mockResolvedValue(PERIOD_BUNDLE);
    });

    it.each([
      ['year_analysis', { year: 2025 }],
      ['ytd_analysis', {}],
      ['history_analysis', {}],
      ['month_analysis', { month: { year: 2026, month: 3 } }],
      ['chat', { chatContext: 'month', month: { year: 2026, month: 3 } }],
      ['chat', { chatContext: 'ytd' }],
      ['chat', { chatContext: 'history' }],
      ['chat', { chatContext: 'none' }],
    ])('%s %o reads the block once, for the owner, and hands it to the stream — never on the SSE (since 2026-11-07)', async (mode, extra) => {
      const response = await streamRequest({ mode, ...extra });
      expect(response.status).toBe(200);
      const streamText = await response.text();
      expect(fetchCashflowBlockInputsMock).toHaveBeenCalledTimes(1);
      expect(fetchCashflowBlockInputsMock.mock.calls[0][0]).toBe('user-1');
      expect(fetchCashflowBlockInputsMock.mock.calls[0][1]).toBeInstanceOf(Date);
      const args = streamAssistantResponseMock.mock.calls[0][0] as { cashflowBlock: string | null };
      expect(args.cashflowBlock).toContain('--- CASHFLOW 12 MESI');
      expect(streamText).not.toContain('CASHFLOW 12 MESI');
    });

    it('a co-owner reads the OWNER\'s block, never their own (2026-11-07)', async () => {
      verifyIdTokenMock.mockResolvedValue({ uid: 'co-owner' });
      accountAccessDocGetMock.mockResolvedValue({ exists: true, data: () => ({ memberUids: ['co-owner'] }) });
      const response = await streamRequest({ mode: 'ytd_analysis' });
      expect(response.status).toBe(200);
      await response.text();
      expect(fetchCashflowBlockInputsMock).toHaveBeenCalledTimes(1);
      expect(fetchCashflowBlockInputsMock.mock.calls[0][0]).toBe('user-1');
    });

    it.each(['ytd_analysis', 'chat'])('%s: a failed read answers the 500, never a silent empty block', async (mode) => {
      fetchCashflowBlockInputsMock.mockRejectedValue(new Error('read failed'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const response = await streamRequest({ mode, chatContext: 'none' });
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "Impossibile avviare lo stream dell'assistente" });
      expect(streamAssistantResponseMock).not.toHaveBeenCalled();
    });

    // DATI-09: the tools and the block share one expense read; the budget and the centres are read beside it.
    it('a chat reads the expenses ONCE and hands the stream the tools context and the block of that read (S1)', async () => {
      const response = await streamRequest({ mode: 'chat', chatContext: 'none' });
      expect(response.status).toBe(200);
      await response.text();
      expect(fetchCashflowBlockInputsMock).toHaveBeenCalledTimes(1);
      expect(fetchCostCentersMock).toHaveBeenCalledWith('user-1');
      expect(fetchBudgetConfigMock).toHaveBeenCalledWith('user-1');
      const args = streamAssistantResponseMock.mock.calls[0][0] as Parameters<typeof streamAssistantResponse>[0];
      expect(args.cashflowBlock).toContain('--- CASHFLOW 12 MESI');
      expect(args.toolContext).toMatchObject({ userId: 'user-1', costCenters: [], budgetConfig: null });
      // The same array the block was built on: one read, not two.
      expect(args.toolContext?.expenses).toBe((await fetchCashflowBlockInputsMock.mock.results[0].value).expenses);
    });

    it('a failed budget read still streams, the budget unreadable for its tool alone (S2)', async () => {
      fetchBudgetConfigMock.mockRejectedValue(new Error('budget down'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const response = await streamRequest({ mode: 'chat', chatContext: 'none' });
      expect(response.status).toBe(200);
      await response.text();
      const args = streamAssistantResponseMock.mock.calls[0][0] as Parameters<typeof streamAssistantResponse>[0];
      expect(args.toolContext?.budgetConfig).toBe('unreadable');
      expect(args.toolContext?.costCenters).toEqual([]);
    });
  });

  // ── The body is validated before anything is read (2026-11) ──────────────────────────────

  describe('POST /api/ai/assistant/stream — the body', () => {
    function streamRequest(body: Record<string, unknown>) {
      return streamRoute(
        createJsonRequest('http://localhost/api/ai/assistant/stream', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-token' },
          body: { userId: 'user-1', prompt: 'Come va?', ...body },
        })
      );
    }

    it('refuses a mode the app does not have with 400, reading and streaming nothing', async () => {
      const response = await streamRequest({ mode: 'weekly' });
      expect(response.status).toBe(400);
      expect(fetchCashflowBlockInputsMock).not.toHaveBeenCalled();
      expect(streamAssistantResponseMock).not.toHaveBeenCalled();
    });

    it('refuses a 4001-character prompt in an analysis mode, and an empty one', async () => {
      expect((await streamRequest({ mode: 'month_analysis', month: { year: 2026, month: 3 }, prompt: 'a'.repeat(4001) })).status).toBe(400);
      expect((await streamRequest({ mode: 'chat', prompt: '   ' })).status).toBe(400);
      expect(streamAssistantResponseMock).not.toHaveBeenCalled();

      const atTheCap = await streamRequest({ mode: 'month_analysis', month: { year: 2026, month: 3 }, prompt: 'a'.repeat(4000) });
      expect(atTheCap.status).toBe(200);
      await atTheCap.text();
    });

    it('keeps every declared field: a year analysis reaches its builder with the year', async () => {
      buildAssistantYearContextMock.mockResolvedValue({ selector: { year: 2025, month: -1 } });
      const response = await streamRequest({ mode: 'year_analysis', year: 2025, preferences: { includeDummySnapshots: true } });
      expect(response.status).toBe(200);
      await response.text();
      expect(buildAssistantYearContextMock).toHaveBeenCalledWith('user-1', 2025, true);
    });
  });

  // ── Registra: the register block, no period bundle (2026-11) ─────────────────────────────

  describe('POST /api/ai/assistant/stream — Registra', () => {
    function registerRequest(body: Record<string, unknown> = {}) {
      return streamRoute(
        createJsonRequest('http://localhost/api/ai/assistant/stream', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-token' },
          body: { userId: 'user-1', mode: 'register', prompt: 'ho fatto spesa per 103 euro', ...body },
        })
      );
    }

    it('reads the register inputs once and builds no period bundle and no portfolio of today', async () => {
      const response = await registerRequest();
      expect(response.status).toBe(200);
      const streamText = await response.text();

      expect(fetchRegisterInputsMock).toHaveBeenCalledTimes(1);
      expect(fetchRegisterInputsMock.mock.calls[0][0]).toBe('user-1');
      expect(fetchRegisterInputsMock.mock.calls[0][1]).toBeInstanceOf(Date);
      expect(buildAssistantMonthContextMock).not.toHaveBeenCalled();
      expect(buildAssistantTodayContextMock).not.toHaveBeenCalled();

      const args = streamAssistantResponseMock.mock.calls[0][0] as { registerBlock: string | null; contextBundle: unknown; mode: string };
      expect(args.mode).toBe('register');
      expect(args.contextBundle).toBeNull();
      expect(args.registerBlock).toContain('--- REGISTRA ---');
      expect(args.registerBlock).toContain('[cat-cibo] Cibo');
      // The page's companion gets the summary, never the block.
      expect(streamText).toContain('"type":"register"');
      expect(streamText).toContain('"categories":1');
      expect(streamText).not.toContain('--- REGISTRA ---');
      expect(streamText).not.toContain('"type":"context"');
    });

    it('reads the CASHFLOW 12 MESI block once, for the owner, and hands it to the stream', async () => {
      const response = await registerRequest();
      await response.text();
      expect(fetchCashflowBlockInputsMock).toHaveBeenCalledTimes(1);
      expect(fetchCashflowBlockInputsMock.mock.calls[0][0]).toBe('user-1');
      const args = streamAssistantResponseMock.mock.calls[0][0] as { cashflowBlock: string | null };
      expect(args.cashflowBlock).toContain('--- CASHFLOW 12 MESI');
      // Registra runs no tool (S1): no context, neither the budget nor the centres read.
      expect((args as { toolContext?: unknown }).toolContext).toBeUndefined();
      expect(fetchCostCentersMock).not.toHaveBeenCalled();
      expect(fetchBudgetConfigMock).not.toHaveBeenCalled();
    });

    it('titles a new thread by the mode, and never retitles the day’s thread', async () => {
      const first = await registerRequest();
      await first.text();
      expect(createAssistantThreadMock).toHaveBeenCalledWith(expect.objectContaining({ mode: 'register', title: 'Titolo server' }));

      // An existing register thread with no preview yet: any other mode would retitle it from the prompt.
      vi.mocked(updateAssistantThreadMetadataMock).mockClear();
      getAssistantThreadMock.mockResolvedValue({
        id: 'thread-1', userId: 'user-1', title: 'Registrazioni · 1 nov 2026', createdAt: new Date(2026, 10, 1), updatedAt: new Date(2026, 10, 1),
        lastMessagePreview: '', mode: 'register', pinnedMonth: null,
      });
      appendAssistantMessageMock.mockResolvedValue({ id: 'msg-x', threadId: 'thread-1', userId: 'user-1', role: 'assistant', content: 'x', createdAt: new Date(2026, 10, 1), mode: 'register' });
      const second = await registerRequest({ threadId: 'thread-1' });
      await second.text();
      expect(updateAssistantThreadMetadataMock).toHaveBeenCalledWith('thread-1', expect.objectContaining({ title: 'Registrazioni · 1 nov 2026', mode: 'register' }));
    });

    it('stores the prose as preview, and the user’s sentence when the answer is only a block', async () => {
      const block = '```expense-proposal\n{"kind":"expense"}\n```';
      streamAssistantResponseMock.mockImplementationOnce(async ({ onText }: Parameters<typeof streamAssistantResponse>[0]) => {
        onText(`Ti propongo questa riga.\n\n${block}`);
        return { text: `Ti propongo questa riga.\n\n${block}`, webSearchUsed: false };
      });
      await (await registerRequest()).text();
      expect(updateAssistantThreadMetadataMock).toHaveBeenLastCalledWith('thread-1', expect.objectContaining({ lastMessagePreview: 'Ti propongo questa riga.' }));

      // Reset, not only cleared: the queue of one-shot answers of `beforeEach` outlives a test that never streams.
      appendAssistantMessageMock.mockReset().mockResolvedValue({ id: 'm', threadId: 'thread-1', userId: 'user-1', role: 'user', content: 'ho fatto spesa per 103 euro', createdAt: new Date(2026, 10, 1), mode: 'register' });
      streamAssistantResponseMock.mockImplementationOnce(async ({ onText }: Parameters<typeof streamAssistantResponse>[0]) => {
        onText(block);
        return { text: block, webSearchUsed: false };
      });
      await (await registerRequest()).text();
      expect(updateAssistantThreadMetadataMock).toHaveBeenLastCalledWith('thread-1', expect.objectContaining({ lastMessagePreview: 'ho fatto spesa per 103 euro' }));
    });

    // The answer's tail (2026-11-25): the next questions are cut off the saved text, kept on the
    // message and sent on `done`; Registra's text is saved as it came. Seen RED saving `result.text`.
    it('saves a chat answer without its tail, keeps the questions and sends both on done', async () => {
      const tail = '```assistant-followups\n["E nel 2025?", "E il mutuo A?"]\n```';
      appendAssistantMessageMock.mockReset().mockResolvedValue({ id: 'm', threadId: 'thread-1', userId: 'user-1', role: 'assistant', content: 'x', createdAt: new Date(2026, 10, 1), mode: 'chat' });
      streamAssistantResponseMock.mockImplementationOnce(async ({ onText }: Parameters<typeof streamAssistantResponse>[0]) => {
        onText(`**2.400 €.**\n\n${tail}`);
        return { text: `**2.400 €.**\n\n${tail}`, webSearchUsed: false };
      });
      const response = await streamRoute(
        createJsonRequest('http://localhost/api/ai/assistant/stream', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-token' },
          body: { userId: 'user-1', mode: 'chat', chatContext: 'none', prompt: 'Quanto costa l’asilo?' },
        })
      );
      const streamText = await response.text();
      const saved = appendAssistantMessageMock.mock.calls.at(-1)![1];
      expect(saved).toMatchObject({ role: 'assistant', content: '**2.400 €.**', followUps: ['E nel 2025?', 'E il mutuo A?'] });
      expect(saved.content).not.toContain('```');
      const done = streamText.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6))).find((event) => event.type === 'done');
      expect(done).toMatchObject({ content: '**2.400 €.**', followUps: ['E nel 2025?', 'E il mutuo A?'] });
    });

    it('saves a Registra answer as it came, a block of that language included', async () => {
      const text = 'Ti propongo questa riga.\n\n```assistant-followups\n["Altro?"]\n```';
      streamAssistantResponseMock.mockImplementationOnce(async ({ onText }: Parameters<typeof streamAssistantResponse>[0]) => {
        onText(text);
        return { text, webSearchUsed: false };
      });
      await (await registerRequest()).text();
      const saved = appendAssistantMessageMock.mock.calls.filter((call) => call[1].role === 'assistant').at(-1)![1];
      expect(saved.content).toBe(text);
      expect(saved).not.toHaveProperty('followUps');
    });

    it('a failed read of the register inputs answers the 500 before any event', async () => {
      fetchRegisterInputsMock.mockRejectedValue(new Error('read failed'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const response = await registerRequest();
      expect(response.status).toBe(500);
      expect(streamAssistantResponseMock).not.toHaveBeenCalled();
    });
  });

  it('the context route refuses Registra with 400: the mode has no period', async () => {
    const response = await getContextRoute(
      createJsonRequest('http://localhost/api/ai/assistant/context?userId=user-1&mode=register', {
        headers: { Authorization: 'Bearer valid-token' },
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'La modalità Registra non ha un contesto di periodo' });
    expect(buildAssistantMonthContextMock).not.toHaveBeenCalled();
  });

  // ── mode 'auto': the router in front of today's pipeline (2026-11) ───────────────────────
  //
  // Seen RED on purpose, one mutation at a time: `route` enqueued after the text (R7); the previous
  // user message read with `findLast` on every user message (R7); `chatContext` dropped from
  // `routeToSelection` (R7b); the month context built on a fallback (R7c); the router called for an
  // explicit mode (R8); `source` always 'override' (R8b); `|| policy` removed and `preferences`
  // passed untouched (R10); the router's outcome stored whole, `elapsedMs` included (R11); the
  // router and the date check moved above `assertCanAccessAccount` (R13).

  describe("POST /api/ai/assistant/stream — mode 'auto'", () => {
    const now = getItalyMonthYear(new Date());
    const lastMonth = now.month === 1 ? { year: now.year - 1, month: 12 } : { year: now.year, month: now.month - 1 };
    const nextMonth = now.month === 12 ? { year: now.year + 1, month: 1 } : { year: now.year, month: now.month + 1 };
    const LAST_MONTH_ROUTE: AssistantRoute = {
      intent: 'month_analysis', period: { kind: 'month', ...lastMonth }, webSearch: false, confidence: 0.9,
    };

    function streamRequest(body: Record<string, unknown>) {
      return streamRoute(
        createJsonRequest('http://localhost/api/ai/assistant/stream', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-token' },
          body: { userId: 'user-1', prompt: 'Com’è andato il mese scorso? ornitorinco', ...body },
        })
      );
    }

    function readEvents(streamText: string): AssistantStreamEvent[] {
      return streamText.split('\n\n').filter(Boolean).map((chunk) => JSON.parse(chunk.replace(/^data: /, '')));
    }

    function routerAnswers(route: AssistantRoute, extra: Partial<AssistantRouteReading> = {}) {
      routeAssistantMessageMock.mockResolvedValue({ route, source: 'router', ...extra, elapsedMs: 12 });
    }

    function streamArgs() {
      return streamAssistantResponseMock.mock.calls[0][0] as Parameters<typeof streamAssistantResponse>[0];
    }

    beforeEach(() => {
      routerAnswers(LAST_MONTH_ROUTE);
    });

    it('R7: calls the router once, emits route right after meta, builds the reading\'s month and pins the thread on it', async () => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const response = await streamRequest({ mode: 'auto' });
      expect(response.status).toBe(200);
      const events = readEvents(await response.text());

      expect(routeAssistantMessageMock).toHaveBeenCalledTimes(1);
      expect(createRouterClientMock).toHaveBeenCalledTimes(1);
      // Before every status (the fake stream emits two), then the order of the other events: the
      // filtered order alone does not name the status (seen red on 2026-11-16 with the route emitted
      // from the first `onStatus`).
      const types = events.map((event) => event.type);
      expect(types.indexOf('route')).toBeLessThan(types.indexOf('status'));
      expect(types.filter((type) => type !== 'status')).toEqual(['meta', 'route', 'context', 'text', 'done']);
      expect(events[1]).toEqual({ type: 'route', reading: { route: LAST_MONTH_ROUTE, source: 'router' } });

      expect(buildAssistantMonthContextMock).toHaveBeenCalledWith('user-1', lastMonth, false);
      expect(createAssistantThreadMock).toHaveBeenCalledWith(expect.objectContaining({ mode: 'month_analysis', pinnedMonth: lastMonth }));
      expect(appendAssistantMessageMock.mock.calls[0][1]).toMatchObject({ mode: 'month_analysis', monthContext: lastMonth });
      expect(streamArgs()).toMatchObject({ mode: 'month_analysis', month: lastMonth });
      expect(updateAssistantThreadMetadataMock).toHaveBeenCalledWith('thread-1', expect.objectContaining({ mode: 'month_analysis', pinnedMonth: lastMonth }));

      const logged = info.mock.calls.find((call) => call[0] === '[assistant/stream] request');
      expect(logged?.[1]).toMatchObject({ mode: 'month_analysis', routeSource: 'router', routeReason: null, routerMs: 12 });
      expect(JSON.stringify(info.mock.calls)).not.toContain('ornitorinco');
      info.mockRestore();
    });

    it('R7: hands the router today, and the previous turn — the last assistant message\'s reading with the user message before it', async () => {
      const previous: AssistantRouteReading = { route: LAST_MONTH_ROUTE, source: 'router' };
      getAssistantThreadDetailMock.mockResolvedValue({
        thread: {},
        messages: [
          { id: 'm1', role: 'user', content: 'messaggio A' },
          { id: 'm2', role: 'assistant', content: 'risposta', routeReading: previous },
          // A failed stream leaves a user message with no answer after it.
          { id: 'm3', role: 'user', content: 'messaggio B' },
        ],
      });
      await (await streamRequest({ mode: 'auto', threadId: 'thread-1', prompt: '  e a settembre?  ' })).text();
      const [input] = routeAssistantMessageMock.mock.calls[0];
      expect(input).toEqual({
        prompt: 'e a settembre?',
        today: now,
        todayIso: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        previous: { reading: previous, userMessage: 'messaggio A' },
      });
    });

    it('R7: a history ending on an assistant message without a reading gives no previous turn', async () => {
      getAssistantThreadDetailMock.mockResolvedValue({
        thread: {},
        messages: [
          { id: 'm1', role: 'user', content: 'messaggio A' },
          { id: 'm2', role: 'assistant', content: 'risposta', routeReading: { route: LAST_MONTH_ROUTE, source: 'router' } },
          { id: 'm3', role: 'user', content: 'messaggio B' },
          { id: 'm4', role: 'assistant', content: 'risposta di un modo esplicito' },
        ],
      });
      await (await streamRequest({ mode: 'auto', threadId: 'thread-1' })).text();
      expect(routeAssistantMessageMock.mock.calls[0][0].previous).toBeNull();
    });

    const BUILDERS = {
      month: buildAssistantMonthContextMock,
      year: buildAssistantYearContextMock,
      ytd: buildAssistantYtdContextMock,
      history: buildAssistantHistoryContextMock,
      today: buildAssistantTodayContextMock,
      register: fetchRegisterInputsMock,
    };
    const lastYear = now.year - 1;

    it.each<[string, AssistantRoute['intent'], AssistantRoute['period'], keyof typeof BUILDERS, unknown[]]>([
      ['month_analysis', 'month_analysis', { kind: 'month', ...lastMonth }, 'month', ['user-1', lastMonth, false]],
      ['year_analysis', 'year_analysis', { kind: 'year', year: lastYear }, 'year', ['user-1', lastYear, false]],
      ['ytd_analysis', 'ytd_analysis', { kind: 'ytd' }, 'ytd', ['user-1', false]],
      ['history_analysis', 'history_analysis', { kind: 'history' }, 'history', ['user-1', 2025, false]],
      ['register', 'register', { kind: 'none' }, 'register', ['user-1', expect.any(Date)]],
      ['chat · none', 'chat', { kind: 'none' }, 'today', ['user-1']],
      ['chat · month', 'chat', { kind: 'month', ...lastMonth }, 'month', ['user-1', lastMonth, false]],
      ['chat · year', 'chat', { kind: 'year', year: lastYear }, 'year', ['user-1', lastYear, false]],
      ['chat · ytd', 'chat', { kind: 'ytd' }, 'ytd', ['user-1', false]],
      ['chat · history', 'chat', { kind: 'history' }, 'history', ['user-1', 2025, false]],
    ])('R7b: a %s reading runs its builder and no other', async (_name, intent, period, builder, args) => {
      routerAnswers({ intent, period, webSearch: false, confidence: 0.9 });
      const response = await streamRequest({ mode: 'auto' });
      expect(response.status).toBe(200);
      await response.text();
      for (const [name, mock] of Object.entries(BUILDERS)) {
        if (name === builder) expect(mock, name).toHaveBeenCalledWith(...args);
        else expect(mock, name).not.toHaveBeenCalled();
      }
    });

    it('R7c: a fallback reading answers on today\'s portfolio, and the route event says why', async () => {
      routeAssistantMessageMock.mockResolvedValue({ route: FALLBACK_ROUTE, source: 'fallback', reason: 'timeout', elapsedMs: 4000 });
      const events = readEvents(await (await streamRequest({ mode: 'auto' })).text());
      expect(buildAssistantTodayContextMock).toHaveBeenCalledWith('user-1');
      expect(buildAssistantMonthContextMock).not.toHaveBeenCalled();
      expect(events.find((event) => event.type === 'route')).toEqual({
        type: 'route', reading: { route: FALLBACK_ROUTE, source: 'fallback', reason: 'timeout' },
      });
      expect(streamArgs()).toMatchObject({ mode: 'chat', contextBundle: null });
    });

    it('R8: an explicit mode never calls the router and emits no route event', async () => {
      const streamText = await (await streamRequest({ mode: 'month_analysis', month: { year: 2026, month: 3 } })).text();
      expect(routeAssistantMessageMock).not.toHaveBeenCalled();
      expect(createRouterClientMock).not.toHaveBeenCalled();
      expect(streamText).not.toContain('"type":"route"');
      expect(appendAssistantMessageMock.mock.calls[1][1]).not.toHaveProperty('routeReading');
    });

    it.each([
      [true, 'carried'],
      [undefined, 'override'],
    ])('R8b: an override with routeCarried=%s skips the router and reads source «%s», confidence 1', async (routeCarried, source) => {
      const route = { intent: 'chat', period: { kind: 'none' }, webSearch: false };
      const events = readEvents(await (await streamRequest({ mode: 'auto', route, ...(routeCarried ? { routeCarried } : {}) })).text());
      expect(routeAssistantMessageMock).not.toHaveBeenCalled();
      const expected = { route: { ...route, confidence: 1 }, source };
      expect(events.find((event) => event.type === 'route')).toEqual({ type: 'route', reading: expected });
      expect(appendAssistantMessageMock.mock.calls[1][1].routeReading).toEqual(expected);
    });

    it.each<[string, Record<string, unknown>, string | null]>([
      ['routeCarried without route', { mode: 'auto', routeCarried: true }, null],
      ['a route beside an explicit mode', { mode: 'chat', route: { intent: 'chat', period: { kind: 'none' }, webSearch: false } }, null],
      ["'auto' with a month", { mode: 'auto', month: { year: 2026, month: 3 } }, null],
      ['an analysis on a year', { mode: 'auto', route: { intent: 'month_analysis', period: { kind: 'year', year: 2025 }, webSearch: false } }, 'Lettura non valida.'],
      ['a month after today', { mode: 'auto', route: { intent: 'chat', period: { kind: 'month', ...nextMonth }, webSearch: false } }, 'Lettura non valida.'],
      ['Registra with the web', { mode: 'auto', route: { intent: 'register', period: { kind: 'none' }, webSearch: true } }, 'Lettura non valida.'],
    ])('R9: %s is a 400, and nothing is read or called', async (_name, body, error) => {
      const response = await streamRequest(body);
      expect(response.status).toBe(400);
      if (error) await expect(response.json()).resolves.toEqual({ error });
      expect(routeAssistantMessageMock).not.toHaveBeenCalled();
      expect(fetchCashflowBlockInputsMock).not.toHaveBeenCalled();
      expect(streamAssistantResponseMock).not.toHaveBeenCalled();
    });

    const MACRO_OFF = { includeMacroContext: false };
    const MACRO_ON = { includeMacroContext: true };

    it.each<[string, Record<string, unknown>, AssistantRoute | null, boolean, boolean | undefined]>([
      ['a Registra override + «petrolio»', { mode: 'auto', prompt: 'benzina 60, il petrolio sale', route: { intent: 'register', period: { kind: 'none' }, webSearch: false } }, null, false, undefined],
      ['a router chat without web + «inflazione»', { mode: 'auto', prompt: 'cosa fa l\'inflazione ai miei risparmi?' }, { intent: 'chat', period: { kind: 'none' }, webSearch: false, confidence: 0.9 }, true, undefined],
      ['an override chat without web + «inflazione»', { mode: 'auto', prompt: 'cosa fa l\'inflazione ai miei risparmi?', route: { intent: 'chat', period: { kind: 'none' }, webSearch: false } }, null, false, undefined],
      // A CARRIED reading is not an override: like the router's, it only adds to today's policy (owner,
      // 2026-11-16; seen red with 'carried' taken as it is, like 'override').
      ['a carried chat without web + «inflazione»', { mode: 'auto', prompt: 'cosa fa l\'inflazione ai miei risparmi?', route: { intent: 'chat', period: { kind: 'none' }, webSearch: false }, routeCarried: true }, null, true, undefined],
      ['a carried analysis without web with «Contesto macro» on', { mode: 'auto', preferences: MACRO_ON, route: { intent: LAST_MONTH_ROUTE.intent, period: LAST_MONTH_ROUTE.period, webSearch: false }, routeCarried: true }, null, true, true],
      ['a router analysis with «Contesto macro» on', { mode: 'auto', preferences: MACRO_ON }, LAST_MONTH_ROUTE, true, true],
      ['a router analysis with the web and «Contesto macro» off', { mode: 'auto', preferences: MACRO_OFF }, { ...LAST_MONTH_ROUTE, webSearch: true }, true, true],
      ['an explicit analysis with «Contesto macro» off', { mode: 'month_analysis', month: { year: 2026, month: 3 }, preferences: MACRO_OFF }, null, false, false],
    ])('R10: %s', async (_name, body, routerRoute, web, macroSentence) => {
      if (routerRoute) routerAnswers(routerRoute);
      const events = readEvents(await (await streamRequest(body)).text());
      expect(streamArgs().enableWebSearch).toBe(web);
      if (macroSentence !== undefined) expect(streamArgs().preferences.includeMacroContext).toBe(macroSentence);
      const routeEvent = events.find((event) => event.type === 'route');
      // The route event's flag is the EFFECTIVE decision.
      if (routeEvent && routeEvent.type === 'route') expect(routeEvent.reading.route.webSearch).toBe(web);
    });

    it('R11: the assistant message stores the route event\'s reading, without elapsedMs; the user message none', async () => {
      const events = readEvents(await (await streamRequest({ mode: 'auto' })).text());
      const routeEvent = events.find((event) => event.type === 'route');
      expect(appendAssistantMessageMock.mock.calls[0][1]).not.toHaveProperty('routeReading');
      const stored = appendAssistantMessageMock.mock.calls[1][1].routeReading;
      expect(stored).toEqual(routeEvent && routeEvent.type === 'route' ? routeEvent.reading : undefined);
      expect(stored).not.toHaveProperty('elapsedMs');
    });

    it('R13: a viewer without a grant is 403 before the router and before the date check', async () => {
      const response = await streamRequest({ mode: 'auto', userId: 'user-2' });
      expect(response.status).toBe(403);
      const future = await streamRequest({
        mode: 'auto', userId: 'user-2', route: { intent: 'chat', period: { kind: 'month', ...nextMonth }, webSearch: false },
      });
      expect(future.status).toBe(403);
      expect(routeAssistantMessageMock).not.toHaveBeenCalled();
    });

    it('R13: past the hourly limit is 429, and the router is never called', async () => {
      vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 60 } as ReturnType<typeof checkRateLimit>);
      const response = await streamRequest({ mode: 'auto' });
      expect(response.status).toBe(429);
      expect(routeAssistantMessageMock).not.toHaveBeenCalled();
    });

    it('R13: without a key the route answers 503 and never reads the message', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const response = await streamRequest({ mode: 'auto' });
      expect(response.status).toBe(503);
      expect(routeAssistantMessageMock).not.toHaveBeenCalled();
    });
  });
});
