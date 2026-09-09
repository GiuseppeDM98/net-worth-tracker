/**
 * Tests for lib/utils/goalsSummary.ts — the numbers of FIRE › Obiettivi: every goal as one line in
 * urgency order, the selected goal's trajectory, the milestones, the allocation the goals derive
 * beside the one already assigned, and the assignments closed by the free shares.
 *
 * `calculateAssetValue` is mocked as quantity × price (the goalMath tests' mock), so every euro
 * here is arithmetic on the fixture and never a Firebase read.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: (asset: { quantity: number; currentPrice: number }) => asset.quantity * asset.currentPrice,
}));

import type { Asset } from '@/types/assets';
import type { GoalAssetAssignment, InvestmentGoal } from '@/types/goals';
import { computeGoalTrajectory, type GoalRow, type GoalTrajectory } from '@/lib/utils/goalTrajectory';
import { calculateGoalProgress } from '@/lib/utils/goalMath';
import {
  buildMilestones,
  goalDateFromIso,
  summarizeAssignments,
  summarizeDerivedAllocation,
  summarizeGoals,
  summarizeTrajectory,
  sumAssetValues,
} from '@/lib/utils/goalsSummary';

const NOW = new Date('2026-08-26T12:00:00');

function asset(id: string, name: string, value: number, assetClass: Asset['assetClass'] = 'equity', ticker = id.toUpperCase()): Asset {
  return {
    id,
    userId: 'u',
    ticker,
    name,
    type: 'etf',
    assetClass,
    currency: 'EUR',
    quantity: 1,
    currentPrice: value,
    lastPriceUpdate: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  } as Asset;
}

function goal(id: string, name: string, extra: Partial<InvestmentGoal> = {}): InvestmentGoal {
  return { id, name, priority: 'media', color: '#3B82F6', createdAt: NOW, updatedAt: NOW, ...extra };
}

/** A GoalRow with a hand-made trajectory — the ordering and counting rules need no annuity math. */
function row(goalDef: InvestmentGoal, currentValue: number, trajectory: Partial<GoalTrajectory>): GoalRow {
  return {
    goal: goalDef,
    progress: {
      goalId: goalDef.id,
      goalName: goalDef.name,
      goalColor: goalDef.color,
      currentValue,
      targetAmount: goalDef.targetAmount,
      progressPercentage: goalDef.targetAmount ? (currentValue / goalDef.targetAmount) * 100 : undefined,
      remainingAmount: goalDef.targetAmount ? Math.max(0, goalDef.targetAmount - currentValue) : undefined,
      actualAllocation: {},
    },
    trajectory: {
      verdict: 'onTrack',
      annualReturn: 4,
      monthsToDeadline: null,
      requiredMonthlyContribution: null,
      currentMonthlyContribution: 0,
      projectedDate: null,
      monthsToTarget: null,
      projectedValueAtDeadline: null,
      ...trajectory,
    },
  };
}

const ASSETS: Asset[] = [
  asset('btp', 'BTP Italia 2030', 95_000, 'bonds'),
  asset('vagf', 'Vanguard Global Aggregate Bond', 15_000, 'bonds'),
  asset('deposito', 'Conto deposito', 15_000, 'cash'),
  asset('cc', 'Conto corrente', 5_000, 'cash'),
  asset('vwce', 'Vanguard FTSE All-World', 46_000, 'equity'),
  asset('btc', 'Bitcoin', 12_000, 'crypto'),
];

const CASA = goal('casa', 'Casa', { priority: 'alta', targetAmount: 120_000, targetDate: '2029-06-30', monthlyContribution: 700, recommendedAllocation: { bonds: 70, equity: 20, cash: 10 } });
const AUTO = goal('auto', 'Auto', { priority: 'media', color: '#F97316', targetAmount: 18_000, targetDate: '2028-03-31', monthlyContribution: 350, recommendedAllocation: { bonds: 80, cash: 20 } });
const STUDI = goal('studi', 'Studi figli', { priority: 'bassa', color: '#8B5CF6', targetAmount: 40_000, targetDate: '2034-09-30', monthlyContribution: 250, recommendedAllocation: { equity: 60, bonds: 40 } });
const EMERGENZA = goal('emergenza', 'Fondo emergenza', { priority: 'alta', color: '#EF4444', targetAmount: 15_000 });

const ASSIGNMENTS: GoalAssetAssignment[] = [
  { goalId: 'casa', assetId: 'btp', percentage: 60 },
  { goalId: 'casa', assetId: 'vagf', percentage: 100 },
  { goalId: 'casa', assetId: 'deposito', percentage: 40 },
  { goalId: 'auto', assetId: 'deposito', percentage: 60 },
  { goalId: 'auto', assetId: 'cc', percentage: 50 },
  { goalId: 'studi', assetId: 'vwce', percentage: 15 },
  { goalId: 'emergenza', assetId: 'cc', percentage: 50 },
  { goalId: 'emergenza', assetId: 'btc', percentage: 100 },
];

describe('goalDateFromIso', () => {
  it('reads the year and the month straight from the ISO string, never through a timezone', () => {
    expect(goalDateFromIso('2029-06-30')).toEqual({ year: 2029, month: 6 });
    expect(goalDateFromIso('2029-06-30T22:00:00.000Z')).toEqual({ year: 2029, month: 6 });
  });

  it('rejects a string that is not a date', () => {
    expect(goalDateFromIso('')).toBeNull();
    expect(goalDateFromIso('domani')).toBeNull();
  });
});

describe('summarizeGoals', () => {
  const rows: GoalRow[] = [
    row(AUTO, 11_500, { verdict: 'onTrack', monthsToDeadline: 19, requiredMonthlyContribution: 316, currentMonthlyContribution: 350, monthsToTarget: 17, projectedDate: new Date('2028-01-26T12:00:00') }),
    row(EMERGENZA, 15_000, { verdict: 'reached', monthsToTarget: 0 }),
    row(CASA, 78_000, { verdict: 'offTrack', monthsToDeadline: 34, requiredMonthlyContribution: 970, currentMonthlyContribution: 700, monthsToTarget: 49, projectedDate: new Date('2030-09-26T12:00:00'), projectedValueAtDeadline: 110_400 }),
    row(STUDI, 6_900, { verdict: 'onTrack', monthsToDeadline: 97, requiredMonthlyContribution: 245, currentMonthlyContribution: 250, monthsToTarget: 96 }),
  ];

  it('orders the lines by urgency: off track first, reached last', () => {
    const overview = summarizeGoals(rows, 228_000);
    expect(overview.goals.map((g) => g.name)).toEqual(['Casa', 'Auto', 'Studi figli', 'Fondo emergenza']);
  });

  it('counts every verdict and the dated goals still in progress', () => {
    const { counts } = summarizeGoals(rows, 228_000);
    expect(counts).toEqual({ total: 4, inProgress: 3, reached: 1, onTrack: 2, offTrack: 1, noDeadline: 0, noTarget: 0, dated: 3 });
  });

  it('sums what is assigned and what the dated goals require against what is planned', () => {
    const overview = summarizeGoals(rows, 228_000);
    expect(overview.allocatedTotal).toBe(111_400);
    expect(overview.allocatedShare).toBeCloseTo(48.86, 2);
    expect(overview.requiredMonthlyTotal).toBe(970 + 316 + 245);
    expect(overview.plannedMonthlyTotal).toBe(700 + 350 + 250);
  });

  it('has no share of a portfolio worth nothing', () => {
    expect(summarizeGoals(rows, 0).allocatedShare).toBeNull();
  });

  it('carries the deadline and the projected date as year and month', () => {
    const casa = summarizeGoals(rows, 228_000).goals[0];
    expect(casa.deadline).toEqual({ year: 2029, month: 6 });
    expect(casa.projectedDate).toEqual({ year: 2030, month: 9 });
    expect(casa.remaining).toBe(42_000);
    expect(casa.progressPct).toBe(65);
  });

  it('leaves an open goal without target, remaining and progress', () => {
    const open = row(goal('figli', 'Figli'), 4_000, { verdict: 'noTarget' });
    const line = summarizeGoals([open], 100_000).goals[0];
    expect(line.targetAmount).toBeNull();
    expect(line.remaining).toBeNull();
    expect(line.progressPct).toBeNull();
    expect(line.deadline).toBeNull();
  });
});

describe('summarizeTrajectory', () => {
  it('reads the dated goal at zero return: the shortfall at the deadline and the extra monthly pace', () => {
    // 35 months (ceil of 1038.6 days / 30.44) at 0%: 78.000 + 700 × 35 = 102.500 at the deadline;
    // required = 42.000 / 35.
    const trajectory = computeGoalTrajectory({ currentValue: 78_000, targetAmount: 120_000, targetDate: '2029-06-30', monthlyContribution: 700, annualReturn: 0, now: NOW });
    const view = summarizeTrajectory({ goal: CASA, progress: calculateGoalProgress(CASA, ASSIGNMENTS, ASSETS), trajectory }, NOW);

    expect(view.monthsToDeadline).toBe(35);
    expect(view.projectedAtDeadline).toBe(102_500);
    expect(view.gapAtDeadline).toBe(17_500);
    expect(view.requiredMonthly).toBeCloseTo(42_000 / 35, 6);
    expect(view.extraMonthly).toBeCloseTo(42_000 / 35 - 700, 6);
    expect(view.deadline).toEqual({ year: 2029, month: 6 });
    expect(view.verdict).toBe('offTrack');
  });

  it('lists the recommended allocation largest first and draws a series up to the deadline', () => {
    const trajectory = computeGoalTrajectory({ currentValue: 78_000, targetAmount: 120_000, targetDate: '2029-06-30', monthlyContribution: 700, annualReturn: 0, now: NOW });
    const view = summarizeTrajectory({ goal: CASA, progress: calculateGoalProgress(CASA, ASSIGNMENTS, ASSETS), trajectory }, NOW);

    expect(view.allocation.map((a) => [a.label, a.pct])).toEqual([['Obbligazioni', 70], ['Azioni', 20], ['Liquidità', 10]]);
    expect(view.series[0]).toMatchObject({ monthIndex: 0, value: 78_000, target: 120_000 });
    expect(view.series[view.series.length - 1]).toMatchObject({ monthIndex: 35, value: 102_500 });
  });

  it('an on-track goal has no extra pace and a surplus at the deadline', () => {
    // 20 months at 0%: 11.500 + 350 × 20 = 18.500 ≥ 18.000.
    const trajectory = computeGoalTrajectory({ currentValue: 11_500, targetAmount: 18_000, targetDate: '2028-03-31', monthlyContribution: 350, annualReturn: 0, now: NOW });
    const view = summarizeTrajectory({ goal: AUTO, progress: calculateGoalProgress(AUTO, ASSIGNMENTS, ASSETS), trajectory }, NOW);

    expect(view.verdict).toBe('onTrack');
    expect(view.gapAtDeadline).toBe(-500);
    expect(view.extraMonthly).toBe(0);
    expect(view.projectedDate).toEqual({ year: 2028, month: 3 });
  });

  it('an open goal has no target, no series and no allocation to explain', () => {
    const open = goal('figli', 'Figli');
    const trajectory = computeGoalTrajectory({ currentValue: 4_000, now: NOW });
    const view = summarizeTrajectory({ goal: open, progress: calculateGoalProgress(open, [], ASSETS), trajectory }, NOW);

    expect(view.targetAmount).toBeNull();
    expect(view.series).toEqual([]);
    expect(view.allocation).toEqual([]);
    expect(view.requiredMonthly).toBeNull();
  });
});

describe('buildMilestones', () => {
  it('lists the reached goals first, then the dated ones in order, then the ones never reached', () => {
    const rows: GoalRow[] = [
      row(CASA, 78_000, { verdict: 'offTrack', monthsToDeadline: 34, monthsToTarget: 49, projectedDate: new Date('2030-09-26T12:00:00') }),
      row(goal('pensione', 'Pensione', { targetAmount: 250_000 }), 38_000, { verdict: 'noDeadline', monthsToTarget: null, projectedDate: null }),
      row(EMERGENZA, 15_000, { verdict: 'reached', monthsToTarget: 0 }),
      row(AUTO, 11_500, { verdict: 'onTrack', monthsToDeadline: 19, monthsToTarget: 17, projectedDate: new Date('2028-01-26T12:00:00') }),
      row(goal('figli', 'Figli'), 4_000, { verdict: 'noTarget' }),
    ];
    const entries = buildMilestones(rows);

    expect(entries.map((e) => [e.name, e.kind])).toEqual([
      ['Fondo emergenza', 'reached'],
      ['Auto', 'dated'],
      ['Casa', 'dated'],
      ['Pensione', 'never'],
    ]);
  });

  it('measures how far past its deadline a late goal lands, in months', () => {
    const rows: GoalRow[] = [row(CASA, 78_000, { verdict: 'offTrack', monthsToDeadline: 34, monthsToTarget: 49, projectedDate: new Date('2030-09-26T12:00:00') })];
    const [casa] = buildMilestones(rows);
    expect(casa.date).toEqual({ year: 2030, month: 9 });
    expect(casa.monthsPastDeadline).toBe(15);
    expect(casa.deadline).toEqual({ year: 2029, month: 6 });
  });

  it('a goal that lands before its deadline carries no lateness', () => {
    const rows: GoalRow[] = [row(AUTO, 11_500, { verdict: 'onTrack', monthsToDeadline: 19, monthsToTarget: 17, projectedDate: new Date('2028-01-26T12:00:00') })];
    expect(buildMilestones(rows)[0].monthsPastDeadline).toBeNull();
  });
});

describe('summarizeDerivedAllocation', () => {
  it('puts the goals-derived target beside the allocation of the assigned quotas, class by class', () => {
    const view = summarizeDerivedAllocation([CASA, AUTO, STUDI, EMERGENZA], ASSIGNMENTS, ASSETS);
    expect(view).not.toBeNull();
    const byClass = Object.fromEntries(view!.rows.map((r) => [r.assetClass, r]));

    // Weighted by gap × priority: Casa 42.000×3, Auto 6.500×2, Studi 33.100×1 (Emergenza is reached).
    expect(byClass.bonds.derivedPct).toBeCloseTo(65, 0);
    expect(byClass.equity.derivedPct).toBeCloseTo(26.2, 0);
    expect(byClass.cash.derivedPct).toBeCloseTo(8.8, 0);
    // Assigned: bonds 72.000, cash 20.000, equity 6.900, crypto 12.000 out of 110.900.
    expect(view!.assignedTotal).toBe(110_900);
    expect(byClass.bonds.assignedPct).toBeCloseTo((72_000 / 110_900) * 100, 6);
    expect(byClass.crypto.assignedPct).toBeCloseTo((12_000 / 110_900) * 100, 6);
    expect(byClass.crypto.derivedPct).toBe(0);
  });

  it('follows the app sequence of classes, never the object key order', () => {
    const view = summarizeDerivedAllocation([CASA, AUTO, STUDI, EMERGENZA], ASSIGNMENTS, ASSETS);
    expect(view!.rows.map((r) => r.assetClass)).toEqual(['equity', 'bonds', 'crypto', 'cash']);
  });

  it('is null without a goal that has both a gap and a recommended allocation', () => {
    expect(summarizeDerivedAllocation([EMERGENZA], ASSIGNMENTS, ASSETS)).toBeNull();
  });
});

describe('summarizeAssignments', () => {
  it('groups the quotas by goal in the order given, each row valued and sorted by value', () => {
    const view = summarizeAssignments([CASA, AUTO, STUDI, EMERGENZA], ASSIGNMENTS, ASSETS);

    expect(view.groups.map((g) => [g.name, g.total])).toEqual([['Casa', 78_000], ['Auto', 11_500], ['Studi figli', 6_900], ['Fondo emergenza', 14_500]]);
    expect(view.groups[0].rows.map((r) => [r.name, r.percentage, r.value])).toEqual([
      ['BTP Italia 2030', 60, 57_000],
      ['Vanguard Global Aggregate Bond', 100, 15_000],
      ['Conto deposito', 40, 6_000],
    ]);
    expect(view.groups[0].rows[0].ticker).toBe('BTP');
  });

  it('counts the quotas and the distinct instruments assigned', () => {
    const view = summarizeAssignments([CASA, AUTO, STUDI, EMERGENZA], ASSIGNMENTS, ASSETS);
    expect(view.quotaCount).toBe(8);
    expect(view.instrumentCount).toBe(6);
    expect(view.assignedTotal).toBe(110_900);
  });

  it('closes with the free shares, largest first, and the total the shares add up to', () => {
    const view = summarizeAssignments([CASA, AUTO, STUDI, EMERGENZA], ASSIGNMENTS, ASSETS);
    expect(view.free.map((r) => [r.name, r.freePct, r.freeValue])).toEqual([
      ['Vanguard FTSE All-World', 85, 39_100],
      ['BTP Italia 2030', 40, 38_000],
    ]);
    expect(view.freeTotal).toBe(77_100);
    expect(view.freeInstrumentCount).toBe(2);
    expect(view.freeShare).toBeCloseTo((77_100 / 188_000) * 100, 6);
    expect(view.totalInstrumentCount).toBe(6);
  });

  it('names an instrument assigned past 100%', () => {
    const over: GoalAssetAssignment[] = [...ASSIGNMENTS, { goalId: 'studi', assetId: 'cc', percentage: 30 }];
    const view = summarizeAssignments([CASA, AUTO, STUDI, EMERGENZA], over, ASSETS);
    expect(view.overAssigned).toEqual([{ assetId: 'cc', name: 'Conto corrente', percentage: 130 }]);
    // An over-assigned instrument has no free share, never a negative one.
    expect(view.free.find((r) => r.assetId === 'cc')).toBeUndefined();
    expect(view.freeTotal).toBe(77_100);
  });

  it('skips a quota whose asset no longer exists', () => {
    const orphan: GoalAssetAssignment[] = [{ goalId: 'casa', assetId: 'gone', percentage: 50 }];
    const view = summarizeAssignments([CASA], orphan, ASSETS);
    expect(view.groups[0].rows).toEqual([]);
    expect(view.quotaCount).toBe(0);
  });

  it('sumAssetValues is the portfolio total on the same basis as every quota', () => {
    expect(sumAssetValues(ASSETS)).toBe(188_000);
  });
});
