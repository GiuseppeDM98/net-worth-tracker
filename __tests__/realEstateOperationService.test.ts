/**
 * Tests for lib/services/realEstateOperationService.ts — the executor of a Compravendita plan: each
 * step through the service that owns the write, an asset created by one step named by the next, and
 * the first failure stopping the run with the count of what landed. The services are mocked; what
 * they write is theirs (and the E2E's, e2e/assets.compravendita.spec.ts).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/assetService', () => ({ createAsset: vi.fn(), updateCashAssetBalancesAtomic: vi.fn() }));
vi.mock('@/lib/services/costCenterService', () => ({ createCostCenter: vi.fn() }));
vi.mock('@/lib/services/expenseCategoryService', () => ({ ensureTransferCategory: vi.fn() }));
vi.mock('@/lib/services/expenseService', () => ({ createExpenseSettledOnDate: vi.fn(), deleteExpenseRows: vi.fn(), getFeesOf: vi.fn() }));
vi.mock('@/lib/services/cashBalanceReconciliation', () => ({ applyBalanceEffects: vi.fn(), reverseAppliedBalances: vi.fn() }));
vi.mock('@/lib/services/debtRepaymentService', () => ({ applyDebtRepayments: vi.fn() }));

import { createAsset, updateCashAssetBalancesAtomic } from '@/lib/services/assetService';
import { createCostCenter } from '@/lib/services/costCenterService';
import { ensureTransferCategory } from '@/lib/services/expenseCategoryService';
import { createExpenseSettledOnDate, deleteExpenseRows, getFeesOf } from '@/lib/services/expenseService';
import { applyBalanceEffects, reverseAppliedBalances } from '@/lib/services/cashBalanceReconciliation';
import { applyDebtRepayments } from '@/lib/services/debtRepaymentService';
import { executeRealEstatePlan, ownershipFields } from '@/lib/services/realEstateOperationService';
import { buildRealEstatePlan } from '@/lib/utils/realEstateOperationPlan';
import { initialAnswers } from '@/lib/utils/realEstateOperationDraft';
import type { RealEstateOperationAnswers } from '@/types/realEstateOperation';
import { CATEGORIES, makeContext } from './fixtures/realEstateOperation';

const context = makeContext();
const answersWith = (patch: Partial<RealEstateOperationAnswers>): RealEstateOperationAnswers => ({ ...initialAnswers(context), ...patch });

beforeEach(() => {
  vi.clearAllMocks();
  let next = 0;
  vi.mocked(createAsset).mockImplementation(async () => `new-${++next}`);
  vi.mocked(createCostCenter).mockResolvedValue({ id: 'cc-new', name: 'Acquisto Casa Nuova' } as never);
  vi.mocked(ensureTransferCategory).mockResolvedValue('trasf');
  vi.mocked(createExpenseSettledOnDate).mockResolvedValue({ ids: ['e'], parents: [], appliedEffects: [{ assetId: 'acc', delta: -1 }], appliedDebtRows: [] });
  vi.mocked(getFeesOf).mockResolvedValue([]);
});

describe('ownershipFields', () => {
  it('should write nothing in comune, the member alone, or the percent quotas', () => {
    expect(ownershipFields({ mode: 'common' })).toEqual({});
    expect(ownershipFields({ mode: 'member', memberId: 'm1' })).toEqual({ ownerMemberId: 'm1' });
    expect(ownershipFields({ mode: 'shares', shares: [{ memberId: 'm1', percent: 60 }, { memberId: 'm2', percent: 40 }, { memberId: 'm3', percent: 0 }] })).toEqual({
      ownerShares: [{ memberId: 'm1', percent: 60 }, { memberId: 'm2', percent: 40 }],
    });
  });
});

describe('executeRealEstatePlan', () => {
  it('should create the property, name it in the transfer and book the cost in the new centre', async () => {
    const answers = answersWith({ propertyName: 'Casa Nuova', price: 200000, depositAmount: 20000, costs: { agency: { amount: 3000, category: { categoryId: 'casa' } } }, costCenter: { mode: 'new', name: 'Acquisto Casa Nuova', existingId: '' } });
    const result = await executeRealEstatePlan('u1', buildRealEstatePlan(answers, context), CATEGORIES, null, new Date(2026, 5, 15, 12));

    expect(result).toMatchObject({ done: 4, total: 4, failedAt: null, createdIds: { property: 'new-1', costCenter: 'cc-new' } });
    expect(vi.mocked(createAsset).mock.calls[0][1]).toMatchObject({ type: 'realestate', quantity: 0, currentPrice: 1, isPrimaryResidence: true, allocationRole: 'excluded' });
    const [deposit, agency] = vi.mocked(createExpenseSettledOnDate).mock.calls;
    expect(deposit[1]).toMatchObject({ type: 'transfer', categoryId: 'trasf', amount: 20000, linkedCashAssetId: 'acc', transferCashAssetId: 'new-1' });
    expect(agency[1]).toMatchObject({ type: 'fixed', amount: 3000, costCenterId: 'cc-new', costCenterName: 'Acquisto Casa Nuova' });
    // Each row's applied effects move the accounts now.
    expect(applyBalanceEffects).toHaveBeenCalledTimes(2);
  });

  it('should open the mortgage on the existing property, raise its value and link the series to the new loan', async () => {
    const answers = answersWith({
      event: 'rogito',
      propertyId: 'house',
      price: 280000,
      hasMortgage: true,
      mortgage: { principal: 100000, ratePct: 3, years: 25, firstInstalmentIso: '2026-07-27', instalmentOverride: null },
      costCenter: { mode: 'none', name: '', existingId: '' },
    });
    await executeRealEstatePlan('u1', buildRealEstatePlan(answers, context), CATEGORIES, null);

    expect(vi.mocked(createAsset).mock.calls[0][1]).toMatchObject({ type: 'loan', assetClass: 'realestate', quantity: 100000, financedAssetId: 'house', debtInterestRate: 3, stampDutyExempt: true });
    // A mortgage derives its owner from the property: no ownership field of its own.
    expect(vi.mocked(createAsset).mock.calls[0][1]).not.toHaveProperty('ownerMemberId');
    expect(updateCashAssetBalancesAtomic).toHaveBeenCalledWith([{ assetId: 'house', signedDelta: 100000 }]);
    const series = vi.mocked(createExpenseSettledOnDate).mock.calls[1][1];
    expect(series).toMatchObject({ type: 'debt', amount: 474.21, isRecurring: true, recurringFrequency: 'monthly', recurringDay: 27, recurringCount: 300, debtAssetId: 'new-1' });
    expect(applyDebtRepayments).toHaveBeenCalled();
  });

  it('should give back and delete the occurrences of a stopped series, its fees with them', async () => {
    vi.mocked(getFeesOf).mockResolvedValue([{ id: 'fee' } as never]);
    const answers = answersWith({ kind: 'sale', event: 'rogito', propertyId: 'house', price: 130000, depositsReceived: 0, stopSeriesIds: ['series-gym'], costCenter: { mode: 'none', name: '', existingId: '' } });
    await executeRealEstatePlan('u1', buildRealEstatePlan(answers, context), CATEGORIES, null);

    const rows = vi.mocked(deleteExpenseRows).mock.calls[0][1].map((row) => row.id);
    expect(rows).toEqual(['g0', 'g1', 'fee']);
    expect(vi.mocked(reverseAppliedBalances).mock.calls[0][0].map((row) => (row as unknown as { id: string }).id)).toEqual(['g0', 'g1', 'fee']);
  });

  it('should close the loan with the price in one transaction, the house falling with it, and write no row for it', async () => {
    const answers = answersWith({ kind: 'sale', event: 'rogito', propertyId: 'house', price: 130000, depositsReceived: 0, payoffs: [{ loanId: 'loan', amount: 60000, include: true }], costCenter: { mode: 'none', name: '', existingId: '' } });
    await executeRealEstatePlan('u1', buildRealEstatePlan(answers, context), CATEGORIES, null);

    expect(updateCashAssetBalancesAtomic).toHaveBeenCalledWith([
      { assetId: 'loan', signedDelta: -60000 },
      { assetId: 'house', signedDelta: -60000 },
    ]);
    // The only row is the net balance: 130.000 − 60.000 to the account, a transfer.
    const written = vi.mocked(createExpenseSettledOnDate).mock.calls.map((call) => call[1]);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ type: 'transfer', amount: 70000, linkedCashAssetId: 'house', transferCashAssetId: 'acc' });
  });

  it('should write a personal policy as its insured\'s («Spesa di»)', async () => {
    const answers = answersWith({
      event: 'rogito',
      propertyName: 'Casa Nuova',
      price: 100000,
      hasMortgage: false,
      lifePolicies: [{ insuredMemberId: 'm-airone', mode: 'monthly', amount: 30, firstIso: '2026-07-15', months: 12, loan: { principal: null, ratePct: null, years: null, firstInstalmentIso: '2026-07-15', instalmentOverride: null }, linkedToProperty: false }],
      costCenter: { mode: 'none', name: '', existingId: '' },
    });
    await executeRealEstatePlan('u1', buildRealEstatePlan(answers, makeContext({ splitEnabled: true })), CATEGORIES, null);

    const policy = vi.mocked(createExpenseSettledOnDate).mock.calls.map((call) => call[1]).find((data) => data.notes === 'Polizza vita Airone');
    expect(policy).toMatchObject({ personalMemberId: 'm-airone', isRecurring: true, recurringCount: 12 });
  });

  it('should stop at the first failure and say how many steps landed', async () => {
    vi.mocked(createExpenseSettledOnDate).mockRejectedValueOnce(new Error('offline'));
    const answers = answersWith({ propertyName: 'Casa Nuova', price: 200000, depositAmount: 20000, costs: { agency: { amount: 3000, category: { categoryId: 'casa' } } }, costCenter: { mode: 'none', name: '', existingId: '' } });
    const result = await executeRealEstatePlan('u1', buildRealEstatePlan(answers, context), CATEGORIES, null);

    expect(result).toMatchObject({ done: 1, total: 3, failedAt: 1 });
    expect(createExpenseSettledOnDate).toHaveBeenCalledTimes(1);
  });
});
