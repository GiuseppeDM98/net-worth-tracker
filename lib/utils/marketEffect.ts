/**
 * The market effect of one instrument between two valuations — the ONE rule the Panoramica (the
 * live portfolio against the previous snapshot) and Storico's Driver (snapshot against snapshot)
 * share, so «mercato» means the same thing on both pages.
 *
 * SDK-free: both callers hand in plain `{ quantity, totalValue }` rows; nothing here reaches the
 * Firebase layer, so the module is readable by the server and by the tests without mocks.
 */

import type { AssetTransaction } from '@/types/assetTransactions';
import type { PensionContribution } from '@/types/pension';
import { valueEffectMonth } from '@/lib/utils/pensionReturn';

/** A position at one valuation: EUR value and the quantity it was held in. */
export interface PositionValue {
  quantity: number;
  totalValue: number;
}

/**
 * The market effect of an instrument traded between two valuations, from the ledger:
 *
 *   Δvalue − net money put in − quantity the ledger does not explain × today's unit value
 *
 * where «money put in» is Σ buys (quantity × priceEur + fees) − Σ sells (quantity × priceEur −
 * fees). For a held quote this is the old `q_prev × Δu`; for a bought one `q × (u_now − p) − fees`;
 * for a sold one `q × (p − u_prev) − fees`. A quantity change no BUY/SELL explains — a migration
 * baseline, an adjustment, a hand-edited quantity — moves no money the ledger knows, so it is
 * valued at the current unit price and kept OUT of the market (it lands in «altre variazioni»; Storico's Driver names it «Quantità fuori dal registro»).
 *
 * `trades` must already be scoped to the window between the two valuations. Returns null when the
 * instrument has no BUY/SELL in it (the caller keeps `q_prev × Δu`), and for a position closed
 * with an unexplained remainder (no price left to value it at).
 */
export function tradeAwarePriceEffect(
  previous: PositionValue | undefined,
  current: PositionValue | undefined,
  trades: AssetTransaction[]
): number | null {
  const moneyTrades = trades.filter((t) => (t.type === 'buy' && !t.isBaseline) || t.type === 'sell');
  if (moneyTrades.length === 0) return null;

  let moneyIn = 0;
  let tradedQuantity = 0;
  for (const trade of moneyTrades) {
    const fees = trade.fees ?? 0;
    if (trade.type === 'buy') {
      moneyIn += trade.quantity * trade.priceEur + fees;
      tradedQuantity += trade.quantity;
    } else {
      moneyIn -= trade.quantity * trade.priceEur - fees;
      tradedQuantity -= trade.quantity;
    }
  }

  const previousQuantity = previous?.quantity ?? 0;
  const currentQuantity = current?.quantity ?? 0;
  const unexplainedQuantity = currentQuantity - previousQuantity - tradedQuantity;
  const currentUnit = current && current.quantity > 0 ? current.totalValue / current.quantity : null;
  // Float noise from quantities like 0.1 + 0.2 is not a quantity the ledger failed to explain.
  const hasUnexplained = Math.abs(unexplainedQuantity) > 1e-9;
  if (hasUnexplained && currentUnit === null) return null;

  const valueChange = (current?.totalValue ?? 0) - (previous?.totalValue ?? 0);
  return valueChange - moneyIn - (hasUnexplained ? unexplainedQuantity * currentUnit! : 0);
}

/**
 * What was paid into one pension fund after the month `afterKey` ('YYYY-MM'), through
 * `throughKey` when given — attributed to the month its VALUE moved (`valueEffectMonth`, the rule
 * Previdenza's «Rendimento del fondo» uses). A fund's market effect is its value change minus this.
 */
export function pensionPaidInBetween(
  contributions: PensionContribution[],
  assetId: string,
  afterKey: string,
  throughKey?: string
): number {
  return contributions
    .filter((c) => {
      if (c.assetId !== assetId) return false;
      const key = valueEffectMonth(c);
      return key > afterKey && (throughKey === undefined || key <= throughKey);
    })
    .reduce((sum, c) => sum + c.amount, 0);
}

/**
 * What was paid into the pension funds after `afterKey`, through `throughKey` when given — the
 * «versati nel fondo pensione» of the Panoramica, Patrimonio and the email, and Storico's
 * «versamenti al fondo pensione». 0 before `startMonth` (`resolvePensionReturnStart`): the
 * contributions are complete only from there, and naming half of them would push the rest of
 * the fund's growth into a negative «altre variazioni» (in Storico's Driver, «Fondo pensione non tracciato»).
 */
export function pensionPaidInAcross(
  contributions: PensionContribution[],
  fundIds: Iterable<string>,
  startMonth: string | null,
  afterKey: string,
  throughKey?: string
): number {
  if (startMonth === null || startMonth > afterKey) return 0;
  let paidIn = 0;
  for (const assetId of fundIds) paidIn += pensionPaidInBetween(contributions, assetId, afterKey, throughKey);
  return paidIn;
}

/** A position as a snapshot's `byAsset` stores it (the live portfolio is mapped to the same shape). */
export interface DebtPositionRow {
  assetId: string;
  name?: string;
  quantity: number;
  /** For a property, its GROSS unit value: `quantity × price − totalValue` is its legacy debt. */
  price: number;
  totalValue: number;
}

/** A loan as `debtRepaymentsBetween` names it: today's asset, and the property it finances. */
export interface DebtLoan {
  id: string;
  name: string;
  financedAssetId?: string;
}

/** One debt's principal repaid between two valuations; negative when that debt went UP. */
export interface DebtRepayment {
  name: string;
  repaid: number;
}

/**
 * The user's own money that moved the net worth outside the cashflow — named beside the market
 * and the savings so it does not swell «altre variazioni» (owner, 2026-10-14: a month's TFR,
 * employer and voluntary contributions read as +1792 € of unexplained change).
 */
export interface MonthFlows {
  /** Paid into the pension funds (`pensionPaidInAcross`); 0 before the contributions are complete. */
  pensionPaidIn: number;
  /** Principal repaid per debt (`debtRepaymentsBetween`). */
  debts: DebtRepayment[];
}

/**
 * Whether a row is a loan: today's loans by id, and — for a loan deleted since (repaid in full,
 * then removed) — any non-property row with a negative value (a loan's value is minus its
 * principal, types/assets.ts).
 */
export function isLoanRowOf(loanIds: Set<string>, realEstateIds: Set<string>) {
  return (row: DebtPositionRow) => loanIds.has(row.assetId) || (row.totalValue < 0 && row.quantity > 0 && !realEstateIds.has(row.assetId));
}

/**
 * The principal repaid on each debt between two valuations, by name — the Panoramica names every
 * mortgage and loan (owner, 2026-10-14), Storico sums them. Two sources of debt:
 *
 *   - a LOAN row: its principal is −totalValue; one on a single side is a debt opened (negative)
 *     or closed (the whole principal);
 *   - a property's LEGACY debt (gross − net, before the loan migration of 2026-10-10), paired per
 *     property — a property on one side only was bought or sold, its debt moved with it. It is
 *     credited to the loan that finances the property (`financedAssetId`), so the migration month
 *     reads one debt that crossed from the property to its loan, not −X on the loan and +X on the
 *     house.
 *
 * Entries are in first-seen order; one that nets to zero is kept, the caller decides what prints.
 */
export function debtRepaymentsBetween(
  previousRows: DebtPositionRow[],
  currentRows: DebtPositionRow[],
  loans: DebtLoan[],
  realEstateIds: Set<string>
): DebtRepayment[] {
  const loansById = new Map(loans.map((loan) => [loan.id, loan]));
  const isLoanRow = isLoanRowOf(new Set(loansById.keys()), realEstateIds);
  const repayments = new Map<string, DebtRepayment>();
  const credit = (key: string, name: string, repaid: number) => {
    const entry = repayments.get(key) ?? { name, repaid: 0 };
    entry.repaid += repaid;
    repayments.set(key, entry);
  };

  const principalsOf = (rows: DebtPositionRow[]) => new Map(rows.filter(isLoanRow).map((row) => [row.assetId, row]));
  const previousLoans = principalsOf(previousRows);
  const currentLoans = principalsOf(currentRows);
  for (const assetId of new Set([...previousLoans.keys(), ...currentLoans.keys()])) {
    const before = previousLoans.get(assetId);
    const after = currentLoans.get(assetId);
    const name = loansById.get(assetId)?.name ?? after?.name ?? before?.name ?? 'Debito';
    credit(assetId, name, -(before?.totalValue ?? 0) + (after?.totalValue ?? 0));
  }

  const legacyDebtsOf = (rows: DebtPositionRow[]) =>
    new Map(rows.filter((row) => realEstateIds.has(row.assetId)).map((row) => [row.assetId, row]));
  const previousProperties = legacyDebtsOf(previousRows);
  const currentProperties = legacyDebtsOf(currentRows);
  const debtOf = (row: DebtPositionRow) => row.quantity * row.price - row.totalValue;
  for (const [assetId, before] of previousProperties) {
    const after = currentProperties.get(assetId);
    if (!after) continue;
    const repaid = debtOf(before) - debtOf(after);
    if (repaid === 0) continue;
    const loan = loans.find((candidate) => candidate.financedAssetId === assetId);
    credit(loan?.id ?? assetId, loan?.name ?? after.name ?? before.name ?? 'Debito', repaid);
  }
  return [...repayments.values()];
}
