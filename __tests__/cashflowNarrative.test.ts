/**
 * Tests for lib/utils/cashflowNarrative.ts — the words of Cashflow › Tracciamento: the
 * verdict that answers «come sta andando il mese (o il periodo)?» and the reading line of
 * every tile. Pure; chartService's Firebase chain is mocked exactly like
 * __tests__/overviewNarrative.test.ts does.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import type { Period } from '@/lib/utils/period';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';
import type { MonthFlow, PeriodCashflowTotals, SavingsHistory, ScheduledSlice } from '@/lib/utils/tracciamentoSummary';
import {
  buildCashflowVerdict,
  describeCategoryShare,
  describeComparisonPhrase,
  describeDeficitMonths,
  describeFlowWindow,
  describeMonthWindow,
  describeMovements,
  describeScheduledHorizon,
  scheduledSentence,
  describeMovementsCount,
  describePeriodCashflow,
  describePeriodSubject,
  describePreviousPeriodLabel,
  describeProjectionReference,
  describeSavingsHistory,
  type CashflowVerdictInput,
} from '@/lib/utils/cashflowNarrative';

// Intl 'it-IT' puts a no-break space before "€" and leaves four-digit amounts ungrouped
// (CLDR minimumGroupingDigits = 2): expectations are written the way the screen prints
// them, with the nbsp flattened to a plain space for readability.
const plain = (narrative: Narrative | null) => (narrative ? narrativeToText(narrative).replace(/ /g, ' ') : null);

const NOW = new Date(2026, 7, 22, 12);
const AUGUST: Period = { kind: 'month', year: 2026, month: 8 };

const TOTALS: PeriodCashflowTotals = { income: 4850, expenses: 2910, net: 1940, savingsRate: 40, coverageRatio: 1.6667, transferCount: 0 };

/** Nothing scheduled — the default for a period that has already happened. */
const NOTHING_SCHEDULED: ScheduledSlice = { count: 0, expenses: 0, income: 0, throughMonth: null };

const INPUT: CashflowVerdictInput = {
  period: AUGUST,
  now: NOW,
  totals: TOTALS,
  delta: { income: 3.19, expenses: -6.43 },
  scheduled: NOTHING_SCHEDULED,
};

describe('the ytd period in words', () => {
  const YTD: Period = { kind: 'ytd', year: 2026, throughMonth: 8 };

  it('should name itself «finora», never as the bare year', () => {
    const subject = describePeriodSubject(YTD, NOW);
    expect(subject.subject).toBe('Il 2026 finora');
    expect(subject.inPeriod).toBe('nel 2026 finora');
    expect(subject.ongoing).toBe(true);
    // The whole year is a different subject.
    expect(describePeriodSubject({ kind: 'year', year: 2026 }, NOW).subject).toBe('Il 2026');
  });

  it('should compare against the same months of the previous year', () => {
    expect(describeComparisonPhrase(YTD, NOW)).toBe('su gen–ago 2025');
    expect(describePreviousPeriodLabel(YTD, NOW)).toBe('gen–ago 2025');
  });

  it('should open the verdict with its own subject', () => {
    const verdict = buildCashflowVerdict({ ...INPUT, period: YTD });
    expect(verdict.headline).toBe('Il 2026 finora sta andando bene.');
    expect(plain(verdict.sentence)).toContain('Nel 2026 finora hai messo da parte');
  });
});

describe('describePeriodSubject', () => {
  it('should name the current month as ongoing, with the euphonic "ad"', () => {
    expect(describePeriodSubject(AUGUST, NOW)).toEqual({ subject: 'Agosto', inPeriod: 'ad agosto', ongoing: true });
    expect(describePeriodSubject({ kind: 'month', year: 2026, month: 5 }, NOW)).toEqual({ subject: 'Maggio', inPeriod: 'a maggio', ongoing: false });
  });

  it('should add the year to a month of another year', () => {
    expect(describePeriodSubject({ kind: 'month', year: 2025, month: 8 }, NOW)).toEqual({
      subject: 'Agosto 2025',
      inPeriod: 'ad agosto 2025',
      ongoing: false,
    });
  });

  it('should name a year and a custom range', () => {
    expect(describePeriodSubject({ kind: 'year', year: 2026 }, NOW)).toEqual({ subject: 'Il 2026', inPeriod: 'nel 2026', ongoing: true });
    expect(describePeriodSubject({ kind: 'year', year: 2024 }, NOW)).toEqual({ subject: 'Il 2024', inPeriod: 'nel 2024', ongoing: false });
    expect(describePeriodSubject({ kind: 'custom', from: new Date(2026, 5, 1), to: new Date(2026, 8, 30) }, NOW)).toEqual({
      subject: 'Il periodo',
      inPeriod: 'nel periodo',
      ongoing: true,
    });
    expect(describePeriodSubject({ kind: 'custom', from: new Date(2026, 5, 1), to: new Date(2026, 6, 31) }, NOW).ongoing).toBe(false);
  });
});

describe('describeComparisonPhrase', () => {
  it('should name the previous month, the previous year, and nothing for a custom range', () => {
    expect(describeComparisonPhrase(AUGUST, NOW)).toBe('su luglio');
    expect(describeComparisonPhrase({ kind: 'month', year: 2026, month: 1 }, NOW)).toBe('su dicembre');
    expect(describeComparisonPhrase({ kind: 'year', year: 2025 }, NOW)).toBe('sul 2024');
    expect(describeComparisonPhrase({ kind: 'custom', from: NOW, to: NOW }, NOW)).toBeNull();
  });

  it('should compare a year still running with the same months of the previous year', () => {
    expect(describeComparisonPhrase({ kind: 'year', year: 2026 }, NOW)).toBe('su gen–ago 2025');
    expect(describePreviousPeriodLabel({ kind: 'year', year: 2026 }, NOW)).toBe('gen–ago 2025');
  });

  it('should give the bare previous label for a delta caption and the capitalised row label for a projection', () => {
    expect(describePreviousPeriodLabel(AUGUST, NOW)).toBe('luglio');
    expect(describePreviousPeriodLabel({ kind: 'year', year: 2025 }, NOW)).toBe('2024');
    expect(describePreviousPeriodLabel({ kind: 'custom', from: NOW, to: NOW }, NOW)).toBeNull();
    expect(describeProjectionReference(AUGUST)).toBe('A luglio');
    expect(describeProjectionReference({ kind: 'month', year: 2026, month: 9 })).toBe('Ad agosto');
    expect(describeProjectionReference({ kind: 'year', year: 2026 })).toBeNull();
  });
});

describe('buildCashflowVerdict', () => {
  it('should praise a month saving 20% or more and state every figure in the sentence', () => {
    const verdict = buildCashflowVerdict(INPUT);

    expect(verdict.headline).toBe('Agosto sta andando bene.');
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe(
      'Ad agosto hai messo da parte il 40% (1940 €): entrate 4850 €, spese 2910 €, in calo del 6,4% su luglio.',
    );
  });

  it('should close by naming the scheduled part AS PART OF the totals, never beside them', () => {
    const both = buildCashflowVerdict({ ...INPUT, scheduled: { count: 3, expenses: 1850, income: 500, throughMonth: 12 } });
    expect(plain(both.sentence)).toBe(
      'Ad agosto hai messo da parte il 40% (1940 €): entrate 4850 €, spese 2910 €, in calo del 6,4% su luglio. Nel totale ci sono ancora 1850 € di spese e 500 € di entrate già in calendario da qui a fine mese.',
    );

    // The verb agrees with the AMOUNT, not with the number of clauses: 406 € is plural.
    const spendingOnly = buildCashflowVerdict({ ...INPUT, scheduled: { count: 2, expenses: 406, income: 0, throughMonth: 10 } });
    expect(plain(spendingOnly.sentence)).toContain('Nel totale ci sono ancora 406 € di spese già in calendario da qui a fine mese.');

    // Only a lone «1 €» is singular — and «1 €» is the figure AS PRINTED, so 1,40 € counts.
    const oneEuro = buildCashflowVerdict({ ...INPUT, scheduled: { count: 1, expenses: 1, income: 0, throughMonth: 9 } });
    expect(plain(oneEuro.sentence)).toContain("Nel totale c'è ancora 1 € di spese già in calendario da qui a fine mese.");
    const roundsToOne = buildCashflowVerdict({ ...INPUT, scheduled: { count: 1, expenses: 1.4, income: 0, throughMonth: 9 } });
    expect(plain(roundsToOne.sentence)).toContain("Nel totale c'è ancora 1 € di spese già in calendario da qui a fine mese.");
    // One euro of spending BESIDE income is plural again: two amounts, one verb.
    const oneEuroPlusIncome = buildCashflowVerdict({ ...INPUT, scheduled: { count: 2, expenses: 1, income: 500, throughMonth: 9 } });
    expect(plain(oneEuroPlusIncome.sentence)).toContain('Nel totale ci sono ancora 1 € di spese e 500 € di entrate già in calendario da qui a fine mese.');

    // A slice with a count but no amounts (transfers only) adds no sentence.
    const transfersOnly = buildCashflowVerdict({ ...INPUT, scheduled: { count: 1, expenses: 0, income: 0, throughMonth: 9 } });
    expect(plain(transfersOnly.sentence)).not.toContain('in calendario');
  });

  it('should use the past tense for a closed month and a year', () => {
    expect(buildCashflowVerdict({ ...INPUT, period: { kind: 'month', year: 2026, month: 5 } }).headline).toBe('Maggio è andato bene.');
    expect(buildCashflowVerdict({ ...INPUT, period: { kind: 'year', year: 2025 } }).headline).toBe('Il 2025 è andato bene.');
    expect(buildCashflowVerdict({ ...INPUT, period: { kind: 'year', year: 2026 } }).headline).toBe('Il 2026 sta andando bene.');
  });

  it('should read a thin margin as neutral', () => {
    const verdict = buildCashflowVerdict({ ...INPUT, totals: { ...TOTALS, expenses: 4400, net: 450, savingsRate: 9.28 } });

    expect(verdict.headline).toBe('Agosto tiene, ma con poco margine.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toContain('hai messo da parte il 9% (450 €)');
  });

  it('should call a deficit by its name, with the figures still in the sentence', () => {
    const deficit = { income: 4850, expenses: 5200, net: -350, savingsRate: -7.2, coverageRatio: 0.93, transferCount: 0 };
    const verdict = buildCashflowVerdict({ ...INPUT, totals: deficit, delta: { income: 3.19, expenses: 12.5 } });

    expect(verdict.headline).toBe('Ad agosto hai speso più di quanto è entrato.');
    expect(verdict.tone).toBe('negative');
    expect(plain(verdict.sentence)).toBe(
      'Ad agosto le spese superano le entrate di 350 €: entrate 4850 €, spese 5200 €, in aumento del 12,5% su luglio.',
    );
    // A closed period takes the past tense, like the headline does.
    expect(plain(buildCashflowVerdict({ ...INPUT, period: { kind: 'month', year: 2026, month: 5 }, totals: deficit, delta: null }).sentence)).toBe(
      'A maggio le spese hanno superato le entrate di 350 €: entrate 4850 €, spese 5200 €.',
    );
  });

  it('should drop the comparison clause when there is no previous period or no base', () => {
    expect(plain(buildCashflowVerdict({ ...INPUT, delta: null }).sentence)).toBe(
      'Ad agosto hai messo da parte il 40% (1940 €): entrate 4850 €, spese 2910 €.',
    );
    expect(plain(buildCashflowVerdict({ ...INPUT, delta: { income: 3, expenses: null } }).sentence)).toBe(
      'Ad agosto hai messo da parte il 40% (1940 €): entrate 4850 €, spese 2910 €.',
    );
    expect(plain(buildCashflowVerdict({ ...INPUT, delta: { income: 3, expenses: 0 } }).sentence)).toBe(
      'Ad agosto hai messo da parte il 40% (1940 €): entrate 4850 €, spese 2910 €, invariate su luglio.',
    );
    // A change that prints as 0,0% is no change: the direction follows the printed figure.
    expect(plain(buildCashflowVerdict({ ...INPUT, delta: { income: 3, expenses: 0.04 } }).sentence)).toContain('spese 2910 €, invariate su luglio.');
  });

  it('should not invent a rate without income', () => {
    const verdict = buildCashflowVerdict({
      ...INPUT,
      totals: { income: 0, expenses: 2910, net: -2910, savingsRate: null, coverageRatio: null, transferCount: 0 },
      delta: { income: null, expenses: -6.43 },
    });

    expect(verdict.headline).toBe('Ad agosto hai speso senza entrate.');
    expect(verdict.tone).toBe('negative');
    expect(plain(verdict.sentence)).toBe('Ad agosto nessuna entrata: spese 2910 €, in calo del 6,4% su luglio.');
  });

  it('should say when there is nothing to judge, without denying the transfers', () => {
    const empty = { income: 0, expenses: 0, net: 0, savingsRate: null, coverageRatio: null, transferCount: 0 };
    const verdict = buildCashflowVerdict({ ...INPUT, totals: empty, delta: null });

    expect(verdict.headline).toBe('Nessuna entrata né spesa ad agosto.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe('Nessun movimento registrato.');
    expect(plain(buildCashflowVerdict({ ...INPUT, totals: { ...empty, transferCount: 2 }, delta: null }).sentence)).toBe(
      'Solo 2 trasferimenti tra i tuoi conti.',
    );
    expect(plain(buildCashflowVerdict({ ...INPUT, totals: { ...empty, transferCount: 1 }, delta: null }).sentence)).toBe(
      'Solo 1 trasferimento tra i tuoi conti.',
    );
  });

  it('should pick the article from the printed percentage', () => {
    const eight = buildCashflowVerdict({ ...INPUT, totals: { ...TOTALS, savingsRate: 8.4 } });
    expect(plain(eight.sentence)).toContain("hai messo da parte l'8%");
    const zero = buildCashflowVerdict({ ...INPUT, totals: { ...TOTALS, savingsRate: 0.3 } });
    expect(plain(zero.sentence)).toContain('hai messo da parte lo 0%');
  });
});

describe('describePeriodCashflow', () => {
  it('should state the income delta and the coverage, the two facts the verdict does not', () => {
    expect(plain(describePeriodCashflow(TOTALS, { income: 3.19, expenses: -6.43 }, 'su luglio'))).toBe(
      'Entrate in aumento del 3,2% su luglio; per ogni euro speso ne entrano 1,67.',
    );
    expect(plain(describePeriodCashflow(TOTALS, { income: -8.1, expenses: 0 }, 'su luglio'))).toBe(
      "Entrate in calo dell'8,1% su luglio; per ogni euro speso ne entrano 1,67.",
    );
    expect(plain(describePeriodCashflow(TOTALS, { income: 0, expenses: 0 }, 'su luglio'))).toBe(
      'Entrate invariate su luglio; per ogni euro speso ne entrano 1,67.',
    );
    expect(plain(describePeriodCashflow(TOTALS, { income: -0.03, expenses: 0 }, 'su luglio'))).toContain('Entrate invariate su luglio');
  });

  it('should drop a clause it cannot support and return null with none left', () => {
    expect(plain(describePeriodCashflow(TOTALS, null, null))).toBe('Per ogni euro speso ne entrano 1,67.');
    expect(plain(describePeriodCashflow({ ...TOTALS, coverageRatio: null }, { income: 3.19, expenses: null }, 'su luglio'))).toBe(
      'Entrate in aumento del 3,2% su luglio.',
    );
    expect(describePeriodCashflow({ ...TOTALS, coverageRatio: null }, { income: null, expenses: null }, 'su luglio')).toBeNull();
    expect(describePeriodCashflow({ ...TOTALS, coverageRatio: null }, null, null)).toBeNull();
  });
});

describe('describeCategoryShare', () => {
  const row = (category: string, amount: number, percentage: number) => ({ category, categoryKey: category, amount, percentage });

  it('should name the top spending category and the weight of the first three', () => {
    const ranking = { rows: [row('Casa', 1150, 39.5), row('Alimentari', 520, 17.9), row('Trasporti', 310, 10.7), row('Ristoranti', 265, 9.1)], total: 2910, remainder: null };
    expect(plain(describeCategoryShare(ranking, 'expenses'))).toBe('Il 40% va in Casa; le prime tre fanno il 68%.');
    // Three rows and a residual: the clause is still informative.
    const cut = { rows: ranking.rows.slice(0, 3), total: 2910, remainder: { amount: 750, percentage: 25.8 } };
    expect(plain(describeCategoryShare(cut, 'expenses'))).toBe('Il 40% va in Casa; le prime tre fanno il 68%.');
  });

  it('should not state a tautology nor claim the whole on a rounded share', () => {
    // Exactly three categories: "le prime tre fanno il 100%" says nothing.
    const three = { rows: [row('Casa', 1600, 68.4), row('Alimentari', 620, 26.5), row('Bar', 120, 5.1)], total: 2340, remainder: null };
    expect(plain(describeCategoryShare(three, 'expenses'))).toBe('Il 68% va in Casa.');
    // A 99,6% share prints as 100% while a second row exists.
    const almost = { rows: [row('Casa', 2490, 99.6), row('Bar', 10, 0.4)], total: 2500, remainder: null };
    expect(plain(describeCategoryShare(almost, 'expenses'))).toBe('Quasi tutto in Casa.');
    const almostThree = { rows: [row('Casa', 2490, 99.6), row('Bar', 5, 0.2), row('Taxi', 3, 0.1), row('Caffè', 2, 0.1)], total: 2500, remainder: null };
    expect(plain(describeCategoryShare(almostThree, 'expenses'))).toBe('Quasi tutto in Casa; le prime tre fanno quasi tutto.');
  });

  it('should stop at the top category with fewer than three rows, and say "tutto" for a single one', () => {
    expect(plain(describeCategoryShare({ rows: [row('Casa', 900, 81.8), row('Bar', 200, 18.2)], total: 1100, remainder: null }, 'expenses'))).toBe(
      "L'82% va in Casa.",
    );
    expect(plain(describeCategoryShare({ rows: [row('Casa', 900, 100)], total: 900, remainder: null }, 'expenses'))).toBe('Tutto in Casa.');
  });

  it('should read income as a source', () => {
    const ranking = { rows: [row('Stipendio', 4200, 86.6), row('Dividendi', 650, 13.4)], total: 4850, remainder: null };
    expect(plain(describeCategoryShare(ranking, 'income'))).toBe("L'87% arriva da Stipendio.");
    expect(plain(describeCategoryShare({ rows: [row('Stipendio', 4200, 100)], total: 4200, remainder: null }, 'income'))).toBe('Tutto da Stipendio.');
  });

  it('should return null with no rows', () => {
    expect(describeCategoryShare({ rows: [], total: 0, remainder: null }, 'expenses')).toBeNull();
  });
});

describe('describeSavingsHistory', () => {
  const flow = (year: number, month: number, savingsRate: number | null): MonthFlow => ({
    key: `${year}-${String(month).padStart(2, '0')}`,
    year,
    month,
    label: 'x',
    income: savingsRate === null ? 0 : 100,
    expenses: 0,
    net: 0,
    savingsRate,
    scheduled: false,
  });
  const history = (overrides: Partial<SavingsHistory>): SavingsHistory => ({
    months: Array.from({ length: 12 }, (_, i) => flow(2026, i + 1, 30)),
    ongoing: null,
    closedCount: 12,
    average: 30.7,
    best: flow(2026, 4, 44.1),
    worst: flow(2025, 12, 12.4),
    deficitMonths: [],
    measuredCount: 12,
    ...overrides,
  });

  it('should state the average, the best month and the worst', () => {
    expect(plain(describeSavingsHistory(history({})))).toBe(
      'In media il 31%; il mese migliore è stato aprile (44%), il peggiore dicembre (12%).',
    );
  });

  it('should print a negative worst month with its sign', () => {
    expect(plain(describeSavingsHistory(history({ worst: flow(2025, 12, -8.2) })))).toContain('il peggiore dicembre (−8%)');
  });

  it('should say over how many closed months the average runs when the running month was left out', () => {
    expect(plain(describeSavingsHistory(history({ ongoing: flow(2026, 8, 57), closedCount: 11, measuredCount: 11 })))).toBe(
      'In media il 31% su 11 mesi chiusi; il mese migliore è stato aprile (44%), il peggiore dicembre (12%).',
    );
  });

  it('should print a negative average without an article and skip the ranking when every month is equal', () => {
    expect(plain(describeSavingsHistory(history({ average: -8.2, worst: flow(2025, 12, -20), best: flow(2026, 4, 2) })))).toBe(
      'In media −8%; il mese migliore è stato aprile (2%), il peggiore dicembre (−20%).',
    );
    expect(plain(describeSavingsHistory(history({ average: 30, best: flow(2026, 7, 30), worst: flow(2026, 6, 30), measuredCount: 8 })))).toBe(
      'In media il 30%, uguale in tutti gli 8 mesi con entrate.',
    );
  });

  it('should not rank a single measured month, and say so', () => {
    expect(plain(describeSavingsHistory(history({ average: 40, best: flow(2026, 8, 40), worst: flow(2026, 8, 40), measuredCount: 1 })))).toBe(
      'Un solo mese con entrate: agosto (40%).',
    );
    expect(describeSavingsHistory(history({ average: null, best: null, worst: null, measuredCount: 0 }))).toBeNull();
  });

  it('should count the deficit months in the footer, naming up to three', () => {
    // The fixture's twelve months end in December 2026; NOW is August 2026 → the window does not end today.
    const ending = (month: number) => history({ months: Array.from({ length: 12 }, (_, i) => flow(month + i > 12 ? 2026 : 2025, ((month + i - 1) % 12) + 1, 30)) });
    const current = ending(9); // Sep 2025 → Aug 2026
    // The window ends today → the running month is not ranked: the footer counts the closed ones.
    expect(plain(describeDeficitMonths({ ...current, ongoing: current.months[11], closedCount: 11, measuredCount: 11 }, NOW))).toBe(
      'Nessun mese in deficit negli 11 chiusi.',
    );
    expect(plain(describeDeficitMonths(history({}), NOW))).toBe('Nessun mese in deficit nei 12 mesi fino a dicembre 2026.');
    const past = history({ months: Array.from({ length: 12 }, (_, i) => flow(i < 4 ? 2024 : 2025, ((8 + i) % 12) + 1, 30)) });
    expect(plain(describeDeficitMonths(past, NOW))).toBe('Nessun mese in deficit nei 12 mesi fino ad agosto 2025.');
    expect(plain(describeDeficitMonths(history({ deficitMonths: [flow(2025, 12, -8)] }), NOW))).toBe('1 mese in deficit: dicembre.');
    expect(plain(describeDeficitMonths(history({ deficitMonths: [flow(2025, 11, -1), flow(2025, 12, -8), flow(2026, 3, -2)] }), NOW))).toBe(
      '3 mesi in deficit: novembre, dicembre e marzo.',
    );
    expect(
      plain(describeDeficitMonths(history({ deficitMonths: [flow(2025, 10, -1), flow(2025, 11, -1), flow(2025, 12, -8), flow(2026, 3, -2)] }), NOW)),
    ).toBe('4 mesi in deficit: ottobre, novembre, dicembre e un altro.');
    expect(plain(describeDeficitMonths(history({ measuredCount: 9 }), NOW))).toBe('Nessun mese in deficit nei 9 con entrate.');
    expect(plain(describeDeficitMonths(history({ measuredCount: 8 }), NOW))).toBe('Nessun mese in deficit negli 8 con entrate.');
    expect(plain(describeDeficitMonths(history({ measuredCount: 11 }), NOW))).toBe('Nessun mese in deficit negli 11 con entrate.');
    expect(plain(describeDeficitMonths(history({ measuredCount: 1 }), NOW))).toBe("Nessun deficit nell'unico mese con entrate.");
    expect(describeDeficitMonths(history({ average: null, best: null, worst: null, measuredCount: 0 }), NOW)).toBeNull();
  });

  it('should name a window as "ultimi" only when it ends today, and the hero window likewise', () => {
    const current = Array.from({ length: 12 }, (_, i) => flow(i < 4 ? 2025 : 2026, ((8 + i) % 12) + 1, 30));
    expect(plain(describeMonthWindow(current, NOW))).toBe('ultimi 12 mesi');
    expect(plain(describeMonthWindow(history({}).months, NOW))).toBe('gen 2026 – dic 2026');
    expect(plain(describeFlowWindow(current.slice(-6), false, NOW))).toBe('Ultimi 6 mesi');
    expect(plain(describeFlowWindow(current.slice(0, 6), false, NOW))).toBe('6 mesi fino a febbraio 2026');
    expect(plain(describeFlowWindow(current, true, NOW))).toBe('Mese per mese');
  });
});

/** No scheduled rows — the default for a period entirely in the past. */
const NO_SCHEDULED = { count: 0, total: 0 };

describe('describeScheduledHorizon', () => {
  it('should close on the end of the PERIOD, not on the last scheduled row', () => {
    expect(describeScheduledHorizon(AUGUST, NOW)).toBe('a fine mese');
    expect(describeScheduledHorizon({ kind: 'year', year: 2026 }, NOW)).toBe('a fine anno');
    // Another month, another year: named, so «fine mese» never means the wrong month.
    expect(describeScheduledHorizon({ kind: 'month', year: 2026, month: 10 }, NOW)).toBe('a fine ottobre');
    expect(describeScheduledHorizon({ kind: 'year', year: 2027 }, NOW)).toBe('a fine 2027');
  });

  it('should name the day of a custom range, which ends on no calendar unit', () => {
    expect(describeScheduledHorizon({ kind: 'custom', from: new Date(2026, 0, 1), to: new Date(2026, 2, 20) }, NOW)).toBe('al 20 marzo');
  });

  it('should let the sentence stand without a horizon', () => {
    const noHorizon = scheduledSentence({ count: 1, expenses: 406, income: 0, throughMonth: 10 }, null);
    expect(plain(noHorizon)).toBe(' Nel totale ci sono ancora 406 € di spese già in calendario.');
  });
});

describe('describeMovements', () => {
  it('should count the rows by type and name the largest', () => {
    const summary = { count: 47, expenseCount: 40, incomeCount: 5, transferCount: 2, largest: { label: 'Stipendio', amount: 4200, type: 'income' as const }, scheduled: NO_SCHEDULED };
    expect(plain(describeMovements(summary))).toBe('47 movimenti: 40 spese, 5 entrate e 2 trasferimenti; la voce più grande è Stipendio (4200 €).');
  });

  it('should drop an empty type and decline the singulars', () => {
    expect(plain(describeMovements({ count: 2, expenseCount: 1, incomeCount: 1, transferCount: 0, largest: { label: 'Casa', amount: 800, type: 'fixed' as const }, scheduled: NO_SCHEDULED }))).toBe(
      '2 movimenti: 1 spesa e 1 entrata; la voce più grande è Casa (800 €).',
    );
    expect(plain(describeMovements({ count: 1, expenseCount: 0, incomeCount: 0, transferCount: 1, largest: { label: 'Giroconto', amount: 300, type: 'transfer' as const }, scheduled: NO_SCHEDULED }))).toBe(
      '1 movimento: 1 trasferimento; la voce più grande è Giroconto (300 €).',
    );
    expect(describeMovements({ count: 0, expenseCount: 0, incomeCount: 0, transferCount: 0, largest: null, scheduled: NO_SCHEDULED })).toBeNull();
  });

  it('should name the scheduled rows — the clause that keeps the list honest against the tiles', () => {
    expect(
      plain(describeMovements({ count: 47, expenseCount: 40, incomeCount: 5, transferCount: 2, largest: { label: 'Stipendio', amount: 4200, type: 'income' as const }, scheduled: { count: 2, total: 406 } })),
    ).toBe('47 movimenti: 40 spese, 5 entrate e 2 trasferimenti, di cui 2 in calendario (406 €); la voce più grande è Stipendio (4200 €).');
  });

  it('should size the aside as shown of total when the list is filtered', () => {
    expect(plain(describeMovementsCount(47, 47))).toBe('47 voci');
    expect(plain(describeMovementsCount(12, 47))).toBe('12 di 47 voci');
    expect(plain(describeMovementsCount(1, 1))).toBe('1 voce');
    expect(plain(describeMovementsCount(0, 0))).toBe('nessuna voce');
  });
});
