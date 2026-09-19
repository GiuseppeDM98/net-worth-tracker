/**
 * Storico's growth drivers: a period's net-worth change split into what the user SAVED, what the
 * MARKET did, the TAX withheld on the period's sales, the mortgage principal repaid, the pension
 * contributions, and what none of them explains:
 *
 *   netWorthGrowth = netSavings + market − taxes + debtRepaid + pensionContributions + other
 *
 * Why not the old «market = growth − savings»: that residual charged the market with every euro
 * the cashflow does not record. On the real account (settembre 2026) it read −557 € in a month the
 * portfolio gained ~1.800 €: the broker withheld ~4.089 € of capital-gains tax on a VWCE sale
 * (regime amministrato: no cashflow row), and the month's savings counted 1.297 € of instalments
 * still in calendar after the snapshot. So:
 *
 *   - `netSavings` counts only the rows ALREADY happened (Italian calendar day ≤ `today`): the
 *     snapshot that closes a running month is a photo of today, and the savings stand on the same
 *     day (`isItalyDayAfter`, the Tracciamento rule);
 *   - `market` is MEASURED instrument by instrument whenever both snapshots carry `byAsset`: the
 *     held quantity's price move (`attributeSelectedChange`), the ledger's trades from trade price
 *     to the snapshot (`tradeAwarePriceEffect`, shared with the Panoramica), a pension fund's value
 *     change net of the contributions paid in (from `startMonth` on — before it the fund's growth
 *     is not attributable and stays in `other`), real estate GROSS of debt (quantity × price, so a
 *     mortgage instalment never reads as the house appreciating);
 *   - `taxes` is the ESTIMATE on the period's sales from the ledger (`summarizePeriodSales`:
 *     realized gain × the instrument's `taxRate`), a magnitude ≥ 0; an unknown rate counts 0 and
 *     the tax stays inside whichever figure absorbs the rest;
 *   - `debtRepaid` is the fall of the debt on real estate between the two snapshots (gross − net
 *     value, both from `byAsset`): the cashflow books the whole instalment as spending, but its
 *     principal stays in the net worth. Its own item, so `netSavings` stays equal to the Cashflow
 *     page's net (owner's decision, 2026-09-19); negative when the typed debt went UP;
 *   - `pensionContributions` is what Previdenza records as paid into the funds in the window
 *     (TFR, employer, voluntary: none of them is a cashflow row, the salary is booked net), by the
 *     month the fund's VALUE moved (`valueEffectMonth`), from `startMonth` on like the fund's
 *     market. Real money, recorded — so it has its own name instead of swelling `other` in the
 *     month the statement lands (owner, 2026-09-19);
 *   - `other` is the remainder: a fund's growth before `startMonth` (not attributable),
 *     quantities the ledger does not explain (an adjustment), cash balances typed by hand on a
 *     different day than the rows (a credit card is debited the month AFTER its rows, so `other`
 *     swings and gives it back), the gap between the estimated and the withheld tax.
 *
 * A pair of snapshots WITHOUT `byAsset` on both sides cannot be measured: its market falls back to
 * the residual net of the tax and of the recorded pension contributions (`growth − savings + taxes −
 * pensionContributions`), its `debtRepaid` and `other` are 0 — the old reading, minus what is
 * named. `isMarketMeasured` says which of the two a figure is.
 *
 * SDK-free and deterministic: `today` is a parameter.
 */

import { fromZonedTime } from 'date-fns-tz';
import type { Asset, MonthlySnapshot } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import type { AssetTransaction } from '@/types/assetTransactions';
import type { PensionContribution } from '@/types/pension';
import { getItalyDateIso, getItalyMonth, getItalyYear, ITALY_TIMEZONE } from '@/lib/utils/dateHelpers';
import { attributeSelectedChange } from '@/lib/utils/snapshotAssetBreakdown';
import { pensionPaidInBetween, tradeAwarePriceEffect, type PositionValue } from '@/lib/utils/marketEffect';
import { summarizePeriodSales } from '@/lib/utils/periodSales';

export interface GrowthDrivers {
  netWorthGrowth: number;
  /** Income + spending (negative) of the cashflow rows already happened, transfers excluded. */
  netSavings: number;
  market: number;
  /** Estimated tax on the period's sales, as a magnitude (≥ 0). */
  taxes: number;
  /** Principal repaid on real-estate debt (gross − net value fell); 0 where not measurable. */
  debtRepaid: number;
  /** Paid into the pension funds in the window, as recorded in Previdenza (not in the cashflow). */
  pensionContributions: number;
  /** netWorthGrowth − netSavings − market + taxes − debtRepaid − pensionContributions. */
  other: number;
  /** True when every pair of snapshots in the period was measured instrument by instrument. */
  isMarketMeasured: boolean;
}

export interface GrowthDriverContext {
  expenses: Expense[];
  transactions: AssetTransaction[];
  /** Today's assets: they say which ids are real estate or pension funds, and carry `taxRate`. */
  assets: Asset[];
  pension: { contributions: PensionContribution[]; startMonth: string | null };
  /** Rows dated after this Italian calendar day are in calendar, not savings. */
  today: Date;
}

export interface MonthlyGrowthDrivers extends GrowthDrivers {
  year: number;
  month: number;
}

export interface YearlyGrowthDrivers extends GrowthDrivers {
  year: string;
  /** Growth over the baseline's value, in percent; `null` without a positive baseline. */
  growthPct: number | null;
  /** The snapshot the year is measured FROM (the previous year's last snapshot, or the year's first). */
  baseline: { year: number; month: number };
  /** The last snapshot of the year — where the window closes. */
  latest: { year: number; month: number };
}

type SnapshotRow = MonthlySnapshot['byAsset'][number];

const monthIndexOf = (year: number, month: number) => year * 12 + (month - 1);
const monthKeyOfIndex = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

/** The first and last instant of an inclusive range of month indexes, in Italian time. */
function italyRangeOf(fromIndex: number, toIndex: number): { start: Date; end: Date } {
  const endNext = toIndex + 1;
  return {
    start: fromZonedTime(`${monthKeyOfIndex(fromIndex)}-01T00:00:00.000`, ITALY_TIMEZONE),
    end: new Date(fromZonedTime(`${monthKeyOfIndex(endNext)}-01T00:00:00.000`, ITALY_TIMEZONE).getTime() - 1),
  };
}

const held = (row: SnapshotRow | undefined): PositionValue | undefined => (row && row.quantity > 0 ? row : undefined);

/**
 * Measures pairs of snapshots over one context. The expenses and the trades are indexed ONCE by
 * Italian month, so a page measuring every month of the history does not rescan them per pair.
 */
export function createGrowthDriverMeter(context: GrowthDriverContext) {
  const todayIso = getItalyDateIso(context.today);
  const savingsByMonth = new Map<number, { total: number; hasRows: boolean }>();
  for (const expense of context.expenses) {
    // Transfers are net-zero; a row after today is in calendar, not yet saved or spent.
    if (expense.type === 'transfer' || getItalyDateIso(expense.date) > todayIso) continue;
    const index = monthIndexOf(getItalyYear(expense.date), getItalyMonth(expense.date));
    const entry = savingsByMonth.get(index) ?? { total: 0, hasRows: false };
    // Income is stored positive, every other type negative.
    entry.total += expense.amount;
    entry.hasRows = true;
    savingsByMonth.set(index, entry);
  }

  const tradesByMonth = new Map<number, AssetTransaction[]>();
  for (const trade of context.transactions) {
    const index = monthIndexOf(getItalyYear(trade.date), getItalyMonth(trade.date));
    const list = tradesByMonth.get(index) ?? [];
    list.push(trade);
    tradesByMonth.set(index, list);
  }

  const realEstateIds = new Set(context.assets.filter((a) => a.type === 'realestate').map((a) => a.id));
  const pensionFundIds = new Set(context.assets.filter((a) => a.type === 'pensionFund').map((a) => a.id));
  // A property is measured GROSS of its debt: the snapshot's `price` is the property value.
  const grossRows = (rows: SnapshotRow[]) => rows.map((row) => (realEstateIds.has(row.assetId) ? { ...row, totalValue: row.quantity * row.price } : row));

  /** Whether any cashflow row already happened in the month range (the Driver skips a year without). */
  function hasCashflowBetween(fromIndex: number, toIndex: number): boolean {
    for (let index = fromIndex; index <= toIndex; index++) if (savingsByMonth.get(index)?.hasRows) return true;
    return false;
  }

  /** Σ over real estate of the debt at `previous` minus the debt at `current` (debt = gross − net). */
  function debtRepaidBetween(previous: MonthlySnapshot, current: MonthlySnapshot): number {
    const debtOf = (rows: SnapshotRow[]) => new Map(rows.filter((row) => realEstateIds.has(row.assetId)).map((row) => [row.assetId, row.quantity * row.price - row.totalValue]));
    const before = debtOf(previous.byAsset);
    const after = debtOf(current.byAsset);
    let repaid = 0;
    // A property present on one side only was bought or sold: its debt moved with it, not repaid.
    for (const [assetId, debt] of before) if (after.has(assetId)) repaid += debt - after.get(assetId)!;
    return repaid;
  }

  function measuredMarket(previous: MonthlySnapshot, current: MonthlySnapshot, trades: AssetTransaction[]): number {
    const previousRows = grossRows(previous.byAsset);
    const currentRows = grossRows(current.byAsset);
    const previousById = new Map(previousRows.map((row) => [row.assetId, row]));
    const currentById = new Map(currentRows.map((row) => [row.assetId, row]));
    const tradesByAsset = new Map<string, AssetTransaction[]>();
    for (const trade of trades) tradesByAsset.set(trade.assetId, [...(tradesByAsset.get(trade.assetId) ?? []), trade]);

    const previousKey = monthKeyOfIndex(monthIndexOf(previous.year, previous.month));
    const currentKey = monthKeyOfIndex(monthIndexOf(current.year, current.month));
    const { startMonth, contributions } = context.pension;
    const pensionTrackable = startMonth !== null && startMonth <= previousKey;

    let market = 0;
    for (const assetId of new Set([...previousById.keys(), ...currentById.keys()])) {
      const before = held(previousById.get(assetId));
      const after = held(currentById.get(assetId));
      if (pensionFundIds.has(assetId)) {
        // Before the contributions are complete the fund's growth is not attributable: `other`.
        if (pensionTrackable && before && after) {
          market += after.totalValue - before.totalValue - pensionPaidInBetween(contributions, assetId, previousKey, currentKey);
        }
        continue;
      }
      const assetTrades = realEstateIds.has(assetId) ? undefined : tradesByAsset.get(assetId);
      const fromLedger = assetTrades ? tradeAwarePriceEffect(before, after, assetTrades) : null;
      market += fromLedger ?? attributeSelectedChange(previousRows, currentRows, new Set([assetId])).priceEffect;
    }
    return market;
  }

  /** The drivers between two snapshots, over the months after `previous` through `current`. */
  function measure(previous: MonthlySnapshot, current: MonthlySnapshot): GrowthDrivers {
    const fromIndex = monthIndexOf(previous.year, previous.month) + 1;
    const toIndex = monthIndexOf(current.year, current.month);
    let netSavings = 0;
    const trades: AssetTransaction[] = [];
    for (let index = fromIndex; index <= toIndex; index++) {
      netSavings += savingsByMonth.get(index)?.total ?? 0;
      trades.push(...(tradesByMonth.get(index) ?? []));
    }
    const sales = trades.some((t) => t.type === 'sell') ? summarizePeriodSales(context.assets, context.transactions, italyRangeOf(fromIndex, toIndex)) : null;
    const taxes = Math.max(sales?.estimatedTax ?? 0, 0);

    const netWorthGrowth = current.totalNetWorth - previous.totalNetWorth;
    const isMarketMeasured = (previous.byAsset?.length ?? 0) > 0 && (current.byAsset?.length ?? 0) > 0;
    const previousKey = monthKeyOfIndex(fromIndex - 1);
    const currentKey = monthKeyOfIndex(toIndex);
    // Named only once the contributions are complete (the Panoramica's rule): before `startMonth`
    // the fund's growth is not attributable, and naming half of it would push the other half negative.
    const { startMonth } = context.pension;
    let pensionContributions = 0;
    if (startMonth !== null && startMonth <= previousKey) {
      for (const assetId of pensionFundIds) pensionContributions += pensionPaidInBetween(context.pension.contributions, assetId, previousKey, currentKey);
    }
    const market = isMarketMeasured ? measuredMarket(previous, current, trades) : netWorthGrowth - netSavings + taxes - pensionContributions;
    const debtRepaid = isMarketMeasured ? debtRepaidBetween(previous, current) : 0;
    const other = netWorthGrowth - netSavings - market + taxes - debtRepaid - pensionContributions;
    return { netWorthGrowth, netSavings, market, taxes, debtRepaid, pensionContributions, other, isMarketMeasured };
  }

  return { measure, hasCashflowBetween };
}

/** Σ of periods; measured only when every part was. */
export function sumGrowthDrivers(rows: GrowthDrivers[]): GrowthDrivers | null {
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => ({
    netWorthGrowth: sum.netWorthGrowth + row.netWorthGrowth,
    netSavings: sum.netSavings + row.netSavings,
    market: sum.market + row.market,
    taxes: sum.taxes + row.taxes,
    debtRepaid: sum.debtRepaid + row.debtRepaid,
    pensionContributions: sum.pensionContributions + row.pensionContributions,
    other: sum.other + row.other,
    isMarketMeasured: sum.isMarketMeasured && row.isMarketMeasured,
  }));
}

const sortSnapshots = (snapshots: MonthlySnapshot[]) => [...snapshots].sort((a, b) => monthIndexOf(a.year, a.month) - monthIndexOf(b.year, b.month));

/**
 * One row per snapshot whose previous CALENDAR month also has one — a gap is not a month.
 * Chronological.
 */
export function buildMonthlyGrowthDrivers(snapshots: MonthlySnapshot[], context: GrowthDriverContext): MonthlyGrowthDrivers[] {
  const meter = createGrowthDriverMeter(context);
  const ordered = sortSnapshots(snapshots);
  const rows: MonthlyGrowthDrivers[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (monthIndexOf(current.year, current.month) - monthIndexOf(previous.year, previous.month) !== 1) continue;
    rows.push({ year: current.year, month: current.month, ...meter.measure(previous, current) });
  }
  return rows;
}

/**
 * One row per year, chronological: from the baseline (the previous year's last snapshot, normally
 * December; the year's own first when there is none) to the year's last snapshot, summed over
 * every consecutive pair of snapshots in between — so a year and its months add up by
 * construction. A year with no cashflow row already happened in its window is skipped: without a
 * recorded savings figure the split would silently read «all market».
 */
export function buildYearlyGrowthDrivers(snapshots: MonthlySnapshot[], context: GrowthDriverContext): YearlyGrowthDrivers[] {
  const meter = createGrowthDriverMeter(context);
  const ordered = sortSnapshots(snapshots);
  const years = [...new Set(ordered.map((s) => s.year))];
  const rows: YearlyGrowthDrivers[] = [];

  for (const year of years) {
    const inYear = ordered.filter((s) => s.year === year);
    const latest = inYear[inYear.length - 1];
    const baseline = ordered.filter((s) => s.year === year - 1).at(-1) ?? inYear[0];
    const baselineIndex = monthIndexOf(baseline.year, baseline.month);
    const latestIndex = monthIndexOf(latest.year, latest.month);
    if (!meter.hasCashflowBetween(baselineIndex + 1, latestIndex)) continue;

    const chain = ordered.filter((s) => {
      const index = monthIndexOf(s.year, s.month);
      return index >= baselineIndex && index <= latestIndex;
    });
    const pairs: GrowthDrivers[] = [];
    for (let i = 1; i < chain.length; i++) pairs.push(meter.measure(chain[i - 1], chain[i]));
    const total = sumGrowthDrivers(pairs);
    if (!total) continue;

    rows.push({
      ...total,
      year: String(year),
      growthPct: baseline.totalNetWorth > 0 ? (total.netWorthGrowth / baseline.totalNetWorth) * 100 : null,
      baseline: { year: baseline.year, month: baseline.month },
      latest: { year: latest.year, month: latest.month },
    });
  }
  return rows;
}
