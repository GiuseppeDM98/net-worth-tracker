import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Unit tests for the real store.ts memory merge/transaction logic.
 *
 * Runs the REAL updateAssistantMemoryDocument/applyAssistantMemoryMutations against a
 * fake Admin `runTransaction` whose `tx.get` throws once a write has happened — same
 * template as __tests__/assetTransactionWriteTx.test.ts. Covers:
 * - the PATCH-metadata-loss bug (a patch carrying only `text` must not wipe
 *   sourceThreadId/evidenceSummary/evaluation history)
 * - applyAssistantMemoryMutations batching multiple item/suggestion mutations into
 *   exactly ONE Firestore transaction
 * - hasDummySnapshots is never fabricated by these write helpers
 */

const mocks = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  runTransactionCalls: { count: 0 },
}));
const store = mocks.store;
const docKey = (collection: string, id: string) => `${collection}/${id}`;

vi.mock('server-only', () => ({}));

vi.mock('@/lib/firebase/admin', () => {
  const key = (collection: string, id: string) => `${collection}/${id}`;
  const { store, runTransactionCalls } = mocks;

  const makeDocRef = (collection: string, id: string) => ({
    id,
    _collection: collection,
    get: async () => {
      const data = store.get(key(collection, id));
      return { exists: data !== undefined, id, data: () => data };
    },
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      const k = key(collection, id);
      store.set(k, opts?.merge ? { ...(store.get(k) ?? {}), ...data } : { ...data });
    },
  });

  const adminDb = {
    collection: (name: string) => ({
      doc: (id: string) => makeDocRef(name, id),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      runTransactionCalls.count += 1;
      let hasWritten = false;
      const pending: { collection: string; id: string; data: Record<string, unknown>; merge?: boolean }[] = [];
      const tx = {
        get: async (ref: { _collection: string; id: string }) => {
          if (hasWritten) {
            throw new Error('Firestore transactions require all reads to be executed before all writes.');
          }
          const data = store.get(key(ref._collection, ref.id));
          return { exists: data !== undefined, id: ref.id, data: () => data };
        },
        set: (
          ref: { _collection: string; id: string },
          data: Record<string, unknown>,
          opts?: { merge?: boolean }
        ) => {
          hasWritten = true;
          pending.push({ collection: ref._collection, id: ref.id, data, merge: opts?.merge });
        },
      };

      const result = await fn(tx);

      for (const write of pending) {
        const k = key(write.collection, write.id);
        store.set(k, write.merge ? { ...(store.get(k) ?? {}), ...write.data } : { ...write.data });
      }

      return result;
    },
  };

  return { adminDb };
});

import { Timestamp } from 'firebase-admin/firestore';
import {
  applyAssistantMemoryMutations,
  updateAssistantMemoryDocument,
} from '@/lib/server/assistant/store';

const USER = 'user-1';

function seedMemory(overrides: Record<string, unknown> = {}) {
  store.set(docKey('assistantMemory', USER), {
    preferences: {
      responseStyle: 'balanced',
      includeMacroContext: false,
      memoryEnabled: true,
      includeDummySnapshots: false,
    },
    items: [],
    suggestions: [],
    updatedAt: Timestamp.now(),
    ...overrides,
  });
}

describe('assistant memory store (real merge/transaction logic)', () => {
  beforeEach(() => {
    store.clear();
    mocks.runTransactionCalls.count = 0;
  });

  describe('updateAssistantMemoryDocument — PATCH metadata preservation', () => {
    it('preserves sourceThreadId/evidenceSummary/evaluation when the patch carries only text', async () => {
      seedMemory({
        items: [
          {
            id: 'item-1',
            userId: USER,
            category: 'goal',
            text: 'FIRE a 45 anni',
            status: 'active',
            createdAt: Timestamp.fromDate(new Date(2026, 0, 1)),
            updatedAt: Timestamp.fromDate(new Date(2026, 0, 1)),
            sourceThreadId: 'thread-abc',
            sourceMessageId: 'msg-abc',
            evidenceSummary: 'Patrimonio liquido 45000 EUR su target 40000 EUR',
            lastEvaluationAt: Timestamp.fromDate(new Date(2026, 1, 1)),
            lastEvaluationResult: {
              matched: true,
              metricValue: 45000,
              targetValue: 40000,
              unit: 'eur',
              evaluatedAgainst: 'liquid_net_worth',
              summary: 'Patrimonio liquido attuale 45000 EUR su target 40000 EUR',
            },
          },
        ],
      });

      const result = await updateAssistantMemoryDocument(USER, {
        item: { id: 'item-1', text: 'FIRE a 45 anni, testo aggiornato', category: 'goal' },
      });

      const updated = result.items.find((i) => i.id === 'item-1')!;
      expect(updated.text).toBe('FIRE a 45 anni, testo aggiornato');
      expect(updated.sourceThreadId).toBe('thread-abc');
      expect(updated.sourceMessageId).toBe('msg-abc');
      expect(updated.evidenceSummary).toBe('Patrimonio liquido 45000 EUR su target 40000 EUR');
      expect(updated.lastEvaluationResult?.metricValue).toBe(45000);
      expect(updated.lastEvaluationAt).toBeInstanceOf(Date);

      // Also verify what actually landed in Firestore, not just the return value.
      const persisted = store.get(docKey('assistantMemory', USER))!;
      const persistedItem = (persisted.items as Record<string, unknown>[])[0];
      expect(persistedItem.sourceThreadId).toBe('thread-abc');
      expect(persistedItem.evidenceSummary).toBe('Patrimonio liquido 45000 EUR su target 40000 EUR');
    });

    it('clears completedAt only on an explicit status change away from completed', async () => {
      seedMemory({
        items: [
          {
            id: 'item-2',
            userId: USER,
            category: 'goal',
            text: 'Liquidità 40k',
            status: 'completed',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            completedAt: Timestamp.now(),
          },
        ],
      });

      const result = await updateAssistantMemoryDocument(USER, {
        item: { id: 'item-2', text: 'Liquidità 40k', category: 'goal', status: 'active', completedAt: undefined },
      });

      const updated = result.items.find((i) => i.id === 'item-2')!;
      expect(updated.status).toBe('active');
      expect(updated.completedAt).toBeUndefined();
    });

    it('does not touch completedAt when the patch never mentions status', async () => {
      const completedAt = new Date(2026, 2, 1);
      seedMemory({
        items: [
          {
            id: 'item-3',
            userId: USER,
            category: 'fact',
            text: 'Ho un mutuo a tasso fisso',
            status: 'completed',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            completedAt: Timestamp.fromDate(completedAt),
          },
        ],
      });

      const result = await updateAssistantMemoryDocument(USER, {
        item: { id: 'item-3', text: 'Ho un mutuo a tasso fisso (aggiornato)', category: 'fact' },
      });

      const updated = result.items.find((i) => i.id === 'item-3')!;
      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toEqual(completedAt);
    });
  });

  describe('applyAssistantMemoryMutations', () => {
    it('applies multiple item/suggestion mutations in exactly one Firestore transaction', async () => {
      seedMemory();

      const result = await applyAssistantMemoryMutations(USER, [
        { kind: 'item', item: { id: 'item-1', category: 'goal', text: 'Liquidità 40k' } },
        { kind: 'item', item: { id: 'item-2', category: 'fact', text: 'Mutuo a tasso fisso' } },
        {
          kind: 'suggestion',
          suggestion: {
            id: 'sugg-1',
            itemId: 'item-1',
            type: 'complete_goal',
            status: 'pending',
            evidenceSummary: 'raggiunto',
            evaluation: {
              matched: true,
              metricValue: 45000,
              targetValue: 40000,
              unit: 'eur',
              evaluatedAgainst: 'liquid_net_worth',
              summary: 'raggiunto',
            },
          },
        },
      ]);

      expect(mocks.runTransactionCalls.count).toBe(1);
      expect(result.items).toHaveLength(2);
      expect(result.suggestions).toHaveLength(1);

      const persisted = store.get(docKey('assistantMemory', USER))!;
      expect((persisted.items as unknown[]).length).toBe(2);
      expect((persisted.suggestions as unknown[]).length).toBe(1);
    });

    it('never wipes existing metadata when batched alongside other mutations', async () => {
      seedMemory({
        items: [
          {
            id: 'item-1',
            userId: USER,
            category: 'goal',
            text: 'FIRE a 45 anni',
            status: 'active',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            sourceThreadId: 'thread-abc',
          },
        ],
      });

      const result = await applyAssistantMemoryMutations(USER, [
        {
          kind: 'item',
          item: {
            id: 'item-1',
            category: 'goal',
            text: 'FIRE a 45 anni',
            lastEvaluationAt: new Date(),
            lastEvaluationResult: {
              matched: false,
              metricValue: 10000,
              targetValue: 40000,
              unit: 'eur',
              evaluatedAgainst: 'liquid_net_worth',
              summary: 'x',
            },
          },
        },
        { kind: 'item', item: { id: 'item-2', category: 'fact', text: 'Nuovo fatto' } },
      ]);

      const updated = result.items.find((i) => i.id === 'item-1')!;
      expect(updated.sourceThreadId).toBe('thread-abc');
      expect(updated.lastEvaluationResult?.metricValue).toBe(10000);
    });

    it('is a no-op (no transaction) when given an empty mutations array', async () => {
      seedMemory();
      await applyAssistantMemoryMutations(USER, []);
      expect(mocks.runTransactionCalls.count).toBe(0);
    });
  });

  describe('updatedAt marks the last CONTENT change', () => {
    // The durable "Ignora" compares item.updatedAt with the ignored suggestion's
    // updatedAt. If a daily re-evaluation bumped the item, every ignore would
    // expire on the next cron run and the completion banner would come back.
    const contentDate = new Date(2026, 0, 1);

    function seedGoal(extra: Record<string, unknown> = {}) {
      seedMemory({
        items: [
          {
            id: 'goal-1',
            userId: USER,
            category: 'goal',
            text: 'Liquidità a 40k',
            status: 'active',
            createdAt: Timestamp.fromDate(contentDate),
            updatedAt: Timestamp.fromDate(contentDate),
            structuredGoal: {
              kind: 'cash_target',
              targetValue: 40000,
              unit: 'eur',
              direction: 'at_least',
            },
            ...extra,
          },
        ],
      });
    }

    it('is preserved when a mutation only stamps a new evaluation', async () => {
      seedGoal();

      const result = await applyAssistantMemoryMutations(USER, [
        {
          kind: 'item',
          item: {
            id: 'goal-1',
            category: 'goal',
            text: 'Liquidità a 40k',
            status: 'active',
            structuredGoal: {
              kind: 'cash_target',
              targetValue: 40000,
              unit: 'eur',
              direction: 'at_least',
            },
            lastEvaluationAt: new Date(2026, 7, 15),
            lastEvaluationResult: {
              matched: true,
              metricValue: 45000,
              targetValue: 40000,
              unit: 'eur',
              evaluatedAgainst: 'cash',
              summary: 'raggiunto',
            },
          },
        },
      ]);

      const updated = result.items.find((i) => i.id === 'goal-1')!;
      expect(updated.updatedAt).toEqual(contentDate);
      expect(updated.lastEvaluationResult?.metricValue).toBe(45000);
    });

    it('is bumped when the goal text changes', async () => {
      seedGoal();

      const result = await updateAssistantMemoryDocument(USER, {
        item: {
          id: 'goal-1',
          category: 'goal',
          text: 'Liquidità a 60k',
          structuredGoal: {
            kind: 'cash_target',
            targetValue: 60000,
            unit: 'eur',
            direction: 'at_least',
          },
        },
      });

      const updated = result.items.find((i) => i.id === 'goal-1')!;
      expect(updated.updatedAt.getTime()).toBeGreaterThan(contentDate.getTime());
    });

    it('is bumped when only the target of the structured goal changes', async () => {
      seedGoal();

      const result = await updateAssistantMemoryDocument(USER, {
        item: {
          id: 'goal-1',
          category: 'goal',
          text: 'Liquidità a 40k',
          structuredGoal: {
            kind: 'cash_target',
            targetValue: 50000,
            unit: 'eur',
            direction: 'at_least',
          },
        },
      });

      const updated = result.items.find((i) => i.id === 'goal-1')!;
      expect(updated.updatedAt.getTime()).toBeGreaterThan(contentDate.getTime());
    });

    it('lets the caller clear a structured goal that no longer fits the text', async () => {
      // The regex parser is gone: mergeMemoryItem never re-derives a structure.
      // When the PATCH route fails to re-structure an edited goal, the goal must
      // become visibly un-trackable rather than keep measuring the old target.
      seedGoal();

      const result = await updateAssistantMemoryDocument(USER, {
        item: { id: 'goal-1', category: 'goal', text: 'Voglio vivere di rendita' },
      });

      const updated = result.items.find((i) => i.id === 'goal-1')!;
      expect(updated.structuredGoal).toBeUndefined();
      expect(updated.updatedAt.getTime()).toBeGreaterThan(contentDate.getTime());
    });
  });

  describe('hasDummySnapshots', () => {
    it('is never fabricated by updateAssistantMemoryDocument', async () => {
      seedMemory();
      const result = await updateAssistantMemoryDocument(USER, {
        item: { id: 'item-1', category: 'fact', text: 'Ho un mutuo a tasso fisso' },
      });
      expect(result.hasDummySnapshots).toBeUndefined();
    });

    it('is never fabricated by applyAssistantMemoryMutations', async () => {
      seedMemory();
      const result = await applyAssistantMemoryMutations(USER, [
        { kind: 'item', item: { id: 'item-1', category: 'fact', text: 'Ho un mutuo a tasso fisso' } },
      ]);
      expect(result.hasDummySnapshots).toBeUndefined();
    });
  });
});
