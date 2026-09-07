/**
 * portfolioFlows — the capital that crosses the boundary of the Rendimenti base, MEASURED.
 *
 * THE DEFECT THIS MODULE CLOSES (issue/PR #319, reimplemented on 2026-09-07)
 * `getCashFlowsFromExpenses` answers «how much money entered the NET WORTH from outside»: income
 * minus spending, transfers skipped by construction (they are net-zero on the whole). That is the
 * right answer while the base IS the whole net worth. It is the wrong one as soon as the base is a
 * subset: with the cash accounts out of it («Liquidità fuori dalla base»), buying an ETF with the
 * money of an account is capital ENTERING the base — a transfer, precisely what that function
 * cannot see — and every purchase reads as return (35.208 € of buys against 659 € of neutralised
 * flows on one real account, February → August 2026: the page doubled the return).
 *
 * THE RULE: THE FLOWS FOLLOW THE BASE
 * Base = the whole net worth → the flows stay the cashflow's: only outside money moves the capital.
 * Base = a subset → for every month whose two snapshots both carry `byAsset`, the flow is measured
 * on the instruments INSIDE the base, one instrument at a time, from the best source available:
 *   - the trade ledger, from the month of the instrument's first recorded trade on: dated to the
 *     OPERATION (a snapshot is dated to the observation — 722 units bought on the 20th sit in the
 *     ledger this month and in the snapshot the next), buys plus fees in, sells minus fees out. A
 *     covered instrument with no trade in a month contributes 0: no trade = no flow, an
 *     information, not a gap to fill from the quantities;
 *   - the quantity change of the `byAsset` breakdown otherwise, `(q₁ − q₀) × p₁`: a quantity that
 *     grew is capital that came in, one that shrank is capital that left, and the price plays no
 *     part — which is exactly the flow a TWR wants at its numerator. A cash account is an
 *     instrument like any other here: its quantity IS its balance, and a balance change is money
 *     that moved (a deposit in, an expense out). A purchase paid from an account inside the base
 *     therefore nets to zero (−balance, +units) by construction.
 * Neither source alone holds up: a ledger knows only what was recorded (it once held the purchase
 * of a new portfolio without the sale of the old one at another broker: −100% that month), and the
 * quantities get the boundary month wrong. Per instrument, they cover each other's blind spot.
 *
 * WHAT THE LEDGER MUST NOT COUNT AS MONEY
 * A migration baseline (`isBaseline`) is an OPENING POSITION dated to the migration day, not a
 * purchase: counted as one it would put the whole portfolio's cost into that month's flow and
 * collapse its return to about −100% on every account migrated from the UI (the blocking defect of
 * the original PR). An `adjustment` is a quantity reset with no cash. Both mark the instrument as
 * COVERED from their month (the ledger is its source from then on) and move no money.
 *
 * WHEN THE FLOW IS NOT MEASURABLE
 * Both snapshots of a pair must carry `byAsset`; without it there is no way to tell a purchase
 * from the market. That month produces no entry — an absence, not a zero — and `externalFlowOf`
 * falls back to the cashflow's savings for it. A measured month in which nothing moved is `0`, an
 * entry like any other: the two must never be confused, or a history of hand-typed snapshots
 * (no breakdown) would end up with zero flows and every contribution read as return.
 *
 * THE FLOW-OPAQUE INSTRUMENTS
 * For some assets the quantity does not count units but VALUE, and grows with the market as much
 * as with the money paid in: a pension fund keeps its value in `quantity` at price 1
 * (`assertFundValueLivesInQuantity`), a property or a hand-valued fund likewise. On them a
 * quantity change cannot tell a contribution from a return, so they contribute 0 to the quantity
 * branch; the pension funds' money travels on its own channel (`PensionBoundaryFlow`), the others'
 * revaluations stay return, as they always did. A cash account is NOT opaque.
 *
 * DECLARED LIMITS
 *  - quantities are valued at the month's END price, not the trade's: right in units, approximate
 *    in euro (the «end-of-period flow» convention the whole pipeline already assumes);
 *  - a quantity change is not always a trade: a split, a merger, an in-kind transfer or a
 *    reinvested dividend moves units without money and reads as a flow;
 *  - a trade left out of the ledger vanishes for a covered instrument (the ledger is trusted);
 *  - interest credited on a cash account inside the base reads as a deposit, not a return.
 */

import type { MonthlySnapshot } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';
import type { PortfolioBoundaryFlow, PortfolioFlowSource } from '@/types/performance';
import { hasAssetBreakdown } from '@/lib/utils/snapshotAssetBreakdown';
import { monthKey } from '@/lib/utils/cashFlowMap';

/** The ledger indexed for the flow: euro moved per instrument and month, and each instrument's first covered month. */
export interface LedgerIndex {
  /** `assetId|YYYY-MM` → net euro (buys and their fees positive, sells net of fees negative). */
  flows: Map<string, number>;
  /** `assetId` → the month of its first trade (baseline and adjustments included): the ledger is its source from there on. */
  coveredFrom: Map<string, string>;
}

/** The positions of one month inside the base, by `assetId`; a duplicate id is summed, never silently overwritten. */
function positionsInBase(snapshot: MonthlySnapshot, excludedIds: Set<string>): Map<string, { quantity: number; price: number }> {
  const out = new Map<string, { quantity: number; price: number }>();
  for (const entry of snapshot.byAsset) {
    if (excludedIds.has(entry.assetId)) continue;
    const previous = out.get(entry.assetId);
    out.set(entry.assetId, { quantity: (previous?.quantity ?? 0) + entry.quantity, price: entry.price });
  }
  return out;
}

/**
 * Index the ledger for the flow. A baseline and an adjustment cover the instrument from their
 * month but move no money (see the header); a buy adds its fees, a sell subtracts them — the same
 * convention as `computeInvestedCapital`.
 *
 * @param trades - The account's trades, any order
 */
export function indexLedger(trades: AssetTransaction[]): LedgerIndex {
  const flows = new Map<string, number>();
  const coveredFrom = new Map<string, string>();

  for (const trade of trades) {
    const month = monthKey(trade.date.getFullYear(), trade.date.getMonth() + 1);
    const since = coveredFrom.get(trade.assetId);
    if (since === undefined || month < since) coveredFrom.set(trade.assetId, month);
    if (trade.type === 'adjustment' || trade.isBaseline) continue;
    const fees = trade.fees ?? 0;
    const amount = trade.type === 'buy' ? trade.quantity * trade.priceEur + fees : -(trade.quantity * trade.priceEur - fees);
    const key = `${trade.assetId}|${month}`;
    flows.set(key, (flows.get(key) ?? 0) + amount);
  }

  return { flows, coveredFrom };
}

export interface MonthlyPortfolioFlow {
  amount: number;
  source: PortfolioFlowSource;
}

/**
 * The net flow of one month: the capital that entered (+) or left (−) the base between two
 * consecutive snapshots, instrument by instrument, from the ledger where the instrument is covered
 * in that month and from the quantities otherwise (the header's rule).
 *
 * @param previous - The previous month's snapshot (its `byAsset` is required)
 * @param current - The measured month's snapshot (its `byAsset` is required)
 * @param excludedIds - The `assetId`s outside the base
 * @param ledger - From `indexLedger`; absent = quantities only
 * @param opaqueIds - Instruments whose quantity is a value (pension funds, properties): no quantity branch on them
 */
export function computeMonthlyPortfolioFlow(
  previous: MonthlySnapshot,
  current: MonthlySnapshot,
  excludedIds: Set<string>,
  ledger?: LedgerIndex,
  opaqueIds: Set<string> = new Set()
): MonthlyPortfolioFlow {
  const before = positionsInBase(previous, excludedIds);
  const after = positionsInBase(current, excludedIds);
  const month = monthKey(current.year, current.month);

  let amount = 0;
  let fromLedger = false;
  let fromQuantities = false;
  for (const assetId of new Set([...before.keys(), ...after.keys()])) {
    const coveredFrom = ledger?.coveredFrom.get(assetId);
    if (coveredFrom !== undefined && month >= coveredFrom) {
      fromLedger = true;
      amount += ledger!.flows.get(`${assetId}|${month}`) ?? 0;
      continue;
    }
    if (opaqueIds.has(assetId)) continue;
    const from = before.get(assetId);
    const to = after.get(assetId);
    const deltaQuantity = (to?.quantity ?? 0) - (from?.quantity ?? 0);
    if (deltaQuantity === 0) continue;
    fromQuantities = true;
    // A position closed in the month has no price this month: value it at the last known one.
    amount += deltaQuantity * (to?.price ?? from?.price ?? 0);
  }
  const source: PortfolioFlowSource = fromLedger && fromQuantities ? 'mixed' : fromLedger ? 'ledger' : 'quantities';
  return { amount, source };
}

/**
 * The measured boundary flows of an account: one entry per MEASURABLE month (both snapshots with a
 * breakdown), zeros included, dated to the month's key; a month with no entry is not measurable.
 *
 * @param snapshots - The account's snapshots, any order (never mutated)
 * @param excludedAssetIds - The `assetId`s outside the base
 * @param trades - The trade ledger; absent or empty = quantities only
 * @param opaqueAssetIds - Instruments whose quantity is a value (see the header)
 */
export function buildPortfolioBoundaryFlows(
  snapshots: MonthlySnapshot[],
  excludedAssetIds: string[],
  trades: AssetTransaction[] = [],
  opaqueAssetIds: string[] = []
): PortfolioBoundaryFlow[] {
  const excludedIds = new Set(excludedAssetIds);
  const opaqueIds = new Set(opaqueAssetIds);
  const ledger = trades.length > 0 ? indexLedger(trades) : undefined;
  const ordered = [...snapshots].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

  const flows: PortfolioBoundaryFlow[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (!hasAssetBreakdown(previous) || !hasAssetBreakdown(current)) continue;
    const { amount, source } = computeMonthlyPortfolioFlow(previous, current, excludedIds, ledger, opaqueIds);
    flows.push({ month: monthKey(current.year, current.month), amount, source });
  }
  return flows;
}
