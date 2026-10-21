/**
 * Tests for the capped-simplex projection extracted from leverageAwareAllocationUtils.ts
 *. No Firebase surface at all — plain arithmetic.
 */
import { describe, it, expect } from 'vitest';
import { projectOntoBudgetBox } from '@/lib/utils/boxProjection';

describe('projectOntoBudgetBox', () => {
  it('respects the budget (sum of the projection equals the requested budget, when feasible)', () => {
    const result = projectOntoBudgetBox([0.5, 0.2, 0.1], [0, 0, 0], [1, 1, 1], 1);
    const sum = result.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('respects every box bound', () => {
    const lo = [0, 0.1, 0.2];
    const hi = [0.5, 0.6, 0.3];
    const result = projectOntoBudgetBox([10, -10, 10], lo, hi, 0.6);
    result.forEach((v, i) => {
      expect(v).toBeGreaterThanOrEqual(lo[i] - 1e-9);
      expect(v).toBeLessThanOrEqual(hi[i] + 1e-9);
    });
    expect(result.reduce((s, v) => s + v, 0)).toBeCloseTo(0.6, 9);
  });

  it('clamps a budget outside [Σlo, Σhi] to the nearest feasible edge', () => {
    const lo = [0, 0, 0];
    const hi = [0.3, 0.3, 0.3]; // Σhi = 0.9
    const overBudget = projectOntoBudgetBox([0.3, 0.3, 0.3], lo, hi, 5);
    expect(overBudget.reduce((s, v) => s + v, 0)).toBeCloseTo(0.9, 9);

    const loFloor = [0.2, 0.2, 0.2]; // Σlo = 0.6
    const underBudget = projectOntoBudgetBox([0, 0, 0], loFloor, [1, 1, 1], -5);
    expect(underBudget.reduce((s, v) => s + v, 0)).toBeCloseTo(0.6, 9);
  });

  it('is idempotent on a point already inside the feasible set', () => {
    const lo = [0, 0, 0];
    const hi = [1, 1, 1];
    const y = [0.5, 0.3, 0.2]; // already sums to 1, within bounds
    const result = projectOntoBudgetBox(y, lo, hi, 1);
    result.forEach((v, i) => expect(v).toBeCloseTo(y[i], 9));
  });
});
