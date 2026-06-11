/**
 * Unit tests for the goal trajectory pure layer (Obiettivi redesign).
 * Pure math + derivation — no Firebase, no React. Time is injected via `now`.
 */

import { describe, it, expect } from 'vitest';
import {
  GOAL_CLASS_RETURNS,
  DEFAULT_GOAL_RETURN,
  expectedAnnualReturn,
  futureValue,
  requiredMonthlyContribution,
  monthsToReach,
  computeGoalTrajectory,
  buildGoalProjectionSeries,
  allocateContributionAcrossGoals,
  sortGoalRowsByUrgency,
  buildGoalsVerdictSummary,
  type GoalRow,
} from '@/lib/utils/goalTrajectory';
import { InvestmentGoal, GoalProgress } from '@/types/goals';

const NOW = new Date('2026-01-01T00:00:00Z');
// ~5 years out.
const dateInMonths = (months: number) =>
  new Date(NOW.getTime() + months * 1000 * 60 * 60 * 24 * 30.44).toISOString();

// ==================== expectedAnnualReturn ====================

describe('expectedAnnualReturn', () => {
  it('falls back to the default with no allocation', () => {
    expect(expectedAnnualReturn(undefined)).toBe(DEFAULT_GOAL_RETURN);
    expect(expectedAnnualReturn({})).toBe(DEFAULT_GOAL_RETURN);
  });

  it('returns the pure class rate for a single-class allocation', () => {
    expect(expectedAnnualReturn({ equity: 100 })).toBeCloseTo(GOAL_CLASS_RETURNS.equity, 5);
    expect(expectedAnnualReturn({ cash: 100 })).toBeCloseTo(GOAL_CLASS_RETURNS.cash, 5);
  });

  it('weights a mixed allocation', () => {
    // 50/50 equity(7)/bonds(2.5) = 4.75
    expect(expectedAnnualReturn({ equity: 50, bonds: 50 })).toBeCloseTo(4.75, 5);
  });

  it('normalises when weights do not sum to 100', () => {
    // weights 20/20 → still 50/50 → 4.75
    expect(expectedAnnualReturn({ equity: 20, bonds: 20 })).toBeCloseTo(4.75, 5);
  });
});

// ==================== futureValue ====================

describe('futureValue', () => {
  it('returns the present value at zero months', () => {
    expect(futureValue(1000, 100, 7, 0)).toBe(1000);
  });

  it('handles zero rate as simple accumulation', () => {
    expect(futureValue(1000, 100, 0, 12)).toBe(1000 + 100 * 12);
  });

  it('compounds the starting balance and contributions', () => {
    // PV 10000 @ 6%/yr for 12 months, no contribution → 10000 * 1.005^12
    const expected = 10000 * Math.pow(1.005, 12);
    expect(futureValue(10000, 0, 6, 12)).toBeCloseTo(expected, 4);
  });
});

// ==================== requiredMonthlyContribution ====================

describe('requiredMonthlyContribution', () => {
  it('zero rate splits the gap evenly', () => {
    // need 1200 more over 12 months → 100/month
    expect(requiredMonthlyContribution(0, 1200, 0, 12)).toBeCloseTo(100, 5);
  });

  it('returns 0 when growth alone reaches the target', () => {
    // huge PV already overshoots
    expect(requiredMonthlyContribution(100000, 50000, 7, 12)).toBe(0);
  });

  it('round-trips with futureValue', () => {
    const c = requiredMonthlyContribution(5000, 20000, 5, 36);
    const fv = futureValue(5000, c, 5, 36);
    expect(fv).toBeCloseTo(20000, 2);
  });

  it('clamps months to at least 1 (past deadline)', () => {
    const c = requiredMonthlyContribution(0, 1000, 0, 0);
    expect(c).toBeCloseTo(1000, 5);
  });
});

// ==================== monthsToReach ====================

describe('monthsToReach', () => {
  it('returns 0 when already at target', () => {
    expect(monthsToReach(1000, 1000, 0, 5)).toBe(0);
    expect(monthsToReach(1500, 1000, 0, 5)).toBe(0);
  });

  it('returns null when never reachable (no rate, no contribution)', () => {
    expect(monthsToReach(500, 1000, 0, 0)).toBeNull();
  });

  it('zero rate divides the gap by the contribution', () => {
    expect(monthsToReach(0, 1000, 100, 0)).toBe(10);
  });

  it('round-trips: futureValue at monthsToReach covers the target', () => {
    const m = monthsToReach(5000, 20000, 300, 6)!;
    expect(m).toBeGreaterThan(0);
    expect(futureValue(5000, 300, 6, m)).toBeGreaterThanOrEqual(20000);
  });
});

// ==================== computeGoalTrajectory ====================

describe('computeGoalTrajectory', () => {
  it('open-ended goal → noTarget verdict', () => {
    const t = computeGoalTrajectory({ currentValue: 5000, now: NOW });
    expect(t.verdict).toBe('noTarget');
    expect(t.requiredMonthlyContribution).toBeNull();
  });

  it('reached when current value meets the target', () => {
    const t = computeGoalTrajectory({
      currentValue: 12000,
      targetAmount: 10000,
      targetDate: dateInMonths(24),
      now: NOW,
    });
    expect(t.verdict).toBe('reached');
  });

  it('target without a date → noDeadline', () => {
    const t = computeGoalTrajectory({
      currentValue: 1000,
      targetAmount: 10000,
      now: NOW,
    });
    expect(t.verdict).toBe('noDeadline');
    expect(t.requiredMonthlyContribution).toBeNull();
  });

  it('off track when contribution is too low for the deadline', () => {
    const t = computeGoalTrajectory({
      currentValue: 0,
      targetAmount: 12000,
      targetDate: dateInMonths(12),
      monthlyContribution: 100, // need ~1000/month
      annualReturn: 0,
      now: NOW,
    });
    expect(t.verdict).toBe('offTrack');
    expect(t.requiredMonthlyContribution).toBeCloseTo(1000, 0);
  });

  it('on track when contribution meets the required pace', () => {
    const t = computeGoalTrajectory({
      currentValue: 0,
      targetAmount: 12000,
      targetDate: dateInMonths(12),
      monthlyContribution: 1000,
      annualReturn: 0,
      now: NOW,
    });
    expect(t.verdict).toBe('onTrack');
    expect(t.projectedValueAtDeadline).toBeCloseTo(12000, 0);
  });

  it('derives the return from the recommended allocation when not overridden', () => {
    const t = computeGoalTrajectory({
      currentValue: 0,
      targetAmount: 10000,
      recommendedAllocation: { equity: 100 },
      now: NOW,
    });
    expect(t.annualReturn).toBeCloseTo(GOAL_CLASS_RETURNS.equity, 5);
  });

  it('produces a projected date when a contribution is set', () => {
    const t = computeGoalTrajectory({
      currentValue: 0,
      targetAmount: 1200,
      monthlyContribution: 100,
      annualReturn: 0,
      now: NOW,
    });
    expect(t.monthsToTarget).toBe(12);
    expect(t.projectedDate).not.toBeNull();
  });
});

// ==================== buildGoalProjectionSeries ====================

describe('buildGoalProjectionSeries', () => {
  it('starts at the current value and ends at/above the deadline horizon', () => {
    const series = buildGoalProjectionSeries({
      currentValue: 1000,
      targetAmount: 13000,
      targetDate: dateInMonths(12),
      monthlyContribution: 1000,
      annualReturn: 0,
      now: NOW,
    });
    expect(series.length).toBeGreaterThan(1);
    expect(series[0].value).toBe(1000);
    expect(series[0].monthIndex).toBe(0);
    expect(series[series.length - 1].monthIndex).toBe(12);
    expect(series.every((p) => p.target === 13000)).toBe(true);
  });

  it('caps the number of points', () => {
    const series = buildGoalProjectionSeries(
      {
        currentValue: 0,
        targetAmount: 100000,
        targetDate: dateInMonths(480), // 40 years
        monthlyContribution: 200,
        annualReturn: 5,
        now: NOW,
      },
      48
    );
    expect(series.length).toBeLessThanOrEqual(50);
  });
});

// ==================== allocateContributionAcrossGoals ====================

const mkGoal = (over: Partial<InvestmentGoal>): InvestmentGoal => ({
  id: 'g',
  name: 'Goal',
  priority: 'media',
  color: '#000',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const mkProgress = (goalId: string, currentValue: number): GoalProgress => ({
  goalId,
  goalName: goalId,
  goalColor: '#000',
  currentValue,
  actualAllocation: {},
});

describe('allocateContributionAcrossGoals', () => {
  it('returns empty for non-positive amounts', () => {
    expect(allocateContributionAcrossGoals([], [], 0)).toEqual([]);
  });

  it('skips fully-funded and open-ended goals', () => {
    const goals = [
      mkGoal({ id: 'full', targetAmount: 1000 }),
      mkGoal({ id: 'open' }), // no target
      mkGoal({ id: 'active', targetAmount: 5000, priority: 'media' }),
    ];
    const progress = [
      mkProgress('full', 1000),
      mkProgress('open', 0),
      mkProgress('active', 1000),
    ];
    const slices = allocateContributionAcrossGoals(goals, progress, 1000);
    expect(slices).toHaveLength(1);
    expect(slices[0].goalId).toBe('active');
  });

  it('weights by gap × priority and never exceeds the gap', () => {
    const goals = [
      mkGoal({ id: 'a', targetAmount: 10000, priority: 'alta' }), // gap 10000 × 3
      mkGoal({ id: 'b', targetAmount: 10000, priority: 'bassa' }), // gap 10000 × 1
    ];
    const progress = [mkProgress('a', 0), mkProgress('b', 0)];
    const slices = allocateContributionAcrossGoals(goals, progress, 4000);
    const a = slices.find((s) => s.goalId === 'a')!;
    const b = slices.find((s) => s.goalId === 'b')!;
    // 3:1 split of 4000 → 3000 / 1000
    expect(a.add).toBeCloseTo(3000, 2);
    expect(b.add).toBeCloseTo(1000, 2);
    expect(a.add).toBeLessThanOrEqual(a.gap);
  });
});

// ==================== ordering + summary ====================

function mkRow(
  id: string,
  verdict: GoalRow['trajectory']['verdict'],
  monthsToDeadline: number | null,
  required: number | null = 0
): GoalRow {
  return {
    goal: mkGoal({ id, name: id, color: '#123' }),
    progress: mkProgress(id, 0),
    trajectory: {
      verdict,
      annualReturn: 5,
      monthsToDeadline,
      requiredMonthlyContribution: required,
      currentMonthlyContribution: 0,
      projectedDate: null,
      monthsToTarget: null,
      projectedValueAtDeadline: null,
    },
  };
}

describe('sortGoalRowsByUrgency', () => {
  it('orders off-track first and reached last, nearest deadline within a tier', () => {
    const rows = [
      mkRow('reached', 'reached', 6),
      mkRow('onTrackFar', 'onTrack', 60),
      mkRow('offTrackNear', 'offTrack', 6),
      mkRow('offTrackFar', 'offTrack', 48),
    ];
    const sorted = sortGoalRowsByUrgency(rows).map((r) => r.goal.id);
    expect(sorted).toEqual(['offTrackNear', 'offTrackFar', 'onTrackFar', 'reached']);
  });
});

describe('buildGoalsVerdictSummary', () => {
  it('counts verdicts and sums required monthly across dated not-reached goals', () => {
    const rows = [
      mkRow('a', 'offTrack', 6, 500),
      mkRow('b', 'onTrack', 24, 200),
      mkRow('c', 'reached', 12, 0),
    ];
    const summary = buildGoalsVerdictSummary(rows);
    expect(summary.total).toBe(3);
    expect(summary.reached).toBe(1);
    expect(summary.onTrack).toBe(1);
    expect(summary.offTrack).toBe(1);
    expect(summary.withDeadline).toBe(2);
    expect(summary.totalRequiredMonthly).toBeCloseTo(700, 5);
    expect(summary.nearest?.goalName).toBe('a'); // nearest deadline (6 mo)
  });

  it('has no nearest when no dated goals exist', () => {
    const rows = [mkRow('open', 'noTarget', null, null)];
    expect(buildGoalsVerdictSummary(rows).nearest).toBeNull();
  });
});
