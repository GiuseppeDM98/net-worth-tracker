/**
 * projectClassTrajectory against the real compareAllocations.
 * assetAllocationService pulls in the client Firebase SDK — mock it (same convention as
 * __tests__/compareAllocations.test.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Asset, AssetAllocationTarget } from '@/types/assets';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import { compareAllocations } from '@/lib/services/assetAllocationService';
import { DEFAULT_REBALANCE_BAND, bandForTarget, type RebalanceBand } from '@/lib/utils/allocationUtils';
import {
  projectClassTrajectory,
  onlyTargetedClasses,
  buildClassMeasurement,
  resolvePositionStates,
  computeUsableLiquidity,
  computeTotalPurchases,
  scheduleInstallments,
  unitPriceEur,
  type PlanDeps,
} from '@/lib/utils/accumulationPlanUtils';
import { buildAccumuloPreview } from '@/lib/utils/accumuloSummary';
import type { AccumulationPlan, Installment, PlanLiquidity, PlanPosition } from '@/types/accumulationPlan';

let seq = 0;
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  seq += 1;
  return {
    id: `a${seq}`,
    userId: 'u1',
    ticker: 'X',
    name: 'X',
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 1000,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const targets = (percentages: Record<string, number>): AssetAllocationTarget => {
  const out: AssetAllocationTarget = {};
  for (const [assetClass, targetPercentage] of Object.entries(percentages)) {
    out[assetClass] = { targetPercentage };
  }
  return out;
};

function basePlan(overrides: Partial<AccumulationPlan> = {}): AccumulationPlan {
  return {
    id: 'plan1',
    userId: 'u1',
    name: 'Piano',
    status: 'draft',
    startMonth: '2026-10',
    months: 3,
    liquidity: { sourceCashAssetIds: [], reserveEur: 0, monthlyInflowEur: 0 },
    positions: [
      { id: 'p1', label: 'Equity', targetPercentage: 100, memberAssetIds: ['equity1'], buyAssetId: 'equity1' },
    ],
    disposals: [],
    installments: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const deps: PlanDeps = {
  valueOf: (a: Asset) => a.quantity * unitPriceEur(a),
  priceOf: (a: Asset) => unitPriceEur(a),
};

/** Compose a real calendar (resolvePositionStates → computeUsableLiquidity →
 *  computeTotalPurchases → scheduleInstallments), the same pipeline `buildDraftPreview` runs —
 *  so an invariant test's expected numbers come from the engine itself, never hand arithmetic that
 *  could silently diverge from a floor/carry/sweep detail. */
function buildRealSchedule(
  positions: PlanPosition[],
  liquidity: PlanLiquidity,
  assetsById: Map<string, Asset>,
  months: number,
  startMonth: string
) {
  const states = resolvePositionStates(positions, assetsById, deps);
  const usable = computeUsableLiquidity(liquidity, assetsById, [], months, deps);
  const totals = computeTotalPurchases(states, usable.L);
  const schedule = scheduleInstallments(totals, states, months, startMonth);
  return { states, usable, totals, schedule };
}

describe('projectClassTrajectory — point 0 with currentIndex = 0', () => {
  it('coincides with compareAllocations(allAssets, targets)', () => {
    const equity = makeAsset({ id: 'equity1', assetClass: 'equity', quantity: 60 });
    const bonds = makeAsset({ id: 'bonds1', assetClass: 'bonds', quantity: 40 });
    const allAssets = [equity, bonds];
    const tgts = targets({ equity: 60, bonds: 40 });
    const plan = basePlan();

    const direct = compareAllocations(allAssets, tgts);
    const points = projectClassTrajectory({
      plan,
      allAssets,
      installments: [],
      targets: tgts,
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      currentIndex: 0,
    });

    const point0 = points.find((p) => p.index === 0)!;
    expect(point0.source).toBe('projected');
    for (const [assetClass, data] of Object.entries(direct.byAssetClass)) {
      expect(point0.byClass[assetClass as keyof typeof point0.byClass]?.currentPct).toBeCloseTo(
        data.currentPercentage,
        6
      );
    }
  });
});

// A class saved at 0% in Impostazioni — the house, the accounts — is not a direction of the plan: on the
// collaudo of 2026-11-17 it filled the PAC panel («Immobili 78,6% → 0,0%») and squashed the chart (owner:
// out of the panel and the chart). Seen red with the filter returning the points unchanged; the engine's own
// trajectory keeps the cash class, which the money-conservation tests below read.
describe('projectClassTrajectory — a class at 0% target', () => {
  it('stays out of every point the views read, the targeted classes stay in', () => {
    const equity = makeAsset({ id: 'equity1', assetClass: 'equity', quantity: 60 });
    const house = makeAsset({ id: 'house1', type: 'realestate', assetClass: 'realestate', quantity: 300 });
    const tgts = targets({ equity: 100, realestate: 0 });
    const points = onlyTargetedClasses(projectClassTrajectory({
      plan: basePlan(),
      allAssets: [equity, house],
      installments: [],
      targets: tgts,
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      currentIndex: 0,
    }));
    for (const point of points) {
      expect(Object.keys(point.byClass)).toEqual(['equity']);
    }
  });
});

describe('projectClassTrajectory — disposals and executed lines', () => {
  it('a sale executed in month 1 leaves the class, and an executed buy is never counted twice', () => {
    const sellable = makeAsset({ id: 'sell1', assetClass: 'equity', quantity: 10, currentPrice: 100 });
    const keep = makeAsset({ id: 'keep1', assetClass: 'bonds', quantity: 10, currentPrice: 100 });
    const allAssets = [sellable, keep];
    const tgts = targets({ equity: 50, bonds: 50 });

    const installments: Installment[] = [
      {
        index: 1,
        month: '2026-10',
        lines: [
          {
            positionId: 'p1',
            assetId: 'keep1',
            plannedQuantity: 5,
            priceEurAtPlan: 100,
            plannedAmountEur: 500,
            status: 'executed',
          },
        ],
        carryInEur: { p1: 0 },
      },
    ];
    const plan = basePlan({
      positions: [{ id: 'p1', label: 'Bonds', targetPercentage: 100, memberAssetIds: ['keep1'], buyAssetId: 'keep1' }],
      disposals: [{ assetId: 'sell1', estimatedProceedsEur: 1000, status: 'planned' }],
      installments,
    });

    const points = projectClassTrajectory({
      plan,
      allAssets,
      installments,
      targets: tgts,
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      currentIndex: 0,
    });

    const month1 = points.find((p) => p.index === 1)!;
    // The disposed equity is gone: only the bonds class carries value.
    expect(month1.byClass.equity?.currentPct ?? 0).toBe(0);
    expect(month1.byClass.bonds?.currentPct).toBeCloseTo(100, 6);

    // The buy was already executed (real quantity in `allAssets` already reflects it) — the
    // executed line must be skipped, never adding a second 5 shares on top of keep1's quantity 10.
    const untouchedKeep = compareAllocations([keep], targets({ bonds: 100 }));
    expect(month1.byClass.bonds?.currentPct).toBeCloseTo(untouchedKeep.byAssetClass.bonds.currentPercentage, 6);
  });
});

describe('projectClassTrajectory — fixed-amount cash target', () => {
  // 800 quote × 100 € di azioni + 20.000 € di cassa, riserva PAC = tutta la cassa (mai spesa),
  // entrata mensile stimata che rifinanzia esattamente ogni rata: il denaro in cassa non si
  // muove mai (numeri di riferimento, idx2), isolando l'effetto del solo
  // La base di mercato CRESCE comunque (nuovo denaro da E), e prima della correzione
  // il target restava congelato alla base della baseline invece di seguirla.
  const cash = makeAsset({ id: 'cash1', assetClass: 'cash', quantity: 1, currentPrice: 20000 });
  const equity = makeAsset({ id: 'equity1', assetClass: 'equity', quantity: 800, currentPrice: 100 });
  const allAssets = [cash, equity];
  const tgts: AssetAllocationTarget = {
    cash: { targetPercentage: 20, useFixedAmount: true, fixedAmount: 20000 },
    equity: { targetPercentage: 100 },
  };
  const positions: PlanPosition[] = [
    { id: 'p1', label: 'Equity', targetPercentage: 100, memberAssetIds: ['equity1'], buyAssetId: 'equity1' },
  ];
  const liquidity: PlanLiquidity = { sourceCashAssetIds: ['cash1'], reserveEur: 20000, monthlyInflowEur: 10000 };
  const assetsById = new Map(allAssets.map((a) => [a.id, a]));
  const { schedule } = buildRealSchedule(positions, liquidity, assetsById, 2, '2026-10');
  const plan = basePlan({ months: 2, liquidity, positions, installments: schedule.installments });

  const points = projectClassTrajectory({
    plan,
    allAssets,
    installments: schedule.installments,
    targets: tgts,
    band: DEFAULT_REBALANCE_BAND,
    compare: compareAllocations,
    currentIndex: 0,
  });

  it('reads a non-cash class target from the SAME point, not the frozen baseline', () => {
    // Reference numbers: idx2 target 83,333 (was 80,000 frozen), drift 0.
    const point2 = points.find((p) => p.index === 2)!;
    expect(point2.byClass.equity?.targetPct).toBeCloseTo(83.3333, 3);
    expect(point2.byClass.equity?.driftPp).toBeCloseTo(0, 6);
    expect(point2.byClass.equity?.outOfBand).toBe(false);
  });

  it('also holds at the intermediate month, not just the last one', () => {
    const point1 = points.find((p) => p.index === 1)!;
    expect(point1.byClass.equity?.driftPp).toBeCloseTo(0, 6);
    expect(point1.byClass.cash?.driftPp).toBeCloseTo(0, 6);
  });

  it('every point stays at 0,00pp drift and in band, not just idx2', () => {
    expect(points).toHaveLength(3); // idx 0..2
    for (const point of points) {
      for (const data of Object.values(point.byClass)) {
        expect(data!.driftPp).toBeCloseTo(0, 6);
        expect(data!.outOfBand).toBe(false);
      }
    }
  });
});

describe('projectClassTrajectory — measured points', () => {
  it('same currentPct when targets are unchanged, different drift when they change', () => {
    const equity = makeAsset({ id: 'equity1', assetClass: 'equity', quantity: 60 });
    const bonds = makeAsset({ id: 'bonds1', assetClass: 'bonds', quantity: 40 });
    const allAssets = [equity, bonds];
    const tgts = targets({ equity: 60, bonds: 40 });

    const measurement = buildClassMeasurement(compareAllocations(allAssets, tgts), new Date('2026-10-05'));
    const plan = basePlan({
      status: 'active',
      baseline: {
        capturedAt: new Date('2026-10-05'),
        positionValuesEur: {},
        sourceCashEur: 0,
        pricesEur: {},
        measurement,
      },
    });

    const pointsSameTargets = projectClassTrajectory({
      plan,
      allAssets,
      installments: [],
      targets: tgts,
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      currentIndex: 1,
    });
    const pointsNewTargets = projectClassTrajectory({
      plan,
      allAssets,
      installments: [],
      targets: targets({ equity: 70, bonds: 30 }),
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      currentIndex: 1,
    });

    const baseline0Same = pointsSameTargets.find((p) => p.index === 0)!;
    const baseline0New = pointsNewTargets.find((p) => p.index === 0)!;
    expect(baseline0Same.source).toBe('measured');
    expect(baseline0Same.byClass.equity?.currentPct).toBeCloseTo(baseline0New.byClass.equity!.currentPct, 6);
    expect(baseline0Same.byClass.equity?.driftPp).not.toBeCloseTo(baseline0New.byClass.equity!.driftPp, 2);
  });
});

describe('outOfBand', () => {
  it('reacts to a fixed 2pp band and to rule525', () => {
    const equity = makeAsset({ id: 'equity1', assetClass: 'equity', quantity: 62 });
    const bonds = makeAsset({ id: 'bonds1', assetClass: 'bonds', quantity: 38 });
    const allAssets = [equity, bonds];
    const tgts = targets({ equity: 60, bonds: 40 });
    const plan = basePlan();

    const fixedBand: RebalanceBand = { type: 'fixed', pp: 2 };
    const rule525: RebalanceBand = { type: 'rule525' };

    const pointsFixed = projectClassTrajectory({
      plan,
      allAssets,
      installments: [],
      targets: tgts,
      band: fixedBand,
      compare: compareAllocations,
      currentIndex: 0,
    });
    const pointsRule525 = projectClassTrajectory({
      plan,
      allAssets,
      installments: [],
      targets: tgts,
      band: rule525,
      compare: compareAllocations,
      currentIndex: 0,
    });

    const equityDrift = pointsFixed.find((p) => p.index === 0)!.byClass.equity!.driftPp;
    expect(pointsFixed.find((p) => p.index === 0)!.byClass.equity!.outOfBand).toBe(
      Math.abs(equityDrift) > bandForTarget(fixedBand, 60)
    );
    expect(pointsRule525.find((p) => p.index === 0)!.byClass.equity!.outOfBand).toBe(
      Math.abs(equityDrift) > bandForTarget(rule525, 60)
    );
  });
});

describe('projectClassTrajectory — the plan spends the cash', () => {
  it('cassa(N) = riserva + residuo, when the reserve is covered', () => {
    // 15.000 € to invest (20.000 € cash − 5.000 € reserve), a 1 €/share position over 3 months
    // that divides the budget with no carry left over (residualEur = 0 by construction).
    const cash = makeAsset({ id: 'cash1', assetClass: 'cash', quantity: 1, currentPrice: 20000 });
    const equity = makeAsset({ id: 'equity1', assetClass: 'equity', quantity: 0, currentPrice: 1 });
    const allAssets = [cash, equity];
    const tgts = targets({ equity: 100, cash: 0 });
    const positions: PlanPosition[] = [
      { id: 'p1', label: 'Equity', targetPercentage: 100, memberAssetIds: ['equity1'], buyAssetId: 'equity1' },
    ];
    const liquidity: PlanLiquidity = { sourceCashAssetIds: ['cash1'], reserveEur: 5000, monthlyInflowEur: 0 };
    const assetsById = new Map(allAssets.map((a) => [a.id, a]));
    const { usable, schedule } = buildRealSchedule(positions, liquidity, assetsById, 3, '2026-10');
    expect(usable.belowReserve).toBe(false);

    const plan = basePlan({ months: 3, liquidity, positions, installments: schedule.installments });
    const points = projectClassTrajectory({
      plan,
      allAssets,
      installments: schedule.installments,
      targets: tgts,
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      currentIndex: 0,
    });

    // Money conservation: purchases only move value between classes, so the TOTAL at month N is
    // exactly what came in (sourceCash — nothing else, here), independent of what got spent.
    const totalEur = 20000;
    const expectedCashEur = liquidity.reserveEur + schedule.residualEur;
    const pointN = points.find((p) => p.index === 3)!;
    expect(pointN.byClass.cash?.currentPct).toBeCloseTo((expectedCashEur / totalEur) * 100, 6);
  });

  it('belowReserve: cassa(N) ≥ riserva instead of the exact equality', () => {
    // Only 3.000 € of cash against a 10.000 € reserve: availableNowEur floors at 0 ("la
    // riserva non si tocca mai") and the 5.000 €/month inflows first refill the 7.000 € gap, so the
    // plan's L is 3.000 € (2026-11-17). The position is priced far above what any month — or the
    // closing sweep — can afford, so nothing is ever bought and the full L carries to residualEur.
    // A `bonds` bystander asset outside the plan stays fixed throughout, so cash's ABSOLUTE €
    // figure — not just a (degenerate, always-100%) ratio against itself — drives the assertion.
    const cash = makeAsset({ id: 'cash1', assetClass: 'cash', quantity: 1, currentPrice: 3000 });
    const equity = makeAsset({ id: 'equity1', assetClass: 'equity', quantity: 0, currentPrice: 1_000_000 });
    const bystander = makeAsset({ id: 'bystander1', assetClass: 'bonds', quantity: 1, currentPrice: 50000 });
    const allAssets = [cash, equity, bystander];
    const tgts = targets({ equity: 100, cash: 0, bonds: 0 });
    const positions: PlanPosition[] = [
      { id: 'p1', label: 'Equity', targetPercentage: 100, memberAssetIds: ['equity1'], buyAssetId: 'equity1' },
    ];
    const liquidity: PlanLiquidity = { sourceCashAssetIds: ['cash1'], reserveEur: 10000, monthlyInflowEur: 5000 };
    const assetsById = new Map(allAssets.map((a) => [a.id, a]));
    const { usable, schedule } = buildRealSchedule(positions, liquidity, assetsById, 2, '2026-10');
    expect(usable.belowReserve).toBe(true);
    expect(schedule.residualEur).toBeCloseTo(usable.L, 6); // nothing affordable — the whole L carries.

    const plan = basePlan({ months: 2, liquidity, positions, installments: schedule.installments });
    const points = projectClassTrajectory({
      plan,
      allAssets,
      installments: schedule.installments,
      targets: tgts,
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      currentIndex: 0,
    });

    expect(usable.L).toBe(3000);
    const cashEur = 3000 + 2 * 5000; // cash0 + the inflows (nothing spent).
    expect(cashEur).toBeGreaterThanOrEqual(liquidity.reserveEur);
    const totalEur = cashEur + 50000; // equity never bought — cash plus the fixed bystander.
    const pointN = points.find((p) => p.index === 2)!;
    expect(pointN.byClass.cash?.currentPct).toBeCloseTo((cashEur / totalEur) * 100, 6);
  });

  it('an executed line is not subtracted from cash a second time', () => {
    // Month 1's buy already happened for real: the ledger — and so `allAssets` — already carries
    // its 100 shares and its lower cash balance. Only month 2 (still `planned`) may reduce the
    // PROJECTED cash any further.
    const cash = makeAsset({ id: 'cash1', assetClass: 'cash', quantity: 1, currentPrice: 10000 });
    const equity = makeAsset({ id: 'equity1', assetClass: 'equity', quantity: 100, currentPrice: 100 });
    const allAssets = [cash, equity];
    const tgts = targets({ equity: 100, cash: 0 });
    const installments: Installment[] = [
      {
        index: 1,
        month: '2026-10',
        lines: [
          { positionId: 'p1', assetId: 'equity1', plannedQuantity: 100, priceEurAtPlan: 100, plannedAmountEur: 10000, status: 'executed' },
        ],
        carryInEur: { p1: 0 },
      },
      {
        index: 2,
        month: '2026-11',
        lines: [
          { positionId: 'p1', assetId: 'equity1', plannedQuantity: 100, priceEurAtPlan: 100, plannedAmountEur: 10000, status: 'planned' },
        ],
        carryInEur: { p1: 0 },
      },
    ];
    const liquidity: PlanLiquidity = { sourceCashAssetIds: ['cash1'], reserveEur: 0, monthlyInflowEur: 0 };
    const plan = basePlan({
      months: 2,
      liquidity,
      positions: [{ id: 'p1', label: 'Equity', targetPercentage: 100, memberAssetIds: ['equity1'], buyAssetId: 'equity1' }],
      installments,
    });

    const points = projectClassTrajectory({
      plan,
      allAssets,
      installments,
      targets: tgts,
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      currentIndex: 0,
    });

    // Correct: cash 10.000 − 10.000 (month 2 only) = 0. A double subtraction of month 1's already-
    // executed 10.000 € would instead read −10.000 (a negative 100% weight on a 10.000 € total).
    const pointN = points.find((p) => p.index === 2)!;
    expect(pointN.byClass.cash?.currentPct).toBeCloseTo(0, 6);
  });

  it('an `excluded` source account: identical to before the fix (no regression)', () => {
    // The task's own proof: compareAllocations drops an `excluded` asset from the market base
    // regardless of its value, so mutating its projected balance is a no-op for every class —
    // equity should read 100% of the market base at every point, cash never entering it.
    const cash = makeAsset({ id: 'cash1', assetClass: 'cash', quantity: 1, currentPrice: 20000, allocationRole: 'excluded' });
    const equity = makeAsset({ id: 'equity1', assetClass: 'equity', quantity: 1, currentPrice: 100 });
    const allAssets = [cash, equity];
    const tgts = targets({ equity: 100 });
    const positions: PlanPosition[] = [
      { id: 'p1', label: 'Equity', targetPercentage: 100, memberAssetIds: ['equity1'], buyAssetId: 'equity1' },
    ];
    const liquidity: PlanLiquidity = { sourceCashAssetIds: ['cash1'], reserveEur: 0, monthlyInflowEur: 1000 };
    const assetsById = new Map(allAssets.map((a) => [a.id, a]));
    const { schedule } = buildRealSchedule(positions, liquidity, assetsById, 2, '2026-10');

    const plan = basePlan({ months: 2, liquidity, positions, installments: schedule.installments });
    const points = projectClassTrajectory({
      plan,
      allAssets,
      installments: schedule.installments,
      targets: tgts,
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      currentIndex: 0,
    });

    for (const point of points) {
      expect(point.byClass.equity?.currentPct).toBeCloseTo(100, 6);
      expect(point.byClass.cash).toBeUndefined();
    }
  });
});

// The empty tile's preview keeps the allocation's cash quota (owner, 2026-11-17), never a fixed 10.000 €.
// Seen red with the old fixed threshold.
describe('buildAccumuloPreview — the reserve is the one passed', () => {
  it('cash within the quota gives no preview; a smaller quota leaves the rest to spend', () => {
    const cash = makeAsset({ id: 'cashP', type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 8000 });
    const equity = makeAsset({ id: 'equityP', assetClass: 'equity', quantity: 100, currentPrice: 100 });
    const deps: PlanDeps = { valueOf: (a) => a.quantity * a.currentPrice, priceOf: unitPriceEur };
    const input = {
      allAssets: [cash, equity],
      targets: targets({ cash: 20, equity: 80 }),
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      deps,
      today: new Date('2026-11-12T12:00:00'),
    };
    expect(buildAccumuloPreview({ ...input, reserveEur: 8000 })).toBeNull();
    const preview = buildAccumuloPreview({ ...input, reserveEur: 2000 });
    expect(preview?.reserveEur).toBe(2000);
    expect(preview?.cashEur).toBe(8000);
  });
});

// Cash within the quota still leaves the monthly inflows to invest (collaudo, 2026-11-17).
// Seen red with the preview given up as soon as the cash did not pass the quota.
describe('buildAccumuloPreview — cash within the quota, inflows only', () => {
  it('previews the plan the inflows alone would make', () => {
    const cash = makeAsset({ id: 'cashQ', type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 8000 });
    const equity = makeAsset({ id: 'equityQ', assetClass: 'equity', quantity: 100, currentPrice: 100 });
    const deps: PlanDeps = { valueOf: (a) => a.quantity * a.currentPrice, priceOf: unitPriceEur };
    const preview = buildAccumuloPreview({
      allAssets: [cash, equity],
      targets: targets({ cash: 20, equity: 80 }),
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      deps,
      today: new Date('2026-11-12T12:00:00'),
      reserveEur: 10000,
      monthlyInflowEur: 1000,
    });
    expect(preview).not.toBeNull();
    expect(preview?.inflowEur).toBe(1000);
    expect(preview?.monthlyEur).toBeGreaterThan(0);
  });
});

// The preview's rate counts only the months that buy (2026-11-17). Seen red dividing by twelve.
describe('buildAccumuloPreview — the refill months', () => {
  it('two months refill a 2000 € gap, ten rate follow', () => {
    const cash = makeAsset({ id: 'cashR', type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 8000 });
    const equity = makeAsset({ id: 'equityR', assetClass: 'equity', quantity: 100, currentPrice: 100 });
    const preview = buildAccumuloPreview({
      allAssets: [cash, equity],
      targets: targets({ cash: 20, equity: 80 }),
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      deps: { valueOf: (a) => a.quantity * a.currentPrice, priceOf: unitPriceEur },
      today: new Date('2026-11-12T12:00:00'),
      reserveEur: 10000,
      monthlyInflowEur: 1000,
    });
    expect(preview?.refillMonths).toBe(2);
    expect(preview?.months).toBe(10);
    expect(preview?.monthlyEur).toBe(1000);
  });
});

// A money-market fund in the cash class counts towards the quota (owner, 2026-11-17).
// Seen red with the cash class read as the accounts alone.
describe('resolvePlanReserve — a money-market fund outside the accounts', () => {
  it('keeps on the accounts the quota minus the fund', async () => {
    const { resolvePlanReserve } = await import('@/lib/utils/accumulationPlanUtils');
    const account = makeAsset({ id: 'accM', type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 10000 });
    const fund = makeAsset({ id: 'fundM', type: 'etf', assetClass: 'cash', quantity: 100, currentPrice: 200 });
    const equity = makeAsset({ id: 'eqM', assetClass: 'equity', quantity: 100, currentPrice: 700 });
    const deps: PlanDeps = { valueOf: (a) => a.quantity * a.currentPrice, priceOf: unitPriceEur };
    const tgts: AssetAllocationTarget = { cash: { targetPercentage: 0, useFixedAmount: true, fixedAmount: 50000 }, equity: { targetPercentage: 100 } };
    expect(resolvePlanReserve([account, fund, equity], tgts, compareAllocations, deps)).toEqual({ reserveEur: 30000, otherCashEur: 20000, quotaEur: 50000 });
  });
});
