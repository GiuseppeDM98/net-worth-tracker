/**
 * The pure figures behind Patrimonio's tiles — cash accounts, the month's trades, the unrealized
 * gain over the cost basis, the ranking of instrument returns, the concentration of the largest
 * positions and the last price update. Every number the page shows that is not already in the
 * overview payload is born here, with a test, never inside a component.
 *
 * Deliberately imports nothing from Firebase: `calculateAssetValue` (assetService) is the only
 * service dependency, and it is the single definition of an asset's EUR value.
 */

import type { Asset } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';
import type { DashboardOverviewTopAsset } from '@/types/dashboardOverview';
import { calculateAssetValue } from '@/lib/services/assetService';
import { hasMarketPrice } from '@/lib/utils/assetPricing';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';

// ─── Cash accounts ────────────────────────────────────────────────────────────

/**
 * A cash ACCOUNT is `type === 'cash' && assetClass === 'cash'` — the cash-picker rule
 * (AGENTS.md → Asset Pricing, FX and Assets): a money-market ETF carries `assetClass: 'cash'`
 * but is an instrument, and belongs in the table.
 */
export function isCashAccount(asset: Pick<Asset, 'type' | 'assetClass'>): boolean {
  return asset.type === 'cash' && asset.assetClass === 'cash';
}

/**
 * A position still held. `quantity = 0` marks a sold asset (AGENTS.md → Asset Pricing): it stays
 * in the table with its «Azzerato» badge, but it is not something the user owns — every count,
 * share and sum on the page runs over held positions only.
 */
export function isHeld(asset: Pick<Asset, 'quantity'>): boolean {
  return asset.quantity > 0;
}

export interface CashAccountRow {
  id: string;
  name: string;
  /** EUR balance (a foreign-currency account through its converted price). */
  balance: number;
  /** Share of the cash held on accounts, 0-100. */
  shareOfCash: number;
}

export interface CashAccountsSummary {
  /** Largest balance first. */
  accounts: CashAccountRow[];
  total: number;
  /** Share of the gross portfolio total, 0-100; null without a total to measure against. */
  shareOfTotal: number | null;
  largest: CashAccountRow | null;
}

export function summarizeCashAccounts(cashAccounts: Asset[], totalValue: number): CashAccountsSummary {
  const valued = cashAccounts
    .map((asset) => ({ id: asset.id, name: asset.name, balance: calculateAssetValue(asset) }))
    .sort((a, b) => b.balance - a.balance);
  const total = valued.reduce((sum, row) => sum + row.balance, 0);
  const accounts = valued.map((row) => ({ ...row, shareOfCash: total > 0 ? (row.balance / total) * 100 : 0 }));
  return {
    accounts,
    total,
    shareOfTotal: totalValue > 0 ? (total / totalValue) * 100 : null,
    largest: accounts[0] ?? null,
  };
}

// ─── The month's trades ───────────────────────────────────────────────────────

export interface MonthTradeRow {
  id: string;
  assetId: string;
  date: Date;
  type: 'buy' | 'sell';
  /** Money that moved: buy = gross + fees, sell = gross − fees (the ledger engine's definition). */
  amountEur: number;
}

export interface MonthTradesSummary {
  bought: number;
  sold: number;
  /** bought − sold: what the month added to the invested capital. */
  net: number;
  count: number;
  /** Newest first. */
  rows: MonthTradeRow[];
}

/**
 * Buys and sells of one Italian calendar month. Migration baselines are opening positions, not
 * purchases, and an adjustment resets a quantity without moving money: both are skipped. The
 * EUR amount follows `computeInvestedCapital` in assetTransactionUtils — fees enter a buy and
 * leave a sell.
 */
export function summarizeMonthTrades(
  transactions: AssetTransaction[],
  period: { month: number; year: number },
): MonthTradesSummary {
  const rows: MonthTradeRow[] = [];
  for (const trade of transactions) {
    if (trade.isBaseline || trade.type === 'adjustment') continue;
    const { month, year } = getItalyMonthYear(trade.date);
    if (month !== period.month || year !== period.year) continue;
    const gross = trade.quantity * trade.priceEur;
    const fees = trade.fees ?? 0;
    rows.push({
      id: trade.id,
      assetId: trade.assetId,
      date: trade.date,
      type: trade.type,
      amountEur: trade.type === 'buy' ? gross + fees : gross - fees,
    });
  }
  rows.sort((a, b) => b.date.getTime() - a.date.getTime());
  const bought = rows.filter((r) => r.type === 'buy').reduce((sum, r) => sum + r.amountEur, 0);
  const sold = rows.filter((r) => r.type === 'sell').reduce((sum, r) => sum + r.amountEur, 0);
  return { bought, sold, net: bought - sold, count: rows.length, rows };
}

// ─── Unrealized gains ─────────────────────────────────────────────────────────

export interface UnrealizedGainsSummary {
  gainLoss: number;
  costBasis: number;
  /** gainLoss over costBasis, 0-100 scale; null when nothing has a cost basis. */
  gainPercent: number | null;
  /** Positions that entered the sum. */
  count: number;
}

/**
 * The EUR-denominated PMC to compare against `calculateAssetValue` (itself always EUR) — never
 * the native `averageCost`, which would mix a foreign-currency PMC with a EUR value. Falls back to
 * `averageCost` only for a EUR-native asset (the two are identical by construction there) or for an
 * asset that predates `averageCostEur` and has not had a ledger mutation since; a non-EUR asset
 * without `averageCostEur` yet has no comparable basis at all.
 */
export function costBasisPerUnitEur(asset: Asset): number | undefined {
  if (asset.averageCostEur !== undefined && asset.averageCostEur > 0) return asset.averageCostEur;
  if (asset.currency.toUpperCase() === 'EUR') return asset.averageCost;
  return undefined;
}

/**
 * Whether an asset's G/P against its PMC is meaningful. Cash accounts do not represent invested
 * capital (their cost basis would dilute the percentage without adding any gain), and a pension
 * fund's leftover `averageCost` from a type conversion is not a PMC — its exit taxation is a
 * different regime altogether.
 */
export function hasCostBasis(asset: Asset): boolean {
  if (isCashAccount(asset) || asset.type === 'pensionFund' || !isHeld(asset)) return false;
  const basis = costBasisPerUnitEur(asset);
  return basis !== undefined && basis > 0;
}

/**
 * One position's G/P against its PMC — the figure the table cell, the mobile row and the sort
 * share. Both sides of the subtraction are EUR (see `costBasisPerUnitEur`), so a foreign-currency
 * position is never measured against its own native-currency PMC. Null when `hasCostBasis` says
 * there is no PMC to measure against.
 */
export function computeUnrealizedGain(asset: Asset): { gainLoss: number; gainPercent: number } | null {
  if (!hasCostBasis(asset)) return null;
  const basis = asset.quantity * (costBasisPerUnitEur(asset) as number);
  const gainLoss = calculateAssetValue(asset) - basis;
  return { gainLoss, gainPercent: basis > 0 ? (gainLoss / basis) * 100 : 0 };
}

export function summarizeUnrealizedGains(assets: Asset[]): UnrealizedGainsSummary {
  let gainLoss = 0;
  let costBasis = 0;
  let count = 0;
  for (const asset of assets) {
    const gain = computeUnrealizedGain(asset);
    if (!gain) continue;
    gainLoss += gain.gainLoss;
    costBasis += asset.quantity * (costBasisPerUnitEur(asset) as number);
    count += 1;
  }
  return {
    gainLoss,
    costBasis,
    gainPercent: costBasis > 0 ? (gainLoss / costBasis) * 100 : null,
    count,
  };
}

// ─── Instrument returns ───────────────────────────────────────────────────────

export interface InstrumentReturnRanking {
  /** Highest `returnPercent` first, at most `bestCount`. */
  best: DashboardOverviewTopAsset[];
  /** The lowest `returnPercent`, when it is not already among the best. */
  worst: DashboardOverviewTopAsset | null;
  /** Positions with a measured return (a cost basis). */
  measuredCount: number;
  /** Instruments the ranking was drawn from — the largest positions, cash accounts excluded. */
  rankedFrom: number;
}

/**
 * The best few and the single worst position by return over PMC, from the overview's
 * `topAssets` (the largest positions, returns already computed server-side — never recomputed
 * here). Positions without a cost basis (`returnPercent === null`) are not ranked, nor are cash
 * accounts and pension funds: the payload computes a "return" on any `averageCost`, but a fund's
 * leftover PMC is not a PMC (same exclusion as `hasCostBasis`), and the tile's KPI must agree.
 */
export function rankInstrumentReturns(topAssets: DashboardOverviewTopAsset[], bestCount = 3): InstrumentReturnRanking {
  const instruments = topAssets.filter((asset) => !(asset.assetType === 'cash' && asset.assetClass === 'cash'));
  const measured = instruments
    .filter((asset): asset is DashboardOverviewTopAsset & { returnPercent: number } => asset.returnPercent !== null)
    .filter((asset) => asset.assetType !== 'pensionFund')
    .sort((a, b) => b.returnPercent - a.returnPercent);
  const best = measured.slice(0, bestCount);
  const last = measured[measured.length - 1];
  const worst = last && !best.includes(last) ? last : null;
  return { best, worst, measuredCount: measured.length, rankedFrom: instruments.length };
}

// ─── Concentration ────────────────────────────────────────────────────────────

/**
 * The share of the gross total held by the `count` largest positions — the concentration the
 * table does not state out loud. Null when the positions are not more than `count` (the
 * largest n would be the whole table) or there is no total.
 */
export function computeTopWeightShare(
  assets: Asset[],
  totalValue: number,
  count = 3,
): { count: number; percent: number } | null {
  const held = assets.filter(isHeld);
  if (totalValue <= 0 || held.length <= count) return null;
  const top = held
    .map((asset) => calculateAssetValue(asset))
    .sort((a, b) => b - a)
    .slice(0, count)
    .reduce((sum, value) => sum + value, 0);
  return { count, percent: (top / totalValue) * 100 };
}

// ─── Last price update ────────────────────────────────────────────────────────

/**
 * The most recent quote among the market-priced assets. A hand-valued asset's
 * `lastPriceUpdate` is the user's last edit, not a quote, so it does not count — nor does an
 * asset whose automatic updates are switched off.
 */
export function resolveLastPriceUpdate(assets: Asset[]): Date | null {
  let latest: Date | null = null;
  for (const asset of assets) {
    if (!hasMarketPrice(asset.type, asset.subCategory) || asset.autoUpdatePrice === false) continue;
    if (!(asset.lastPriceUpdate instanceof Date)) continue;
    if (!latest || asset.lastPriceUpdate.getTime() > latest.getTime()) latest = asset.lastPriceUpdate;
  }
  return latest;
}
