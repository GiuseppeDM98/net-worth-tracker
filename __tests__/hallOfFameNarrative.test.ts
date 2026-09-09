/**
 * Tests for lib/utils/hallOfFameNarrative.ts — the words of the Hall of Fame: the verdict that
 * answers «quali sono stati i mesi e gli anni migliori?» and the reading line of every tile.
 *
 * Same mocking as storicoNarrative.test.ts: the module needs chartService's it-IT percentage
 * formatter, whose Firebase chain is mocked away. Every phrasing is pinned here, and a missing
 * input drops its clause instead of printing a placeholder (The Narrative Honesty Rule).
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import {
  buildHallOfFameVerdict,
  describeFullRanking,
  describeHallOfFameHeader,
  describeIncomeAverage,
  describeIncomeRecords,
  describeMonthsAside,
  describeNetWorthRecords,
  describeNotes,
  describeSavingsRecords,
  describeWorstMonth,
  describeWorstYear,
  describeYearRecords,
  type HallOfFameVerdictInput,
} from '@/lib/utils/hallOfFameNarrative';
import type { NotesSummary, RecordBoard, RecordEntry } from '@/lib/utils/hallOfFameSummary';
import type { HallOfFameStats } from '@/types/hall-of-fame';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';

/** The screen prints a no-break space before €; the tests read it as a normal one. */
const plain = (narrative: Narrative | null) => (narrative ? narrativeToText(narrative).replace(/ /g, ' ') : null);

function monthEntry(overrides: Partial<RecordEntry> = {}): RecordEntry {
  return {
    key: '2025-10',
    year: 2025,
    month: 10,
    label: 'ott 2025',
    longLabel: 'ottobre 2025',
    value: 8240,
    percentage: 4.095,
    income: null,
    base: null,
    isCurrent: false,
    ...overrides,
  };
}

function yearEntry(overrides: Partial<RecordEntry> = {}): RecordEntry {
  return {
    key: '2024',
    year: 2024,
    label: '2024',
    longLabel: '2024',
    value: 48_900,
    percentage: 31.206,
    income: null,
    base: null,
    isCurrent: false,
    ...overrides,
  };
}

const CURRENT_YEAR = yearEntry({ key: '2026', year: 2026, label: '2026', longLabel: '2026', value: 41_300, percentage: 19.399, isCurrent: true });
const WORST_MONTH = monthEntry({ key: '2025-03', year: 2025, month: 3, label: 'mar 2025', longLabel: 'marzo 2025', value: -8420, percentage: -3.9 });

const FULL_VERDICT: HallOfFameVerdictInput = {
  hasRecords: true,
  bestMonth: monthEntry(),
  worstMonth: WORST_MONTH,
  currentMonth: monthEntry({ key: '2026-08', year: 2026, month: 8, label: 'ago 2026', longLabel: 'agosto 2026', value: 6480, percentage: 2.7, isCurrent: true }),
  currentMonthRank: 3,
  bestYear: yearEntry(),
  currentYear: CURRENT_YEAR,
  currentYearRank: 2,
};

describe('buildHallOfFameVerdict', () => {
  it('names the best month, the running year and where the running month sits', () => {
    const verdict = buildHallOfFameVerdict(FULL_VERDICT);

    expect(verdict.headline).toBe('Il tuo mese migliore è ottobre 2025.');
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe(
      'In quel mese il patrimonio è salito di +8240 €, il +4,1% in un mese; il 2026 è finora il secondo anno migliore, con +41.300 €, e agosto è oggi al 3° posto tra i mesi.',
    );
  });

  it('drops the percentage when the month before has no net worth to compare with', () => {
    const verdict = buildHallOfFameVerdict({ ...FULL_VERDICT, bestMonth: monthEntry({ percentage: null }) });

    expect(plain(verdict.sentence)).toContain('è salito di +8240 €; il 2026');
    expect(plain(verdict.sentence)).not.toContain('in un mese');
  });

  it('drops the year clause when the running year is not in the ranking', () => {
    const verdict = buildHallOfFameVerdict({ ...FULL_VERDICT, currentYear: null, currentYearRank: null });

    expect(plain(verdict.sentence)).toBe(
      'In quel mese il patrimonio è salito di +8240 €, il +4,1% in un mese, e agosto è oggi al 3° posto tra i mesi.',
    );
  });

  it('calls the running year the best one when it leads the ranking', () => {
    const verdict = buildHallOfFameVerdict({ ...FULL_VERDICT, bestYear: CURRENT_YEAR, currentYearRank: 1 });

    expect(plain(verdict.sentence)).toContain('il 2026 è finora il tuo anno migliore, con +41.300 €');
  });

  it('gives a year past the podium its position instead of a word', () => {
    const verdict = buildHallOfFameVerdict({ ...FULL_VERDICT, currentYearRank: 4 });

    expect(plain(verdict.sentence)).toContain('il 2026 è finora al 4° posto tra gli anni, con +41.300 €');
  });

  it('says so in the headline when the running month IS the record, and never repeats it', () => {
    const current = monthEntry({ key: '2026-08', year: 2026, month: 8, label: 'ago 2026', longLabel: 'agosto 2026', isCurrent: true });
    const verdict = buildHallOfFameVerdict({ ...FULL_VERDICT, bestMonth: current, currentMonth: current, currentMonthRank: 1 });

    expect(verdict.headline).toBe('Agosto 2026 è il tuo mese migliore.');
    expect(plain(verdict.sentence)).not.toContain('posto tra i mesi');
  });

  it('drops the running-month clause when the month is nowhere in the ranking', () => {
    const verdict = buildHallOfFameVerdict({ ...FULL_VERDICT, currentMonth: null, currentMonthRank: null });

    expect(plain(verdict.sentence)).toBe(
      'In quel mese il patrimonio è salito di +8240 €, il +4,1% in un mese; il 2026 è finora il secondo anno migliore, con +41.300 €.',
    );
  });

  it('falls back to the worst month when no month has grown yet', () => {
    const verdict = buildHallOfFameVerdict({
      ...FULL_VERDICT,
      bestMonth: null,
      bestYear: null,
      currentYear: null,
      currentYearRank: null,
      currentMonth: null,
      currentMonthRank: null,
    });

    expect(verdict.headline).toBe("Non c'è ancora un mese in crescita.");
    expect(verdict.tone).toBe('warning');
    expect(plain(verdict.sentence)).toBe('Il mese peggiore è marzo 2025: −8420 €, il −3,9%.');
  });

  it('explains how a record is born when there is nothing to rank', () => {
    const verdict = buildHallOfFameVerdict({
      hasRecords: false,
      bestMonth: null,
      worstMonth: null,
      currentMonth: null,
      currentMonthRank: null,
      bestYear: null,
      currentYear: null,
      currentYearRank: null,
    });

    expect(verdict.headline).toBe('I record cominciano dal secondo snapshot.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toContain('Ogni mese viene confrontato con quello prima');
  });
});

describe('the tile readings', () => {
  it('names the record month and what the podium is worth', () => {
    expect(plain(describeNetWorthRecords({ best: monthEntry(), topThreeGrowth: 22_630 }))).toBe(
      'Il mese migliore è ottobre 2025: +8240 €, il +4,1% in un mese. I tre migliori valgono insieme +22.630 €.',
    );
  });

  it('drops the podium clause below three records', () => {
    expect(plain(describeNetWorthRecords({ best: monthEntry(), topThreeGrowth: null }))).toBe(
      'Il mese migliore è ottobre 2025: +8240 €, il +4,1% in un mese.',
    );
  });

  it('says plainly when no month has grown', () => {
    expect(plain(describeNetWorthRecords({ best: null, topThreeGrowth: null }))).toBe(
      'Nessun mese in crescita, per ora.',
    );
  });

  it('names the worst month in the footer, and disappears without one', () => {
    expect(plain(describeWorstMonth(WORST_MONTH))).toBe('Il mese peggiore resta marzo 2025: −8420 €, il −3,9%.');
    expect(describeWorstMonth(null)).toBeNull();
  });

  it('measures the record income against the monthly average', () => {
    const top = monthEntry({ key: '2025-12', year: 2025, month: 12, label: 'dic 2025', longLabel: 'dicembre 2025', value: 6940, percentage: null });

    expect(plain(describeIncomeRecords({ top, averageMonthlyIncome: 4280 }))).toBe(
      'Il mese con più entrate è dicembre 2025: 6940 €, il 62,1% sopra la tua media mensile.',
    );
    expect(plain(describeIncomeRecords({ top, averageMonthlyIncome: null }))).toBe(
      'Il mese con più entrate è dicembre 2025: 6940 €.',
    );
  });

  it('prints the average income only with the months it was measured on', () => {
    const stats: HallOfFameStats = {
      monthCount: 46,
      yearCount: 5,
      averageMonthlyIncome: 4280,
      averageMonthlyExpenses: 2610,
      firstMonth: { year: 2022, month: 11 },
      lastMonth: { year: 2026, month: 8 },
    };

    expect(plain(describeIncomeAverage(stats))).toBe('Media mensile 4280 € sui 46 mesi tracciati.');
    expect(describeIncomeAverage(null)).toBeNull();
    expect(describeIncomeAverage({ ...stats, averageMonthlyIncome: 0 })).toBeNull();
  });

  it('reads a savings record as what was kept out of what came in', () => {
    const top = monthEntry({ key: '2026-03', year: 2026, month: 3, label: 'mar 2026', longLabel: 'marzo 2026', value: 3180, percentage: 60, income: 5300 });

    expect(plain(describeSavingsRecords(top))).toBe(
      'Il mese in cui hai messo da parte di più è marzo 2026: +3180 € su 5300 € di entrate, il 60,0%.',
    );
    expect(plain(describeSavingsRecords(null))).toBe('Nessun mese con entrate registrate, per ora.');
  });

  it('names the best year and where the running one stands', () => {
    expect(plain(describeYearRecords({ top: yearEntry(), current: CURRENT_YEAR, currentRank: 2 }))).toBe(
      'Il tuo anno migliore è il 2024: +48.900 €, il +31,2%. Il 2026 è secondo e non è ancora finito.',
    );
  });

  it('folds the running year into one sentence when it already leads', () => {
    expect(plain(describeYearRecords({ top: CURRENT_YEAR, current: CURRENT_YEAR, currentRank: 1 }))).toBe(
      'Il tuo anno migliore è il 2026: +41.300 €, il +19,4%, e non è ancora finito.',
    );
  });

  it('drops the running-year sentence when the year is unranked', () => {
    expect(plain(describeYearRecords({ top: yearEntry(), current: null, currentRank: null }))).toBe(
      'Il tuo anno migliore è il 2024: +48.900 €, il +31,2%.',
    );
  });

  it('names the worst year, or says there is none', () => {
    const worst = yearEntry({ key: '2022', year: 2022, label: '2022', longLabel: '2022', value: -6300, percentage: -4.1 });

    expect(plain(describeWorstYear(worst))).toBe('Il tuo anno peggiore è il 2022: −6300 €, il −4,1%.');
    expect(plain(describeWorstYear(null))).toBe('Nessun anno in perdita.');
  });

  it('counts the annotated periods and names the most recent', () => {
    const summary: NotesSummary = {
      total: 4,
      periodCount: 4,
      latest: { id: 'b', key: '2026-01', year: 2026, month: 1, label: 'gen 2026', longLabel: 'gennaio 2026', sectionLabels: [], text: '' },
      rows: [],
    };

    expect(plain(describeNotes(summary))).toBe('Hai annotato 4 periodi; il più recente è gennaio 2026.');
    expect(plain(describeNotes({ ...summary, total: 6 }))).toBe(
      'Hai annotato 4 periodi con 6 note; il più recente è gennaio 2026.',
    );
    expect(plain(describeNotes({ total: 0, periodCount: 0, latest: null, rows: [] }))).toBe('Nessuna nota, per ora.');
  });

  it('names what the full ranking is showing, and what is still running', () => {
    const board = {
      period: 'monthly',
      category: 'growth',
      sectionKey: 'bestMonthsByNetWorthGrowth',
      rows: new Array(20).fill(monthEntry()),
      top: monthEntry(),
      runnerUp: monthEntry(),
      current: monthEntry({ key: '2026-08', longLabel: 'agosto 2026', isCurrent: true }),
      currentRank: 3,
      total: 20,
    } as unknown as RecordBoard;

    expect(plain(describeFullRanking({ board, notedCount: 3 }))).toBe(
      'I 20 mesi con la crescita di patrimonio più alta, dal migliore. 3 hanno una nota, e agosto 2026 è ancora in corso.',
    );
    expect(plain(describeFullRanking({ board: { ...board, current: null, currentRank: null }, notedCount: 0 }))).toBe(
      'I 20 mesi con la crescita di patrimonio più alta, dal migliore.',
    );
    expect(plain(describeFullRanking({ board: null, notedCount: 0 }))).toBe('Nessun record in questa classifica.');
  });

  it('uses the singular for a ranking of one', () => {
    const board = {
      period: 'annual',
      category: 'savings',
      sectionKey: 'bestYearsBySavings',
      rows: [yearEntry()],
      top: yearEntry(),
      runnerUp: null,
      current: null,
      currentRank: null,
      total: 1,
    } as unknown as RecordBoard;

    expect(plain(describeFullRanking({ board, notedCount: 1 }))).toBe(
      "L'anno in cui hai messo da parte di più. 1 ha una nota.",
    );
  });
});

describe('the header line', () => {
  const stats: HallOfFameStats = {
    monthCount: 46,
    yearCount: 5,
    averageMonthlyIncome: 4280,
    averageMonthlyExpenses: 2610,
    firstMonth: { year: 2022, month: 11 },
    lastMonth: { year: 2026, month: 8 },
  };

  it('says how much history the records were drawn from', () => {
    expect(describeHallOfFameHeader(stats)).toBe('46 mesi e 5 anni a confronto, da novembre 2022');
  });

  it('drops the starting month when the history does not carry one', () => {
    expect(describeHallOfFameHeader({ ...stats, firstMonth: null })).toBe('46 mesi e 5 anni a confronto');
  });

  it('has nothing to say without stats', () => {
    expect(describeHallOfFameHeader(null)).toBeUndefined();
    expect(describeMonthsAside(null)).toBeUndefined();
    expect(describeMonthsAside(stats)).toBe('46 mesi confrontati');
  });

  it('keeps the singular for a single month or year', () => {
    expect(describeHallOfFameHeader({ ...stats, monthCount: 1, yearCount: 1 })).toBe(
      '1 mese e 1 anno a confronto, da novembre 2022',
    );
  });
});
