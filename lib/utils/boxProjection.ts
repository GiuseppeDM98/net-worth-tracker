/**
 * Euclidean projection onto a capped-simplex budget box, extracted from
 * `leverageAwareAllocationUtils.ts` so `weightOptimizer.ts` (a different convex QP over the same
 * kind of box) can reuse it without importing the leverage-aware planner. No dependencies.
 */

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/**
 * Euclidean projection of `y` onto `{x : Σx = budget, lo_i ≤ x_i ≤ hi_i}` (continuous
 * knapsack / capped-simplex projection), via bisection on the shift `t` in
 * `x_i = clamp(y_i - t, lo_i, hi_i)`. `f(t) = Σx_i(t)` is non-increasing in `t`, so the root of
 * `f(t) = budget` is found by bisection. `budget` is clamped into `[Σlo_i, Σhi_i]` first so the
 * projection is always well-defined even if the caller asks for an infeasible budget.
 */
function projectOntoBudgetBox(y: number[], lo: number[], hi: number[], budget: number): number[] {
  const n = y.length;
  if (n === 0) return [];

  const sumLo = lo.reduce((s, v) => s + v, 0);
  const sumHi = hi.reduce((s, v) => s + v, 0);
  const clampedBudget = clamp(budget, sumLo, sumHi);

  const sumAt = (t: number): number => {
    let s = 0;
    for (let i = 0; i < n; i++) s += clamp(y[i] - t, lo[i], hi[i]);
    return s;
  };

  let tLo = Math.min(...y.map((yi, i) => yi - hi[i])) - 1;
  let tHi = Math.max(...y.map((yi, i) => yi - lo[i])) + 1;

  for (let iter = 0; iter < 100; iter++) {
    const tMid = (tLo + tHi) / 2;
    if (sumAt(tMid) > clampedBudget) tLo = tMid;
    else tHi = tMid;
  }

  const t = (tLo + tHi) / 2;
  return y.map((yi, i) => clamp(yi - t, lo[i], hi[i]));
}

export { dot, clamp, projectOntoBudgetBox };
