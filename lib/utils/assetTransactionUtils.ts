/**
 * Derivation engine for the asset trade ledger (pure, tested).
 *
 * This module is the mathematical core of the "Registro operazioni asset" feature: it folds an
 * asset's BUY/SELL/ADJUSTMENT transactions into a position state (quantity, PMC, cost basis,
 * realized P&L, holding start) and derives the money-weighted metrics (XIRR, total return,
 * invested capital) on top of that state.
 *
 * Design constraints (repo conventions — do not break):
 *   - ZERO Firebase imports. Types only, plus getItalyYear from dateHelpers (itself pure). The
 *     tests import this module without mocking @/lib/firebase/config — same posture as
 *     allocationUtils.ts. Keeping the money math here (not in the service layer) is system
 *     invariant #6 of docs/specs/1-asset-transactions/README.md.
 *   - TIME IS INJECTED. Any function needing "now" takes it as an explicit Date parameter.
 *
 * Two invariants govern the PMC math and MUST be preserved (README §invariants):
 *   #2 The native PMC (`averageCost`) is the weighted average of native trade prices with fees
 *      EXCLUDED — exactly today's Asset.averageCost semantics. Fees and FX live only in the
 *      EUR-side fields (costBasisEur / investedEur / realized P&L).
 *   #4 The migration baseline NEVER produces a holdingStartDate (see §holdingStartDate below).
 */

import type { AssetTransaction } from '@/types/assetTransactions';
import { getItalyYear } from '@/lib/utils/dateHelpers';

/** Float-dust tolerance: quantities within this of a boundary are treated as the boundary. */
const EPSILON = 1e-9;

/** Milliseconds in one day; used for the day-exact XIRR discounting. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * A transaction sequence that cannot represent a valid position history.
 * `userMessage` is Italian and user-displayable — the Admin API route forwards it verbatim in the
 * 422 body, so it must never contain internal detail.
 */
export class LedgerValidationError extends Error {
  code: 'SELL_EXCEEDS_HOLDING' | 'NEGATIVE_INPUT' | 'BASELINE_NOT_FIRST';
  userMessage: string;
  transactionId?: string;

  constructor(
    code: 'SELL_EXCEEDS_HOLDING' | 'NEGATIVE_INPUT' | 'BASELINE_NOT_FIRST',
    userMessage: string,
    transactionId?: string,
  ) {
    super(userMessage);
    this.name = 'LedgerValidationError';
    this.code = code;
    this.userMessage = userMessage;
    this.transactionId = transactionId;
    // Restore the prototype chain so `instanceof LedgerValidationError` holds after transpilation
    // to older targets (well-known TS gotcha when extending built-in Error).
    Object.setPrototypeOf(this, LedgerValidationError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * Rank of a transaction WITHIN a single date. Baseline first (it is the opening position), then
 * buy → sell → adjustment. The buy-before-sell rule matters: a same-day buy+sell of a brand-new
 * asset is only valid if the buy is applied first, otherwise the sell would over-sell an empty
 * position and the whole sequence would be wrongly rejected.
 */
function sameDateRank(t: AssetTransaction): number {
  if (t.isBaseline === true) return -1;
  switch (t.type) {
    case 'buy':
      return 0;
    case 'sell':
      return 1;
    case 'adjustment':
      return 2;
  }
}

/**
 * Sort transactions into deterministic replay order: date, then same-date type rank, then
 * createdAt, then id as a final total-order tie-break. Returns a new array; the input is not
 * mutated. Every other function in this module sorts internally via this helper — callers may
 * pass transactions in any order.
 */
export function sortTransactionsForReplay(transactions: AssetTransaction[]): AssetTransaction[] {
  return [...transactions].sort((a, b) => {
    const dateDiff = a.date.getTime() - b.date.getTime();
    if (dateDiff !== 0) return dateDiff;

    const rankDiff = sameDateRank(a) - sameDateRank(b);
    if (rankDiff !== 0) return rankDiff;

    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime();
    if (createdDiff !== 0) return createdDiff;

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Position replay
// ---------------------------------------------------------------------------

export interface LedgerPositionState {
  quantity: number;
  averageCost: number | undefined;      // native PMC; undefined only before any transaction
  costBasisEur: number;                 // EUR cost of the OPEN position, buy fees included
  averageCostEur: number | undefined;   // costBasisEur / quantity; undefined when quantity === 0
  realizedPnlEur: number;               // cumulative since baseline
  realizedByYear: Record<number, number>; // fiscal year (getItalyYear of sell date) → EUR
  investedEur: number;                  // Σ buy (quantity·priceEur + fees), baseline included
  divestedEur: number;                  // Σ sell (quantity·priceEur − fees)
  holdingStartDate: Date | undefined;   // see §holdingStartDate — undefined means "do not overwrite"
}

/** Reject negative primitive inputs early (defense in depth; zod also guards the write path). */
function assertNonNegative(t: AssetTransaction): void {
  if (t.quantity < 0 || t.pricePerUnit < 0 || t.priceEur < 0 || (t.fees ?? 0) < 0) {
    throw new LedgerValidationError(
      'NEGATIVE_INPUT',
      'Quantità, prezzo e commissioni non possono essere negativi.',
      t.id,
    );
  }
}

/**
 * Replay an asset's full transaction list into its current position state.
 *
 * Deterministic fold over the sorted sequence. Throws LedgerValidationError on any invalid history
 * (over-sell, negative input, a transaction dated before the baseline) — this is also the route's
 * pre-write validation: editing or deleting a mid-history trade re-runs the whole replay, so a
 * later over-sell is caught even though the edited trade itself looks fine.
 *
 * §holdingStartDate — set to the transaction date whenever quantity moves from <= 0 to > 0 AND the
 * transaction is NOT the baseline. Rationale (invariant #4, do not "simplify" away): the baseline
 * freezes a position whose real holding began long before migration day. computeDividendYieldMetrics
 * (lib/utils/yieldOnCost.ts) and the total-return calc in app/api/dividends/stats/route.ts drop
 * every dividend paid before Asset.holdingStartDate; stamping the migration date here would silently
 * zero out YOC for the whole existing portfolio. `holdingStartDate: undefined` in the result means
 * "leave the asset doc's existing value untouched" — the write path must never deleteField() it.
 */
export function replayTransactions(transactions: AssetTransaction[]): LedgerPositionState {
  const sorted = sortTransactionsForReplay(transactions);

  // A baseline is the opening position: nothing may precede it. After sorting it can only be at
  // index 0 (baselineDate is the global floor and baseline outranks same-day trades); anywhere
  // else means an earlier-dated trade slipped in.
  const baselineIndex = sorted.findIndex((t) => t.isBaseline === true);
  if (baselineIndex > 0) {
    throw new LedgerValidationError(
      'BASELINE_NOT_FIRST',
      'La transazione di apertura (baseline) deve precedere ogni altra operazione.',
      sorted[baselineIndex].id,
    );
  }

  const state: LedgerPositionState = {
    quantity: 0,
    averageCost: undefined,
    costBasisEur: 0,
    averageCostEur: undefined,
    realizedPnlEur: 0,
    realizedByYear: {},
    investedEur: 0,
    divestedEur: 0,
    holdingStartDate: undefined,
  };

  for (const t of sorted) {
    assertNonNegative(t);
    const prevQuantity = state.quantity;

    switch (t.type) {
      case 'buy': {
        // Native PMC is a weighted average of native prices, fees EXCLUDED (invariant #2).
        // (prevAverageCost is treated as 0 when the previous quantity was 0.)
        const prevAverageCost = state.averageCost ?? 0;
        const newQuantity = prevQuantity + t.quantity;
        state.averageCost =
          newQuantity > 0
            ? (prevQuantity * prevAverageCost + t.quantity * t.pricePerUnit) / newQuantity
            : prevAverageCost;
        state.quantity = newQuantity;

        // Fees and FX enter only the EUR side.
        const addedCostEur = t.quantity * t.priceEur + (t.fees ?? 0);
        state.costBasisEur += addedCostEur;
        state.investedEur += addedCostEur;
        break;
      }

      case 'sell': {
        if (t.quantity > state.quantity + EPSILON) {
          throw new LedgerValidationError(
            'SELL_EXCEEDS_HOLDING',
            'La vendita supera la quantità posseduta a quella data.',
            t.id,
          );
        }
        // EUR average cost as of this instant (before reducing the position).
        const averageCostEur = state.quantity > 0 ? state.costBasisEur / state.quantity : 0;
        const proceeds = t.quantity * t.priceEur - (t.fees ?? 0);
        const soldCostBasis = t.quantity * averageCostEur;
        const realized = proceeds - soldCostBasis;

        state.realizedPnlEur += realized;
        const year = getItalyYear(t.date);
        state.realizedByYear[year] = (state.realizedByYear[year] ?? 0) + realized;
        state.costBasisEur -= soldCostBasis;
        state.divestedEur += proceeds;
        state.quantity -= t.quantity;
        // Native averageCost is UNCHANGED — selling never moves the PMC (regime amministrato).

        // Clamp float dust when the position closes; keep the last native PMC (harmless at qty 0,
        // and every consumer filters on quantity > 0).
        if (state.quantity <= EPSILON) {
          state.quantity = 0;
          state.costBasisEur = 0;
        }
        break;
      }

      case 'adjustment': {
        // Absolute reset: new quantity + new PMC from this date onward. Splits and corrections.
        // No realized P&L, no cash movement, no fees.
        state.quantity = t.quantity;
        state.averageCost = t.pricePerUnit;
        state.costBasisEur = t.quantity * t.priceEur;
        break;
      }
    }

    // Shared holding-start rule (applies to buy and adjustment alike; never to the baseline).
    if (prevQuantity <= 0 && state.quantity > 0 && t.isBaseline !== true) {
      state.holdingStartDate = t.date;
    }
  }

  state.averageCostEur = state.quantity > 0 ? state.costBasisEur / state.quantity : undefined;
  return state;
}

// ---------------------------------------------------------------------------
// Asset-doc projection
// ---------------------------------------------------------------------------

/**
 * Project the replay result into the exact fields written back to assets/{assetId}. Single tested
 * source of truth for the write path. `averageCost: undefined` can only occur for an empty
 * sequence (the route never writes in that case); `holdingStartDate: undefined` means "do not
 * write" (see §holdingStartDate).
 */
export function buildDerivedAssetFields(state: LedgerPositionState): {
  quantity: number;
  averageCost: number | undefined;
  holdingStartDate: Date | undefined;
} {
  return {
    quantity: state.quantity,
    averageCost: state.averageCost,
    holdingStartDate: state.holdingStartDate,
  };
}

// ---------------------------------------------------------------------------
// Cash settlement
// ---------------------------------------------------------------------------

/**
 * Signed EUR delta to apply to the linked cash asset's balance for ONE transaction.
 *   buy  → −(quantity·priceEur + fees)   (cash debited)
 *   sell → +(quantity·priceEur − fees)   (cash credited)
 *   adjustment, or no linkedCashAssetId → 0
 *
 * Pure so edit/delete flows can net reversal = −computeCashDelta(old) with
 * application = computeCashDelta(new) into a single per-cash-asset delta.
 */
export function computeCashDelta(t: AssetTransaction): number {
  if (!t.linkedCashAssetId || t.type === 'adjustment') return 0;
  const fees = t.fees ?? 0;
  if (t.type === 'buy') return -(t.quantity * t.priceEur + fees);
  return t.quantity * t.priceEur - fees; // sell
}

// ---------------------------------------------------------------------------
// XIRR (money-weighted, date-exact)
// ---------------------------------------------------------------------------

export interface XirrFlow {
  date: Date;
  amountEur: number;
}

/**
 * Build the dated EUR cash-flow series for an asset's XIRR, sorted ascending by date.
 *
 *   buy        → −(quantity·priceEur + fees) at t.date   (baseline included — the opening outlay)
 *   sell       → +(quantity·priceEur − fees) at t.date
 *   adjustment → NO flow. Splits are value-neutral, so a quantity-correcting adjustment slightly
 *                distorts XIRR — accepted v1 limitation.
 *   dividend   → +amountEur at its payment date (the CALLER scopes dividends to
 *                paymentDate >= first ledger date AND >= holdingStartDate, and passes NET EUR).
 *   terminal   → +currentValueEur at `now`, ONLY if the current quantity > 0 (a closed position's
 *                last real flow is its final sell).
 */
export function buildXirrFlows(input: {
  transactions: AssetTransaction[];
  dividendsNetEur: { date: Date; amountEur: number }[];
  currentValueEur: number;
  now: Date;
}): XirrFlow[] {
  const flows: XirrFlow[] = [];

  for (const t of input.transactions) {
    if (t.type === 'buy') {
      flows.push({ date: t.date, amountEur: -(t.quantity * t.priceEur + (t.fees ?? 0)) });
    } else if (t.type === 'sell') {
      flows.push({ date: t.date, amountEur: t.quantity * t.priceEur - (t.fees ?? 0) });
    }
    // adjustment → intentionally no flow
  }

  for (const dividend of input.dividendsNetEur) {
    flows.push({ date: dividend.date, amountEur: dividend.amountEur });
  }

  // Only an open position has a terminal (mark-to-market) inflow.
  const state = replayTransactions(input.transactions);
  if (state.quantity > 0) {
    flows.push({ date: input.now, amountEur: input.currentValueEur });
  }

  flows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return flows;
}

/**
 * Internal net-present-value of a flow series at annual rate `r`, discounting each flow by the
 * actual day count since the earliest flow: NPV(r) = Σ amount_i / (1 + r)^(days_i / 365).
 */
function computeNpv(amounts: number[], years: number[], r: number): number {
  let sum = 0;
  for (let i = 0; i < amounts.length; i++) {
    sum += amounts[i] / Math.pow(1 + r, years[i]);
  }
  return sum;
}

/** Analytic derivative of computeNpv with respect to `r` (for Newton–Raphson). */
function computeNpvDerivative(amounts: number[], years: number[], r: number): number {
  let sum = 0;
  for (let i = 0; i < amounts.length; i++) {
    sum += amounts[i] * -years[i] * Math.pow(1 + r, -years[i] - 1);
  }
  return sum;
}

/** Bisection fallback on [−0.9999, 10]; null when the bracket shows no sign change. */
function solveXirrByBisection(amounts: number[], years: number[]): number | null {
  let lo = -0.9999;
  let hi = 10;
  let fLo = computeNpv(amounts, years, lo);
  let fHi = computeNpv(amounts, years, hi);
  if (!isFinite(fLo) || !isFinite(fHi)) return null;
  if (Math.abs(fLo) < 1e-7) return lo;
  if (Math.abs(fHi) < 1e-7) return hi;
  if (fLo * fHi > 0) return null; // no root bracketed

  for (let iter = 0; iter < 200; iter++) {
    const mid = (lo + hi) / 2;
    const fMid = computeNpv(amounts, years, mid);
    if (Math.abs(fMid) < 1e-7 || (hi - lo) / 2 < EPSILON) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Solve the money-weighted internal rate of return for a dated flow series.
 *
 * The result is the ANNUALIZED rate as a FRACTION (e.g. 0.10 == 10%/yr); multiply by 100 for
 * display. Stated explicitly to prevent the ×100 drift bugs the repo has seen with TWR. The UI
 * renders `null` as "–", never 0.
 *
 * Newton–Raphson from r₀ = 0.1 (max 100 iterations, tolerance 1e-7); on non-convergence, a near-zero
 * derivative, or a step leaving the valid domain, it falls back to bisection on [−0.9999, 10].
 * Returns null when: fewer than 2 flows, all flows the same sign, total span < 1 day, or the
 * bisection bracket shows no sign change.
 *
 * This is deliberately SEPARATE from calculateIRR in performanceService.ts, which is
 * monthly-bucketed and snapshot-based. Both are kept; they answer different questions.
 */
export function computeAssetXirr(flows: XirrFlow[]): number | null {
  if (flows.length < 2) return null;

  const hasPositive = flows.some((f) => f.amountEur > 0);
  const hasNegative = flows.some((f) => f.amountEur < 0);
  if (!hasPositive || !hasNegative) return null; // no sign change → no root

  const times = flows.map((f) => f.date.getTime());
  const t0 = Math.min(...times);
  const tEnd = Math.max(...times);
  if ((tEnd - t0) / MS_PER_DAY < 1) return null; // span shorter than a day is not annualizable

  const amounts = flows.map((f) => f.amountEur);
  const years = flows.map((f) => (f.date.getTime() - t0) / MS_PER_DAY / 365);

  // Newton–Raphson.
  let r = 0.1;
  let converged = false;
  for (let iter = 0; iter < 100; iter++) {
    const value = computeNpv(amounts, years, r);
    if (Math.abs(value) < 1e-7) {
      converged = true;
      break;
    }
    const derivative = computeNpvDerivative(amounts, years, r);
    if (!isFinite(derivative) || Math.abs(derivative) < 1e-12) break; // flat → bisection
    const next = r - value / derivative;
    if (!isFinite(next) || next <= -0.9999 || next > 1e6) break; // left the domain → bisection
    if (Math.abs(next - r) < 1e-10) {
      r = next;
      converged = Math.abs(computeNpv(amounts, years, r)) < 1e-7;
      break;
    }
    r = next;
  }
  if (converged) return r;

  return solveXirrByBisection(amounts, years);
}

// ---------------------------------------------------------------------------
// Per-asset total return
// ---------------------------------------------------------------------------

export interface AssetTotalReturn {
  investedEur: number;          // state.investedEur (denominator)
  realizedPnlEur: number;
  unrealizedPnlEur: number;     // currentValueEur − state.costBasisEur (0 when closed)
  dividendsNetEur: number;      // same scoped set used for XIRR
  totalReturnEur: number;       // realized + unrealized + dividends
  totalReturnPct: number | null; // totalReturnEur / investedEur; null when investedEur === 0
  isClosed: boolean;            // quantity === 0 with a non-empty ledger
}

/**
 * Ledger-based total return for one asset, including closed positions and partial sells, with BOTH
 * sides of the ratio in EUR. Replaces the static price-vs-PMC `totalReturnAssets` figure (which
 * excludes sold positions and mixes native price with EUR dividends).
 */
export function computeAssetTotalReturn(
  state: LedgerPositionState,
  currentValueEur: number,
  dividendsNetEur: number,
): AssetTotalReturn {
  const unrealizedPnlEur = state.quantity > 0 ? currentValueEur - state.costBasisEur : 0;
  const totalReturnEur = state.realizedPnlEur + unrealizedPnlEur + dividendsNetEur;
  const totalReturnPct = state.investedEur === 0 ? null : totalReturnEur / state.investedEur;
  const isClosed = state.quantity === 0 && (state.investedEur > 0 || state.divestedEur > 0);

  return {
    investedEur: state.investedEur,
    realizedPnlEur: state.realizedPnlEur,
    unrealizedPnlEur,
    dividendsNetEur,
    totalReturnEur,
    totalReturnPct,
    isClosed,
  };
}

// ---------------------------------------------------------------------------
// Invested capital (Rendimenti)
// ---------------------------------------------------------------------------

/**
 * Net capital invested through the ledger within [start, end] (INCLUSIVE), across all assets.
 *
 *   investedEur = Σ buy  (quantity·priceEur + fees)   with start <= date <= end
 *   divestedEur = Σ sell (quantity·priceEur − fees)
 *   netInvestedEur = investedEur − divestedEur
 *
 * Baselines COUNT as buys: for a window starting before migration day, the baseline correctly
 * represents "capital in play". Adjustments never move money and are ignored.
 */
export function computeInvestedCapital(
  transactions: AssetTransaction[],
  start: Date,
  end: Date,
): { investedEur: number; divestedEur: number; netInvestedEur: number } {
  const startMs = start.getTime();
  const endMs = end.getTime();
  let investedEur = 0;
  let divestedEur = 0;

  for (const t of transactions) {
    const ms = t.date.getTime();
    if (ms < startMs || ms > endMs) continue;
    if (t.type === 'buy') {
      investedEur += t.quantity * t.priceEur + (t.fees ?? 0);
    } else if (t.type === 'sell') {
      divestedEur += t.quantity * t.priceEur - (t.fees ?? 0);
    }
    // adjustment → ignored (no money movement)
  }

  return { investedEur, divestedEur, netInvestedEur: investedEur - divestedEur };
}
