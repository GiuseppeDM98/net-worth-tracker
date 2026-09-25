/**
 * Tax on withdrawals — the ONE rule the FIRE engines share (2026-09-24).
 *
 * A euro of expenses in retirement is not a euro sold: selling an instrument realises its
 * capital gain, and the broker withholds the tax on that gain (26% on most instruments, 12,5%
 * on Italian government bonds — the rate each asset carries in the app). So to have `net` in
 * hand the plan must sell `gross = net / (1 − gainShare × rate)`, where `gainShare` is the share
 * of the portfolio's value that is unrealised gain — which grows as the portfolio compounds on a
 * cost basis that does not. Every FIRE number that ignored this understated what retirement
 * costs; PRODUCT.md's first principle is that a figure the product cannot stand behind is not
 * shown, so the gross-up is declared wherever it enters (the Base di calcolo, the Parametri).
 *
 * The basis moves with the sales: selling `gross` out of `capital` consumes `gross / capital` of
 * the basis (average-cost logic, the same the ledger's PMC follows), so the gain share of what
 * is left is unchanged by the sale and only the market moves it. Contributions add basis euro
 * for euro; a pension fund that merges into the portfolio counts as basis (its exit taxation is
 * another regime, `pensionDeduction.ts`, out of this model and said so).
 *
 * Pure and Firestore-free; the asset reader takes `valueOf` injected (AGENTS → Module Hygiene).
 */

import type { Asset } from '@/types/assets';
import { costBasisPerUnitEur } from '@/lib/utils/costBasisEur';

/** The capital-gains rate an instrument without one is assumed to carry (redditi diversi). */
export const DEFAULT_CAPITAL_GAINS_RATE = 26;

export interface WithdrawalTaxProfile {
  /** Today's cost basis of the portfolio the plan withdraws from, in euro. */
  basisToday: number;
  /** The value-weighted capital-gains rate over the unrealised gains, in percent. */
  rate: number;
  /** Share of today's value that is unrealised gain, 0..1. */
  gainShare: number;
  /** Value of the instruments whose basis is known (cash and pension funds count as basis). */
  coveredValue: number;
  /** Value of the instruments with no EUR cost basis: treated as basis, and declared. */
  uncoveredValue: number;
  uncoveredCount: number;
}

/**
 * The gain share of a capital against its basis: 0 when the basis covers the value (a loss, a
 * portfolio at cost) and never above 1.
 */
export function resolveGainShare(capital: number, basis: number): number {
  if (capital <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - basis / capital));
}

/** `1 / (1 − gainShare × rate)`: what a net euro costs in gross sales. 1 without gain or rate. */
export function resolveTaxMultiplier(gainShare: number, ratePct: number): number {
  const drag = Math.min(0.99, Math.max(0, gainShare) * Math.max(0, ratePct) / 100);
  return 1 / (1 - drag);
}

export interface GrossWithdrawal {
  gross: number;
  tax: number;
  /** The basis left after the sale, consumed in proportion to the value sold. */
  basisAfter: number;
}

/**
 * The gross sale that leaves `net` in hand, and the basis that survives it. Selling more than
 * the capital holds is the caller's ruin to record: `gross` is not capped here.
 */
export function withdrawGross(capital: number, basis: number, net: number, ratePct: number): GrossWithdrawal {
  if (net <= 0) return { gross: 0, tax: 0, basisAfter: basis };
  const gross = net * resolveTaxMultiplier(resolveGainShare(capital, basis), ratePct);
  const soldShare = capital > 0 ? Math.min(1, gross / capital) : 1;
  return { gross, tax: gross - net, basisAfter: Math.max(0, basis * (1 - soldShare)) };
}

/** Cash accounts and pension funds have no capital gain to tax here: their value IS basis. */
function isValueItsOwnBasis(asset: Asset): boolean {
  return (asset.type === 'cash' && asset.assetClass === 'cash') || asset.type === 'pensionFund';
}

/**
 * The portfolio's tax profile today over the assets given (the caller passes the FIRE-eligible
 * ones, so the filter is not restated here). Null when no instrument has a cost basis at all:
 * a gain share of 0 there would read «no tax» about a portfolio nobody measured.
 */
export function resolvePortfolioTaxProfile(assets: Asset[], valueOf: (asset: Asset) => number): WithdrawalTaxProfile | null {
  let basisToday = 0;
  let coveredValue = 0;
  let uncoveredValue = 0;
  let uncoveredCount = 0;
  let weightedRate = 0;
  let positiveGains = 0;
  let sawBasis = false;

  for (const asset of assets) {
    if (asset.quantity <= 0) continue;
    const value = valueOf(asset);
    if (value <= 0) continue;
    if (isValueItsOwnBasis(asset)) {
      basisToday += value;
      coveredValue += value;
      continue;
    }
    const basisPerUnit = costBasisPerUnitEur(asset);
    if (basisPerUnit === undefined) {
      basisToday += value;
      uncoveredValue += value;
      uncoveredCount += 1;
      continue;
    }
    sawBasis = true;
    const basis = asset.quantity * basisPerUnit;
    basisToday += basis;
    coveredValue += value;
    const gain = value - basis;
    if (gain > 0) {
      positiveGains += gain;
      weightedRate += gain * (asset.taxRate && asset.taxRate > 0 ? asset.taxRate : DEFAULT_CAPITAL_GAINS_RATE);
    }
  }

  if (!sawBasis) return null;
  const totalValue = coveredValue + uncoveredValue;
  return {
    basisToday,
    rate: positiveGains > 0 ? weightedRate / positiveGains : DEFAULT_CAPITAL_GAINS_RATE,
    gainShare: resolveGainShare(totalValue, basisToday),
    coveredValue,
    uncoveredValue,
    uncoveredCount,
  };
}
