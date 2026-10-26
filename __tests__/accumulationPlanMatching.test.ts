/**
 * Tests for the PAC ledger-matching engine (lib/utils/accumulationPlanMatching.ts, doc/pac-ate.md §9/§11).
 */
import { describe, it, expect } from 'vitest';
import type { AccumulationPlan, Installment, PlanDisposal } from '@/types/accumulationPlan';
import type { AssetTransaction } from '@/types/assetTransactions';
import { matchPlanExecutions } from '@/lib/utils/accumulationPlanMatching';

let seq = 0;
function makeTransaction(overrides: Partial<AssetTransaction> = {}): AssetTransaction {
  seq += 1;
  return {
    id: `tx${seq}`,
    userId: 'u1',
    assetId: 'vwce',
    type: 'buy',
    date: new Date('2026-10-05T10:00:00Z'),
    quantity: 5,
    pricePerUnit: 100,
    priceEur: 100,
    createdAt: new Date('2026-10-05T10:00:00Z'),
    updatedAt: new Date('2026-10-05T10:00:00Z'),
    ...overrides,
  };
}

function makeInstallment(overrides: Partial<Installment> = {}): Installment {
  return {
    index: 1,
    month: '2026-10',
    lines: [
      {
        positionId: 'p1',
        assetId: 'vwce',
        plannedQuantity: 5,
        priceEurAtPlan: 100,
        plannedAmountEur: 500,
        status: 'planned',
      },
    ],
    carryInEur: { p1: 0 },
    ...overrides,
  };
}

function makePlan(overrides: Partial<AccumulationPlan> = {}): AccumulationPlan {
  return {
    id: 'plan1',
    userId: 'u1',
    name: 'Piano',
    status: 'active',
    startMonth: '2026-10',
    months: 6,
    liquidity: { sourceCashAssetIds: ['cash1'], reserveEur: 0, monthlyInflowEur: 0 },
    positions: [{ id: 'p1', label: 'VWCE', targetPercentage: 100, memberAssetIds: ['vwce'], buyAssetId: 'vwce' }],
    disposals: [],
    installments: [makeInstallment()],
    activatedAt: new Date('2026-10-01T00:00:00Z'),
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

const TODAY_IN_OCTOBER = new Date('2026-10-15T10:00:00Z');

describe('matchPlanExecutions — installment lines', () => {
  it('high confidence: linkedCashAssetId is one of the source accounts', () => {
    const plan = makePlan();
    const tx = makeTransaction({ linkedCashAssetId: 'cash1' });
    const { matches, lineStates } = matchPlanExecutions(plan, [tx], TODAY_IN_OCTOBER);
    expect(lineStates['1:p1']).toBe('toConfirm');
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe('high');
    expect(matches[0].transactionIds).toEqual([tx.id]);
  });

  it('medium confidence: no linkedCashAssetId at all', () => {
    const plan = makePlan();
    const tx = makeTransaction({ linkedCashAssetId: undefined });
    const { matches, lineStates } = matchPlanExecutions(plan, [tx], TODAY_IN_OCTOBER);
    expect(lineStates['1:p1']).toBe('toConfirm');
    expect(matches[0].confidence).toBe('medium');
  });

  it('an unrelated linked cash account is not a candidate at all', () => {
    const plan = makePlan();
    const tx = makeTransaction({ linkedCashAssetId: 'cash-other' });
    const { matches, lineStates } = matchPlanExecutions(plan, [tx], TODAY_IN_OCTOBER);
    expect(matches).toHaveLength(0);
    // October is the current installment's own month here — no match, not yet late.
    expect(lineStates['1:p1']).toBe('todo');
  });

  it('two buys in the same month are summed into one match', () => {
    const plan = makePlan();
    const tx1 = makeTransaction({ id: 'a', quantity: 3, priceEur: 100, linkedCashAssetId: 'cash1' });
    const tx2 = makeTransaction({ id: 'b', quantity: 2, priceEur: 100, linkedCashAssetId: 'cash1' });
    const { matches } = matchPlanExecutions(plan, [tx1, tx2], TODAY_IN_OCTOBER);
    expect(matches).toHaveLength(1);
    expect(matches[0].transactionIds.sort()).toEqual(['a', 'b']);
    expect(matches[0].quantity).toBe(5);
    expect(matches[0].amountEur).toBe(500);
  });

  it('an id already recorded on a line of the plan is never proposed again', () => {
    const plan = makePlan({
      installments: [
        makeInstallment({
          lines: [
            {
              positionId: 'p1',
              assetId: 'vwce',
              plannedQuantity: 5,
              priceEurAtPlan: 100,
              plannedAmountEur: 500,
              status: 'planned',
              transactionIds: ['tx1'], // already linked, even though the line itself is still `planned`
            },
          ],
        }),
      ],
    });
    const tx1 = makeTransaction({ id: 'tx1', linkedCashAssetId: 'cash1' });
    const { matches, lineStates } = matchPlanExecutions(plan, [tx1], TODAY_IN_OCTOBER);
    expect(matches).toHaveLength(0);
    expect(lineStates['1:p1']).toBe('todo');
  });

  it('executed with every transaction id still in the ledger reads as executed', () => {
    const plan = makePlan({
      installments: [
        makeInstallment({
          lines: [
            {
              positionId: 'p1',
              assetId: 'vwce',
              plannedQuantity: 5,
              priceEurAtPlan: 100,
              plannedAmountEur: 500,
              status: 'executed',
              transactionIds: ['tx1'],
              executedQuantity: 5,
              executedAmountEur: 500,
            },
          ],
        }),
      ],
    });
    const tx1 = makeTransaction({ id: 'tx1' });
    const { lineStates } = matchPlanExecutions(plan, [tx1], TODAY_IN_OCTOBER);
    expect(lineStates['1:p1']).toBe('executed');
  });

  it('executed with a deleted transaction id reads as lostLink', () => {
    const plan = makePlan({
      installments: [
        makeInstallment({
          lines: [
            {
              positionId: 'p1',
              assetId: 'vwce',
              plannedQuantity: 5,
              priceEurAtPlan: 100,
              plannedAmountEur: 500,
              status: 'executed',
              transactionIds: ['tx-deleted'],
              executedQuantity: 5,
              executedAmountEur: 500,
            },
          ],
        }),
      ],
    });
    const { lineStates } = matchPlanExecutions(plan, [], TODAY_IN_OCTOBER);
    expect(lineStates['1:p1']).toBe('lostLink');
  });

  it('the SAME line reads as executed, not lostLink, while the ledger query is still loading (PR #4 review, rilievo 5)', () => {
    const plan = makePlan({
      installments: [
        makeInstallment({
          lines: [
            {
              positionId: 'p1',
              assetId: 'vwce',
              plannedQuantity: 5,
              priceEurAtPlan: 100,
              plannedAmountEur: 500,
              status: 'executed',
              transactionIds: ['tx-not-arrived-yet'],
              executedQuantity: 5,
              executedAmountEur: 500,
            },
          ],
        }),
      ],
    });
    // `transactions` reads as `[]` the same way whether the ledger is genuinely empty or the
    // query is still in flight — the 4th argument is the only thing telling the two apart.
    const stillLoading = matchPlanExecutions(plan, [], TODAY_IN_OCTOBER, true);
    expect(stillLoading.lineStates['1:p1']).toBe('executed');
    const genuinelyEmpty = matchPlanExecutions(plan, [], TODAY_IN_OCTOBER, false);
    expect(genuinelyEmpty.lineStates['1:p1']).toBe('lostLink');
  });

  it('a planned line before the current month with no match reads as late', () => {
    // startMonth 2026-10, installment 1 is October; "today" is now December → October is behind.
    const plan = makePlan();
    const today = new Date('2026-12-05T10:00:00Z');
    const { lineStates } = matchPlanExecutions(plan, [], today);
    expect(lineStates['1:p1']).toBe('late');
  });

  it('skipped stays skipped regardless of the ledger', () => {
    const plan = makePlan({
      installments: [
        makeInstallment({
          lines: [
            {
              positionId: 'p1',
              assetId: 'vwce',
              plannedQuantity: 5,
              priceEurAtPlan: 100,
              plannedAmountEur: 500,
              status: 'skipped',
            },
          ],
        }),
      ],
    });
    const { lineStates } = matchPlanExecutions(plan, [], TODAY_IN_OCTOBER);
    expect(lineStates['1:p1']).toBe('skipped');
  });

  it('respects the Italy calendar month boundary, not a naive UTC read', () => {
    // 23:30 in Italy (CET, UTC+1 in January) on the 31st is 22:30 UTC the same day — still January.
    const plan = makePlan({
      installments: [makeInstallment({ index: 1, month: '2026-01' })],
      startMonth: '2026-01',
    });
    const tx = makeTransaction({
      date: new Date('2026-01-31T22:30:00Z'),
      linkedCashAssetId: 'cash1',
    });
    const today = new Date('2026-01-31T23:00:00Z');
    const { matches, lineStates } = matchPlanExecutions(plan, [tx], today);
    expect(lineStates['1:p1']).toBe('toConfirm');
    expect(matches[0].transactionIds).toEqual([tx.id]);
  });

  it('a baseline buy is never a candidate', () => {
    const plan = makePlan();
    const tx = makeTransaction({ isBaseline: true, linkedCashAssetId: 'cash1' });
    const { matches, lineStates } = matchPlanExecutions(plan, [tx], TODAY_IN_OCTOBER);
    expect(matches).toHaveLength(0);
    expect(lineStates['1:p1']).toBe('todo');
  });

  it('a buy for a different asset or a different month is never a candidate', () => {
    const plan = makePlan();
    const wrongAsset = makeTransaction({ assetId: 'swda', linkedCashAssetId: 'cash1' });
    const wrongMonth = makeTransaction({ date: new Date('2026-11-05T10:00:00Z'), linkedCashAssetId: 'cash1' });
    const { matches, lineStates } = matchPlanExecutions(plan, [wrongAsset, wrongMonth], TODAY_IN_OCTOBER);
    expect(matches).toHaveLength(0);
    expect(lineStates['1:p1']).toBe('todo');
  });
});

describe('matchPlanExecutions — disposals', () => {
  const disposal: PlanDisposal = { assetId: 'eimi', estimatedProceedsEur: 1000, status: 'planned' };

  it('a sell on/after activation matches, whatever its month', () => {
    const plan = makePlan({ disposals: [disposal] });
    const tx = makeTransaction({ assetId: 'eimi', type: 'sell', date: new Date('2026-11-20T10:00:00Z'), quantity: 10, priceEur: 100 });
    const { matches, lineStates } = matchPlanExecutions(plan, [tx], TODAY_IN_OCTOBER);
    expect(lineStates['disposal:eimi']).toBe('toConfirm');
    expect(matches[0]).toMatchObject({ kind: 'disposal', assetId: 'eimi', quantity: 10, amountEur: 1000 });
  });

  it('a sell before activation is not a candidate', () => {
    const plan = makePlan({ disposals: [disposal] });
    const tx = makeTransaction({ assetId: 'eimi', type: 'sell', date: new Date('2026-09-20T10:00:00Z') });
    const { matches, lineStates } = matchPlanExecutions(plan, [tx], TODAY_IN_OCTOBER);
    expect(matches).toHaveLength(0);
    expect(lineStates['disposal:eimi']).toBe('todo');
  });

  it('is late once past month 1 with no match (D5: a disposal belongs to month 1)', () => {
    const plan = makePlan({ disposals: [disposal] });
    const laterToday = new Date('2026-12-01T10:00:00Z'); // installment 1 → past, currentIndex > 1
    const { lineStates } = matchPlanExecutions(plan, [], laterToday);
    expect(lineStates['disposal:eimi']).toBe('late');
  });

  it('executed with an existing transaction id reads as executed, a deleted one as lostLink', () => {
    const executed: PlanDisposal = { ...disposal, status: 'executed', transactionIds: ['tx-sell'], executedAmountEur: 1000 };
    const planWithLedger = makePlan({ disposals: [executed] });
    const { lineStates: withLedger } = matchPlanExecutions(planWithLedger, [makeTransaction({ id: 'tx-sell', type: 'sell' })], TODAY_IN_OCTOBER);
    expect(withLedger['disposal:eimi']).toBe('executed');

    const { lineStates: withoutLedger } = matchPlanExecutions(planWithLedger, [], TODAY_IN_OCTOBER);
    expect(withoutLedger['disposal:eimi']).toBe('lostLink');
  });

  it('the same executed disposal reads as executed while the ledger query is loading (rilievo 5)', () => {
    const executed: PlanDisposal = { ...disposal, status: 'executed', transactionIds: ['tx-sell'], executedAmountEur: 1000 };
    const planWithLedger = makePlan({ disposals: [executed] });
    const { lineStates } = matchPlanExecutions(planWithLedger, [], TODAY_IN_OCTOBER, true);
    expect(lineStates['disposal:eimi']).toBe('executed');
  });
});
