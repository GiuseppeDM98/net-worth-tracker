/**
 * Tests for lib/utils/hallOfFameSummary.ts — the numbers of the Hall of Fame page.
 *
 * The module never re-derives a record: it reads the rankings the shared definition already
 * stored (lib/utils/hallOfFameRecords.ts, the same one the periodic email uses) and turns them
 * into what a tile shows — the board, where the running period sits in it, the chronological
 * timeline of the record months, and the notes. It is clock-free: "today" is passed in.
 */

import { describe, expect, it, vi } from 'vitest';

// `hallOfFameSummary` reaches the shared record definition, which reaches expenseService's
// pure aggregates — and with them the client Firebase chain. Mocked away, as in the sibling tests.
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

import {
  buildRecordTimeline,
  getBoard,
  summarizeHallOfFame,
  summarizeNotes,
  TIMELINE_LIMIT,
} from '@/lib/utils/hallOfFameSummary';
import type { HallOfFameData, HallOfFameNote, MonthlyRecord, YearlyRecord } from '@/types/hall-of-fame';

const TODAY = { year: 2026, month: 8 };

function monthRecord(
  year: number,
  month: number,
  netWorthDiff: number,
  previousNetWorth: number,
  totalIncome = 0,
  totalExpenses = 0,
): MonthlyRecord {
  return {
    year,
    month,
    monthYear: `${String(month).padStart(2, '0')}/${year}`,
    netWorthDiff,
    previousNetWorth,
    totalIncome,
    totalExpenses,
  };
}

function yearRecord(
  year: number,
  netWorthDiff: number,
  startOfYearNetWorth: number,
  totalIncome = 0,
  totalExpenses = 0,
): YearlyRecord {
  return { year, netWorthDiff, startOfYearNetWorth, totalIncome, totalExpenses };
}

const GROWTH_MONTHS: MonthlyRecord[] = [
  monthRecord(2025, 10, 8240, 201_220),
  monthRecord(2026, 1, 7910, 219_720),
  monthRecord(2026, 8, 6480, 240_010),
  monthRecord(2024, 3, 6310, 131_480),
];

const DECLINE_MONTHS: MonthlyRecord[] = [monthRecord(2025, 3, -8420, 215_900)];

const INCOME_MONTHS: MonthlyRecord[] = [
  monthRecord(2025, 12, 0, 0, 6940, 3100),
  monthRecord(2026, 7, 0, 0, 5780, 2900),
];

const SAVING_MONTHS: MonthlyRecord[] = [
  monthRecord(2026, 3, 0, 0, 5300, 2120),
  monthRecord(2025, 9, 0, 0, 5100, 2690),
];

const GROWTH_YEARS: YearlyRecord[] = [
  yearRecord(2024, 48_900, 156_700),
  yearRecord(2026, 41_300, 212_900),
  yearRecord(2025, 37_150, 171_900),
];

function makeData(overrides: Partial<HallOfFameData> = {}): HallOfFameData {
  return {
    userId: 'u1',
    notes: [],
    bestMonthsByNetWorthGrowth: GROWTH_MONTHS,
    bestMonthsByIncome: INCOME_MONTHS,
    worstMonthsByNetWorthDecline: DECLINE_MONTHS,
    worstMonthsByExpenses: [monthRecord(2025, 12, 0, 0, 6940, 4910)],
    bestMonthsBySavings: SAVING_MONTHS,
    bestYearsByNetWorthGrowth: GROWTH_YEARS,
    bestYearsByIncome: [yearRecord(2026, 0, 0, 44_100, 21_000)],
    worstYearsByNetWorthDecline: [],
    worstYearsByExpenses: [yearRecord(2025, 0, 0, 41_000, 26_400)],
    bestYearsBySavings: [yearRecord(2026, 0, 0, 44_100, 21_000)],
    stats: {
      monthCount: 46,
      yearCount: 5,
      averageMonthlyIncome: 4280,
      averageMonthlyExpenses: 2610,
      firstMonth: { year: 2022, month: 11 },
      lastMonth: { year: 2026, month: 8 },
    },
    updatedAt: new Date('2026-08-25T12:00:00Z'),
    ...overrides,
  };
}

describe('summarizeHallOfFame', () => {
  it('reports no records for a user who has none', () => {
    const summary = summarizeHallOfFame(null, TODAY);

    expect(summary.hasRecords).toBe(false);
    expect(summary.stats).toBeNull();
    expect(getBoard(summary, 'monthly', 'growth')).toBeNull();
  });

  it('keeps the stored order of a ranking and names its top', () => {
    const board = getBoard(summarizeHallOfFame(makeData(), TODAY), 'monthly', 'growth');

    expect(board?.rows.map((row) => row.key)).toEqual(['2025-10', '2026-01', '2026-08', '2024-03']);
    expect(board?.top?.longLabel).toBe('ottobre 2025');
    expect(board?.top?.label).toBe('ott 2025');
    expect(board?.top?.value).toBe(8240);
    expect(board?.runnerUp?.longLabel).toBe('gennaio 2026');
    expect(board?.total).toBe(4);
  });

  it('locates the running month inside the ranking it appears in', () => {
    const board = getBoard(summarizeHallOfFame(makeData(), TODAY), 'monthly', 'growth');

    expect(board?.currentRank).toBe(3);
    expect(board?.current?.longLabel).toBe('agosto 2026');
    expect(board?.rows.filter((row) => row.isCurrent)).toHaveLength(1);
  });

  it('leaves the running month unranked when it is not in the ranking', () => {
    const board = getBoard(summarizeHallOfFame(makeData(), TODAY), 'monthly', 'decline');

    expect(board?.currentRank).toBeNull();
    expect(board?.current).toBeNull();
  });

  it('derives a month percentage from the previous net worth, and drops it without one', () => {
    const summary = summarizeHallOfFame(
      makeData({ bestMonthsByNetWorthGrowth: [monthRecord(2025, 10, 8240, 201_220), monthRecord(2023, 1, 400, 0)] }),
      TODAY,
    );
    const rows = getBoard(summary, 'monthly', 'growth')!.rows;

    expect(rows[0].percentage).toBeCloseTo(4.095, 3);
    expect(rows[0].base).toBe(201_220);
    expect(rows[1].percentage).toBeNull();
    expect(rows[1].base).toBeNull();
  });

  it('derives a year percentage from the net worth at the start of the year', () => {
    const board = getBoard(summarizeHallOfFame(makeData(), TODAY), 'annual', 'growth');

    expect(board?.rows[0].label).toBe('2024');
    expect(board?.rows[0].longLabel).toBe('2024');
    expect(board?.rows[0].percentage).toBeCloseTo(31.206, 3);
    expect(board?.currentRank).toBe(2);
  });

  it('measures a savings record as income minus expenses, with the rate as its percentage', () => {
    const board = getBoard(summarizeHallOfFame(makeData(), TODAY), 'monthly', 'savings');

    expect(board?.top?.value).toBe(3180);
    expect(board?.top?.percentage).toBeCloseTo(60, 6);
    expect(board?.top?.income).toBe(5300);
  });

  it('returns no savings board for a document written before the ranking existed', () => {
    const data = makeData();
    delete data.bestMonthsBySavings;
    delete data.bestYearsBySavings;

    const summary = summarizeHallOfFame(data, TODAY);

    expect(getBoard(summary, 'monthly', 'savings')).toBeNull();
    expect(getBoard(summary, 'annual', 'savings')).toBeNull();
    expect(summary.hasRecords).toBe(true);
  });

  it('carries an expense record as a positive cost', () => {
    const board = getBoard(summarizeHallOfFame(makeData(), TODAY), 'monthly', 'expenses');

    expect(board?.top?.value).toBe(4910);
    expect(board?.top?.percentage).toBeNull();
    expect(board?.top?.base).toBeNull();
  });

  it('adds up the three best growth months, and stays silent below three', () => {
    expect(summarizeHallOfFame(makeData(), TODAY).topThreeGrowth).toBe(22_630);

    const thin = summarizeHallOfFame(
      makeData({ bestMonthsByNetWorthGrowth: GROWTH_MONTHS.slice(0, 2) }),
      TODAY,
    );
    expect(thin.topThreeGrowth).toBeNull();
  });

  it('carries the stored stats through', () => {
    expect(summarizeHallOfFame(makeData(), TODAY).stats?.monthCount).toBe(46);
    const data = makeData();
    delete data.stats;
    expect(summarizeHallOfFame(data, TODAY).stats).toBeNull();
  });
});

describe('buildRecordTimeline', () => {
  it('puts the record months back in chronological order and flags the running one', () => {
    const board = getBoard(summarizeHallOfFame(makeData(), TODAY), 'monthly', 'growth')!;

    const timeline = buildRecordTimeline(board.rows);

    expect(timeline.map((point) => point.key)).toEqual(['2024-03', '2025-10', '2026-01', '2026-08']);
    expect(timeline.map((point) => point.label)).toEqual(['mar', 'ott', 'gen', 'ago']);
    expect(timeline.at(-1)?.isCurrent).toBe(true);
  });

  it('keeps the highest records when there are more than the limit', () => {
    const many = Array.from({ length: TIMELINE_LIMIT + 4 }, (_, i) =>
      monthRecord(2020 + Math.floor(i / 12), (i % 12) + 1, 1000 - i * 10, 100_000),
    );
    const board = getBoard(
      summarizeHallOfFame(makeData({ bestMonthsByNetWorthGrowth: many }), TODAY),
      'monthly',
      'growth',
    )!;

    const timeline = buildRecordTimeline(board.rows);

    expect(timeline).toHaveLength(TIMELINE_LIMIT);
    // The four smallest records are the ones dropped, not the four latest.
    expect(timeline.map((point) => point.value).sort((a, b) => a - b)[0]).toBe(1000 - (TIMELINE_LIMIT - 1) * 10);
  });

  it('is empty without records', () => {
    expect(buildRecordTimeline([])).toEqual([]);
  });
});

describe('summarizeNotes', () => {
  function note(id: string, year: number, month: number | undefined, sections: HallOfFameNote['sections'], text: string): HallOfFameNote {
    return { id, text, sections, year, month, createdAt: new Date(), updatedAt: new Date() };
  }

  const NOTES: HallOfFameNote[] = [
    note('a', 2025, 3, ['worstMonthsByNetWorthDecline', 'worstMonthsByExpenses'], 'Correzione sui mercati.'),
    note('b', 2026, 1, ['bestMonthsByNetWorthGrowth'], 'Ribilanciamento di gennaio.'),
    note('c', 2025, 12, ['bestMonthsByIncome'], 'Tredicesima e rimborso.'),
    note('d', 2024, undefined, ['bestYearsByNetWorthGrowth'], "L'anno del cambio lavoro."),
  ];

  it('orders the notes from the most recent period and names it', () => {
    const summary = summarizeNotes(NOTES);

    expect(summary.rows.map((row) => row.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(summary.latest?.longLabel).toBe('gennaio 2026');
    expect(summary.total).toBe(4);
    expect(summary.periodCount).toBe(4);
  });

  it('labels a yearly note with its year alone', () => {
    const summary = summarizeNotes(NOTES);
    const yearly = summary.rows.find((row) => row.id === 'd');

    expect(yearly?.label).toBe('2024');
    expect(yearly?.longLabel).toBe('2024');
  });

  it('names every ranking a note belongs to', () => {
    const summary = summarizeNotes(NOTES);

    expect(summary.rows[2].sectionLabels).toEqual([
      'Peggior Mese: Calo Patrimonio',
      'Peggior Mese: Spese',
    ]);
  });

  it('counts one period once even with several notes on it', () => {
    const summary = summarizeNotes([
      ...NOTES,
      note('e', 2026, 1, ['bestMonthsByIncome'], 'Seconda nota sullo stesso mese.'),
    ]);

    expect(summary.total).toBe(5);
    expect(summary.periodCount).toBe(4);
  });

  it('is empty without notes', () => {
    const summary = summarizeNotes([]);

    expect(summary.rows).toEqual([]);
    expect(summary.latest).toBeNull();
    expect(summary.total).toBe(0);
  });
});
