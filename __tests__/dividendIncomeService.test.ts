import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldValue } from 'firebase-admin/firestore';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

const { expenseDeleteMock, dividendUpdateMock } = vi.hoisted(() => ({
  expenseDeleteMock: vi.fn(),
  dividendUpdateMock: vi.fn(),
}));

// The write under test is the Admin `update` on the dividend doc: the payload it receives
// is what Firestore would apply, so the assertions read it verbatim.
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'expenses') {
        return { doc: vi.fn(() => ({ delete: expenseDeleteMock })) };
      }
      if (name === 'dividends') {
        return { doc: vi.fn(() => ({ update: dividendUpdateMock })) };
      }
      throw new Error(`Unexpected collection: ${name}`);
    }),
  },
}));

vi.mock('@/lib/services/currencyConversionService', () => ({
  convertMultipleToEur: vi.fn(),
  getExchangeRateToEur: vi.fn(),
}));

import { deleteExpenseForDividend } from '@/lib/services/dividendIncomeService';
import { updateDividend } from '@/lib/services/dividendService';

function lastUpdatePayload(): Record<string, unknown> {
  return dividendUpdateMock.mock.calls[0][0] as Record<string, unknown>;
}

describe('deleteExpenseForDividend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expenseDeleteMock.mockResolvedValue(undefined);
    dividendUpdateMock.mockResolvedValue(undefined);
  });

  it('deletes the expense row and clears the dividend link with the delete sentinel', async () => {
    await deleteExpenseForDividend('div-1', 'exp-1');

    expect(expenseDeleteMock).toHaveBeenCalledOnce();
    expect(dividendUpdateMock).toHaveBeenCalledOnce();

    // Regression: `removeUndefinedDeep` used to strip `expenseId: undefined` before the
    // write, so the stale link survived. The key must reach Firestore as a delete sentinel.
    const payload = lastUpdatePayload();
    expect(payload).toHaveProperty('expenseId');
    expect(payload.expenseId).toBeInstanceOf(FieldValue);
    expect((payload.expenseId as FieldValue).isEqual(FieldValue.delete())).toBe(true);
  });
});

describe('updateDividend expenseId handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dividendUpdateMock.mockResolvedValue(undefined);
  });

  it('leaves the link untouched when a partial update omits expenseId', async () => {
    await updateDividend('div-1', { quantity: 10 });

    const payload = lastUpdatePayload();
    expect(payload).not.toHaveProperty('expenseId');
    expect(payload.quantity).toBe(10);
  });

  it('writes the expense id when linking', async () => {
    await updateDividend('div-1', { expenseId: 'exp-9' });

    expect(lastUpdatePayload().expenseId).toBe('exp-9');
  });
});
