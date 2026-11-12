/**
 * Tests for the exact active-set solver behind the optimizer's «Con vendite mirate» mode
 * (`lib/utils/activeSetQP.ts`). The property test checks
 * an optimality CERTIFICATE (the KKT conditions of the piecewise-linear QP) instead of comparing
 * against another solver: a point that satisfies them is the unique optimum, whoever computed it.
 */
import { describe, it, expect } from 'vitest';
import { solveLinear, solvePiecewiseQP, type PiecewiseQP } from '@/lib/utils/activeSetQP';
import { projectOntoBudgetBox } from '@/lib/utils/boxProjection';

function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** The KKT residual of `x` for `P`: 0 at the optimum (up to float noise). */
function kktViolation(P: PiecewiseQP, x: number[]): number {
  const m = x.length;
  const g = x.map((_, i) => P.G[i].reduce((s, gij, j) => s + gij * x[j], 0) - P.q[i]);
  const slopeBelowAt = (i: number, v: number) => {
    const k = P.kinks[i];
    return k && k.slopeBelow < 0 && k.at > P.lo[i] && k.at < P.hi[i] && v < k.at ? k.slopeBelow : 0;
  };
  // Each coordinate: the admissible interval for −(g_i + ν·e_i), from φ's subdifferential and the box.
  const tol = 1e-9;
  let nuLo = -Infinity;
  let nuHi = Infinity;
  let violation = 0;
  for (let i = 0; i < m; i++) {
    const k = P.kinks[i];
    const atKink = k && k.slopeBelow < 0 && k.at > P.lo[i] && k.at < P.hi[i] && Math.abs(x[i] - k.at) <= 1e-12;
    const atLo = Math.abs(x[i] - P.lo[i]) <= 1e-12;
    const atHi = P.hi[i] < Infinity && Math.abs(x[i] - P.hi[i]) <= 1e-12;
    // subgradient slopes: sL (left derivative), sR (right derivative) of φ_i + box indicator
    let sL = slopeBelowAt(i, x[i] - 1e-9);
    let sR = slopeBelowAt(i, x[i] + 1e-9);
    if (atKink) {
      sL = k!.slopeBelow;
      sR = 0;
    }
    if (atLo) sL = -Infinity;
    if (atHi) sR = Infinity;
    // need: sL ≤ −(g_i + ν e_i) ≤ sR
    if (P.e[i] !== 0) {
      nuLo = Math.max(nuLo, -sR - g[i]);
      nuHi = Math.min(nuHi, -sL - g[i]);
    } else {
      violation = Math.max(violation, sL + g[i], -(sR + g[i]));
    }
  }
  if (nuLo > nuHi) violation = Math.max(violation, nuLo - nuHi);
  const scale = Math.max(1, ...g.map(Math.abs));
  return violation / scale - tol;
}

function randomProblem(rand: () => number): { P: PiecewiseQP; x0: number[] } {
  const summed = 2 + Math.floor(rand() * 12);
  const slack = Math.floor(rand() * 3);
  const m = summed + slack;
  const A = Array.from({ length: m + 2 }, () => Array.from({ length: m }, () => rand() * 2 - 1));
  const G = Array.from({ length: m }, (_, i) =>
    Array.from({ length: m }, (_, j) => A.reduce((s, row) => s + row[i] * row[j], 0) * 100 + (i === j ? 0.01 : 0))
  );
  const q = Array.from({ length: m }, () => (rand() * 2 - 1) * 100);
  const lo = Array.from({ length: m }, (_, i) => (i < summed && rand() < 0.3 ? rand() * 0.05 : 0));
  const hi = Array.from({ length: m }, (_, i) => (i >= summed ? Infinity : rand() < 0.3 ? lo[i] + rand() * 0.4 : 1));
  const cur = Array.from({ length: m }, (_, i) => lo[i] + rand() * Math.min(1, hi[i]) * 0.3);
  const kinks = cur.map((c, i) => (i < summed && rand() < 0.7 ? { at: c, slopeBelow: -rand() * 200 } : null));
  const e = Array.from({ length: m }, (_, i) => (i < summed ? 1 : 0));
  const sumLo = lo.slice(0, summed).reduce((s, v) => s + v, 0);
  const sumHi = hi.slice(0, summed).reduce((s, v) => s + v, 0);
  const total = Math.min(1, sumHi);
  if (sumLo > total) return randomProblem(rand);
  const w0 = projectOntoBudgetBox(cur.slice(0, summed), lo.slice(0, summed), hi.slice(0, summed), total);
  return { P: { G, q, e, total, lo, hi, kinks }, x0: [...w0, ...new Array(slack).fill(0)] };
}

describe('solveLinear', () => {
  it('solves a small system and flags a singular one', () => {
    expect(solveLinear([[2, 1], [1, 3]], [3, 5])).toEqual([0.8, 1.4]);
    expect(solveLinear([[1, 2], [2, 4]], [1, 2])).toBeNull();
  });
});

describe('solvePiecewiseQP', () => {
  it('finds the analytic optimum of a box-free two-variable problem', () => {
    // min ½(x1² + x2²) − (x1 + 3x2)  s.t. x1 + x2 = 1  →  x = (−0.5, 1.5)
    const P: PiecewiseQP = { G: [[1, 0], [0, 1]], q: [1, 3], e: [1, 1], total: 1, lo: [-10, -10], hi: [10, 10], kinks: [null, null] };
    const r = solvePiecewiseQP(P, [0.5, 0.5]);
    expect(r.converged).toBe(true);
    expect(r.x[0]).toBeCloseTo(-0.5, 12);
    expect(r.x[1]).toBeCloseTo(1.5, 12);
  });

  it('holds a coordinate EXACTLY at its kink when the sale costs more than it gains', () => {
    // Without the kink x1 would go to 0.2; selling below 0.5 costs 10 per unit, the pull is only 3.
    const P: PiecewiseQP = {
      G: [[10, 0], [0, 10]],
      q: [2, 8],
      e: [1, 1],
      total: 1,
      lo: [0, 0],
      hi: [1, 1],
      kinks: [{ at: 0.5, slopeBelow: -10 }, null],
    };
    const r = solvePiecewiseQP(P, [0.5, 0.5]);
    expect(r.converged).toBe(true);
    expect(r.x[0]).toBe(0.5);
    expect(r.x[1]).toBe(0.5);
  });

  it('does not cycle when every summed coordinate starts on its kink (the degeneracy found on 2026-09-27)', () => {
    // Σ current = total: every coordinate at its kink, the equality row redundant with the bounds.
    const P: PiecewiseQP = {
      G: [[4, 1, 0], [1, 4, 1], [0, 1, 4]],
      q: [4, 0, 0],
      e: [1, 1, 1],
      total: 1,
      lo: [0, 0, 0],
      hi: [1, 1, 1],
      kinks: [{ at: 0.2, slopeBelow: -0.01 }, { at: 0.3, slopeBelow: -0.01 }, { at: 0.5, slopeBelow: -0.01 }],
    };
    const r = solvePiecewiseQP(P, [0.2, 0.3, 0.5]);
    expect(r.converged).toBe(true);
    expect(r.x[0]).toBeGreaterThan(0.2);
    expect(kktViolation(P, r.x)).toBeLessThanOrEqual(0);
  });

  it('satisfies the KKT conditions on 300 random problems (boxes, kinks, unsummed slacks)', () => {
    const rand = lcg(20260927);
    for (let k = 0; k < 300; k++) {
      const { P, x0 } = randomProblem(rand);
      const r = solvePiecewiseQP(P, x0);
      expect(r.converged, `problem ${k}`).toBe(true);
      const summed = r.x.reduce((s, v, i) => s + v * P.e[i], 0);
      expect(Math.abs(summed - P.total), `problem ${k} Σ`).toBeLessThan(1e-9);
      r.x.forEach((v, i) => {
        expect(v, `problem ${k} x${i} ≥ lo`).toBeGreaterThanOrEqual(P.lo[i] - 1e-12);
        expect(v, `problem ${k} x${i} ≤ hi`).toBeLessThanOrEqual(P.hi[i] + 1e-12);
      });
      expect(kktViolation(P, r.x), `problem ${k} KKT`).toBeLessThanOrEqual(0);
    }
  });

  it('is deterministic bit for bit', () => {
    const rand = lcg(7);
    const { P, x0 } = randomProblem(rand);
    expect(solvePiecewiseQP(P, x0)).toEqual(solvePiecewiseQP(P, x0));
  });
});
