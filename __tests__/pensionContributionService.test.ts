import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Behavioural tests for the pension contribution service.
 *
 * Firestore and every collaborating service are mocked (the `fireService.test.ts` pattern): what is
 * under test is the ORCHESTRATION — which value effect each nature triggers, what ends up persisted,
 * and that a delete reverses exactly what the matching create applied (invariant #5).
 */

// ─── Firestore mocks ─────────────────────────────────────────────────────────
const addDocMock = vi.fn();
const deleteDocMock = vi.fn();
const getDocsMock = vi.fn();

vi.mock('@/lib/firebase/config', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ collectionName: name }),
  doc: (_db: unknown, name: string, id: string) => ({ collectionName: name, id }),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  Timestamp: {
    now: () => new Date('2026-07-24T09:00:00Z'),
    fromDate: (date: Date) => date,
  },
}));

// ─── Collaborating service mocks ─────────────────────────────────────────────
const getAssetByIdMock = vi.fn();
const updateCashAssetBalanceMock = vi.fn();
vi.mock('@/lib/services/assetService', () => ({
  getAssetById: (...args: unknown[]) => getAssetByIdMock(...args),
  updateCashAssetBalance: (...args: unknown[]) => updateCashAssetBalanceMock(...args),
}));

const reconcileTransferCreateMock = vi.fn();
const reconcileTransferDeleteMock = vi.fn();
vi.mock('@/lib/services/cashBalanceReconciliation', () => ({
  reconcileTransferCreate: (...args: unknown[]) => reconcileTransferCreateMock(...args),
  reconcileTransferDelete: (...args: unknown[]) => reconcileTransferDeleteMock(...args),
}));

const createExpenseMock = vi.fn();
const deleteExpenseMock = vi.fn();
vi.mock('@/lib/services/expenseService', () => ({
  createExpense: (...args: unknown[]) => createExpenseMock(...args),
  deleteExpense: (...args: unknown[]) => deleteExpenseMock(...args),
}));

const ensureTransferCategoryMock = vi.fn();
const getCategoryByIdMock = vi.fn();
vi.mock('@/lib/services/expenseCategoryService', () => ({
  ensureTransferCategory: (...args: unknown[]) => ensureTransferCategoryMock(...args),
  getCategoryById: (...args: unknown[]) => getCategoryByIdMock(...args),
}));

import {
  getPensionContributions,
  recordPensionContribution,
  deletePensionContribution,
  PENSION_CONTRIBUTIONS_COLLECTION,
} from '@/lib/services/pensionContributionService';
import type { PensionContribution } from '@/types/pension';

const USER_ID = 'user-1';
const FUND_ID = 'fund-1';
const CASH_ID = 'cash-1';
const CONTRIBUTION_DATE = new Date(2026, 5, 15);

/** The payload handed to `addDoc` by the most recent write. */
function lastWrittenPayload(): Record<string, unknown> {
  return addDocMock.mock.calls.at(-1)![1] as Record<string, unknown>;
}

/** A persisted contribution, as the list query would hand it to the delete path. */
function makeStoredContribution(overrides: Partial<PensionContribution> = {}): PensionContribution {
  return {
    id: 'contribution-1',
    userId: USER_ID,
    assetId: FUND_ID,
    source: 'tfr',
    amount: 1500,
    date: CONTRIBUTION_DATE,
    taxYear: 2026,
    deductible: false,
    createdAt: CONTRIBUTION_DATE,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  addDocMock.mockResolvedValue({ id: 'new-contribution' });
  deleteDocMock.mockResolvedValue(undefined);
  updateCashAssetBalanceMock.mockResolvedValue(undefined);
  reconcileTransferCreateMock.mockResolvedValue(true);
  reconcileTransferDeleteMock.mockResolvedValue(true);
  createExpenseMock.mockResolvedValue('transfer-1');
  deleteExpenseMock.mockResolvedValue(undefined);
  ensureTransferCategoryMock.mockResolvedValue('category-transfer');
  getCategoryByIdMock.mockResolvedValue({ id: 'category-transfer', name: 'Trasferimenti' });
  getAssetByIdMock.mockResolvedValue({ id: CASH_ID, assetClass: 'cash' });
});

// ─── getPensionContributions ─────────────────────────────────────────────────

describe('getPensionContributions', () => {
  function stubDocs(docs: { id: string; data: Record<string, unknown> }[]) {
    getDocsMock.mockResolvedValue({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });
  }

  it('should query with equality filters only and sort newest first in memory', async () => {
    // Arrange: returned out of order, as an unordered Firestore query would.
    stubDocs([
      {
        id: 'old',
        data: {
          userId: USER_ID,
          assetId: FUND_ID,
          source: 'tfr',
          amount: 1000,
          date: new Date(2025, 0, 10),
          taxYear: 2025,
          deductible: false,
          createdAt: new Date(2025, 0, 10),
        },
      },
      {
        id: 'recent',
        data: {
          userId: USER_ID,
          assetId: FUND_ID,
          source: 'voluntary',
          amount: 500,
          date: new Date(2026, 5, 15),
          taxYear: 2026,
          deductible: true,
          createdAt: new Date(2026, 5, 15),
        },
      },
    ]);

    // Act
    const contributions = await getPensionContributions(USER_ID);

    // Assert: in-memory ordering, and no orderBy constraint was ever built.
    expect(contributions.map((c) => c.id)).toEqual(['recent', 'old']);
    const { constraints } = getDocsMock.mock.calls[0][0] as { constraints: unknown[] };
    expect(constraints).toEqual([{ field: 'userId', op: '==', value: USER_ID }]);
  });

  it('should add the assetId filter when scoped to one fund', async () => {
    stubDocs([]);

    await getPensionContributions(USER_ID, FUND_ID);

    const { constraints } = getDocsMock.mock.calls[0][0] as { constraints: unknown[] };
    expect(constraints).toEqual([
      { field: 'userId', op: '==', value: USER_ID },
      { field: 'assetId', op: '==', value: FUND_ID },
    ]);
  });
});

// ─── recordPensionContribution: TFR / employer ───────────────────────────────

describe('recordPensionContribution (TFR / employer)', () => {
  it('should credit the fund and record the contribution without creating an Expense', async () => {
    // Act
    const id = await recordPensionContribution(USER_ID, {
      assetId: FUND_ID,
      source: 'tfr',
      amount: 1500,
      date: CONTRIBUTION_DATE,
    });

    // Assert: value effect on the fund only — no cashflow entry, no transfer reconciliation.
    expect(id).toBe('new-contribution');
    expect(updateCashAssetBalanceMock).toHaveBeenCalledWith(FUND_ID, 1500);
    expect(createExpenseMock).not.toHaveBeenCalled();
    expect(reconcileTransferCreateMock).not.toHaveBeenCalled();

    const payload = lastWrittenPayload();
    expect(payload).toMatchObject({
      userId: USER_ID,
      assetId: FUND_ID,
      source: 'tfr',
      amount: 1500,
      taxYear: 2026,
      deductible: false,
    });
    // TFR never transits an account, so neither link is persisted.
    expect(payload).not.toHaveProperty('linkedExpenseId');
    expect(payload).not.toHaveProperty('sourceCashAssetId');
  });

  it('should persist an employer contribution as deductible', async () => {
    await recordPensionContribution(USER_ID, {
      assetId: FUND_ID,
      source: 'employer',
      amount: 800,
      date: CONTRIBUTION_DATE,
    });

    expect(updateCashAssetBalanceMock).toHaveBeenCalledWith(FUND_ID, 800);
    expect(lastWrittenPayload()).toMatchObject({ source: 'employer', deductible: true });
  });

  it('should default the tax year to the calendar year of the payment date', async () => {
    await recordPensionContribution(USER_ID, {
      assetId: FUND_ID,
      source: 'tfr',
      amount: 100,
      date: new Date(2025, 11, 31),
    });

    expect(lastWrittenPayload()).toMatchObject({ taxYear: 2025 });
  });

  it('should honour an explicit year-end straddle tax year', async () => {
    // A January payment booked to the closing tax year.
    await recordPensionContribution(USER_ID, {
      assetId: FUND_ID,
      source: 'employer',
      amount: 300,
      date: new Date(2027, 0, 10),
      taxYear: 2026,
    });

    expect(lastWrittenPayload()).toMatchObject({ taxYear: 2026 });
  });

  it('should roll back the fund credit when the record write fails', async () => {
    addDocMock.mockRejectedValueOnce(new Error('firestore unavailable'));

    await expect(
      recordPensionContribution(USER_ID, {
        assetId: FUND_ID,
        source: 'tfr',
        amount: 1500,
        date: CONTRIBUTION_DATE,
      })
    ).rejects.toThrow('firestore unavailable');

    // The credit is undone, so a retry cannot inflate the fund twice.
    expect(updateCashAssetBalanceMock).toHaveBeenNthCalledWith(1, FUND_ID, 1500);
    expect(updateCashAssetBalanceMock).toHaveBeenNthCalledWith(2, FUND_ID, -1500);
  });
});

// ─── recordPensionContribution: voluntary ────────────────────────────────────

describe('recordPensionContribution (voluntary)', () => {
  const voluntaryInput = {
    assetId: FUND_ID,
    source: 'voluntary' as const,
    amount: 500,
    date: CONTRIBUTION_DATE,
    sourceCashAssetId: CASH_ID,
  };

  it('should create the transfer entry, move both balances, and link them on the record', async () => {
    // Act
    const id = await recordPensionContribution(USER_ID, voluntaryInput);

    // Assert: audit-trail transfer entry, net-zero for the cashflow metrics.
    expect(id).toBe('new-contribution');
    const [expenseUserId, expenseData, categoryName] = createExpenseMock.mock.calls[0];
    expect(expenseUserId).toBe(USER_ID);
    expect(expenseData).toMatchObject({
      type: 'transfer',
      categoryId: 'category-transfer',
      amount: 500,
      currency: 'EUR',
      linkedCashAssetId: CASH_ID,
      transferCashAssetId: FUND_ID,
    });
    expect(categoryName).toBe('Trasferimenti');

    // Assert: account −amount, fund +amount, atomically — never a standalone fund credit.
    expect(reconcileTransferCreateMock).toHaveBeenCalledWith({
      originId: CASH_ID,
      destId: FUND_ID,
      amount: 500,
    });
    expect(updateCashAssetBalanceMock).not.toHaveBeenCalled();

    // Assert: both links persisted so the delete can reverse the exact transfer.
    expect(lastWrittenPayload()).toMatchObject({
      source: 'voluntary',
      deductible: true,
      linkedExpenseId: 'transfer-1',
      sourceCashAssetId: CASH_ID,
    });
  });

  it('should label the transfer entry with the user renamed transfer category', async () => {
    getCategoryByIdMock.mockResolvedValue({ id: 'category-transfer', name: 'Giroconti' });

    await recordPensionContribution(USER_ID, voluntaryInput);

    expect(createExpenseMock.mock.calls[0][2]).toBe('Giroconti');
  });

  it('should throw and touch nothing when the source cash account is missing', async () => {
    await expect(
      recordPensionContribution(USER_ID, { ...voluntaryInput, sourceCashAssetId: undefined })
    ).rejects.toThrow('requires a source cash account');

    expect(createExpenseMock).not.toHaveBeenCalled();
    expect(reconcileTransferCreateMock).not.toHaveBeenCalled();
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('should reject an origin account that is not a cash asset', async () => {
    // Debiting an ETF through updateCashAssetBalance would destroy its share count.
    getAssetByIdMock.mockResolvedValue({ id: 'etf-1', assetClass: 'equity' });

    await expect(
      recordPensionContribution(USER_ID, { ...voluntaryInput, sourceCashAssetId: 'etf-1' })
    ).rejects.toThrow('must come from a cash account');

    expect(createExpenseMock).not.toHaveBeenCalled();
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('should remove the transfer entry when the balance move fails', async () => {
    reconcileTransferCreateMock.mockRejectedValueOnce(new Error('transaction aborted'));

    await expect(recordPensionContribution(USER_ID, voluntaryInput)).rejects.toThrow(
      'transaction aborted'
    );

    // Otherwise the feed would show a transfer that never moved money — and deleting it by hand
    // would move the balances a second time, in the wrong direction.
    expect(deleteExpenseMock).toHaveBeenCalledWith('transfer-1');
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('should reverse the transfer and its entry when the record write fails', async () => {
    addDocMock.mockRejectedValueOnce(new Error('firestore unavailable'));

    await expect(recordPensionContribution(USER_ID, voluntaryInput)).rejects.toThrow(
      'firestore unavailable'
    );

    expect(reconcileTransferDeleteMock).toHaveBeenCalledWith({
      originId: CASH_ID,
      destId: FUND_ID,
      amount: 500,
    });
    expect(deleteExpenseMock).toHaveBeenCalledWith('transfer-1');
  });
});

// ─── recordPensionContribution: input validation ─────────────────────────────

describe('recordPensionContribution (validation)', () => {
  it.each([0, -100, Number.NaN])('should reject a non-positive amount (%s)', async (amount) => {
    await expect(
      recordPensionContribution(USER_ID, {
        assetId: FUND_ID,
        source: 'tfr',
        amount,
        date: CONTRIBUTION_DATE,
      })
    ).rejects.toThrow('positive number');

    expect(updateCashAssetBalanceMock).not.toHaveBeenCalled();
  });

  it('should reject an unknown contribution source', async () => {
    await expect(
      recordPensionContribution(USER_ID, {
        assetId: FUND_ID,
        source: 'bonus' as never,
        amount: 100,
        date: CONTRIBUTION_DATE,
      })
    ).rejects.toThrow('Unknown pension contribution source');
  });

  it('should reject a tax year more than one year away from the payment date', async () => {
    await expect(
      recordPensionContribution(USER_ID, {
        assetId: FUND_ID,
        source: 'voluntary',
        amount: 100,
        date: CONTRIBUTION_DATE,
        taxYear: 2024,
        sourceCashAssetId: CASH_ID,
      })
    ).rejects.toThrow('not plausible');

    expect(createExpenseMock).not.toHaveBeenCalled();
  });
});

// ─── deletePensionContribution ───────────────────────────────────────────────

describe('deletePensionContribution', () => {
  it('should debit the fund and remove the record for a TFR contribution', async () => {
    const contribution = makeStoredContribution({ source: 'tfr', amount: 1500 });

    await deletePensionContribution(contribution);

    expect(updateCashAssetBalanceMock).toHaveBeenCalledWith(FUND_ID, -1500);
    expect(deleteExpenseMock).not.toHaveBeenCalled();
    expect(reconcileTransferDeleteMock).not.toHaveBeenCalled();
    expect(deleteDocMock).toHaveBeenCalledWith({
      collectionName: PENSION_CONTRIBUTIONS_COLLECTION,
      id: 'contribution-1',
    });
  });

  it('should reverse the transfer and delete the linked entry for a voluntary contribution', async () => {
    const contribution = makeStoredContribution({
      source: 'voluntary',
      amount: 500,
      deductible: true,
      linkedExpenseId: 'transfer-1',
      sourceCashAssetId: CASH_ID,
    });

    await deletePensionContribution(contribution);

    // Account +amount, fund −amount: the exact mirror of the create.
    expect(reconcileTransferDeleteMock).toHaveBeenCalledWith({
      originId: CASH_ID,
      destId: FUND_ID,
      amount: 500,
    });
    expect(deleteExpenseMock).toHaveBeenCalledWith('transfer-1');
    expect(updateCashAssetBalanceMock).not.toHaveBeenCalled();
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
  });

  it('should still debit the fund when a voluntary record has no source account', async () => {
    const contribution = makeStoredContribution({
      source: 'voluntary',
      amount: 500,
      deductible: true,
      linkedExpenseId: 'transfer-1',
    });

    await deletePensionContribution(contribution);

    expect(reconcileTransferDeleteMock).toHaveBeenCalledWith({
      originId: undefined,
      destId: FUND_ID,
      amount: 500,
    });
  });

  it('should remove the record even when the reversal fails', async () => {
    // The fund may have been deleted by hand — an orphaned record must stay removable.
    updateCashAssetBalanceMock.mockRejectedValueOnce(new Error('asset gone'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(deletePensionContribution(makeStoredContribution())).resolves.toBeUndefined();

    expect(deleteDocMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
