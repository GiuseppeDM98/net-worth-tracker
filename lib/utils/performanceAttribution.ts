/**
 * performanceAttribution — «da dove viene il rendimento?»: the period's market gain, instrument
 * by instrument, reconciled to the figure the page already prints.
 *
 * WHAT IS ATTRIBUTED
 * The same price/quantity split Storico and the Panoramica's market digest use
 * (`attributeSelectedChange`: priceEffect = q_prev × (u_curr − u_prev), u = totalValue / quantity in
 * EUR), applied one instrument at a time to every pair of consecutive snapshots of the period that
 * BOTH carry a `byAsset` breakdown, and summed over the months. Euro, not percent, on purpose: the
 * euro effects are exact and additive (Σ instruments = Σ months = the market effect), while a
 * per-instrument percentage of a geometrically chained TWR is not — the arithmetic sum of monthly
 * contributions differs from the TWR, and a share of a gain that is small or negative explodes.
 *
 * THE RECONCILIATION, AND WHY THE RESIDUAL IS A ROW
 * For every attributed month the page's own gain is `ΔbaseNetWorth − externalFlow` (the TWR
 * numerator, with the pension channel — `externalFlowOf`). Σ price effects never equals it: cash
 * interest, a balance corrected by hand, an expense paid from an untracked account, a dividend
 * that landed in cash — all of them move the total without moving any instrument's unit value.
 * That difference is not hidden and not spread over the rows: it is `unattributed`, printed as
 * the closing row of the list, so the rows visibly add up to the gain (The Narrative Honesty Rule).
 *
 * THE THREE SPECIAL CASES, THE SAME RULES AS THE OVERVIEW DIGEST
 *  - a pension fund lives at price 1, so its price effect is 0 by construction: its market effect
 *    is `Δvalue − the contributions that moved its value that month` (`valueEffectMonth`), and only
 *    for the months AFTER it entered the base (`pensionEntryMonth`): the entry month is a flow, the
 *    months before it are not measured;
 *  - real estate is measured GROSS of debt (`quantity × price`), because `totalValue` nets the
 *    mortgage out and an instalment would read as the property appreciating;
 *  - an instrument out of the base (`excludedAssetIds`) is skipped entirely, and a row at
 *    quantity 0 is a closed position (handled inside `attributeSelectedChange`).
 *
 * COVERAGE IS SAID, NEVER ASSUMED
 * Snapshots before `byAsset` existed (2025-11 on the real account) cannot be attributed. The
 * result carries how many of the period's months were, and the reading names the window it
 * covers («sui 10 mesi con il dettaglio per strumento») instead of pretending the sum is the
 * whole period's.
 *
 * Zero Firebase imports: a pure function of its inputs, like every `*Summary` module.
 */

import type { Asset, MonthlySnapshot } from '@/types/assets';
import type { CashFlowData, PeriodMonth } from '@/types/performance';
import type { PensionContribution } from '@/types/pension';
import { attributeSelectedChange, hasAssetBreakdown, type SnapshotAsset } from '@/lib/utils/snapshotAssetBreakdown';
import { buildCashFlowMap, monthKey } from '@/lib/utils/cashFlowMap';
import { valueEffectMonth } from '@/lib/utils/pensionReturn';

/** One instrument's contribution to the period's gain, in euro. */
export interface InstrumentContribution {
  assetId: string;
  name: string;
  ticker: string;
  /** Σ of the monthly price effects; for a pension fund, Δvalue − contributions after its entry. */
  marketEffect: number;
  /** Net dividends and coupons received in the period, when the caller provides them. */
  dividends: number;
  /** `marketEffect + dividends` — the row's figure. */
  total: number;
  isPensionFund: boolean;
  /** Months in which the instrument was held at the start and could be attributed. */
  monthsAttributed: number;
}

export interface AttributionCoverage {
  /** Monthly returns the period measures (snapshot pairs). */
  measuredMonths: number;
  /** Pairs whose two snapshots both carry a breakdown. */
  attributedMonths: number;
  /** The first and last attributed months, null when nothing could be attributed. */
  firstAttributed: PeriodMonth | null;
  lastAttributed: PeriodMonth | null;
}

export interface ReturnAttribution {
  /** Every instrument with a non-zero figure, largest |total| first. */
  rows: InstrumentContribution[];
  /** Σ rows.total */
  attributed: number;
  /** The page's own market gain over the ATTRIBUTED months: Σ (ΔbaseNetWorth − externalFlow). */
  gain: number;
  /** `gain − attributed`: what moved the total without moving any instrument's unit value. */
  unattributed: number;
  coverage: AttributionCoverage;
}

export interface AttributionInput {
  /** The period's snapshots (baseline + measured months), base-projected, any order. */
  snapshots: MonthlySnapshot[];
  /** The period's cash flows as the metrics payload carries them (pension channel included). */
  cashFlows: CashFlowData[];
  /** Out of the base in every month, from `resolvePerformanceBase`. */
  excludedAssetIds: string[];
  pension: {
    fundIds: string[];
    /** 'YYYY-MM' from which the funds are in the base; null = never. */
    entryMonth: string | null;
    contributions: PensionContribution[];
  };
  /** The account's assets, for the type (real estate, pension fund) and the current name. */
  assets: ReadonlyArray<Pick<Asset, 'id' | 'name' | 'type'>>;
  /** Net dividends received in the period, per assetId (see `sumDividendsByAsset`). */
  dividendsByAsset?: Map<string, number>;
}

/** Below a cent an effect is floating-point residue, not a contribution. */
const EFFECT_EPSILON_EUR = 0.005;

/**
 * Sum an instrument's contributions that moved its value in one month.
 */
function contributionsMovedIn(contributions: PensionContribution[], assetId: string, month: string): number {
  return contributions
    .filter((c) => c.assetId === assetId && valueEffectMonth(c) === month)
    .reduce((sum, c) => sum + c.amount, 0);
}

/**
 * Attribute the period's market gain to its instruments.
 *
 * @returns The ranked rows, the reconciliation against the page's gain, and the coverage. Rows
 *   are empty (and everything 0) when no pair of snapshots carries a breakdown.
 */
export function attributePeriodReturn(input: AttributionInput): ReturnAttribution {
  const { cashFlows, excludedAssetIds, pension, assets, dividendsByAsset } = input;
  const ordered = [...input.snapshots].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
  const flowByMonth = buildCashFlowMap(cashFlows);
  const excluded = new Set(excludedAssetIds);
  const fundIds = new Set(pension.fundIds);
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const realEstateIds = new Set(assets.filter((asset) => asset.type === 'realestate').map((asset) => asset.id));

  // Real estate gross of debt, like the overview digest: the raw `price` is the property's value.
  const grossRows = (rows: SnapshotAsset[]): SnapshotAsset[] =>
    rows.map((row) => (realEstateIds.has(row.assetId) ? { ...row, totalValue: row.quantity * row.price } : row));

  const effects = new Map<string, { marketEffect: number; months: number; name: string; ticker: string }>();
  const record = (row: SnapshotAsset, effect: number) => {
    const current = effects.get(row.assetId) ?? { marketEffect: 0, months: 0, name: row.name, ticker: row.ticker };
    current.marketEffect += effect;
    current.months += 1;
    // The latest snapshot's name wins over an older one, the account's current name over both;
    // trimmed, because a name saved with a leading space would open the reading on two spaces.
    current.name = (assetById.get(row.assetId)?.name ?? row.name).trim();
    current.ticker = row.ticker;
    effects.set(row.assetId, current);
  };

  let gain = 0;
  let attributedMonths = 0;
  let firstAttributed: PeriodMonth | null = null;
  let lastAttributed: PeriodMonth | null = null;

  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    if (!hasAssetBreakdown(prev) || !hasAssetBreakdown(curr)) continue;

    const currKey = monthKey(curr.year, curr.month);
    gain += curr.totalNetWorth - prev.totalNetWorth - (flowByMonth.get(currKey) ?? 0);
    attributedMonths += 1;
    firstAttributed ??= { year: curr.year, month: curr.month };
    lastAttributed = { year: curr.year, month: curr.month };

    const prevRows = grossRows(prev.byAsset);
    const currRows = grossRows(curr.byAsset);
    const prevById = new Map(prevRows.map((row) => [row.assetId, row]));

    for (const row of currRows) {
      if (excluded.has(row.assetId) || !(row.quantity > 0)) continue;
      const before = prevById.get(row.assetId);
      if (!before || !(before.quantity > 0)) continue; // opened this month: a flow, no prior price

      if (fundIds.has(row.assetId)) {
        // In the base only after its entry month; the entry itself is a flow.
        if (pension.entryMonth === null || currKey <= pension.entryMonth) continue;
        record(row, row.totalValue - before.totalValue - contributionsMovedIn(pension.contributions, row.assetId, currKey));
        continue;
      }

      const { priceEffect } = attributeSelectedChange(prevRows, currRows, new Set([row.assetId]));
      record(row, priceEffect);
    }
  }

  const rows: InstrumentContribution[] = [...effects.entries()]
    .map(([assetId, effect]) => {
      const dividends = dividendsByAsset?.get(assetId) ?? 0;
      return {
        assetId,
        name: effect.name,
        ticker: effect.ticker,
        marketEffect: effect.marketEffect,
        dividends,
        total: effect.marketEffect + dividends,
        isPensionFund: fundIds.has(assetId),
        monthsAttributed: effect.months,
      };
    })
    .filter((row) => Math.abs(row.total) >= EFFECT_EPSILON_EUR)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const attributed = rows.reduce((sum, row) => sum + row.total, 0);

  return {
    rows,
    attributed,
    gain,
    unattributed: gain - attributed,
    coverage: { measuredMonths: Math.max(0, ordered.length - 1), attributedMonths, firstAttributed, lastAttributed },
  };
}

/** The fields of a dividend record the attribution reads. */
export type DividendReceipt = {
  assetId: string;
  paymentDate: Date;
  netAmount: number;
  /** Set when the record was converted; a EUR record has none. */
  netAmountEur?: number;
};

/**
 * Net dividends and coupons RECEIVED in a window, per instrument.
 *
 * Received = paid by `endDate`, which the caller caps at today (`metrics.dividendEndDate`): an
 * announced coupon is not return yet (doc/guide/cashflow-dividendi.md — received and announced
 * are never one figure). EUR when the record carries a conversion, the native figure otherwise.
 */
export function sumDividendsByAsset(dividends: DividendReceipt[], startDate: Date, endDate: Date): Map<string, number> {
  const byAsset = new Map<string, number>();
  for (const dividend of dividends) {
    if (dividend.paymentDate < startDate || dividend.paymentDate > endDate) continue;
    const amount = dividend.netAmountEur ?? dividend.netAmount;
    byAsset.set(dividend.assetId, (byAsset.get(dividend.assetId) ?? 0) + amount);
  }
  return byAsset;
}
