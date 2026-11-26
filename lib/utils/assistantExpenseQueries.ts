/**
 * The questions the Assistente may ask about the recorded cashflow, answered by code (2026-11-23).
 *
 * Until then the model read one printed block — categories for twelve months, the series by type,
 * no single row — and was told not to compute. Now it asks for a total, a series, a comparison or
 * the rows behind a figure, and gets numbers it can quote.
 *
 * THE RULES are the cashflow block's (lib/utils/cashflowBlock.ts): a row's day is its ITALIAN day;
 * classification by `type`, never by sign; transfers are neither income nor spending; a spending
 * figure is positive; `excludeFromBudget` rows count unless the query is the Budget's; nothing
 * before the first year of the history the user keeps. A group is an ID, a label is a name
 * (lib/utils/expenseGrouping.ts): two categories of one name are two groups.
 * Pure: no Firebase, no clock — «today» and the floor are a parameter.
 */
import type { Expense } from '@/types/expenses';
import { roundToCents } from '@/lib/utils/cents';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { countsTowardBudget } from '@/lib/utils/budgetUtils';
import { getCategoryKey, getCategoryName, getSubCategoryKey, getSubCategoryLabel, resolveDisplayLabels } from '@/lib/utils/expenseGrouping';

export type QueryKind = 'spending' | 'income';
export type SpendingType = 'fixed' | 'variable' | 'debt';
export type GroupBy = 'category' | 'subcategory' | 'type' | 'month' | 'costCenter';

export interface ExpenseQuery {
  /** Inclusive Italian days, YYYY-MM-DD. */
  fromIso: string;
  toIso: string;
  kind: QueryKind;
  types?: SpendingType[];
  categories?: string[];
  subCategories?: string[];
  costCenters?: string[];
  /** Searched in the notes and in the three names. */
  text?: string;
  minAmount?: number;
  maxAmount?: number;
  /** Only the rows the Budget counts. */
  budgetOnly?: boolean;
  /** Also the rows dated after today. */
  includeScheduled?: boolean;
}

/** What a query is read against. */
export interface QueryClock {
  /** Today's Italian day. */
  todayIso: string;
  /** The first day of the history the user keeps (`${cashflowHistoryStartYear}-01-01`); null when the setting is absent. */
  floorIso: string | null;
}

export function queryClockOf(todayIso: string, cashflowHistoryStartYear: number | undefined): QueryClock {
  return { todayIso, floorIso: cashflowHistoryStartYear ? `${cashflowHistoryStartYear}-01-01` : null };
}

export const GROUPS_CAP = 60;
export const COMPARE_CAP = 40;
export const ROWS_CAP = 100;

export const TYPE_LABELS: Record<Exclude<Expense['type'], 'transfer'>, string> = {
  fixed: 'Spese Necessarie',
  variable: 'Spese Non Necessarie',
  debt: 'Debiti',
  income: 'Entrate',
};

/** Case and accents out: «Sanità» = «sanita». */
export function foldName(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

interface Selected {
  row: Expense;
  day: string;
  value: number;
}

interface Selection {
  selected: Selected[];
  /** Rows that answer every filter and lie before the floor: counted, never summed. */
  beforeFloor: number;
}

function selectRows(expenses: readonly Expense[], query: ExpenseQuery, clock: QueryClock): Selection {
  const categories = query.categories?.map(foldName);
  const subCategories = query.subCategories?.map(foldName);
  const costCenters = query.costCenters?.map(foldName);
  const needle = query.text ? foldName(query.text) : '';
  const selected: Selected[] = [];
  let beforeFloor = 0;
  for (const row of expenses) {
    if (row.type === 'transfer') continue;
    if ((row.type === 'income') !== (query.kind === 'income')) continue;
    const day = getItalyDateIso(row.date);
    if (day < query.fromIso || day > query.toIso) continue;
    if (!query.includeScheduled && day > clock.todayIso) continue;
    if (query.types && query.kind === 'spending' && !query.types.includes(row.type as SpendingType)) continue;
    if (categories && !categories.includes(foldName(row.categoryName))) continue;
    if (subCategories && !(row.subCategoryName && subCategories.includes(foldName(row.subCategoryName)))) continue;
    if (costCenters && !(row.costCenterName && costCenters.includes(foldName(row.costCenterName)))) continue;
    if (query.budgetOnly && !countsTowardBudget(row)) continue;
    const value = row.type === 'income' ? row.amount : Math.abs(row.amount);
    if (query.minAmount !== undefined && Math.abs(value) < query.minAmount) continue;
    if (query.maxAmount !== undefined && Math.abs(value) > query.maxAmount) continue;
    if (needle) {
      const haystack = foldName(`${row.notes ?? ''} ${row.categoryName} ${row.subCategoryName ?? ''} ${row.costCenterName ?? ''}`);
      if (!haystack.includes(needle)) continue;
    }
    if (clock.floorIso && day < clock.floorIso) {
      beforeFloor += 1;
      continue;
    }
    selected.push({ row, day, value });
  }
  return { selected, beforeFloor };
}

/** The first Italian day the account holds a row (transfers aside), never before the floor; null with no row. */
function historyStart(expenses: readonly Expense[], clock: QueryClock): string | null {
  let first: string | null = null;
  for (const row of expenses) {
    if (row.type === 'transfer') continue;
    const day = getItalyDateIso(row.date);
    if (first === null || day < first) first = day;
  }
  if (first === null) return null;
  return clock.floorIso && clock.floorIso > first ? clock.floorIso : first;
}

function monthKeysOf(fromIso: string, toIso: string): string[] {
  const [fromYear, fromMonth] = fromIso.split('-').map(Number);
  const [toYear, toMonth] = toIso.split('-').map(Number);
  const keys: string[] = [];
  for (let index = fromYear * 12 + (fromMonth - 1); index <= toYear * 12 + (toMonth - 1); index++) {
    keys.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`);
  }
  return keys;
}

/** A group before its label is settled: `name` may be shared, `qualifier` tells two namesakes apart. */
interface Bucket {
  key: string;
  name: string;
  qualifier?: string;
  total: number;
  rows: number;
}

function groupOf(selected: Selected, by: GroupBy): Pick<Bucket, 'key' | 'name' | 'qualifier'> {
  const { row, day } = selected;
  const typeLabel = TYPE_LABELS[row.type as keyof typeof TYPE_LABELS];
  if (by === 'month') return { key: day.slice(0, 7), name: day.slice(0, 7) };
  if (by === 'type') return { key: row.type, name: typeLabel };
  if (by === 'category') return { key: getCategoryKey(row), name: getCategoryName(row), qualifier: typeLabel };
  if (by === 'subcategory') {
    return {
      key: `${getCategoryKey(row)}/${getSubCategoryKey(row)}`,
      name: `${getCategoryName(row)} › ${getSubCategoryLabel(row)}`,
      qualifier: typeLabel,
    };
  }
  return row.costCenterId
    ? { key: row.costCenterId, name: row.costCenterName ?? row.costCenterId }
    : { key: '', name: '(nessun centro di costo)' };
}

/** The labels of ONE result: a name two keys share takes its type in parentheses. */
function labelsOf(buckets: Iterable<Bucket>): Map<string, string> {
  return resolveDisplayLabels([...buckets].map(({ key, name, qualifier }) => ({ key, name, qualifier })));
}

export interface GroupRow {
  key: string;
  label: string;
  total: number;
  rows: number;
}

export interface TotalsResult {
  total: number;
  rows: number;
  groups: GroupRow[];
  /** Groups past the cap — the smallest, or the oldest months; their sum is in `total`, not in `groups`. */
  omittedGroups: number;
  /** Rows the history's floor left out of everything above. */
  beforeFloorRows: number;
}

function groupAll(selected: Selected[], by: GroupBy): Map<string, Bucket> {
  const groups = new Map<string, Bucket>();
  for (const item of selected) {
    const { key, name, qualifier } = groupOf(item, by);
    const group = groups.get(key) ?? { key, name, qualifier, total: 0, rows: 0 };
    group.total += item.value;
    group.rows += 1;
    groups.set(key, group);
  }
  return groups;
}

/**
 * The total of a query and its groups. Months in calendar order with the empty ones at zero, from
 * the later of the asked start and the account's first month — a query «from 1970» is not six
 * hundred empty months — and the most recent `GROUPS_CAP` of them; any other grouping largest first.
 */
export function totalsBy(expenses: readonly Expense[], query: ExpenseQuery, by: GroupBy, clock: QueryClock): TotalsResult {
  const { selected, beforeFloor } = selectRows(expenses, query, clock);
  const groups = groupAll(selected, by);
  const total = roundToCents(selected.reduce((sum, item) => sum + item.value, 0));
  if (by === 'month') {
    const lastIso = query.includeScheduled || query.toIso <= clock.todayIso ? query.toIso : clock.todayIso;
    const start = historyStart(expenses, clock);
    const fromIso = start !== null && start > query.fromIso ? start : query.fromIso;
    const months = start === null || lastIso < fromIso ? [] : monthKeysOf(fromIso, lastIso);
    const kept = months.slice(-GROUPS_CAP);
    return {
      total,
      rows: selected.length,
      groups: kept.map((key) => {
        const group = groups.get(key);
        return { key, label: key, total: roundToCents(group?.total ?? 0), rows: group?.rows ?? 0 };
      }),
      omittedGroups: months.length - kept.length,
      beforeFloorRows: beforeFloor,
    };
  }
  const labels = labelsOf(groups.values());
  const sorted = [...groups.values()]
    .map((group) => ({ key: group.key, label: labels.get(group.key) ?? group.name, total: roundToCents(group.total), rows: group.rows }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.label.localeCompare(b.label, 'it'));
  return {
    total,
    rows: selected.length,
    groups: sorted.slice(0, GROUPS_CAP),
    omittedGroups: Math.max(0, sorted.length - GROUPS_CAP),
    beforeFloorRows: beforeFloor,
  };
}

export interface CompareRow {
  label: string;
  a: number;
  b: number;
  /** b − a. */
  delta: number;
  /** Null when `a` is zero. */
  deltaPct: number | null;
}

export interface CompareResult {
  totalA: number;
  totalB: number;
  delta: number;
  deltaPct: number | null;
  rows: CompareRow[];
  omittedRows: number;
  /** Rows the history's floor left out, both periods together. */
  beforeFloorRows: number;
}

function pct(a: number, b: number): number | null {
  return a === 0 ? null : Math.round(((b - a) / Math.abs(a)) * 1000) / 10;
}

/** Period B against period A under the same filters, group by group, the largest move first. */
export function comparePeriods(
  expenses: readonly Expense[],
  filters: Omit<ExpenseQuery, 'fromIso' | 'toIso'>,
  periodA: { fromIso: string; toIso: string },
  periodB: { fromIso: string; toIso: string },
  by: Exclude<GroupBy, 'month'>,
  clock: QueryClock,
): CompareResult {
  const { selected: selectedA, beforeFloor: beforeFloorA } = selectRows(expenses, { ...filters, ...periodA }, clock);
  const { selected: selectedB, beforeFloor: beforeFloorB } = selectRows(expenses, { ...filters, ...periodB }, clock);
  const groupsA = groupAll(selectedA, by);
  const groupsB = groupAll(selectedB, by);
  const keys = [...new Set([...groupsA.keys(), ...groupsB.keys()])];
  // One surface, one set of labels: B's name wins for a group both periods hold.
  const labels = labelsOf(keys.map((key) => (groupsB.get(key) ?? groupsA.get(key))!));
  const rows: CompareRow[] = keys.map((key) => {
    const a = roundToCents(groupsA.get(key)?.total ?? 0);
    const b = roundToCents(groupsB.get(key)?.total ?? 0);
    return { label: labels.get(key)!, a, b, delta: roundToCents(b - a), deltaPct: pct(a, b) };
  });
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.label.localeCompare(y.label, 'it'));
  const totalA = roundToCents(selectedA.reduce((sum, item) => sum + item.value, 0));
  const totalB = roundToCents(selectedB.reduce((sum, item) => sum + item.value, 0));
  return {
    totalA,
    totalB,
    delta: roundToCents(totalB - totalA),
    deltaPct: pct(totalA, totalB),
    rows: rows.slice(0, COMPARE_CAP),
    omittedRows: Math.max(0, rows.length - COMPARE_CAP),
    beforeFloorRows: beforeFloorA + beforeFloorB,
  };
}

export interface RowLine {
  date: string;
  type: string;
  category: string;
  subCategory: string | null;
  amount: number;
  notes: string | null;
  costCenter: string | null;
  recurring: boolean;
}

export interface RowsResult {
  /** Of ALL the matching rows, shown or not. */
  total: number;
  rows: number;
  shown: RowLine[];
  omitted: number;
  /** Rows the history's floor left out. */
  beforeFloorRows: number;
}

/** The rows behind a figure, at most `ROWS_CAP`, with the count and the total of all of them. */
export function listRows(
  expenses: readonly Expense[],
  query: ExpenseQuery,
  order: 'date-desc' | 'date-asc' | 'amount-desc',
  limit: number,
  clock: QueryClock,
  /** The ceiling on what is shown: the tools use the default, the spending-review email a higher one. */
  maxRows: number = ROWS_CAP,
): RowsResult {
  const { selected, beforeFloor } = selectRows(expenses, query, clock);
  selected.sort((a, b) =>
    order === 'amount-desc'
      ? Math.abs(b.value) - Math.abs(a.value) || b.day.localeCompare(a.day)
      : order === 'date-asc'
        ? a.day.localeCompare(b.day)
        : b.day.localeCompare(a.day),
  );
  const cap = Math.min(Math.max(1, Math.floor(limit)), maxRows);
  return {
    total: roundToCents(selected.reduce((sum, item) => sum + item.value, 0)),
    rows: selected.length,
    shown: selected.slice(0, cap).map(({ row, day, value }) => ({
      date: day,
      type: TYPE_LABELS[row.type as keyof typeof TYPE_LABELS],
      category: getCategoryName(row),
      subCategory: row.subCategoryName ?? null,
      amount: roundToCents(value),
      notes: row.notes?.slice(0, 160) ?? null,
      costCenter: row.costCenterName ?? null,
      recurring: row.isRecurring === true || Boolean(row.installmentParentId),
    })),
    omitted: Math.max(0, selected.length - cap),
    beforeFloorRows: beforeFloor,
  };
}

/**
 * The names a filter does not find in `existing` — the caller passes the taxonomy's names AND the
 * ones written on the recorded rows: a deleted category still filters the rows that carry its name.
 */
export function unknownNames(asked: string[] | undefined, existing: readonly string[]): string[] {
  if (!asked) return [];
  const known = new Set(existing.map(foldName));
  return asked.filter((name) => !known.has(foldName(name)));
}
