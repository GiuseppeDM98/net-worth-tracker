/**
 * Linking many expenses to a cost center at once — the pure half («Collega spese…», 2026-09-18).
 *
 * A center is filled from the expense form, one row at a time; a center created AFTER its
 * expenses (the owner's car: created in April, first expense in January, 41 rows) meant 41
 * trips through that form. This module turns the account's expenses into CANDIDATES for one
 * center, filters them, summarises a selection in the words' raw material, and plans the
 * write together with its undo. No React, no Firestore.
 *
 * Three rules it owns:
 * - A candidate is SPENDING: by `type` first (incomes and transfers are never offered — a
 *   center measures a cost), and with an outgoing amount, the way a center reads its rows.
 * - A recurring series or an instalment plan is ONE candidate that stands for every
 *   occurrence still to be linked, the future ones included. A center reads its future from
 *   the calendar (costCenterSummary.ts, header): linking only the rows already paid would
 *   leave «con il calendario chiude a …» blind to the rest of the plan.
 * - An expense has ONE center. Linking a row that belongs to another center MOVES it, so
 *   those rows are hidden unless asked for, and a selection always says what it moves.
 */

import type { Expense } from '@/types/expenses';
import { getCategoryKey } from '@/lib/utils/expenseGrouping';
import { getItalyYear, isItalyDayAfter, toDate } from '@/lib/utils/dateHelpers';

// ─── Candidates ───────────────────────────────────────────────────────────────

export type LinkSeriesKind = 'recurring' | 'installment';

export interface LinkCandidate {
  /** The expense id, or `series:<parentId>` — stable across filters, so a selection survives them. */
  key: string;
  /** Every row a tick links: one for a plain expense, the occurrences not yet on the target for a series. */
  rows: Expense[];
  /** A plain row's date; for a series the latest occurrence already booked, else the first to come. */
  date: Date;
  categoryKey: string;
  categoryName: string;
  subCategoryName: string | null;
  notes: string | null;
  /** Positive: the cost the tick adds to the center. */
  total: number;
  series: { kind: LinkSeriesKind; count: number; scheduledCount: number } | null;
  /** The OTHER centers these rows leave, with how many rows each loses; empty when none has a center. */
  leaves: Array<{ centerId: string; centerName: string; count: number }>;
  years: number[];
}

/**
 * Spending by TYPE — and an outgoing amount, because that is how a center reads its own rows
 * (CostCentersTab / CostCenterDetail keep `amount < 0`). A refund is spending by type but a
 * positive amount: offered here, it would be linked and then appear nowhere on the page.
 */
const isSpending = (expense: Expense) => expense.type !== 'income' && expense.type !== 'transfer' && expense.amount < 0;
const cost = (expense: Expense) => Math.abs(expense.amount);

/** The series a row belongs to: every occurrence carries the same parent id. */
export function seriesKeyOf(expense: Expense): { kind: LinkSeriesKind; parentId: string } | null {
  if (expense.isInstallment && expense.installmentParentId) return { kind: 'installment', parentId: expense.installmentParentId };
  if (expense.isRecurring && expense.recurringParentId) return { kind: 'recurring', parentId: expense.recurringParentId };
  return null;
}

function leavesOf(rows: Expense[]): LinkCandidate['leaves'] {
  const byCenter = new Map<string, { centerName: string; count: number }>();
  for (const row of rows) {
    if (!row.costCenterId) continue;
    const entry = byCenter.get(row.costCenterId) ?? { centerName: row.costCenterName ?? 'un altro centro', count: 0 };
    entry.count += 1;
    byCenter.set(row.costCenterId, entry);
  }
  return [...byCenter.entries()].map(([centerId, entry]) => ({ centerId, ...entry }));
}

function toCandidate(key: string, rows: Expense[], series: LinkCandidate['series'], now: Date): LinkCandidate {
  const sorted = [...rows].sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
  const booked = sorted.filter((row) => !isItalyDayAfter(toDate(row.date), now));
  // The row a reader recognises the series by: the last one paid, or the first one due.
  const face = booked.length > 0 ? booked[booked.length - 1] : sorted[0];
  return {
    key,
    rows: sorted,
    date: toDate(face.date),
    categoryKey: getCategoryKey(face),
    categoryName: face.categoryName,
    subCategoryName: face.subCategoryName ?? null,
    notes: face.notes?.trim() || null,
    total: sorted.reduce((sum, row) => sum + cost(row), 0),
    series,
    leaves: leavesOf(sorted),
    years: [...new Set(sorted.map((row) => getItalyYear(toDate(row.date))))].sort((a, b) => b - a),
  };
}

/**
 * Every expense of the account a tick could link to `targetCenterId`, newest first.
 * Rows already on the target are not candidates; a series whose every occurrence is already
 * there disappears, one partly linked stands for what is left.
 */
export function buildLinkCandidates(expenses: ReadonlyArray<Expense>, targetCenterId: string, now: Date): LinkCandidate[] {
  const plain: LinkCandidate[] = [];
  const bySeries = new Map<string, { kind: LinkSeriesKind; all: Expense[] }>();

  for (const expense of expenses) {
    if (!isSpending(expense)) continue;
    const series = seriesKeyOf(expense);
    if (!series) {
      if (expense.costCenterId !== targetCenterId) plain.push(toCandidate(expense.id, [expense], null, now));
      continue;
    }
    const entry = bySeries.get(series.parentId) ?? { kind: series.kind, all: [] };
    entry.all.push(expense);
    bySeries.set(series.parentId, entry);
  }

  const grouped: LinkCandidate[] = [];
  for (const [parentId, { kind, all }] of bySeries) {
    const pending = all.filter((row) => row.costCenterId !== targetCenterId);
    if (pending.length === 0) continue;
    const scheduledCount = pending.filter((row) => isItalyDayAfter(toDate(row.date), now)).length;
    grouped.push(toCandidate(`series:${parentId}`, pending, { kind, count: pending.length, scheduledCount }, now));
  }

  return [...plain, ...grouped].sort((a, b) => b.date.getTime() - a.date.getTime());
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface LinkFilters {
  /** Free text over notes, category and subcategory; blank = no text filter. */
  query: string;
  /** A `getCategoryKey` value, or null for every category. */
  categoryKey: string | null;
  year: number | null;
  /** Off by default: rows of ANOTHER center are only shown when asked for. */
  includeOtherCenters: boolean;
}

export const DEFAULT_LINK_FILTERS: LinkFilters = { query: '', categoryKey: null, year: null, includeOtherCenters: false };

const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function filterLinkCandidates(candidates: ReadonlyArray<LinkCandidate>, filters: LinkFilters): LinkCandidate[] {
  const needle = fold(filters.query.trim());
  return candidates.filter((candidate) => {
    if (!filters.includeOtherCenters && candidate.leaves.length > 0) return false;
    if (filters.categoryKey !== null && candidate.categoryKey !== filters.categoryKey) return false;
    if (filters.year !== null && !candidate.years.includes(filters.year)) return false;
    if (!needle) return true;
    return fold(`${candidate.categoryName} ${candidate.subCategoryName ?? ''} ${candidate.notes ?? ''}`).includes(needle);
  });
}

export interface LinkCategoryOption {
  key: string;
  label: string;
}

/** The categories the candidates hold, A→Z. Two keys under one name (a «Casa» fixed and one variable) both appear. */
export function listLinkCategories(candidates: ReadonlyArray<LinkCandidate>): LinkCategoryOption[] {
  const byKey = new Map<string, string>();
  for (const candidate of candidates) if (!byKey.has(candidate.categoryKey)) byKey.set(candidate.categoryKey, candidate.categoryName);
  return [...byKey.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, 'it'));
}

export function listLinkYears(candidates: ReadonlyArray<LinkCandidate>): number[] {
  return [...new Set(candidates.flatMap((candidate) => candidate.years))].sort((a, b) => b - a);
}

// ─── A selection ──────────────────────────────────────────────────────────────

export interface LinkSelectionSummary {
  /** Expense rows the confirm writes — a ticked series counts every occurrence. */
  rowCount: number;
  total: number;
  /** What the selection takes away from other centers, largest first. */
  moves: Array<{ centerId: string; centerName: string; count: number }>;
}

export function summarizeLinkSelection(candidates: ReadonlyArray<LinkCandidate>, selectedKeys: ReadonlySet<string>): LinkSelectionSummary {
  const moves = new Map<string, { centerName: string; count: number }>();
  let rowCount = 0;
  let total = 0;
  for (const candidate of candidates) {
    if (!selectedKeys.has(candidate.key)) continue;
    rowCount += candidate.rows.length;
    total += candidate.total;
    for (const leave of candidate.leaves) {
      const entry = moves.get(leave.centerId) ?? { centerName: leave.centerName, count: 0 };
      entry.count += leave.count;
      moves.set(leave.centerId, entry);
    }
  }
  return {
    rowCount,
    total,
    moves: [...moves.entries()].map(([centerId, entry]) => ({ centerId, ...entry })).sort((a, b) => b.count - a.count),
  };
}

// ─── The write, and its undo ──────────────────────────────────────────────────

/** One expense's center fields as they must be written: both, always — the name is denormalised on the row. */
export interface CenterAssignment {
  expenseId: string;
  costCenterId: string | null;
  costCenterName: string | null;
}

export interface LinkPlan {
  writes: CenterAssignment[];
  /** Each row exactly as it was — its previous center included — so «Annulla» is a second write, not a guess. */
  undo: CenterAssignment[];
}

const previousAssignment = (row: Expense): CenterAssignment => ({
  expenseId: row.id,
  costCenterId: row.costCenterId ?? null,
  costCenterName: row.costCenterName ?? null,
});

export function buildLinkPlan(
  candidates: ReadonlyArray<LinkCandidate>,
  selectedKeys: ReadonlySet<string>,
  target: { id: string; name: string },
): LinkPlan {
  const rows = candidates.filter((candidate) => selectedKeys.has(candidate.key)).flatMap((candidate) => candidate.rows);
  return {
    writes: rows.map((row) => ({ expenseId: row.id, costCenterId: target.id, costCenterName: target.name })),
    undo: rows.map(previousAssignment),
  };
}

/** Taking rows OUT of a center: the same two-sided plan, towards «no center». */
export function buildUnlinkPlan(rows: ReadonlyArray<Expense>): LinkPlan {
  return {
    writes: rows.map((row) => ({ expenseId: row.id, costCenterId: null, costCenterName: null })),
    undo: rows.map(previousAssignment),
  };
}

/** The occurrences of `row`'s series among a center's rows — what «tutta la serie» unlinks. */
export function seriesRowsOf(row: Expense, centerRows: ReadonlyArray<Expense>): Expense[] {
  const series = seriesKeyOf(row);
  if (!series) return [row];
  return centerRows.filter((other) => seriesKeyOf(other)?.parentId === series.parentId);
}
