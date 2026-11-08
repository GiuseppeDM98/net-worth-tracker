/**
 * The CASHFLOW 12 MESI block — the cashflow as the Consulente's interview and strategy, every mode of the Assistente
 * and the AI comments of the emails read it (owner, 2026-11-01; every surface since 2026-11-07,
 * decision 81).
 *
 * WHY IT EXISTS
 * The period bundle (`buildCashflowBreakdown` over ONE period) says what came in and went out in that
 * period; it cannot say how concentrated the income is over time, how much is left each month and how
 * steady that is, which commitments recur, or which accounts hold the liquidity. The strategy sizes the
 * goals' `monthlyContribution` and the cash reserve on exactly those figures, so they come from here:
 * aggregates on the 12 full Italian months before the current one, the current month counted up to
 * the Italian today and printed apart, a monthly series over the whole recorded history (from the first
 * month holding a row, never before `cashflowHistoryStartYear`, no cap — owner, 2026-11-07), and the rows
 * up to 12 months past the current one read for the commitments' next date and state only.
 *
 * Pure: no Firebase, no clock. The «today» is `input.todayIso` and an asset's balance is the injected
 * `assetValueOf` (`calculateAssetValue` lives beside the client SDK). The server reads the inputs in
 * ONE query (`fetchCashflowBlockInputs`, in the assistant's context service). This module imports
 * nothing from the service layer nor Firebase: a grep for those paths here must print nothing.
 *
 * THE RULES (doc/guide/consulente.md § The run)
 * - A row's month is its ITALIAN calendar month (`getItalyDateIso`): the rows sit at Italian midnight
 *   and the server runs in UTC. Month arithmetic on `year * 12 + (month - 1)`, never `Date.setMonth`.
 * - Classification by `type`, never by sign; transfers out of income and spending, counted apart.
 *   `excludeFromBudget` rows count (`countsTowardBudget` is the Budget's gate, not the cashflow's),
 *   `balancePending` rows count on their date.
 * - Key by id, label by name (`getCategoryKey`/`getSubCategoryKey`, `resolveDisplayLabels`).
 * - Income is a signed sum; dividends and coupons are in the total and out of the sources and the HHI
 *   (owner, 2026-11-01). The concentration reads on the FIRST source's share.
 * - A whole instalment is spending: the principal lowers the debt, but it left the account (owner,
 *   2026-11-01), and the block says so.
 * - A commitment is a recorded series or instalment plan, never inferred; a `debt` row naming a loan
 *   belongs to the loan only.
 * - Every cut is written in the text the model reads (the silent-cap rule, doc/guide/assistente.md).
 */

import type { Expense, ExpenseCategory, ExpenseType, RecurrenceFrequency } from '@/types/expenses';
import { EXPENSE_TYPE_LABELS, NO_SUBCATEGORY_KEY, NO_SUBCATEGORY_LABEL } from '@/types/expenses';
import type { Asset, AssetAllocationSettings } from '@/types/assets';
import { isCashAccount, isLoanAsset } from '@/types/assets';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import {
  getCategoryKey,
  getCategoryName,
  getSubCategoryKey,
  getSubCategoryLabel,
  resolveDisplayLabels,
} from '@/lib/utils/expenseGrouping';
import { resolveRecurrenceFrequency } from '@/lib/utils/recurrenceDates';
import { roundToCents } from '@/lib/utils/cents';
import { cachedFormatCurrencyEUR, formatNumberIt, formatPercentageIt } from '@/lib/utils/formatters';

export const CASHFLOW_BLOCK_AGGREGATE_MONTHS = 12;   // full months before the current one
export const CASHFLOW_BLOCK_FUTURE_MONTHS = 12;      // read past the current month, commitments only
export const CASHFLOW_BLOCK_ROW_CAP = 40;            // commitments printed (series + instalment plans)
export const CASHFLOW_BLOCK_SOURCE_CAP = 20;         // income sources printed
export const CASHFLOW_BLOCK_SUBCATEGORY_CAP = 60;    // spending subcategories printed, across categories
export const CASHFLOW_BLOCK_MIN_MEDIAN_MONTHS = 3;

export type CashflowBlockSettings = Pick<AssetAllocationSettings,
  'dividendIncomeCategoryId' | 'cashflowHistoryStartYear' | 'defaultDebitCashAssetId' | 'defaultCreditCashAssetId'>;

export interface CashflowBlockInput {
  /** The Italian «today» (`getItalyDateIso(now)`): the builder never reads the clock. */
  todayIso: string;
  categories: ExpenseCategory[];
  /** Every asset of the user: the cash accounts, the loans and the properties are picked here. */
  assets: Asset[];
  settings: CashflowBlockSettings | null;
  /** An asset's EUR balance — `calculateAssetValue`, injected (it lives beside the client SDK). */
  assetValueOf: (asset: Asset) => number;
}

export interface CashAccountLine { id: string; name: string; balance: number; roles: ('addebito' | 'accredito')[] }

export type IncomeReading = 'una fonte dominante' | 'due fonti principali' | 'fonti diversificate' | 'nessuna entrata';
export interface IncomeSource {
  key: string;             // `${getCategoryKey(row)}/${getSubCategoryKey(row)}`
  label: string;           // «Categoria › Sottocategoria», the category alone without a subcategory
  total: number;           // signed, 12 full months
  share: number | null;    // 0-100 of the positive sources' sum; null when total ≤ 0
  monthsPresent: number;   // full months holding a row of the source
}
export interface SpendingCategory {
  key: string; label: string; total: number; share: number;          // share 0-100 of spending.total
  subCategories: { key: string; label: string; total: number }[];    // the printed ones, after the global cap
}
export interface MonthRow {
  ym: string;                                   // 'YYYY-MM', Italian calendar
  state: 'full' | 'in-progress' | 'before-floor';
  income: number;                               // signed, dividends included
  necessary: number; nonNecessary: number; debt: number; unclassified: number;   // magnitudes ≥ 0
  savings: number;                              // income − the four spending figures
  savingsRate: number | null;                   // 0-100; null when income ≤ 0
  rows: number;                                 // counted rows (no transfers); 0 ⇒ «nessuna riga»
}
export interface Quartiles { q1: number; median: number; q3: number }
export interface Commitment {
  kind: 'recurring' | 'instalments';
  key: string;                                  // recurringParentId or installmentParentId
  label: string;                                // the latest row's category › subcategory
  frequency: RecurrenceFrequency;               // an instalment plan is 'monthly'
  amount: number;                               // |amount| of the latest row ≤ today, else of the first later row
  change: { from: number; sinceYm: string } | null;
  nextIso: string | null;                       // the first row after today
  endedYm: string | null;                       // the last row's month when no row follows today
  instalment: { number: number; total: number } | null;   // number 0 ⇒ «prima rata il …»
}
export interface LoanLine {
  debtAssetId: string;
  name: string | null;                          // null ⇒ «prestito eliminato»
  monthly: number | null;                       // median |amount|, 12 full months, payoffs out; null ⇒ none yet
  monthlyRows: number;
  payoff: number;                               // Σ |amount| of the 12 full months' payoff rows
  nextIso: string | null;
}
export interface CashflowBlock {
  windows: {
    aggregateFromYm: string; aggregateToYm: string; currentYm: string; todayIso: string; seriesFromYm: string;
    floorYm: string | null;                     // `${cashflowHistoryStartYear}-01`, null when the setting is absent
    beforeFloorRows: number;                    // rows up to today the floor leaves out (transfers aside)
    medianFromYm: string | null; medianMonths: number;
  };
  income: { total: number; dividends: number; sources: IncomeSource[]; sourcesCut: { count: number; total: number };
            hhi: number | null; topShare: number | null; reading: IncomeReading };
  spending: { total: number; byType: { necessary: number; nonNecessary: number; debt: number; unclassified: number };
              untypedRows: number; byCategory: SpendingCategory[]; subCategoriesCut: { count: number; total: number } };
  savings: { total: number; rate: number | null };
  currentMonth: { income: number; spending: number; rows: number; scheduled: { rows: number; income: number; spending: number } };
  series: MonthRow[];                           // the first month with a row (≤ the aggregates' first) → current, oldest first
  volatility: { spending: Quartiles; savings: Quartiles } | null;   // null ⇒ «dati insufficienti per le mediane»
  commitments: { items: Commitment[]; cut: number };
  loans: { items: LoanLine[]; unlinked: { rows: number; total: number } };
  transfers: { rows: number; moved: number; property: { rows: number; moved: number } };
  accounts: CashAccountLine[];
}

// ─── Months ───────────────────────────────────────────────────────────────────

function ymIndex(ym: string): number {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  return year * 12 + (month - 1);
}

function ymOf(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** A row with its Italian day and month, computed once. */
interface DatedRow {
  row: Expense;
  day: string;   // 'YYYY-MM-DD', Italian calendar
  ym: string;
  idx: number;
}

type SpendingBucket = 'necessary' | 'nonNecessary' | 'debt' | 'unclassified';

/** `type` is declared required, but a legacy or imported row can arrive without one. */
function bucketOf(row: Expense): SpendingBucket {
  switch (row.type) {
    case 'fixed': return 'necessary';
    case 'variable': return 'nonNecessary';
    case 'debt': return 'debt';
    default: return 'unclassified';
  }
}

/** QUARTILE.INC: linear interpolation at (n − 1) · p over the sorted values. */
function quantile(sorted: readonly number[], p: number): number {
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function quartilesOf(values: readonly number[]): Quartiles {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    q1: roundToCents(quantile(sorted, 0.25)),
    median: roundToCents(quantile(sorted, 0.5)),
    q3: roundToCents(quantile(sorted, 0.75)),
  };
}

function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, 'it');
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

/**
 * EVERY cash account (`isCashAccount`: a money-market ETF with `assetClass: 'cash'` is an instrument,
 * not an account), a closed one included — the register's account list names it too. The balance is
 * the Patrimonio's (`assetValueOf`), the roles are the two default accounts of the expense form.
 */
export function buildCashAccountLines(
  assets: readonly Asset[],
  settings: Pick<AssetAllocationSettings, 'defaultDebitCashAssetId' | 'defaultCreditCashAssetId'> | null,
  assetValueOf: (asset: Asset) => number,
): CashAccountLine[] {
  return assets
    .filter(isCashAccount)
    .map((asset) => {
      const roles: CashAccountLine['roles'] = [];
      if (settings?.defaultDebitCashAssetId === asset.id) roles.push('addebito');
      if (settings?.defaultCreditCashAssetId === asset.id) roles.push('accredito');
      return { id: asset.id, name: asset.name?.trim() || asset.id, balance: assetValueOf(asset), roles };
    })
    .sort((a, b) => b.balance - a.balance || compareLabels(a.name, b.name));
}

// ─── The builder ──────────────────────────────────────────────────────────────

interface SourceAccumulator { key: string; name: string; total: number; months: Set<string> }
interface CategoryAccumulator {
  key: string; name: string; qualifier?: string; total: number;
  subs: Map<string, { key: string; name: string; total: number }>;
}
interface CommitmentGroup { kind: Commitment['kind']; key: string; rows: DatedRow[] }

export function buildCashflowBlock(expenses: readonly Expense[], input: CashflowBlockInput): CashflowBlock {
  const { todayIso, settings } = input;
  const currentYm = todayIso.slice(0, 7);
  const current = ymIndex(currentYm);
  const aggregateFrom = current - CASHFLOW_BLOCK_AGGREGATE_MONTHS;
  const aggregateTo = current - 1;
  const floorYm = settings?.cashflowHistoryStartYear ? `${settings.cashflowHistoryStartYear}-01` : null;
  const floor = floorYm ? ymIndex(floorYm) : Number.NEGATIVE_INFINITY;
  const dividendCategoryId = settings?.dividendIncomeCategoryId;

  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const assetById = new Map(input.assets.map((asset) => [asset.id, asset]));

  const categoryNameOf = (row: Expense): string =>
    categoryById.get(getCategoryKey(row))?.name?.trim() || getCategoryName(row);
  const subCategoryNameOf = (row: Expense): string => {
    const subKey = getSubCategoryKey(row);
    if (subKey === NO_SUBCATEGORY_KEY) return NO_SUBCATEGORY_LABEL;
    const sub = categoryById.get(getCategoryKey(row))?.subCategories?.find((s) => s.id === subKey);
    return sub?.name?.trim() || getSubCategoryLabel(row);
  };
  const pathOf = (row: Expense): string =>
    getSubCategoryKey(row) === NO_SUBCATEGORY_KEY
      ? categoryNameOf(row)
      : `${categoryNameOf(row)} › ${subCategoryNameOf(row)}`;

  // Oldest first, ties by id: every «latest» below is the last of a stable order.
  const rows: DatedRow[] = expenses
    .map((row) => {
      const day = getItalyDateIso(row.date);
      const ym = day.slice(0, 7);
      return { row, day, ym, idx: ymIndex(ym) };
    })
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0));

  // The series: the whole recorded history, from the first month holding a counted row (never before
  // the floor, no cap — owner, 2026-11-07), and always the 12 full months, so a gap month among them
  // still prints «nessuna riga». A row after today sits in the current month or later, so the min below
  // already ignores it.
  const firstRow = rows.find((r) => r.row.type !== 'transfer' && r.idx >= floor);
  const seriesFrom = Math.min(firstRow ? firstRow.idx : aggregateFrom, aggregateFrom);
  // The rows the floor leaves out, declared in the header: the silent-cap rule (2026-11-07).
  const beforeFloorRows = rows.filter((r) => r.row.type !== 'transfer' && r.idx < floor && r.day <= todayIso).length;

  // No `idx >= seriesFrom` here: the series opens at the first row past the floor, so a counted row is
  // never before it. The rows after today in the current month are «scheduled» in the loop below, which
  // drops them before these tests — so the current month needs no day check either (2026-11-07).
  const isFullCounted = (r: DatedRow) => r.idx < current && r.idx >= floor;
  const inAggregate = (r: DatedRow) => isFullCounted(r) && r.idx >= aggregateFrom;
  const isCurrentCounted = (r: DatedRow) => r.idx === current;

  // ── The series ──
  const series: MonthRow[] = [];
  for (let idx = seriesFrom; idx <= current; idx++) {
    series.push({
      ym: ymOf(idx),
      state: idx === current ? 'in-progress' : idx < floor ? 'before-floor' : 'full',
      income: 0, necessary: 0, nonNecessary: 0, debt: 0, unclassified: 0, savings: 0, savingsRate: null, rows: 0,
    });
  }

  const currentMonth = { income: 0, spending: 0, rows: 0, scheduled: { rows: 0, income: 0, spending: 0 } };

  for (const r of rows) {
    if (r.row.type === 'transfer') continue;
    if (r.idx === current && r.day > todayIso) {
      currentMonth.scheduled.rows += 1;
      if (r.row.type === 'income') currentMonth.scheduled.income += r.row.amount;
      else currentMonth.scheduled.spending += Math.abs(r.row.amount);
      continue;
    }
    if (!isFullCounted(r) && !isCurrentCounted(r)) continue;
    const month = series[r.idx - seriesFrom];
    month.rows += 1;
    if (r.row.type === 'income') {
      month.income += r.row.amount;
    } else {
      month[bucketOf(r.row)] += Math.abs(r.row.amount);
    }
  }

  for (const month of series) {
    month.income = roundToCents(month.income);
    month.necessary = roundToCents(month.necessary);
    month.nonNecessary = roundToCents(month.nonNecessary);
    month.debt = roundToCents(month.debt);
    month.unclassified = roundToCents(month.unclassified);
    month.savings = roundToCents(month.income - month.necessary - month.nonNecessary - month.debt - month.unclassified);
    month.savingsRate = month.income > 0 ? (month.savings / month.income) * 100 : null;
  }

  const inProgress = series[series.length - 1];
  currentMonth.income = inProgress.income;
  currentMonth.spending = roundToCents(inProgress.necessary + inProgress.nonNecessary + inProgress.debt + inProgress.unclassified);
  currentMonth.rows = inProgress.rows;
  currentMonth.scheduled.income = roundToCents(currentMonth.scheduled.income);
  currentMonth.scheduled.spending = roundToCents(currentMonth.scheduled.spending);

  // ── The 12 full months ──
  let incomeTotal = 0;
  let dividends = 0;
  const sources = new Map<string, SourceAccumulator>();
  const byType = { necessary: 0, nonNecessary: 0, debt: 0, unclassified: 0 };
  let untypedRows = 0;
  const categories = new Map<string, CategoryAccumulator>();
  const transfers = { rows: 0, moved: 0, property: { rows: 0, moved: 0 } };

  for (const r of rows) {
    if (!inAggregate(r)) continue;
    const { row } = r;
    if (row.type === 'transfer') {
      const moved = Math.abs(row.amount);
      transfers.rows += 1;
      transfers.moved += moved;
      const touchesProperty = [row.transferCashAssetId, row.linkedCashAssetId]
        .some((id) => id !== undefined && assetById.get(id)?.type === 'realestate');
      if (touchesProperty) {
        transfers.property.rows += 1;
        transfers.property.moved += moved;
      }
      continue;
    }
    if (row.type === 'income') {
      incomeTotal += row.amount;
      if (dividendCategoryId && row.categoryId === dividendCategoryId) {
        dividends += row.amount;
        continue;
      }
      const key = `${getCategoryKey(row)}/${getSubCategoryKey(row)}`;
      const source = sources.get(key) ?? { key, name: '', total: 0, months: new Set<string>() };
      source.name = pathOf(row);
      source.total += row.amount;
      source.months.add(r.ym);
      sources.set(key, source);
      continue;
    }
    const bucket = bucketOf(row);
    const magnitude = Math.abs(row.amount);
    byType[bucket] += magnitude;
    if (bucket === 'unclassified') untypedRows += 1;

    const categoryKey = getCategoryKey(row);
    const qualifierType: ExpenseType | undefined = categoryById.get(categoryKey)?.type ?? row.type;
    const category: CategoryAccumulator = categories.get(categoryKey) ?? {
      key: categoryKey, name: '', total: 0, subs: new Map(),
    };
    category.name = categoryNameOf(row);
    category.qualifier = qualifierType ? EXPENSE_TYPE_LABELS[qualifierType] : undefined;
    category.total += magnitude;
    const subKey = getSubCategoryKey(row);
    const sub = category.subs.get(subKey) ?? { key: subKey, name: '', total: 0 };
    sub.name = subCategoryNameOf(row);
    sub.total += magnitude;
    category.subs.set(subKey, sub);
    categories.set(categoryKey, category);
  }

  // Income sources: shares over the POSITIVE totals, the reading on the first share.
  const sourceLabels = resolveDisplayLabels([...sources.values()].map((s) => ({ key: s.key, name: s.name })));
  const positiveSum = [...sources.values()].reduce((sum, s) => (s.total > 0 ? sum + s.total : sum), 0);
  const allSources: IncomeSource[] = [...sources.values()]
    .map((s) => ({
      key: s.key,
      label: sourceLabels.get(s.key) ?? s.name,
      total: roundToCents(s.total),
      share: s.total > 0 && positiveSum > 0 ? (s.total / positiveSum) * 100 : null,
      monthsPresent: s.months.size,
    }))
    .sort((a, b) => b.total - a.total || compareLabels(a.label, b.label));
  const positiveShares = allSources.map((s) => s.share).filter((share): share is number => share !== null);
  const hhi = positiveShares.length > 0
    ? roundToCents(positiveShares.reduce((sum, share) => sum + (share / 100) ** 2, 0))
    : null;
  const topShare = positiveShares.length > 0 ? positiveShares[0] : null;
  let reading: IncomeReading = 'nessuna entrata';
  if (topShare !== null) {
    if (topShare >= 70) reading = 'una fonte dominante';
    else if (topShare + (positiveShares[1] ?? 0) >= 80) reading = 'due fonti principali';
    else reading = 'fonti diversificate';
  }
  const printedSources = allSources.slice(0, CASHFLOW_BLOCK_SOURCE_CAP);
  const cutSources = allSources.slice(CASHFLOW_BLOCK_SOURCE_CAP);

  // Spending: every category printed; the subcategories ranked across ALL categories, then capped.
  const spendingTotal = byType.necessary + byType.nonNecessary + byType.debt + byType.unclassified;
  const categoryLabels = resolveDisplayLabels(
    [...categories.values()].map((c) => ({ key: c.key, name: c.name, qualifier: c.qualifier })),
  );
  const rankedCategories = [...categories.values()]
    .map((c) => ({ accumulator: c, label: categoryLabels.get(c.key) ?? c.name }))
    .sort((a, b) => b.accumulator.total - a.accumulator.total || compareLabels(a.label, b.label));
  // A category whose rows carry no subcategory at all prints its share alone.
  const rankedSubs = rankedCategories
    .flatMap(({ accumulator, label }) => {
      const subs = [...accumulator.subs.values()];
      if (subs.length === 1 && subs[0].key === NO_SUBCATEGORY_KEY) return [];
      return subs.map((sub) => ({ categoryKey: accumulator.key, categoryLabel: label, sub }));
    })
    .sort((a, b) =>
      b.sub.total - a.sub.total
      || compareLabels(a.categoryLabel, b.categoryLabel)
      || compareLabels(a.sub.name, b.sub.name));
  const keptSubs = rankedSubs.slice(0, CASHFLOW_BLOCK_SUBCATEGORY_CAP);
  const cutSubs = rankedSubs.slice(CASHFLOW_BLOCK_SUBCATEGORY_CAP);
  const byCategory: SpendingCategory[] = rankedCategories.map(({ accumulator, label }) => ({
    key: accumulator.key,
    label,
    total: roundToCents(accumulator.total),
    share: spendingTotal > 0 ? (accumulator.total / spendingTotal) * 100 : 0,
    subCategories: keptSubs
      .filter((entry) => entry.categoryKey === accumulator.key)
      .map(({ sub }) => ({ key: sub.key, label: sub.name, total: roundToCents(sub.total) })),
  }));

  // ── The medians: from the first full month holding a counted row, never before the floor ──
  // A month before the floor holds no counted row, so `rows > 0` already keeps it out.
  const firstDataIdx = series.findIndex((month, i) => seriesFrom + i <= aggregateTo && month.rows > 0);
  let medianFrom: number | null = null;
  let medianMonths = 0;
  let volatility: CashflowBlock['volatility'] = null;
  if (firstDataIdx !== -1) {
    medianFrom = Math.max(aggregateFrom, seriesFrom + firstDataIdx);
    medianMonths = aggregateTo - medianFrom + 1;
    if (medianMonths >= CASHFLOW_BLOCK_MIN_MEDIAN_MONTHS) {
      const span = series.slice(medianFrom - seriesFrom, aggregateTo - seriesFrom + 1);
      volatility = {
        spending: quartilesOf(span.map((m) => m.necessary + m.nonNecessary + m.debt + m.unclassified)),
        savings: quartilesOf(span.map((m) => m.savings)),
      };
    }
  }

  // ── The commitments: the recorded series and instalment plans ──
  const groups = new Map<string, CommitmentGroup>();
  for (const r of rows) {
    const { row } = r;
    if (row.type === 'debt' && row.debtAssetId) continue;   // a loan's instalment, listed under the loan
    let kind: Commitment['kind'];
    let key: string;
    if (row.isRecurring === true && row.recurringParentId) {
      kind = 'recurring';
      key = row.recurringParentId;
    } else if (row.installmentParentId) {
      kind = 'instalments';
      key = row.installmentParentId;
    } else {
      continue;
    }
    const groupKey = `${kind}:${key}`;
    const group = groups.get(groupKey) ?? { kind, key, rows: [] };
    group.rows.push(r);
    groups.set(groupKey, group);
  }

  const commitments: Commitment[] = [];
  for (const group of groups.values()) {
    if (!group.rows.some((r) => r.idx >= aggregateFrom)) continue;
    const past = group.rows.filter((r) => r.day <= todayIso);
    const future = group.rows.filter((r) => r.day > todayIso);
    const reference = past.length > 0 ? past[past.length - 1] : future[0];
    const amount = roundToCents(Math.abs(reference.row.amount));
    // The amount's history starts at the floor like every figure of the block (2026-11-07); the plan's
    // number, total and next date read every row of it, since they are the record's own.
    const priced = past.filter((r) => r.idx >= floor);
    let change: Commitment['change'] = null;
    if (priced.length > 0) {
      const cents = (r: DatedRow) => Math.round(Math.abs(r.row.amount) * 100);
      const latest = priced[priced.length - 1];
      let runStart = priced.length - 1;
      while (runStart > 0 && cents(priced[runStart - 1]) === cents(latest)) runStart -= 1;
      if (runStart > 0) {
        change = { from: roundToCents(Math.abs(priced[runStart - 1].row.amount)), sinceYm: priced[runStart].ym };
      }
    }
    const nextIso = future.length > 0 ? future[0].day : null;
    commitments.push({
      kind: group.kind,
      key: group.key,
      label: pathOf(reference.row),
      frequency: group.kind === 'recurring' ? resolveRecurrenceFrequency(reference.row.recurringFrequency) : 'monthly',
      amount,
      change,
      nextIso,
      endedYm: nextIso === null ? group.rows[group.rows.length - 1].ym : null,
      instalment: group.kind === 'instalments'
        ? {
            number: past.length > 0 ? past[past.length - 1].row.installmentNumber ?? 0 : 0,
            total: reference.row.installmentTotal ?? group.rows.length,
          }
        : null,
    });
  }
  const monthlyEquivalent = (c: Commitment) => (c.frequency === 'yearly' ? c.amount / 12 : c.amount);
  commitments.sort((a, b) => {
    const aActive = a.nextIso !== null;
    const bActive = b.nextIso !== null;
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (aActive) return monthlyEquivalent(b) - monthlyEquivalent(a) || compareLabels(a.label, b.label);
    return compareLabels(b.endedYm ?? '', a.endedYm ?? '') || compareLabels(a.label, b.label);
  });

  // ── The loans: the `debt` rows naming one, and only there ──
  const loanGroups = new Map<string, DatedRow[]>();
  let unlinkedRows = 0;
  let unlinkedTotal = 0;
  for (const r of rows) {
    if (r.row.type !== 'debt') continue;
    if (r.row.debtAssetId) {
      const group = loanGroups.get(r.row.debtAssetId) ?? [];
      group.push(r);
      loanGroups.set(r.row.debtAssetId, group);
      continue;
    }
    const inCommitment = (r.row.isRecurring === true && r.row.recurringParentId) || r.row.installmentParentId;
    if (!inCommitment && inAggregate(r)) {
      unlinkedRows += 1;
      unlinkedTotal += Math.abs(r.row.amount);
    }
  }
  const loans: LoanLine[] = [];
  for (const [debtAssetId, group] of loanGroups) {
    if (!group.some((r) => r.idx >= aggregateFrom)) continue;
    const loanAsset = assetById.get(debtAssetId);
    const counted = group.filter(inAggregate);
    const instalments = counted.filter((r) => !r.row.isDebtPayoff).map((r) => Math.abs(r.row.amount));
    const payoff = counted.filter((r) => r.row.isDebtPayoff).reduce((sum, r) => sum + Math.abs(r.row.amount), 0);
    const next = group.find((r) => r.day > todayIso && !r.row.isDebtPayoff);
    loans.push({
      debtAssetId,
      name: loanAsset && isLoanAsset(loanAsset) ? loanAsset.name?.trim() || debtAssetId : null,
      monthly: instalments.length > 0 ? quartilesOf(instalments).median : null,
      monthlyRows: instalments.length,
      payoff: roundToCents(payoff),
      nextIso: next?.day ?? null,
    });
  }
  loans.sort((a, b) => (b.monthly ?? 0) - (a.monthly ?? 0) || compareLabels(a.name ?? '', b.name ?? ''));

  // ── The accounts: a closed account with no role is no use to whoever reads the block ──
  const accounts = buildCashAccountLines(input.assets, settings, input.assetValueOf).filter((line) => {
    const asset = assetById.get(line.id);
    return !(asset?.quantity === 0 && line.roles.length === 0);
  });

  const roundedIncome = roundToCents(incomeTotal);
  const roundedSpending = roundToCents(spendingTotal);
  const savingsTotal = roundToCents(roundedIncome - roundedSpending);

  return {
    windows: {
      aggregateFromYm: ymOf(aggregateFrom),
      aggregateToYm: ymOf(aggregateTo),
      currentYm,
      todayIso,
      seriesFromYm: ymOf(seriesFrom),
      floorYm,
      beforeFloorRows,
      medianFromYm: medianFrom === null ? null : ymOf(medianFrom),
      medianMonths,
    },
    income: {
      total: roundedIncome,
      dividends: roundToCents(dividends),
      sources: printedSources,
      sourcesCut: { count: cutSources.length, total: roundToCents(cutSources.reduce((sum, s) => sum + s.total, 0)) },
      hhi,
      topShare,
      reading,
    },
    spending: {
      total: roundedSpending,
      byType: {
        necessary: roundToCents(byType.necessary),
        nonNecessary: roundToCents(byType.nonNecessary),
        debt: roundToCents(byType.debt),
        unclassified: roundToCents(byType.unclassified),
      },
      untypedRows,
      byCategory,
      subCategoriesCut: { count: cutSubs.length, total: roundToCents(cutSubs.reduce((sum, e) => sum + e.sub.total, 0)) },
    },
    savings: { total: savingsTotal, rate: roundedIncome > 0 ? (savingsTotal / roundedIncome) * 100 : null },
    currentMonth,
    series,
    volatility,
    commitments: {
      items: commitments.slice(0, CASHFLOW_BLOCK_ROW_CAP),
      cut: Math.max(0, commitments.length - CASHFLOW_BLOCK_ROW_CAP),
    },
    loans: { items: loans, unlinked: { rows: unlinkedRows, total: roundToCents(unlinkedTotal) } },
    transfers: {
      rows: transfers.rows,
      moved: roundToCents(transfers.moved),
      property: { rows: transfers.property.rows, moved: roundToCents(transfers.property.moved) },
    },
    accounts,
  };
}

// ─── The printer ──────────────────────────────────────────────────────────────

/** Whole euros; `|| 0` keeps «-0 €» out. */
function eur(value: number): string {
  return cachedFormatCurrencyEUR(Math.round(value) || 0, true);
}

/** A series column: a whole number with no unit. */
function num(value: number): string {
  return formatNumberIt(Math.round(value) || 0, 0);
}

/** A whole percentage; rounded first so a −0,3% never reads «-0%». */
function pct(value: number): string {
  return formatPercentageIt(Math.round(value) || 0, 0);
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** «e altra 1 fonte» / «e altre 3 fonti». */
function others(n: number, one: string, many: string): string {
  return n === 1 ? `altra 1 ${one}` : `altre ${n} ${many}`;
}

function formatIncome(block: CashflowBlock): string {
  const { income } = block;
  if (income.sources.length === 0 && income.sourcesCut.count === 0) {
    if (income.dividends !== 0) {
      return `Entrate: ${eur(income.total)} in ${CASHFLOW_BLOCK_AGGREGATE_MONTHS} mesi, tutte dividendi e cedole: nessuna fonte oltre a dividendi e cedole.`;
    }
    return 'Entrate: nessuna entrata registrata negli ultimi 12 mesi pieni.';
  }
  const dividends = income.dividends !== 0 ? ` (di cui dividendi e cedole ${eur(income.dividends)}, fuori dalle fonti)` : '';
  const sources = income.sources
    .map((s) => `${s.label} ${eur(s.total)}${s.share !== null ? ` ${pct(s.share)}` : ''} (${s.monthsPresent})`)
    .join(', ');
  const cut = income.sourcesCut.count > 0
    ? `; e ${others(income.sourcesCut.count, 'fonte', 'fonti')}, ${eur(income.sourcesCut.total)}`
    : '';
  let concentration: string;
  if (income.reading === 'nessuna entrata' || income.hhi === null || income.topShare === null) {
    concentration = 'Concentrazione: nessuna fonte con entrate positive.';
  } else {
    const reading = income.reading === 'una fonte dominante'
      ? `una fonte dominante (${pct(income.topShare)})`
      : income.reading;
    concentration = `Concentrazione: ${reading}, HHI ${formatNumberIt(income.hhi, 2)}.`;
  }
  return `Entrate: ${eur(income.total)} in ${CASHFLOW_BLOCK_AGGREGATE_MONTHS} mesi${dividends}. `
    + `Fonti (totale, quota, mesi presenti): ${sources}${cut}. ${concentration}`;
}

function hasUntyped(block: CashflowBlock): boolean {
  return block.spending.untypedRows > 0 || block.series.some((m) => m.unclassified > 0);
}

function formatSpending(block: CashflowBlock): string {
  const { spending } = block;
  if (spending.total === 0 && spending.byCategory.length === 0) {
    return 'Uscite: nessuna uscita registrata negli ultimi 12 mesi pieni.';
  }
  const shareOf = (value: number) => pct(spending.total > 0 ? (value / spending.total) * 100 : 0);
  const types = [
    `${EXPENSE_TYPE_LABELS.fixed} ${eur(spending.byType.necessary)} (${shareOf(spending.byType.necessary)})`,
    `${EXPENSE_TYPE_LABELS.variable} ${eur(spending.byType.nonNecessary)} (${shareOf(spending.byType.nonNecessary)})`,
    `${EXPENSE_TYPE_LABELS.debt} ${eur(spending.byType.debt)} (${shareOf(spending.byType.debt)})`,
  ];
  if (hasUntyped(block)) {
    types.push(`Non classificate ${eur(spending.byType.unclassified)} (${shareOf(spending.byType.unclassified)}, `
      + `${count(spending.untypedRows, 'riga senza tipo', 'righe senza tipo')})`);
  }
  const categories = spending.byCategory
    .map((c) => {
      const subs = c.subCategories.map((s) => `${s.label} ${eur(s.total)}`).join(', ');
      return `${c.label} ${eur(c.total)} (${pct(c.share)}${subs ? `: ${subs}` : ''})`;
    })
    .join('; ');
  const cut = spending.subCategoriesCut.count > 0
    ? `. E ${others(spending.subCategoriesCut.count, 'sottocategoria minore', 'sottocategorie minori')}, `
      + `${eur(spending.subCategoriesCut.total)} in tutto, già nei totali delle categorie`
    : '';
  return `Uscite: ${eur(spending.total)} in ${CASHFLOW_BLOCK_AGGREGATE_MONTHS} mesi — ${types.join(', ')}. `
    + `Per categoria: ${categories}${cut}.`;
}

function formatSavings(block: CashflowBlock): string {
  const { savings } = block;
  const rate = savings.rate === null
    ? ' (tasso —: entrate nulle o negative)'
    : `, il ${pct(savings.rate)} delle entrate`;
  return `Risparmio: ${eur(savings.total)} in ${CASHFLOW_BLOCK_AGGREGATE_MONTHS} mesi${rate}; `
    + 'le rate contano per intero: la quota capitale riduce il debito.';
}

function formatVolatility(block: CashflowBlock): string {
  const { volatility, windows } = block;
  if (volatility === null) {
    return `Mediane: dati insufficienti per le mediane (${count(windows.medianMonths, 'mese pieno con dati', 'mesi pieni con dati')}).`;
  }
  return `Su ${count(windows.medianMonths, 'mese', 'mesi')} (dal ${windows.medianFromYm}): `
    + `spesa mensile mediana ${eur(volatility.spending.median)}, metà dei mesi fra ${eur(volatility.spending.q1)} e ${eur(volatility.spending.q3)}; `
    + `risparmio mensile mediano ${eur(volatility.savings.median)}, metà dei mesi fra ${eur(volatility.savings.q1)} e ${eur(volatility.savings.q3)}.`;
}

function formatCurrentMonth(block: CashflowBlock): string {
  const { currentMonth, windows } = block;
  const scheduled = currentMonth.scheduled.rows > 0
    ? `; più ${count(currentMonth.scheduled.rows, 'riga programmata', 'righe programmate')} fino a fine mese `
      + `(uscite ${eur(currentMonth.scheduled.spending)}, entrate ${eur(currentMonth.scheduled.income)}), `
      + `${currentMonth.scheduled.rows === 1 ? 'non contata' : 'non contate'}`
    : '';
  return `Il mese in corso (${windows.currentYm}, fino al ${windows.todayIso}): entrate ${eur(currentMonth.income)}, `
    + `uscite ${eur(currentMonth.spending)} (${count(currentMonth.rows, 'riga', 'righe')})${scheduled}.`;
}

function formatSeries(block: CashflowBlock): string[] {
  const untyped = hasUntyped(block);
  const columns = ['entrate', EXPENSE_TYPE_LABELS.fixed, EXPENSE_TYPE_LABELS.variable, EXPENSE_TYPE_LABELS.debt,
    ...(untyped ? ['Non classificate'] : []), 'risparmio', 'tasso di risparmio'];
  const lines = [`Serie mensile in euro (${columns.join(' / ')}):`];
  for (const month of block.series) {
    const head = month.state === 'in-progress'
      ? `${month.ym} (in corso, fino al ${block.windows.todayIso})`
      : month.ym;
    if (month.state === 'before-floor') {
      lines.push(`${head}: prima dell'inizio dello storico`);
      continue;
    }
    if (month.rows === 0) {
      lines.push(`${head}: nessuna riga`);
      continue;
    }
    const figures = [num(month.income), num(month.necessary), num(month.nonNecessary), num(month.debt),
      ...(untyped ? [num(month.unclassified)] : []), num(month.savings),
      month.savingsRate === null ? '—' : pct(month.savingsRate)];
    lines.push(`${head}: ${figures.join(' / ')}`);
  }
  return lines;
}

function formatCommitment(c: Commitment): string {
  const cadence = c.kind === 'instalments' ? 'a rate' : c.frequency === 'yearly' ? 'annuale' : 'mensile';
  let text = `${c.label} ${cadence} ${eur(c.amount)}`;
  const notes: string[] = [];
  if (c.change) notes.push(`da ${eur(c.change.from)} a ${eur(c.amount)} dal ${c.change.sinceYm}`);
  if (c.instalment && c.instalment.number === 0 && c.nextIso) {
    text += `, prima rata il ${c.nextIso}`;
  } else {
    if (c.instalment) text += `, rata ${c.instalment.number} di ${c.instalment.total}`;
    notes.push(c.nextIso ? `prossima ${c.nextIso}` : `terminata il ${c.endedYm}`);
  }
  return notes.length > 0 ? `${text} (${notes.join('; ')})` : text;
}

function formatCommitments(block: CashflowBlock): string {
  const { commitments, windows } = block;
  if (commitments.items.length === 0) {
    return `Impegni ricorrenti: nessuna serie né piano a rate dal ${windows.aggregateFromYm}.`;
  }
  const cut = commitments.cut > 0
    ? `; e ${commitments.cut === 1 ? 'altra 1 non elencata' : `altre ${commitments.cut} non elencate`}`
    : '';
  return `Impegni ricorrenti (serie e piani a rate con almeno una riga dal ${windows.aggregateFromYm}): `
    + `${commitments.items.map(formatCommitment).join('; ')}${cut}.`;
}

function formatLoan(loan: LoanLine): string {
  const name = loan.name ?? 'prestito eliminato';
  const payoff = loan.payoff > 0 ? `; estinzioni anticipate ${eur(loan.payoff)}` : '';
  if (loan.monthly === null) {
    const head = loan.nextIso ? `${name}: prima rata il ${loan.nextIso}` : `${name}: nessuna rata nei 12 mesi pieni`;
    return payoff ? `${head} (${payoff.slice(2)})` : head;
  }
  const next = loan.nextIso ? `; prossima ${loan.nextIso}` : '';
  return `${name} ${eur(loan.monthly)}/mese (mediana su ${count(loan.monthlyRows, 'rata', 'rate')}${next}${payoff})`;
}

function formatLoans(block: CashflowBlock): string {
  const { loans } = block;
  const unlinked = loans.unlinked.rows > 0
    ? `. ${count(loans.unlinked.rows, 'rata', 'rate')} senza prestito collegato, ${eur(loans.unlinked.total)}`
    : '';
  if (loans.items.length === 0) return `Rate di prestito: nessuna${unlinked}.`;
  return `Rate di prestito: ${loans.items.map(formatLoan).join('; ')}${unlinked}.`;
}

function formatTransfers(block: CashflowBlock): string {
  const { transfers } = block;
  if (transfers.rows === 0) return 'Trasferimenti fra conti: nessuno.';
  const property = transfers.property.rows > 0
    ? `, di cui ${transfers.property.rows} verso o da immobili, ${eur(transfers.property.moved)}`
    : '';
  return `Trasferimenti fra conti: ${count(transfers.rows, 'riga', 'righe')}, ${eur(transfers.moved)} mossi${property} `
    + '(non contati né fra le entrate né fra le uscite).';
}

function formatAccounts(block: CashflowBlock): string {
  if (block.accounts.length === 0) return 'Conti liquidi: nessun conto registrato.';
  const lines = block.accounts.map((account) => {
    if (account.roles.length === 0) return `${account.name} ${eur(account.balance)}`;
    const roles = account.roles.length === 2
      ? 'addebito e accredito predefiniti'
      : `${account.roles[0]} predefinito`;
    return `${account.name} ${eur(account.balance)} (${roles})`;
  });
  return `Conti liquidi: ${lines.join('; ')}.`;
}

/** The block as the model reads it, whole: every cut says what it left out. */
export function formatCashflowBlockForPrompt(block: CashflowBlock): string {
  const { windows } = block;
  const floorIdx = windows.floorYm ? ymIndex(windows.floorYm) : null;
  const floorInSeries = floorIdx !== null
    && floorIdx > ymIndex(windows.seriesFromYm)
    && floorIdx <= ymIndex(windows.currentYm);
  // The floor is named when it cuts the series OR leaves a row out (2026-11-07): a series that simply
  // opens on it would otherwise read as «the first recorded month».
  const left = windows.beforeFloorRows > 0
    ? `, ${count(windows.beforeFloorRows, 'riga precedente esclusa', 'righe precedenti escluse')}`
    : '';
  const floor = windows.floorYm !== null && (floorInSeries || windows.beforeFloorRows > 0)
    ? `; storico contato dal ${windows.floorYm}${left}`
    : '';
  const header = `--- CASHFLOW 12 MESI (ultimi 12 mesi pieni: ${windows.aggregateFromYm} → ${windows.aggregateToYm}; `
    + `il mese in corso ${windows.currentYm} fino al ${windows.todayIso}, a parte; `
    + `serie mensile: ${windows.seriesFromYm} → ${windows.currentYm}${floor}) ---`;
  return [
    header,
    formatIncome(block),
    formatSpending(block),
    formatSavings(block),
    formatVolatility(block),
    formatCurrentMonth(block),
    ...formatSeries(block),
    formatCommitments(block),
    formatLoans(block),
    formatTransfers(block),
    formatAccounts(block),
  ].join('\n');
}
