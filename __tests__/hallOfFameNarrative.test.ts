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
  describeNetWorthRecords,
  describeNoteFormReading,
  describeNotePeriod,
  describeNotes,
  describePartialYearChip,
  describeRecordWindow,
  describeSavingsRecords,
  describeTimelineCaption,
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
    monthsCovered: null,
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
    monthsCovered: 12,
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
  const FIFTH = monthEntry({ key: '2025-05', year: 2025, month: 5, label: 'mag 2025', longLabel: 'maggio 2025', value: 2195, percentage: 1.1 });

  /**
   * The verdict, 200px above, already prints the record month and its two figures: the tile
   * says what the podium is worth and where the board ends, never the same figure again
   * (critique of 2026-09-24: «+8240 €» and «+4,1%» were printed three times in 200px).
   */
  it('says what the podium is worth and where the tile ends, without repeating the verdict', () => {
    const reading = plain(describeNetWorthRecords({ best: monthEntry(), topThreeGrowth: 22_630, last: FIFTH }));

    expect(reading).toBe("I tre mesi migliori valgono insieme +22.630 €; l'ultimo in tessera, maggio 2025, è a +2195 €.");
    expect(reading).not.toContain('8240');
    expect(reading).not.toContain('4,1%');
  });

  it('drops the last-row clause when the tile ends on the record itself', () => {
    expect(plain(describeNetWorthRecords({ best: monthEntry(), topThreeGrowth: 22_630, last: monthEntry() }))).toBe(
      'I tre mesi migliori valgono insieme +22.630 €.',
    );
  });

  it('names the record month below three records, when there is no podium to sum', () => {
    expect(plain(describeNetWorthRecords({ best: monthEntry(), topThreeGrowth: null, last: monthEntry() }))).toBe(
      'Il mese migliore è ottobre 2025: +8240 €, il +4,1% in un mese.',
    );
  });

  it('says plainly when no month has grown', () => {
    expect(plain(describeNetWorthRecords({ best: null, topThreeGrowth: null, last: null }))).toBe(
      'Nessun mese in crescita, per ora.',
    );
  });

  it('names the worst month in the footer, and disappears without one', () => {
    expect(plain(describeWorstMonth(WORST_MONTH))).toBe('Il mese peggiore resta marzo 2025: −8420 €, il −3,9%.');
    expect(describeWorstMonth(null)).toBeNull();
  });

  /** The page celebrates: its dominant tile must not END on its one red figure. */
  it('closes the worst month on the recovery since, when the stats carry it', () => {
    expect(plain(describeWorstMonth(WORST_MONTH, { months: 17, growing: 15 }))).toBe(
      'Il mese peggiore resta marzo 2025: −8420 €, il −3,9%; da allora 15 mesi su 17 in crescita.',
    );
    expect(plain(describeWorstMonth(WORST_MONTH, { months: 1, growing: 1 }))).toContain('da allora 1 mese su 1 in crescita');
    // The worst month is the latest one: nothing has followed it yet.
    expect(plain(describeWorstMonth(WORST_MONTH, { months: 0, growing: 0 }))).toBe(
      'Il mese peggiore resta marzo 2025: −8420 €, il −3,9%.',
    );
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

  /** «il 88,5%» shipped: the article follows the figure as printed (The Comma Rule). */
  it('elides the article before a percentage that starts with a vowel sound', () => {
    const top = monthEntry({ key: '2025-12', year: 2025, month: 12, label: 'dic 2025', longLabel: 'dicembre 2025', value: 6900, percentage: null });

    expect(plain(describeIncomeRecords({ top, averageMonthlyIncome: 3660 }))).toContain("6900 €, l'88,5% sopra la tua media mensile.");
    expect(plain(describeIncomeRecords({ top: { ...top, value: 4070 }, averageMonthlyIncome: 3660 }))).toContain("l'11,2% sopra");
    expect(plain(describeIncomeRecords({ top: { ...top, value: 3950 }, averageMonthlyIncome: 3660 }))).toContain("l'7,9%".replace("l'7", 'il 7'));
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
    expect(plain(describeSavingsRecords({ ...top, percentage: 81.4 }))).toContain("di entrate, l'81,4%.");
    expect(plain(describeSavingsRecords(null))).toBe('Nessun mese con entrate registrate, per ora.');
  });

  /**
   * The verdict already says WHERE the running year stands («il secondo anno migliore»); the
   * tile says how far it is from the place above — a figure the verdict does not print.
   */
  it('names the best year and how far the running one is from the place above', () => {
    expect(plain(describeYearRecords({ top: yearEntry(), current: CURRENT_YEAR, currentRank: 2, above: yearEntry() }))).toBe(
      'Il tuo anno migliore è il 2024: +48.900 €, il +31,2%. Il 2026 è a 7600 € dal primo posto e non è ancora finito.',
    );
    const second = yearEntry({ key: '2025', year: 2025, label: '2025', longLabel: '2025', value: 43_000 });
    expect(plain(describeYearRecords({ top: yearEntry(), current: CURRENT_YEAR, currentRank: 3, above: second }))).toContain(
      'Il 2026 è a 1700 € dal secondo posto e non è ancora finito.',
    );
  });

  it('falls back to the position when the row above is not known', () => {
    expect(plain(describeYearRecords({ top: yearEntry(), current: CURRENT_YEAR, currentRank: 4, above: null }))).toContain(
      'Il 2026 è al 4° posto e non è ancora finito.',
    );
  });

  it('folds the running year into one sentence when it already leads', () => {
    expect(plain(describeYearRecords({ top: CURRENT_YEAR, current: CURRENT_YEAR, currentRank: 1, above: null }))).toBe(
      'Il tuo anno migliore è il 2026: +41.300 €, il +19,4%, e non è ancora finito.',
    );
  });

  it('drops the running-year sentence when the year is unranked', () => {
    expect(plain(describeYearRecords({ top: yearEntry(), current: null, currentRank: null, above: null }))).toBe(
      'Il tuo anno migliore è il 2024: +48.900 €, il +31,2%.',
    );
  });

  /** A first year that starts in December is ranked beside whole years: it says on how many months. */
  it('declares a partial first year on how many months it was measured', () => {
    const partial = yearEntry({ key: '2022', year: 2022, label: '2022', longLabel: '2022', value: 937, percentage: 0.8, monthsCovered: 1 });

    expect(plain(describeYearRecords({ top: partial, current: null, currentRank: null, above: null }))).toBe(
      'Il tuo anno migliore è il 2022: +937 €, il +0,8% su 1 mese.',
    );
    expect(describePartialYearChip(partial)).toBe('1 mese');
    expect(describePartialYearChip({ ...partial, monthsCovered: 3 })).toBe('3 mesi');
    // A whole year, a running year and a record written before the field existed say nothing.
    expect(describePartialYearChip(yearEntry())).toBeNull();
    expect(describePartialYearChip({ ...partial, isCurrent: true, monthsCovered: 9 })).toBeNull();
    expect(describePartialYearChip({ ...partial, monthsCovered: null })).toBeNull();
    expect(describePartialYearChip(monthEntry())).toBeNull();
  });

  it('names the worst year, or says there is none', () => {
    const worst = yearEntry({ key: '2022', year: 2022, label: '2022', longLabel: '2022', value: -6300, percentage: -4.1 });

    expect(plain(describeWorstYear(worst))).toBe('Il tuo anno peggiore è il 2022: −6300 €, il −4,1%.');
    expect(plain(describeWorstYear({ ...worst, monthsCovered: 2 }))).toBe('Il tuo anno peggiore è il 2022: −6300 €, il −4,1% su 2 mesi.');
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
  });

  /** An absence is ONE sentence, and the two absences are two different facts. */
  it('tells a ranking the document lacks from one nothing has entered', () => {
    expect(plain(describeFullRanking({ board: null, notedCount: 0 }))).toBe(
      'Questa classifica arriva con il prossimo aggiornamento dei record.',
    );
    const empty = { period: 'annual', category: 'decline', rows: [], total: 0, current: null } as unknown as RecordBoard;
    expect(plain(describeFullRanking({ board: empty, notedCount: 0 }))).toBe('Nessun periodo è entrato in questa classifica.');
  });

  /** «Gli 10 anni» and «dal migliore» on a cost were the two grammar slips of the Dettaglio. */
  it('orders each ranking in its own terms, with the article the number takes', () => {
    const rows = (n: number) => new Array(n).fill(yearEntry());
    const board = (category: string, n: number) =>
      ({ period: 'annual', category, rows: rows(n), total: n, current: null, currentRank: null }) as unknown as RecordBoard;

    expect(plain(describeFullRanking({ board: board('growth', 10), notedCount: 0 }))).toBe(
      'I 10 anni con la crescita di patrimonio più alta, dal migliore.',
    );
    expect(plain(describeFullRanking({ board: board('expenses', 8), notedCount: 0 }))).toBe(
      'Gli 8 anni con le spese più alte, dal più alto.',
    );
    expect(plain(describeFullRanking({ board: board('decline', 3), notedCount: 0 }))).toBe(
      'I 3 anni con il calo di patrimonio più forte, dal più forte.',
    );
    expect(plain(describeFullRanking({ board: board('income', 2), notedCount: 0 }))).toContain(', dal più alto.');
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

  /** A document the cron stopped refreshing must not look like a fresh one. */
  it('dates the rankings when the document carries their stamp', () => {
    expect(describeHallOfFameHeader(stats, new Date(2026, 8, 24, 12))).toBe(
      '46 mesi e 5 anni a confronto, da novembre 2022 · record aggiornati il 24/09/2026',
    );
    expect(describeHallOfFameHeader(stats, null)).not.toContain('aggiornati');
  });

  it('drops the starting month when the history does not carry one', () => {
    expect(describeHallOfFameHeader({ ...stats, firstMonth: null })).toBe('46 mesi e 5 anni a confronto');
  });

  it('has nothing to say without stats', () => {
    expect(describeHallOfFameHeader(null)).toBeUndefined();
    expect(describeRecordWindow(null)).toBeUndefined();
    expect(describeRecordWindow({ ...stats, lastMonth: null })).toBeUndefined();
  });

  it('names the window the records were drawn from as the Record tile\'s scope', () => {
    expect(describeRecordWindow(stats)).toBe('da nov 2022 a ago 2026');
  });

  it('keeps the singular for a single month or year', () => {
    expect(describeHallOfFameHeader({ ...stats, monthCount: 1, yearCount: 1 })).toBe(
      '1 mese e 1 anno a confronto, da novembre 2022',
    );
  });
});

describe('the small labels', () => {
  it('says when the chart is a cut of the ranking', () => {
    expect(describeTimelineCaption(12, 20)).toBe('I 12 record più grandi');
    expect(describeTimelineCaption(8, 20)).toBe('Gli 8 record più grandi');
    expect(describeTimelineCaption(5, 5)).toBe('I 5 record');
  });

  it('names a period the way the page writes it, for a marker\'s accessible name', () => {
    expect(describeNotePeriod(2024, 3)).toBe('marzo 2024');
    expect(describeNotePeriod(2024)).toBe('2024');
  });

  it('gives the note form a status line for each of its three states', () => {
    expect(describeNoteFormReading({ sectionCount: 0, isRanked: null })).toBe(
      'Scegli il periodo e almeno una classifica: la nota compare accanto ai record che scegli.',
    );
    expect(describeNoteFormReading({ sectionCount: 1, isRanked: true })).toBe('La nota comparirà su una classifica di questo periodo.');
    expect(describeNoteFormReading({ sectionCount: 3, isRanked: null })).toBe('La nota comparirà su 3 classifiche di questo periodo.');
    expect(describeNoteFormReading({ sectionCount: 2, isRanked: false })).toBe(
      'Questo periodo non è in nessuna delle classifiche scelte: la nota resta nella tessera Note.',
    );
  });
});
