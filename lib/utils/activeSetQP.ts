/**
 * Exact primal active-set solver for the one convex problem the optimizer's «Con vendite mirate»
 * mode needs:
 *
 *   min ½·xᵀGx − qᵀx + Σ_i φ_i(x_i)   s.t.  Σ_{i: e_i = 1} x_i = total,   lo_i ≤ x_i ≤ hi_i
 *
 * with G symmetric positive definite and each φ_i convex piecewise linear with AT MOST one kink:
 * `slopeBelow · (x − at)` for x < at, 0 above (slopeBelow ≤ 0 — a sale below the current weight
 * costs `−slopeBelow` per unit, holding or buying costs nothing).
 *
 * Why not the projected gradient the other two modes use (owner's call, 2026-09-27, measured on the
 * real 12-candidate fixture): the objective is badly conditioned (λ from 1 to 1000, ε = 0,01 —
 * κ ≈ 10⁶), so projected descent needs ~1000 iterations per solve and the tax search needs 10–50
 * solves; this solver needs 25–45 active-set steps for the WHOLE search (0,1–0,2 ms against 15–500
 * ms) and returns the exact optimum — a held instrument sits at its current weight to the last bit,
 * the tax lands on the cap to the cent. It is used only where the tax cap binds; Ideale and
 * Raggiungibile keep `solveQP` byte for byte.
 *
 * Each coordinate is either FIXED at a breakpoint (lo, the kink, hi) or FREE inside one segment,
 * where φ_i is linear; the free subproblem is an equality-constrained QP solved exactly (one
 * `solveLinear`). A step towards its solution stops at the first breakpoint crossed (that coordinate
 * becomes fixed); at the subproblem's optimum, a fixed coordinate whose directional derivative is
 * negative is released into the segment it points to. Strict convexity makes every step descend.
 *
 * Degeneracy (found by the randomized cross-check, 2026-09-27): with every summed coordinate fixed,
 * the equality row is linearly dependent on the active bounds, and releasing one coordinate alone
 * cannot move it (Σ pins it) — the method cycled until its iteration cap. The cure is in the ratio
 * test: while ONE summed coordinate is free, Σ determines it and the test skips it, so it is never
 * re-fixed at α = 0 (removing that skip turns the degeneracy test red). A summed coordinate is also
 * freed before the first step, so the first multiplier ν is read from a real stationarity row.
 *
 * Deterministic: fixed iteration order, ties broken by index, no randomness.
 */

export interface PiecewiseKink {
  at: number;
  /** ≤ 0: the objective's slope below `at` (0 above). */
  slopeBelow: number;
}

export interface PiecewiseQP {
  G: number[][];
  q: number[];
  /** 1 = the coordinate counts in the equality row, 0 = it does not. */
  e: number[];
  total: number;
  lo: number[];
  /** `Infinity` allowed. */
  hi: number[];
  /** `null` = no kink (φ_i ≡ 0). A kink outside (lo, hi) or with slope 0 is ignored. */
  kinks: Array<PiecewiseKink | null>;
}

export interface PiecewiseQPResult {
  x: number[];
  iterations: number;
  converged: boolean;
}

const SNAP = 1e-12;

/** Gaussian elimination with partial pivoting; null when the system is singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const k = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    if (p !== c) {
      const tmp = M[p];
      M[p] = M[c];
      M[c] = tmp;
    }
    for (let r = c + 1; r < k; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j];
    }
  }
  const x = new Array<number>(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let s = M[r][k];
    for (let j = r + 1; j < k; j++) s -= M[r][j] * x[j];
    x[r] = s / M[r][r];
  }
  return x;
}

function breakpointsOf(P: PiecewiseQP, i: number): number[] {
  const bp = [P.lo[i]];
  const kink = P.kinks[i];
  if (kink && kink.slopeBelow < 0 && kink.at > P.lo[i] && kink.at < P.hi[i]) bp.push(kink.at);
  if (P.hi[i] > P.lo[i]) bp.push(P.hi[i]);
  return bp;
}

/** φ_i's slope on the segment that ends at `upper`. */
function slopeOn(P: PiecewiseQP, i: number, upper: number): number {
  const kink = P.kinks[i];
  return kink && kink.slopeBelow < 0 && upper <= kink.at ? kink.slopeBelow : 0;
}

/**
 * Solves `P` from `x0`, which MUST be feasible (box and equality) — the caller projects it
 * (`projectOntoBudgetBox`) or warm-starts from a previous solution of the same box.
 */
export function solvePiecewiseQP(P: PiecewiseQP, x0: number[], maxIterations?: number): PiecewiseQPResult {
  const m = x0.length;
  const x = x0.slice();
  const bps = Array.from({ length: m }, (_, i) => breakpointsOf(P, i));
  const fixedAt = new Array<number>(m).fill(-1); // breakpoint index, or -1 when free
  const seg = new Array<number>(m).fill(0); // free: the segment [bp[seg], bp[seg + 1]]

  for (let i = 0; i < m; i++) {
    const bp = bps[i];
    let found = -1;
    for (let j = 0; j < bp.length; j++) {
      if (Math.abs(x[i] - bp[j]) <= SNAP) {
        found = j;
        break;
      }
    }
    if (found >= 0 || bp.length === 1) {
      fixedAt[i] = Math.max(0, found);
      x[i] = bp[fixedAt[i]];
    } else {
      let k = 0;
      while (k < bp.length - 2 && x[i] > bp[k + 1]) k++;
      seg[i] = k;
    }
  }

  // Free one summed coordinate, so the first ν comes from a stationarity row (header, «Degeneracy»).
  if (!fixedAt.some((f, i) => f < 0 && P.e[i] !== 0)) {
    for (let i = 0; i < m; i++) {
      if (P.e[i] === 0 || bps[i].length < 2) continue;
      const j = fixedAt[i];
      fixedAt[i] = -1;
      seg[i] = j < bps[i].length - 1 ? j : j - 1;
      break;
    }
  }

  let gScale = 0;
  for (const row of P.G) for (const v of row) gScale = Math.max(gScale, Math.abs(v));
  const dualTol = 1e-11 * Math.max(1, gScale);
  const cap = maxIterations ?? 50 * m + 50;

  for (let it = 0; it < cap; it++) {
    const F: number[] = [];
    const X: number[] = [];
    for (let i = 0; i < m; i++) (fixedAt[i] >= 0 ? X : F).push(i);
    const freeSummed = F.filter((i) => P.e[i] !== 0);
    const hasSummed = freeSummed.length > 0;
    let nu = 0;

    if (F.length > 0) {
      const k = F.length + (hasSummed ? 1 : 0);
      const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
      const b = new Array<number>(k).fill(0);
      F.forEach((i, a) => {
        F.forEach((j, c) => {
          A[a][c] = P.G[i][j];
        });
        let r = P.q[i];
        for (const j of X) r -= P.G[i][j] * x[j];
        b[a] = r - slopeOn(P, i, bps[i][seg[i] + 1]);
        if (hasSummed) {
          A[a][F.length] = P.e[i];
          A[F.length][a] = P.e[i];
        }
      });
      if (hasSummed) {
        let r = P.total;
        for (const j of X) r -= P.e[j] * x[j];
        b[F.length] = r;
      }
      const sol = solveLinear(A, b);
      if (!sol) return { x, iterations: it + 1, converged: false };
      if (hasSummed) nu = sol[F.length];

      const pinned = freeSummed.length === 1 ? freeSummed[0] : -1;
      let alpha = 1;
      let block = -1;
      let blockAt = -1;
      F.forEach((i, a) => {
        if (i === pinned) return;
        const d = sol[a] - x[i];
        const bp = bps[i];
        if (d > 0) {
          const upper = bp[seg[i] + 1];
          if (upper < Infinity) {
            const al = (upper - x[i]) / d;
            if (al < alpha) {
              alpha = al;
              block = i;
              blockAt = seg[i] + 1;
            }
          }
        } else if (d < 0) {
          const al = (bp[seg[i]] - x[i]) / d;
          if (al < alpha) {
            alpha = al;
            block = i;
            blockAt = seg[i];
          }
        }
      });
      alpha = Math.max(0, alpha);
      F.forEach((i, a) => {
        x[i] += alpha * (sol[a] - x[i]);
      });
      if (pinned >= 0) {
        // Σ determines the pinned coordinate exactly — no drift from the linear solve.
        let r = P.total;
        for (let j = 0; j < m; j++) if (j !== pinned) r -= P.e[j] * x[j];
        x[pinned] = r;
      }
      if (block >= 0) {
        fixedAt[block] = blockAt;
        x[block] = bps[block][blockAt];
        continue;
      }
    }

    // Subproblem optimum reached: release the fixed coordinate with the most negative directional derivative.
    let worst = -dualTol;
    let release = -1;
    let direction = 0;
    for (const i of X) {
      const bp = bps[i];
      const j = fixedAt[i];
      if (bp.length < 2) continue;
      let g = -P.q[i] + nu * P.e[i];
      for (let c = 0; c < m; c++) g += P.G[i][c] * x[c];
      if (j < bp.length - 1) {
        const up = g + slopeOn(P, i, bp[j + 1]);
        if (up < worst) {
          worst = up;
          release = i;
          direction = 1;
        }
      }
      if (j > 0) {
        const down = -(g + slopeOn(P, i, bp[j]));
        if (down < worst) {
          worst = down;
          release = i;
          direction = -1;
        }
      }
    }
    if (release < 0) return { x, iterations: it + 1, converged: true };
    const j = fixedAt[release];
    fixedAt[release] = -1;
    seg[release] = direction > 0 ? j : j - 1;
  }

  return { x, iterations: cap, converged: false };
}
