/**
 * The portfolio as the assistant reads it (2026-10-20, owner's decision: «l'assistente deve
 * vedere TUTTO»): every instrument, the allocation on the SAME base as the Allocazione page,
 * the trade ledger, the dividend registry and the coupons of the bonds held, the pension funds
 * with their contributions, the loans, the household.
 *
 * Pure: no Firebase, no React. `assetValueOf` is injected (the real `calculateAssetValue` lives in the
 * Firebase-coupled service layer, the precedent of `buildHoldings`), `now` is a parameter. The
 * five context builders feed it the documents the Admin SDK read and hand its result to the
 * prompt through `AssistantMonthContextBundle.portfolio`; the prompt (`formatBundleForPrompt`)
 * prints every list WHOLE, or says in the text how many rows it left out — a silent cap is a
 * hallucinated «N/D» (doc/guide/assistente.md § Prompt builders).
 *
 * WHY THE ALLOCATION IS COMPUTED HERE AND NOT READ FROM THE SNAPSHOT
 * The snapshot's `byAssetClass` is the WHOLE patrimony — the home, the mortgage, the pension
 * funds, a private-equity commitment, a credit card — while the Allocazione page partitions the
 * assets by `allocationRole` and measures the targets on tradable + frozen only, net of the debts
 * that follow each group (doc/guide/allocazione.md § Allocation — allocationRole). Handed the
 * snapshot, the model saw «Immobili 22%» on a page that shows no real estate at all and compared
 * Azioni with its target on a base the page never uses. The same partition, the same holdings and
 * the same target reading as the page (`partitionByAllocationRole`, `buildHoldings`, the fixed
 * cash amount carved out of the base) are what make its sentences and the page agree.
 */

import type { Asset, AssetAllocationTarget, FamilyMember, SubCategoryTarget } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';
import type { Dividend } from '@/types/dividend';
import type { PensionContribution } from '@/types/pension';
import type { Expense } from '@/types/expenses';
import type { GoalAssetAssignment } from '@/types/goals';
import { isLoanAsset } from '@/types/assets';
import {
  ASSET_CLASS_LABELS,
  NO_SUBCATEGORY_LABEL,
  buildHoldings,
  partitionByAllocationRole,
  resolveAllocationRoleWithin,
  type AllocatableHolding,
} from '@/lib/utils/allocationUtils';
import { costBasisPerUnitEur } from '@/lib/utils/costBasisEur';
import { hasMarketPrice } from '@/lib/utils/assetPricing';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { describeAssetOwnerLabel } from '@/lib/utils/assetOwnership';
import { getItalyDateIso, toDate } from '@/lib/utils/dateHelpers';
import { instrumentTicker, isQuotedInstrument } from '@/lib/utils/exposureRequests';
import { sliceFraction } from '@/lib/utils/assetSlice';
import { goalAssetValue, isGoalAsset } from '@/lib/utils/goalAssetValue';
import { couponFrequencyLabel, getNextCouponDate, hasCouponPayments, resolveCoupon, resolveInflationIndexation } from '@/lib/utils/couponUtils';
import { loanDebtOf } from '@/lib/utils/mortgageRepayment';

/** How many ledger rows and dividend rows reach the prompt before the text declares a cut. */
export const PORTFOLIO_LEDGER_ROW_CAP = 300;
export const PORTFOLIO_DIVIDEND_ROW_CAP = 150;

export type AssistantHoldingRole = 'tradable' | 'frozen' | 'excluded';

export const HOLDING_ROLE_LABELS: Record<AssistantHoldingRole, string> = {
  tradable: 'negoziabile',
  frozen: 'non negoziabile (conta nella base, i piani non lo toccano)',
  excluded: "escluso dall'Allocazione",
};

export interface AssistantHoldingRow {
  assetId: string;
  name: string;
  /** The display ticker when it differs from the name; absent on an account or a hand-valued holding. */
  ticker?: string;
  /** The raw `asset.ticker`, the key of the Esposizione's profile cache (2026-11-08, the Consulente's bond block); absent on an unquoted holding. */
  profileTicker?: string;
  type: string;
  assetClass: string;
  subCategory?: string;
  role: AssistantHoldingRole;
  quantity: number;
  currency: string;
  /** EUR, negative on a loan. */
  valueEur: number;
  /** The fiscal PMC per unit in EUR, fees included; absent where there is no PMC to read. */
  costPerUnitEur?: number;
  /** quantity × costPerUnitEur; absent with it. */
  costBasisEur?: number;
  gainEur?: number;
  gainPct?: number;
  /** «di Marcella», «Giuseppe 273 quote, 692 in comune», null when the whole asset is in comune. */
  owner: string | null;
  isLiquid: boolean;
  /** A bond's redemption date (`bondDetails.maturityDate`) as an ISO day; only on a `bond` with its details (2026-11-08). */
  maturityIso?: string;
  /** The property a loan finances, by name; only on a loan. */
  financedAssetName?: string;
  /**
   * The share of the holding its goal quotas add up to (0-100) and the euro left free, with
   * Goal-Based Investing on (2026-10-20: «vede anche gli asset liberi?»). Absent with the feature
   * off, on a loan, on a sold-out position.
   */
  goalAssignedPct?: number;
  goalFreeEur?: number;
  /** What the goals can hold of it — a property net of its loans; the base of the two above. */
  goalValueEur?: number;
}

export interface AssistantAllocationClassRow {
  assetClass: string;
  label: string;
  value: number;
  /** Of the base (tradable + frozen). */
  pct: number;
  tradableValue: number;
  frozenValue: number;
  subCategories: { subCategory: string; value: number; pctOfClass: number; pctOfBase: number }[];
}

export interface AssistantTargetSubRow {
  subCategory: string;
  currentPctOfClass: number;
  targetPctOfClass: number;
  gapPp: number;
}

export interface AssistantTargetRow {
  assetClass: string;
  label: string;
  currentPct: number;
  currentValue: number;
  /** % of the base; on a fixed-amount cash target, the amount's share of the base today. */
  targetPct: number;
  /** Set when the class is Liquidità with a fixed euro target. */
  fixedAmount?: number;
  gapPp: number;
  subRows: AssistantTargetSubRow[];
}

export interface AssistantAllocationContext {
  /** tradable + frozen, net of the debts that follow them. */
  baseTotal: number;
  tradableTotal: number;
  frozenTotal: number;
  /** What the page leaves out entirely, net of the debts that follow it. */
  excludedTotal: number;
  byClass: AssistantAllocationClassRow[];
  excluded: { name: string; assetClass: string; value: number }[];
  frozen: { name: string; assetClass: string; value: number }[];
  /** null without configured targets. */
  targets: AssistantTargetRow[] | null;
}

export interface AssistantLedgerRow {
  dateIso: string;
  assetName: string;
  ticker?: string;
  type: 'buy' | 'sell' | 'adjustment';
  quantity: number;
  priceEur: number;
  feesEur: number;
  /** quantity × priceEur (fees aside). */
  amountEur: number;
  isBaseline: boolean;
}

export interface AssistantDividendRow {
  paymentDateIso: string;
  assetName: string;
  ticker?: string;
  grossEur: number;
  netEur: number;
  kind: string;
  isProvisional: boolean;
}

export interface AssistantCouponFact {
  assetName: string;
  ticker?: string;
  /** The annual rate in force today, in percent, as the dividend engine resolves it. */
  annualRatePct: number | null;
  frequency: string;
  maturityIso: string;
  nextCouponIso: string | null;
  /** The inflation mechanism, in words, or null. */
  indexation: string | null;
  /** The coupon per unit in EUR, as resolved for the next payment. */
  nextCouponPerUnitEur: number | null;
}

export interface AssistantPensionFund {
  assetId: string;
  name: string;
  valueEur: number;
  memberName: string | null;
  role: AssistantHoldingRole;
  byYear: { taxYear: number; tfr: number; voluntary: number; employer: number; total: number }[];
}

export interface AssistantLoanRow {
  name: string;
  financedAssetName: string | null;
  residualDebtEur: number;
  interestRatePct: number | null;
  /** The last instalment booked in the period's rows, when one is there. */
  lastInstalmentEur: number | null;
  role: AssistantHoldingRole;
}

export interface AssistantFamilyContext {
  ownerAge: number | null;
  members: { name: string; grossAnnualIncome: number | null }[];
}

/** What the goals cover of the held portfolio, the same arithmetic as FIRE › Obiettivi' «Non assegnato» (`getUnassignedValue`). */
export interface AssistantGoalCoverage {
  /** Value of the held assets (loans excluded), the base of the two figures below. */
  totalEur: number;
  assignedEur: number;
  freeEur: number;
}

export interface AssistantPortfolioContext {
  /** Every held asset and every loan, sold-out positions left out (the ledger tells of them). */
  holdings: AssistantHoldingRow[];
  /** Null with Goal-Based Investing off: a feature not in use, never a zero. */
  goalCoverage: AssistantGoalCoverage | null;
  allocation: AssistantAllocationContext;
  ledger: { rows: AssistantLedgerRow[]; totalRows: number; omittedRows: number };
  dividends: {
    received: AssistantDividendRow[];
    announced: AssistantDividendRow[];
    /** How many received rows the cap left out (the oldest ones). */
    omittedReceived: number;
    coupons: AssistantCouponFact[];
  };
  pension: AssistantPensionFund[];
  loans: AssistantLoanRow[];
  family: AssistantFamilyContext;
}

export interface BuildPortfolioContextInput {
  assets: Asset[];
  transactions: AssetTransaction[];
  dividends: Dividend[];
  pensionContributions: PensionContribution[];
  /** The period's expense rows, for the last instalment of each loan. */
  expenses: Expense[];
  targets: AssetAllocationTarget | null;
  /** The goals' quotas, when Goal-Based Investing is on; null when it is off (the holdings then carry no coverage). */
  goalAssignments: GoalAssetAssignment[] | null;
  familyMembers: FamilyMember[];
  ownerAge: number | null;
  assetValueOf: (asset: Asset) => number;
  now: Date;
}

const TRANSACTION_TYPE_LABELS: Record<AssistantLedgerRow['type'], string> = {
  buy: 'acquisto',
  sell: 'vendita',
  adjustment: 'rettifica',
};

export function ledgerTypeLabel(type: AssistantLedgerRow['type']): string {
  return TRANSACTION_TYPE_LABELS[type];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function pctOf(value: number, base: number): number {
  return base > 0 ? (value / base) * 100 : 0;
}

/** The ticker as a reader would name it, only when it adds something to the name. */
function tickerOf(asset: Pick<Asset, 'name' | 'ticker' | 'displayTicker'>): string | undefined {
  const ticker = getAssetDisplayTicker(asset);
  return ticker && ticker !== asset.name ? ticker : undefined;
}

/** A sub-target's percentage of its class, whatever legacy shape it was stored in. */
function subTargetPct(target: number | SubCategoryTarget): number {
  return typeof target === 'number' ? target : target.targetPercentage;
}

// ─── Holdings ─────────────────────────────────────────────────────────────────

/** The fraction of an asset its quotas across the goals add up to — a percent or units of the asset (`sliceFraction`). */
function assignedFractionOf(asset: Asset, assignments: readonly GoalAssetAssignment[]): number {
  let total = 0;
  for (const assignment of assignments) {
    if (assignment.assetId !== asset.id) continue;
    total += sliceFraction('percentage' in assignment ? { percent: assignment.percentage } : { units: assignment.units }, asset.quantity);
  }
  return total;
}

function buildHoldingRows(
  assets: Asset[],
  valueOf: (asset: Asset) => number,
  memberNames: ReadonlyMap<string, string>,
  goalAssignments: readonly GoalAssetAssignment[] | null
): AssistantHoldingRow[] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const rows: AssistantHoldingRow[] = [];

  for (const asset of assets) {
    // A sold-out position is history, not a holding; a repaid loan likewise.
    if (!(asset.quantity > 0) && !isLoanAsset(asset)) continue;
    if (isLoanAsset(asset) && !(asset.quantity > 0)) continue;

    const valueEur = valueOf(asset);
    // The G/P reads only where Patrimonio reads one: a quoted instrument with a EUR PMC. An
    // account, a hand-valued holding or a pension fund has no PMC to measure against.
    const measurable =
      !isLoanAsset(asset) && asset.type !== 'pensionFund' && asset.type !== 'cash' && hasMarketPrice(asset.type, asset.subCategory);
    const costPerUnitEur = measurable ? costBasisPerUnitEur(asset) : undefined;
    const costBasisEur = costPerUnitEur !== undefined ? asset.quantity * costPerUnitEur : undefined;
    const gainEur = costBasisEur !== undefined ? valueEur - costBasisEur : undefined;
    const financed = asset.financedAssetId ? byId.get(asset.financedAssetId) : undefined;
    // The goals' hold on the asset, as FIRE › Obiettivi measures it: the quotas summed, the rest free.
    const assignedFraction = goalAssignments && isGoalAsset(asset) ? Math.min(1, assignedFractionOf(asset, goalAssignments)) : null;
    // What the goals can hold of it: a property net of its loans (lib/utils/goalAssetValue.ts).
    const goalValueEur = assignedFraction !== null ? goalAssetValue(asset, assets, valueOf) : 0;

    const profileTicker = isQuotedInstrument(asset) ? instrumentTicker(asset) : '';
    rows.push({
      assetId: asset.id,
      name: asset.name.trim(),
      ...(tickerOf(asset) ? { ticker: tickerOf(asset) } : {}),
      ...(profileTicker ? { profileTicker } : {}),
      ...(asset.type === 'bond' && asset.bondDetails ? { maturityIso: getItalyDateIso(toDate(asset.bondDetails.maturityDate)) } : {}),
      type: asset.type,
      assetClass: asset.assetClass,
      ...(asset.subCategory ? { subCategory: asset.subCategory } : {}),
      role: resolveAllocationRoleWithin(asset, assets),
      quantity: asset.quantity,
      currency: asset.currency ?? 'EUR',
      valueEur,
      ...(costPerUnitEur !== undefined ? { costPerUnitEur } : {}),
      ...(costBasisEur !== undefined ? { costBasisEur } : {}),
      ...(gainEur !== undefined ? { gainEur } : {}),
      ...(gainEur !== undefined && costBasisEur ? { gainPct: (gainEur / costBasisEur) * 100 } : {}),
      owner: describeAssetOwnerLabel(asset, assets, memberNames),
      isLiquid: asset.isLiquid !== false,
      ...(financed ? { financedAssetName: financed.name.trim() } : {}),
      ...(assignedFraction !== null ? { goalAssignedPct: assignedFraction * 100, goalFreeEur: goalValueEur * (1 - assignedFraction), goalValueEur } : {}),
    });
  }

  // Largest first, debts last: the reader meets the portfolio the way the page ranks it.
  return rows.sort((a, b) => b.valueEur - a.valueEur);
}

// ─── Allocation on the page's base ────────────────────────────────────────────

function groupHoldings(holdings: AllocatableHolding[]): { name: string; assetClass: string; value: number }[] {
  return holdings.map((holding) => ({ name: holding.label, assetClass: holding.assetClass, value: holding.value }));
}

function buildAllocationContext(
  assets: Asset[],
  targets: AssetAllocationTarget | null,
  valueOf: (asset: Asset) => number
): AssistantAllocationContext {
  const { tradable, frozen, excluded } = partitionByAllocationRole(assets);
  // The reporting lists carry the debts (a loan nets the group it follows); the planners' list
  // does not, and the base is the reporting one — like the page's `reportedHoldings`.
  const tradableHoldings = buildHoldings(tradable, valueOf, { includeDebts: true });
  const frozenHoldings = buildHoldings(frozen, valueOf, { includeDebts: true });
  const excludedHoldings = buildHoldings(excluded, valueOf, { includeDebts: true });

  const tradableTotal = sum(tradableHoldings.map((holding) => holding.value));
  const frozenTotal = sum(frozenHoldings.map((holding) => holding.value));
  const baseTotal = tradableTotal + frozenTotal;
  const excludedTotal = sum(excludedHoldings.map((holding) => holding.value));

  const classes = new Map<string, AssistantAllocationClassRow>();
  const subTotals = new Map<string, Map<string, number>>();
  const addTo = (holding: AllocatableHolding) => {
    const row =
      classes.get(holding.assetClass) ??
      {
        assetClass: holding.assetClass,
        label: ASSET_CLASS_LABELS[holding.assetClass] ?? holding.assetClass,
        value: 0,
        pct: 0,
        tradableValue: 0,
        frozenValue: 0,
        subCategories: [],
      };
    row.value += holding.value;
    if (holding.tradable) row.tradableValue += holding.value;
    else row.frozenValue += holding.value;
    classes.set(holding.assetClass, row);
    const subs = subTotals.get(holding.assetClass) ?? new Map<string, number>();
    const key = holding.subCategory || NO_SUBCATEGORY_LABEL;
    subs.set(key, (subs.get(key) ?? 0) + holding.value);
    subTotals.set(holding.assetClass, subs);
  };
  for (const holding of tradableHoldings) addTo(holding);
  for (const holding of frozenHoldings) addTo(holding);

  const byClass = [...classes.values()]
    .map((row) => ({
      ...row,
      pct: pctOf(row.value, baseTotal),
      subCategories: [...(subTotals.get(row.assetClass) ?? new Map()).entries()]
        .map(([subCategory, value]) => ({
          subCategory,
          value,
          pctOfClass: pctOf(value, row.value),
          pctOfBase: pctOf(value, baseTotal),
        }))
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);

  return {
    baseTotal,
    tradableTotal,
    frozenTotal,
    excludedTotal,
    byClass,
    excluded: groupHoldings(excludedHoldings).sort((a, b) => b.value - a.value),
    frozen: groupHoldings(frozenHoldings).sort((a, b) => b.value - a.value),
    targets: buildTargetRows(targets, byClass, baseTotal),
  };
}

/**
 * Target vs current on the base, class by class and sub-category by sub-category, with the
 * page's reading of a fixed-amount cash target: the reserved euro is carved out of the base
 * before the other classes' percentages apply (`toLegacyAllocationResult`).
 */
function buildTargetRows(
  targets: AssetAllocationTarget | null,
  byClass: AssistantAllocationClassRow[],
  baseTotal: number
): AssistantTargetRow[] | null {
  if (!targets || baseTotal <= 0) return null;
  const cashTarget = targets['cash'];
  const useCashFixedAmount = cashTarget?.useFixedAmount === true;
  const cashFixedAmount = useCashFixedAmount ? cashTarget?.fixedAmount || 0 : 0;
  const targetBase = useCashFixedAmount ? Math.max(0, baseTotal - cashFixedAmount) : baseTotal;
  const rows: AssistantTargetRow[] = [];

  for (const [assetClass, target] of Object.entries(targets)) {
    const isFixedCash = assetClass === 'cash' && useCashFixedAmount;
    if (!isFixedCash && !(target.targetPercentage > 0)) continue;
    const current = byClass.find((row) => row.assetClass === assetClass);
    const currentValue = current?.value ?? 0;
    const currentPct = pctOf(currentValue, baseTotal);
    const targetValue = isFixedCash ? cashFixedAmount : (target.targetPercentage / 100) * targetBase;
    const targetPct = pctOf(targetValue, baseTotal);

    const subRows: AssistantTargetSubRow[] = [];
    for (const [subCategory, subTarget] of Object.entries(target.subTargets ?? {})) {
      const targetPctOfClass = subTargetPct(subTarget);
      const currentSub = current?.subCategories.find((row) => row.subCategory === subCategory);
      const currentPctOfClass = currentSub?.pctOfClass ?? 0;
      subRows.push({ subCategory, currentPctOfClass, targetPctOfClass, gapPp: currentPctOfClass - targetPctOfClass });
    }
    // A sub-category the page files as «Senza sottocategoria» inside a class that has targets:
    // its euros count in the class, no sleeve has an opinion on them.
    const untargeted = current?.subCategories.filter((row) => !(target.subTargets && row.subCategory in target.subTargets)) ?? [];
    for (const row of untargeted) {
      if (subRows.length === 0) break;
      subRows.push({ subCategory: row.subCategory, currentPctOfClass: row.pctOfClass, targetPctOfClass: 0, gapPp: row.pctOfClass });
    }

    rows.push({
      assetClass,
      label: ASSET_CLASS_LABELS[assetClass] ?? assetClass,
      currentPct,
      currentValue,
      targetPct,
      ...(isFixedCash ? { fixedAmount: cashFixedAmount } : {}),
      gapPp: currentPct - targetPct,
      subRows,
    });
  }

  return rows.length > 0 ? rows : null;
}

// ─── Ledger, dividends, coupons ───────────────────────────────────────────────

function buildLedger(transactions: AssetTransaction[], assets: Asset[]): AssistantPortfolioContext['ledger'] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const sorted = [...transactions].sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
  // The most recent rows survive a cut: what happened lately is what a question is about.
  const kept = sorted.slice(Math.max(0, sorted.length - PORTFOLIO_LEDGER_ROW_CAP));
  const rows = kept.map((transaction): AssistantLedgerRow => {
    const asset = byId.get(transaction.assetId);
    return {
      dateIso: getItalyDateIso(toDate(transaction.date)),
      assetName: asset?.name.trim() ?? 'Strumento non più in portafoglio',
      ...(asset && tickerOf(asset) ? { ticker: tickerOf(asset) } : {}),
      type: transaction.type,
      quantity: transaction.quantity,
      priceEur: transaction.priceEur,
      feesEur: transaction.fees ?? 0,
      amountEur: transaction.quantity * transaction.priceEur,
      isBaseline: transaction.isBaseline === true,
    };
  });
  return { rows, totalRows: sorted.length, omittedRows: sorted.length - kept.length };
}

function toDividendRow(dividend: Dividend, assets: Map<string, Asset>): AssistantDividendRow {
  const asset = assets.get(dividend.assetId);
  // EUR when the conversion stored it, the native amount otherwise (a EUR dividend has no field).
  const grossEur = dividend.grossAmountEur ?? dividend.grossAmount;
  const netEur = dividend.netAmountEur ?? dividend.netAmount;
  return {
    paymentDateIso: getItalyDateIso(toDate(dividend.paymentDate)),
    assetName: dividend.assetName?.trim() || asset?.name.trim() || 'Strumento',
    ...(asset && tickerOf(asset) ? { ticker: tickerOf(asset) } : {}),
    grossEur,
    netEur,
    kind: dividend.dividendType,
    isProvisional: dividend.isProvisional === true,
  };
}

/**
 * The registry in its two halves — received and announced are never one figure
 * (doc/guide/cashflow-dividendi.md) — and, for every bond held, the coupon the engine resolves
 * for its next payment.
 */
function buildDividendContext(dividends: Dividend[], assets: Asset[], now: Date): AssistantPortfolioContext['dividends'] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const todayIso = getItalyDateIso(now);
  const rows = dividends
    .map((dividend) => toDividendRow(dividend, byId))
    .sort((a, b) => a.paymentDateIso.localeCompare(b.paymentDateIso));
  const received = rows.filter((row) => row.paymentDateIso <= todayIso);
  const announced = rows.filter((row) => row.paymentDateIso > todayIso);
  const keptReceived = received.slice(Math.max(0, received.length - PORTFOLIO_DIVIDEND_ROW_CAP));

  const coupons: AssistantCouponFact[] = [];
  for (const asset of assets) {
    const details = asset.bondDetails;
    if (!details || !(asset.quantity > 0) || !hasCouponPayments(details)) continue;
    // `getNextCouponDate` reads the clock itself (its signature has no `now`): the fact is
    // «the next coupon from today», which is what the reader asks about.
    const next = getNextCouponDate(toDate(details.issueDate), details.couponFrequency, toDate(details.maturityDate));
    const resolved = next ? resolveCoupon(next, details, details.nominalValue ?? 1) : null;
    const indexation = resolveInflationIndexation(details);
    coupons.push({
      assetName: asset.name.trim(),
      ...(tickerOf(asset) ? { ticker: tickerOf(asset) } : {}),
      annualRatePct: resolved ? resolved.fixedAnnualRate : null,
      frequency: couponFrequencyLabel(details.couponFrequency),
      maturityIso: getItalyDateIso(toDate(details.maturityDate)),
      nextCouponIso: next ? getItalyDateIso(next) : null,
      indexation:
        indexation === 'italia' ? 'BTP Italia: somma il FOI alla cedola' : indexation === 'euro' ? 'BTP€i: moltiplica per il coefficiente' : null,
      nextCouponPerUnitEur: resolved ? resolved.perShare : null,
    });
  }

  return { received: keptReceived, announced, omittedReceived: received.length - keptReceived.length, coupons };
}

// ─── Pension, loans, family ───────────────────────────────────────────────────

function buildPensionContext(
  assets: Asset[],
  contributions: PensionContribution[],
  memberNames: ReadonlyMap<string, string>,
  valueOf: (asset: Asset) => number
): AssistantPensionFund[] {
  const funds: AssistantPensionFund[] = [];
  for (const asset of assets) {
    if (asset.type !== 'pensionFund') continue;
    const years = new Map<number, { tfr: number; voluntary: number; employer: number }>();
    for (const contribution of contributions) {
      if (contribution.assetId !== asset.id) continue;
      const year = years.get(contribution.taxYear) ?? { tfr: 0, voluntary: 0, employer: 0 };
      year[contribution.source] += contribution.amount;
      years.set(contribution.taxYear, year);
    }
    const memberId = asset.pensionFundDetails?.familyMemberId;
    funds.push({
      assetId: asset.id,
      name: asset.name.trim(),
      valueEur: valueOf(asset),
      memberName: memberId ? (memberNames.get(memberId) ?? null) : null,
      role: resolveAllocationRoleWithin(asset, assets),
      byYear: [...years.entries()]
        .map(([taxYear, split]) => ({ taxYear, ...split, total: split.tfr + split.voluntary + split.employer }))
        .sort((a, b) => a.taxYear - b.taxYear),
    });
  }
  return funds.sort((a, b) => b.valueEur - a.valueEur);
}

function buildLoanContext(assets: Asset[], expenses: Expense[]): AssistantLoanRow[] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const loans: AssistantLoanRow[] = [];
  for (const asset of assets) {
    if (!isLoanAsset(asset) || !(asset.quantity > 0)) continue;
    const debt = loanDebtOf(asset);
    const instalments = expenses
      .filter((expense) => expense.debtAssetId === asset.id)
      .sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
    const last = instalments[instalments.length - 1];
    const financed = asset.financedAssetId ? byId.get(asset.financedAssetId) : undefined;
    loans.push({
      name: asset.name.trim(),
      financedAssetName: financed?.name.trim() ?? null,
      residualDebtEur: debt.debt,
      interestRatePct: debt.annualRatePct ?? null,
      lastInstalmentEur: last ? Math.abs(last.amount) : null,
      role: resolveAllocationRoleWithin(asset, assets),
    });
  }
  return loans;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/** A portfolio with nothing in it — the shape a test fixture starts from, every list empty. */
export function emptyAssistantPortfolioContext(): AssistantPortfolioContext {
  return {
    holdings: [],
    goalCoverage: null,
    allocation: { baseTotal: 0, tradableTotal: 0, frozenTotal: 0, excludedTotal: 0, byClass: [], excluded: [], frozen: [], targets: null },
    ledger: { rows: [], totalRows: 0, omittedRows: 0 },
    dividends: { received: [], announced: [], omittedReceived: 0, coupons: [] },
    pension: [],
    loans: [],
    family: { ownerAge: null, members: [] },
  };
}

/** The goals' coverage of the held portfolio: Σ of every holding's free euro against its value, loans out. */
function buildGoalCoverage(holdings: readonly AssistantHoldingRow[]): AssistantGoalCoverage {
  let totalEur = 0;
  let freeEur = 0;
  for (const row of holdings) {
    if (row.goalFreeEur === undefined || row.goalValueEur === undefined) continue;
    totalEur += row.goalValueEur;
    freeEur += row.goalFreeEur;
  }
  return { totalEur, assignedEur: totalEur - freeEur, freeEur };
}

export function buildAssistantPortfolioContext(input: BuildPortfolioContextInput): AssistantPortfolioContext {
  const { assets, transactions, dividends, pensionContributions, expenses, targets, goalAssignments, familyMembers, ownerAge, assetValueOf: valueOf, now } = input;
  const memberNames = new Map(familyMembers.map((member) => [member.id, member.name]));
  const holdings = buildHoldingRows(assets, valueOf, memberNames, goalAssignments);

  return {
    holdings,
    goalCoverage: goalAssignments ? buildGoalCoverage(holdings) : null,
    allocation: buildAllocationContext(assets, targets, valueOf),
    ledger: buildLedger(transactions, assets),
    dividends: buildDividendContext(dividends, assets, now),
    pension: buildPensionContext(assets, pensionContributions, memberNames, valueOf),
    loans: buildLoanContext(assets, expenses),
    family: {
      ownerAge,
      members: familyMembers.map((member) => ({ name: member.name, grossAnnualIncome: member.grossAnnualIncome ?? null })),
    },
  };
}
