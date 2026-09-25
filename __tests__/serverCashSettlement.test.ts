import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration test for `settleDueBalances` (lib/server/cashSettlement.ts) — the server job the
 * snapshot route runs first: every pending row whose date has arrived moves its account and, for
 * a mortgage instalment linked to a property, pays down the property's debt by its PRINCIPAL
 * (lib/utils/mortgageRepayment.ts), stamping the row with what it repaid.
 *
 * Runs the REAL function against an in-memory Admin Firestore whose transaction enforces the
 * SDK's «all reads before all writes» (a `get` after an `update` throws, as the live one does),
 * so an interleaved read of a property after the account writes would fail here. A Playwright
 * spec cannot reach this module (no `@/` alias in `e2e/`), which is why it is pinned here.
 */

type Doc = Record<string, unknown>;

const DELETE = Symbol('delete');
const collections: Record<string, Map<string, Doc>> = { expenses: new Map(), assets: new Map() };

interface FakeRef {
  collection: string;
  id: string;
}

function snapshotOf(ref: FakeRef) {
  const data = collections[ref.collection].get(ref.id);
  return { id: ref.id, ref, exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
}

function applyUpdate(ref: FakeRef, update: Doc) {
  const current = { ...collections[ref.collection].get(ref.id)! };
  for (const [key, value] of Object.entries(update)) {
    if (value === DELETE) delete current[key];
    else current[key] = value;
  }
  collections[ref.collection].set(ref.id, current);
}

vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => DELETE } }));
vi.mock('@/lib/services/dashboardOverviewInvalidation.server', () => ({
  invalidateDashboardOverviewSummaryServer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      const filters: [string, unknown][] = [];
      const query = {
        doc: (id: string): FakeRef => ({ collection: name, id }),
        where: (field: string, _op: string, value: unknown) => {
          filters.push([field, value]);
          return query;
        },
        get: async () => ({
          docs: [...collections[name].keys()]
            .map((id) => snapshotOf({ collection: name, id }))
            .filter((snap) => filters.every(([field, value]) => snap.data()![field] === value)),
        }),
      };
      return query;
    },
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      let hasWritten = false;
      const writes: [FakeRef, Doc][] = [];
      const tx = {
        get: async (ref: FakeRef) => {
          if (hasWritten) throw new Error('Firestore transactions require all reads to be executed before all writes.');
          return snapshotOf(ref);
        },
        update: (ref: FakeRef, update: Doc) => {
          hasWritten = true;
          writes.push([ref, update]);
        },
      };
      const result = await fn(tx);
      for (const [ref, update] of writes) applyUpdate(ref, update);
      return result;
    },
  },
}));

import { settleDueBalances } from '@/lib/server/cashSettlement';

const UID = 'u1';
const NOW = new Date(2026, 9, 10, 20);

function instalment(id: string, date: Date, extra: Doc = {}) {
  collections.expenses.set(id, {
    userId: UID,
    type: 'debt',
    amount: -1012,
    date,
    linkedCashAssetId: 'bnl',
    debtAssetId: 'casa',
    balancePending: true,
    ...extra,
  });
}

beforeEach(() => {
  collections.expenses.clear();
  collections.assets.clear();
  collections.assets.set('bnl', { userId: UID, quantity: 5000 });
  collections.assets.set('casa', { userId: UID, outstandingDebt: 200_000, debtInterestRate: 3.6 });
});

describe('settleDueBalances — a mortgage instalment on its day', () => {
  it('should debit the account, repay the principal and stamp the row, leaving a later row waiting', async () => {
    instalment('due', new Date(2026, 9, 10, 12));
    instalment('later', new Date(2026, 10, 10, 12));

    const { settled } = await settleDueBalances(UID, NOW);

    expect(settled).toBe(1);
    expect(collections.assets.get('bnl')!.quantity).toBe(5000 - 1012);
    // 200.000 × 3,6% / 12 = 600 of interest → 412 of principal.
    expect(collections.assets.get('casa')!.outstandingDebt).toBe(199_588);
    expect(collections.expenses.get('due')).toMatchObject({ debtPrincipalRepaid: 412, debtInterestPaid: 600 });
    expect(collections.expenses.get('due')).not.toHaveProperty('balancePending');
    expect(collections.expenses.get('later')).toMatchObject({ balancePending: true });
    expect(collections.expenses.get('later')).not.toHaveProperty('debtPrincipalRepaid');
  });

  it('should apply two due instalments in date order, the second on the debt the first left', async () => {
    instalment('september', new Date(2026, 8, 10, 12));
    instalment('october', new Date(2026, 9, 10, 12));

    await settleDueBalances(UID, NOW);

    expect(collections.expenses.get('september')!.debtPrincipalRepaid).toBe(412);
    expect(collections.expenses.get('october')!.debtPrincipalRepaid).toBe(413.24);
    expect(collections.assets.get('casa')!.outstandingDebt).toBe(199_174.76);
  });

  it('should settle a row whose property is someone else\'s without touching that debt', async () => {
    collections.assets.set('casa', { userId: 'someone-else', outstandingDebt: 200_000, debtInterestRate: 3.6 });
    instalment('due', new Date(2026, 9, 10, 12));

    const { settled } = await settleDueBalances(UID, NOW);

    expect(settled).toBe(1);
    expect(collections.assets.get('casa')!.outstandingDebt).toBe(200_000);
    expect(collections.expenses.get('due')).toMatchObject({ debtPrincipalRepaid: 0 });
    expect(collections.expenses.get('due')).not.toHaveProperty('balancePending');
  });

  it('should repay nothing twice when it runs again', async () => {
    instalment('due', new Date(2026, 9, 10, 12));

    await settleDueBalances(UID, NOW);
    const second = await settleDueBalances(UID, NOW);

    expect(second.settled).toBe(0);
    expect(collections.assets.get('casa')!.outstandingDebt).toBe(199_588);
    expect(collections.assets.get('bnl')!.quantity).toBe(5000 - 1012);
  });

  it('should settle a plain linked row exactly as before, with no debt stamp', async () => {
    collections.expenses.set('groceries', { userId: UID, type: 'variable', amount: -80, date: new Date(2026, 9, 10, 12), linkedCashAssetId: 'bnl', balancePending: true });

    await settleDueBalances(UID, NOW);

    expect(collections.assets.get('bnl')!.quantity).toBe(4920);
    expect(collections.expenses.get('groceries')).not.toHaveProperty('debtPrincipalRepaid');
    expect(collections.assets.get('casa')!.outstandingDebt).toBe(200_000);
  });
});
