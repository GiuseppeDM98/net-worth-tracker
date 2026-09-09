/**
 * Hall of Fame's numbers: what a tile of that page shows, derived from the rankings the
 * document already holds.
 *
 * The page does NOT re-derive a record. The definition of a record lives in one place —
 * `lib/utils/hallOfFameRecords.ts`, the same module the periodic email uses — and is written
 * into `hall-of-fame/{userId}` by `updateHallOfFame`. This module reads those stored slices and
 * turns them into boards: the rows in the order they were ranked, the top, and where the period
 * the reader is living in sits inside each one.
 *
 * Clock-free on purpose: "today" is passed in (`HallOfFameToday`), so a test pins a month
 * instead of racing the calendar, and the Italian wall clock stays the page's business.
 *
 * A ranking the document does not carry is `null`, never an empty board: a document written
 * before the savings ranking existed has no savings record, which is a different statement
 * from "no month ever saved anything" (The Narrative Honesty Rule).
 *
 * The words live in `hallOfFameNarrative.ts`.
 */

import { SECTION_LABELS } from '@/lib/constants/hallOfFame';
import { MONTH_NAMES } from '@/lib/constants/months';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { periodSavings } from '@/lib/utils/hallOfFameRecords';
import type {
  HallOfFameData,
  HallOfFameNote,
  HallOfFameSectionKey,
  HallOfFameStats,
  MonthlyRecord,
  YearlyRecord,
} from '@/types/hall-of-fame';

/** How many record months the timeline chart draws. */
export const TIMELINE_LIMIT = 12;

export type RecordPeriod = 'monthly' | 'annual';
export type RecordCategory = 'growth' | 'decline' | 'income' | 'expenses' | 'savings';
export type BoardKey = `${RecordPeriod}:${RecordCategory}`;

/** The period the page is being read in — an Italian calendar month. */
export interface HallOfFameToday {
  year: number;
  /** 1-12 */
  month: number;
}

/** One position of a ranking, ready to be printed. */
export interface RecordEntry {
  /** "2025-10" for a month, "2024" for a year. */
  key: string;
  year: number;
  /** 1-12; absent on a yearly record. */
  month?: number;
  /** The row form: "ott 2025" / "2024". */
  label: string;
  /** The sentence form: "ottobre 2025" / "2024". */
  longLabel: string;
  /** The ranked quantity: the net-worth change, the income, the cost, or what was kept. */
  value: number;
  /** The figure printed beside the value — a net-worth variation or a savings rate; null when not knowable. */
  percentage: number | null;
  /** The income a savings record was measured on; null on every other category. */
  income: number | null;
  /**
   * The net worth the variation was measured against — the month before, or the start of the
   * year. Null on every ranking that is not a net-worth change, and on a record with no
   * baseline: the Dettaglio prints it rather than dividing the value by its own percentage.
   */
  base: number | null;
  /** True when this row IS the period the reader is living in. */
  isCurrent: boolean;
}

/** One ranking, plus where the running period sits in it. */
export interface RecordBoard {
  period: RecordPeriod;
  category: RecordCategory;
  /** The key a note is filed under for this ranking. */
  sectionKey: HallOfFameSectionKey;
  rows: RecordEntry[];
  top: RecordEntry | null;
  runnerUp: RecordEntry | null;
  /** The running period's row, when the ranking holds one. */
  current: RecordEntry | null;
  /** Its 1-based position; null when the running period is not ranked. */
  currentRank: number | null;
  total: number;
}

/** One bar of the record timeline. */
export interface TimelinePoint {
  key: string;
  /** The axis label: the short month alone ("ago"). */
  label: string;
  /** What the hover and the accessible name say ("agosto 2026"). */
  caption: string;
  value: number;
  isCurrent: boolean;
}

/** One note, with the rankings it belongs to already named. */
export interface NoteEntry {
  id: string;
  /** The period the note is filed under: "2026-01" for a month, "2024" for a year. */
  key: string;
  year: number;
  month?: number;
  label: string;
  longLabel: string;
  sectionLabels: string[];
  text: string;
}

export interface NotesSummary {
  /** How many notes exist. */
  total: number;
  /** How many distinct periods carry at least one. */
  periodCount: number;
  /** The note on the most recent period. */
  latest: NoteEntry | null;
  /** Newest period first. */
  rows: NoteEntry[];
}

export interface HallOfFameSummary {
  /** False when there is nothing to rank at all. */
  hasRecords: boolean;
  stats: HallOfFameStats | null;
  /** Every ranking the document carries; one it does not is absent, never an empty board. */
  boards: Partial<Record<BoardKey, RecordBoard>>;
  /** The three best growth months added up; null below three. */
  topThreeGrowth: number | null;
  notes: NotesSummary;
}

/** Which stored field, and which note section, each (period, category) pair addresses. */
const SECTION_BY_BOARD: Record<BoardKey, HallOfFameSectionKey> = {
  'monthly:growth': 'bestMonthsByNetWorthGrowth',
  'monthly:decline': 'worstMonthsByNetWorthDecline',
  'monthly:income': 'bestMonthsByIncome',
  'monthly:expenses': 'worstMonthsByExpenses',
  'monthly:savings': 'bestMonthsBySavings',
  'annual:growth': 'bestYearsByNetWorthGrowth',
  'annual:decline': 'worstYearsByNetWorthDecline',
  'annual:income': 'bestYearsByIncome',
  'annual:expenses': 'worstYearsByExpenses',
  'annual:savings': 'bestYearsBySavings',
};

/** The note section a ranking files its notes under. */
export function sectionKeyFor(period: RecordPeriod, category: RecordCategory): HallOfFameSectionKey {
  return SECTION_BY_BOARD[`${period}:${category}`];
}

function monthLabels(year: number, month: number): { key: string; label: string; longLabel: string } {
  return {
    key: `${year}-${String(month).padStart(2, '0')}`,
    label: `${MONTH_NAMES_SHORT[month - 1].toLowerCase()} ${year}`,
    longLabel: `${MONTH_NAMES[month - 1].toLowerCase()} ${year}`,
  };
}

function yearLabels(year: number): { key: string; label: string; longLabel: string } {
  return { key: `${year}`, label: `${year}`, longLabel: `${year}` };
}

/** A share is a share only with a denominator: a base of zero yields null, never a 0%. */
function shareOf(value: number, base: number): number | null {
  return base > 0 ? (value / base) * 100 : null;
}

function toMonthEntry(record: MonthlyRecord, category: RecordCategory, today: HallOfFameToday): RecordEntry {
  const labels = monthLabels(record.year, record.month);
  const isCurrent = record.year === today.year && record.month === today.month;
  return { ...labels, year: record.year, month: record.month, isCurrent, ...valueOf(record, category, record.previousNetWorth) };
}

function toYearEntry(record: YearlyRecord, category: RecordCategory, today: HallOfFameToday): RecordEntry {
  const labels = yearLabels(record.year);
  const isCurrent = record.year === today.year;
  return { ...labels, year: record.year, isCurrent, ...valueOf(record, category, record.startOfYearNetWorth) };
}

/**
 * What a category ranks, and what it prints beside it.
 *
 * A cost is carried POSITIVE: an expense record is the size of a cost, not a loss, and the sign
 * tokens mean gain and loss and nothing else (AGENTS.md → Layout and Color Tokens).
 */
function valueOf(
  record: { netWorthDiff: number; totalIncome: number; totalExpenses: number },
  category: RecordCategory,
  netWorthBase: number,
): Pick<RecordEntry, 'value' | 'percentage' | 'income' | 'base'> {
  switch (category) {
    case 'growth':
    case 'decline':
      return {
        value: record.netWorthDiff,
        percentage: shareOf(record.netWorthDiff, netWorthBase),
        income: null,
        base: netWorthBase > 0 ? netWorthBase : null,
      };
    case 'income':
      return { value: record.totalIncome, percentage: null, income: null, base: null };
    case 'expenses':
      return { value: record.totalExpenses, percentage: null, income: null, base: null };
    case 'savings': {
      const saved = periodSavings(record);
      return { value: saved, percentage: shareOf(saved, record.totalIncome), income: record.totalIncome, base: null };
    }
  }
}

function buildBoard(rows: RecordEntry[], period: RecordPeriod, category: RecordCategory): RecordBoard {
  const currentIndex = rows.findIndex((row) => row.isCurrent);
  return {
    period,
    category,
    sectionKey: sectionKeyFor(period, category),
    rows,
    top: rows[0] ?? null,
    runnerUp: rows[1] ?? null,
    current: currentIndex >= 0 ? rows[currentIndex] : null,
    currentRank: currentIndex >= 0 ? currentIndex + 1 : null,
    total: rows.length,
  };
}

/**
 * Every board the page can show, from the stored document.
 *
 * @param data  The stored rankings; null for a user who has none yet.
 * @param today The Italian calendar month the page is read in.
 */
export function summarizeHallOfFame(data: HallOfFameData | null, today: HallOfFameToday): HallOfFameSummary {
  const notes = summarizeNotes(data?.notes ?? []);

  if (!data) {
    return { hasRecords: false, stats: null, boards: {}, topThreeGrowth: null, notes };
  }

  const boards: Partial<Record<BoardKey, RecordBoard>> = {};

  const monthly: Array<[RecordCategory, MonthlyRecord[] | undefined]> = [
    ['growth', data.bestMonthsByNetWorthGrowth],
    ['decline', data.worstMonthsByNetWorthDecline],
    ['income', data.bestMonthsByIncome],
    ['expenses', data.worstMonthsByExpenses],
    ['savings', data.bestMonthsBySavings],
  ];
  for (const [category, records] of monthly) {
    if (!records) continue;
    boards[`monthly:${category}`] = buildBoard(
      records.map((record) => toMonthEntry(record, category, today)),
      'monthly',
      category,
    );
  }

  const annual: Array<[RecordCategory, YearlyRecord[] | undefined]> = [
    ['growth', data.bestYearsByNetWorthGrowth],
    ['decline', data.worstYearsByNetWorthDecline],
    ['income', data.bestYearsByIncome],
    ['expenses', data.worstYearsByExpenses],
    ['savings', data.bestYearsBySavings],
  ];
  for (const [category, records] of annual) {
    if (!records) continue;
    boards[`annual:${category}`] = buildBoard(
      records.map((record) => toYearEntry(record, category, today)),
      'annual',
      category,
    );
  }

  const growthRows = boards['monthly:growth']?.rows ?? [];
  const topThreeGrowth =
    growthRows.length >= 3 ? growthRows.slice(0, 3).reduce((sum, row) => sum + row.value, 0) : null;

  const hasRecords = Object.values(boards).some((board) => board.total > 0);

  return { hasRecords, stats: data.stats ?? null, boards, topThreeGrowth, notes };
}

/** One ranking, or null when the document does not carry it. */
export function getBoard(
  summary: HallOfFameSummary,
  period: RecordPeriod,
  category: RecordCategory,
): RecordBoard | null {
  return summary.boards[`${period}:${category}`] ?? null;
}

/**
 * The record months back in chronological order — the chart answers «WHEN did the records
 * happen?», which the podium above it does not: a podium ranks, it does not date.
 *
 * Beyond the limit the SMALLEST records are dropped, never the oldest: the chart is about the
 * biggest months, and cutting by date would silently turn it into a recent-months chart.
 */
export function buildRecordTimeline(rows: RecordEntry[], limit = TIMELINE_LIMIT): TimelinePoint[] {
  return [...rows]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, limit)
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : (a.month ?? 0) - (b.month ?? 0)))
    .map((row) => ({
      key: row.key,
      label: row.month ? MONTH_NAMES_SHORT[row.month - 1].toLowerCase() : row.label,
      caption: row.longLabel,
      value: row.value,
      isCurrent: row.isCurrent,
    }));
}

/**
 * The notes, newest period first.
 *
 * "Most recent" is the most recent PERIOD annotated, not the last one written: the stored note
 * timestamps are Firestore values the page never normalises, and the period is what the reader
 * is looking at anyway.
 */
export function summarizeNotes(notes: HallOfFameNote[]): NotesSummary {
  const rows: NoteEntry[] = notes
    .map((note) => {
      const labels = note.month ? monthLabels(note.year, note.month) : yearLabels(note.year);
      return {
        id: note.id,
        year: note.year,
        month: note.month,
        ...labels,
        sectionLabels: note.sections.map((section) => SECTION_LABELS[section]).filter(Boolean),
        text: note.text,
      };
    })
    .sort((a, b) => (a.year !== b.year ? b.year - a.year : (b.month ?? 0) - (a.month ?? 0)));

  const periods = new Set(rows.map((row) => row.key));

  return { total: rows.length, periodCount: periods.size, latest: rows[0] ?? null, rows };
}

/** How many rows of a ranking carry at least one note. */
export function countNotedRows(board: RecordBoard | null, notes: HallOfFameNote[]): number {
  if (!board) return 0;
  return board.rows.filter((row) =>
    notes.some(
      (note) => note.year === row.year && note.month === row.month && note.sections.includes(board.sectionKey),
    ),
  ).length;
}
