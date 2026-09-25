/**
 * Tests for lib/services/dividendIncomeService.ts — the income row of a dividend and the cash
 * account it credits (the rule itself is pinned by dividendAccount.test.ts).
 *
 * The Admin SDK is an in-memory fake built inside `vi.hoisted` (a plain const is not initialised
 * when the hoisted `vi.mock` factory runs): documents live in one Map keyed `collection/id`, and
 * `runTransaction` hands out a `tx` over the same Map, so the assertions read what Firestore
 * would hold after the write. It does not evaluate the reads-before-writes rule — the emulator
 * exercise does.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldValue } from 'firebase-admin/firestore';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

const fake = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const dividendUpdateMock = vi.fn();
  let nextId = 0;

  const refOf = (collection: string, id: string) => {
    const key = `${collection}/${id}`;
    const snapshot = () => ({ exists: docs.has(key), id, data: () => docs.get(key) });
    return {
      id,
      key,
      get: async () => snapshot(),
      update: async (patch: Record<string, unknown>) => {
        if (collection === 'dividends') dividendUpdateMock(patch);
        docs.set(key, { ...(docs.get(key) ?? {}), ...patch });
      },
      delete: async () => void docs.delete(key),
    };
  };
  type Ref = ReturnType<typeof refOf>;

  const tx = {
    get: async (ref: Ref) => ref.get(),
    set: (ref: Ref, data: Record<string, unknown>) => void docs.set(ref.key, data),
    update: (ref: Ref, patch: Record<string, unknown>) => void docs.set(ref.key, { ...(docs.get(ref.key) ?? {}), ...patch }),
    delete: (ref: Ref) => void docs.delete(ref.key),
  };

  const adminDb = {
    collection: (name: string) => ({ doc: (id?: string) => refOf(name, id ?? `auto-${++nextId}`) }),
    runTransaction: async <T,>(body: (t: typeof tx) => Promise<T>) => body(tx),
  };
  return { docs, dividendUpdateMock, adminDb };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: fake.adminDb }));
vi.mock('@/lib/services/currencyConversionService', () => ({
  convertMultipleToEur: vi.fn(),
  getExchangeRateToEur: vi.fn(),
}));
vi.mock('@/lib/services/dashboardOverviewInvalidation.server', () => ({
  invalidateDashboardOverviewSummaryServer: vi.fn().mockResolvedValue(undefined),
}));

import {
  createExpenseFromDividend,
  deleteExpenseForDividend,
  updateExpenseFromDividend,
} from '@/lib/services/dividendIncomeService';
import { updateDividend } from '@/lib/services/dividendService';
import type { Dividend } from '@/types/dividend';

/** 20:00 in Italy on 2026-09-20: the cron's hour. */
const NOW = new Date('2026-09-20T18:00:00Z');
const TODAY = new Date('2026-09-20T00:00:00+02:00');
const LAST_SPRING = new Date('2026-03-10T00:00:00+01:00');

function dividend(overrides: Partial<Dividend> = {}): Dividend {
  return {
    id: 'div-1',
    userId: 'u1',
    assetId: 'vwce',
    assetTicker: 'VWCE',
    assetName: 'Vanguard FTSE All-World',
    paymentDate: TODAY,
    netAmount: 12.3456,
    currency: 'EUR',
    ...overrides,
  } as Dividend;
}

function seed(overrides: { assetAccount?: string; defaultAccount?: string } = {}) {
  fake.docs.set('dividends/div-1', { userId: 'u1' });
  fake.docs.set('assets/vwce', { userId: 'u1', type: 'etf', dividendCashAssetId: overrides.assetAccount });
  fake.docs.set('assetAllocationTargets/u1', { dividendCashAssetId: overrides.defaultAccount });
  fake.docs.set('assets/directa', { userId: 'u1', type: 'cash', assetClass: 'cash', currency: 'EUR', quantity: 1000 });
  fake.docs.set('assets/fineco', { userId: 'u1', type: 'cash', assetClass: 'cash', currency: 'EUR', quantity: 500 });
}

const balanceOf = (accountId: string) => fake.docs.get(`assets/${accountId}`)?.quantity;
const rowOf = (expenseId: string) => fake.docs.get(`expenses/${expenseId}`);

beforeEach(() => {
  fake.docs.clear();
  fake.dividendUpdateMock.mockClear();
});

describe('createExpenseFromDividend', () => {
  it('should credit the account of the instrument, to the cent, and link the row to it', async () => {
    seed({ assetAccount: 'directa', defaultAccount: 'fineco' });

    const expenseId = await createExpenseFromDividend(dividend(), 'cat-1', 'Dividendi', undefined, undefined, NOW);

    expect(rowOf(expenseId)).toMatchObject({ type: 'income', amount: 12.35, currency: 'EUR', linkedCashAssetId: 'directa' });
    expect(rowOf(expenseId)).not.toHaveProperty('balancePending'); // absent means applied
    expect(balanceOf('directa')).toBe(1012.35);
    expect(balanceOf('fineco')).toBe(500);
    expect(fake.docs.get('dividends/div-1')?.expenseId).toBe(expenseId);
  });

  it('should fall back to the default account of the settings', async () => {
    seed({ defaultAccount: 'fineco' });

    const expenseId = await createExpenseFromDividend(dividend(), 'cat-1', 'Dividendi', undefined, undefined, NOW);

    expect(rowOf(expenseId)?.linkedCashAssetId).toBe('fineco');
    expect(balanceOf('fineco')).toBe(512.35);
  });

  it('should write an arrear with no account and move nothing', async () => {
    seed({ assetAccount: 'directa', defaultAccount: 'fineco' });

    const expenseId = await createExpenseFromDividend(
      dividend({ paymentDate: LAST_SPRING }), 'cat-1', 'Dividendi', undefined, undefined, NOW,
    );

    expect(rowOf(expenseId)).toMatchObject({ amount: 12.35 });
    expect(rowOf(expenseId)).not.toHaveProperty('linkedCashAssetId');
    expect(balanceOf('directa')).toBe(1000);
    expect(balanceOf('fineco')).toBe(500);
  });

  it('should write the row without a link when nothing is configured', async () => {
    seed();

    const expenseId = await createExpenseFromDividend(dividend(), 'cat-1', 'Dividendi', undefined, undefined, NOW);

    expect(rowOf(expenseId)).not.toHaveProperty('linkedCashAssetId');
  });

  it('should not credit an account that is not the user’s own cash account, nor one in another currency', async () => {
    seed({ assetAccount: 'directa' });
    fake.docs.set('assets/directa', { userId: 'someone-else', type: 'cash', assetClass: 'cash', currency: 'EUR', quantity: 1000 });
    const foreign = await createExpenseFromDividend(dividend(), 'cat-1', 'Dividendi', undefined, undefined, NOW);
    expect(rowOf(foreign)).not.toHaveProperty('linkedCashAssetId');
    expect(balanceOf('directa')).toBe(1000);

    fake.docs.set('dividends/div-2', { userId: 'u1' });
    fake.docs.set('assets/directa', { userId: 'u1', type: 'cash', assetClass: 'cash', currency: 'EUR', quantity: 1000 });
    const dollars = await createExpenseFromDividend(
      dividend({ id: 'div-2', currency: 'USD', netAmount: 20 }), 'cat-1', 'Dividendi', undefined, undefined, NOW,
    );
    expect(rowOf(dollars)).toMatchObject({ currency: 'USD' });
    expect(rowOf(dollars)).not.toHaveProperty('linkedCashAssetId');
    expect(balanceOf('directa')).toBe(1000);
  });

  it('should be idempotent: a dividend that already has its row credits nothing twice', async () => {
    seed({ assetAccount: 'directa' });

    const first = await createExpenseFromDividend(dividend(), 'cat-1', 'Dividendi', undefined, undefined, NOW);
    const second = await createExpenseFromDividend(dividend(), 'cat-1', 'Dividendi', undefined, undefined, NOW);

    expect(second).toBe(first);
    expect(balanceOf('directa')).toBe(1012.35);
  });
});

describe('updateExpenseFromDividend', () => {
  it('should give the account the difference when the dividend changes', async () => {
    seed({ assetAccount: 'directa' });
    const expenseId = await createExpenseFromDividend(dividend(), 'cat-1', 'Dividendi', undefined, undefined, NOW);

    await updateExpenseFromDividend(dividend({ netAmount: 20 }), expenseId, 'Dividendi');

    expect(rowOf(expenseId)).toMatchObject({ amount: 20, linkedCashAssetId: 'directa' });
    expect(balanceOf('directa')).toBeCloseTo(1020, 9);
  });

  it('should move nothing for a row that never credited an account', async () => {
    seed({ assetAccount: 'directa' });
    const expenseId = await createExpenseFromDividend(
      dividend({ paymentDate: LAST_SPRING }), 'cat-1', 'Dividendi', undefined, undefined, NOW,
    );

    await updateExpenseFromDividend(dividend({ paymentDate: LAST_SPRING, netAmount: 20 }), expenseId, 'Dividendi');

    expect(rowOf(expenseId)).toMatchObject({ amount: 20 });
    expect(balanceOf('directa')).toBe(1000);
  });
});

describe('deleteExpenseForDividend', () => {
  it('should give back what the row had credited', async () => {
    seed({ assetAccount: 'directa' });
    const expenseId = await createExpenseFromDividend(dividend(), 'cat-1', 'Dividendi', undefined, undefined, NOW);

    await deleteExpenseForDividend('div-1', expenseId);

    expect(rowOf(expenseId)).toBeUndefined();
    expect(balanceOf('directa')).toBeCloseTo(1000, 9);
  });

  it('deletes the expense row and clears the dividend link with the delete sentinel', async () => {
    fake.docs.set('expenses/exp-1', { userId: 'u1', type: 'income', amount: 10 });
    fake.docs.set('dividends/div-1', { userId: 'u1', expenseId: 'exp-1' });

    await deleteExpenseForDividend('div-1', 'exp-1');

    expect(rowOf('exp-1')).toBeUndefined();
    expect(fake.dividendUpdateMock).toHaveBeenCalledOnce();
    // Regression: `removeUndefinedDeep` used to strip `expenseId: undefined` before the
    // write, so the stale link survived. The key must reach Firestore as a delete sentinel.
    const payload = fake.dividendUpdateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toHaveProperty('expenseId');
    expect(payload.expenseId).toBeInstanceOf(FieldValue);
    expect((payload.expenseId as FieldValue).isEqual(FieldValue.delete())).toBe(true);
  });
});

describe('updateDividend expenseId handling', () => {
  it('leaves the link untouched when a partial update omits expenseId', async () => {
    await updateDividend('div-1', { quantity: 10 });

    const payload = fake.dividendUpdateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('expenseId');
    expect(payload.quantity).toBe(10);
  });

  it('writes the expense id when linking', async () => {
    await updateDividend('div-1', { expenseId: 'exp-9' });

    expect((fake.dividendUpdateMock.mock.calls[0][0] as Record<string, unknown>).expenseId).toBe('exp-9');
  });
});
