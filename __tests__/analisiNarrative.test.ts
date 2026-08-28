/**
 * Tests for lib/utils/analisiNarrative.ts — the words of Analisi: the verdict that answers
 * «dove vanno i soldi, e cosa è cambiato?» and the reading line of every tile. Pure;
 * chartService's Firebase chain is mocked exactly like __tests__/cashflowNarrative.test.ts.
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

import { narrativeToText, type Narrative } from '@/lib/utils/narrative';
import type { PeriodCashflowTotals, ScheduledSlice } from '@/lib/utils/tracciamentoSummary';
import type { CategoryDeltaRow, TotalsPacing } from '@/lib/utils/comparisonDeltas';
import type { SpendingAnomaly } from '@/lib/utils/cashflowComposition';
import type { AnalisiPeriod, FlowSummary, SpendingPoint, TopExpenses } from '@/lib/utils/analisiSummary';
import {
  buildAnalisiVerdict,
  describeAnalisiSubject,
  describeAnalisiScheduledHorizon,
  describeAnomalies,
  describeBaseline,
  describeComparison,
  describeComparisonSummary,
  describeEntityFocus,
  describeFlow,
  describePeriodScope,
  describeSpendingChart,
  describeSpendingChartFooter,
  describeTopExpenses,
  shareInWords,
  type AnalisiVerdictInput,
} from '@/lib/utils/analisiNarrative';

const plain = (narrative: Narrative | null) => (narrative ? narrativeToText(narrative).replace(/ /g, ' ') : null);
/** The segment whose text prints as `text` (nbsp flattened), to assert its face and sign. */
const segmentOf = (narrative: Narrative | null | undefined, text: string) => narrative?.find((segment) => segment.text.replace(/ /g, ' ') === text);

const TODAY = { year: 2026, month: 8 };
const CURRENT: AnalisiPeriod = { mode: 'current', year: 2026, month: null };
const CURRENT_MONTH: AnalisiPeriod = { mode: 'current', year: 2026, month: 8 };
const PAST_MONTH: AnalisiPeriod = { mode: 'current', year: 2026, month: 3 };
const PAST_YEAR: AnalisiPeriod = { mode: 'year', year: 2025, month: null };
const PAST_YEAR_MONTH: AnalisiPeriod = { mode: 'year', year: 2025, month: 11 };
const HISTORY: AnalisiPeriod = { mode: 'history', year: null, month: null };

const TOTALS: PeriodCashflowTotals = { income: 39400, expenses: 31200, net: 8200, savingsRate: 20.81, coverageRatio: 1.2628, transferCount: 0 };

const PACING: TotalsPacing = {
  expenses: { current: 31200, previous: 29943, delta: 1257, deltaPercent: 4.198 },
  income: { current: 39400, previous: 38700, delta: 700, deltaPercent: 1.809 },
  baselineLabel: 'vs 2025 (stessi mesi, gen–ago)',
};

const ANOMALIES: SpendingAnomaly[] = [
  { key: 'variable:cat-rist', expenseType: 'variable', categoryKey: 'cat-rist', categoryLabel: 'Ristoranti', currentTotal: 430, referenceAverage: 290, deltaPercent: 48.3, absoluteDelta: 140 },
  { key: 'fixed:cat-auto', expenseType: 'fixed', categoryKey: 'cat-auto', categoryLabel: 'Auto', currentTotal: 550, referenceAverage: 420, deltaPercent: 31, absoluteDelta: 130 },
];

/** Nothing ahead — the default for a period that has already happened. */
const NOTHING_SCHEDULED: ScheduledSlice = { count: 0, expenses: 0, income: 0, throughMonth: null };

const INPUT: AnalisiVerdictInput = {
  period: CURRENT,
  today: TODAY,
  historyStartYear: 2024,
  totals: TOTALS,
  scheduled: NOTHING_SCHEDULED,
  pacing: PACING,
  baseline: 'gen–ago 2025',
  topCategory: { label: 'Casa', percentage: 33.3, categoryKey: 'cat-casa', expenseType: 'fixed' },
  grown: { label: 'Vacanze', delta: 1100, deltaPercent: 55, expenseType: 'variable', categoryKey: 'cat-vac' },
  shrunk: { label: 'Alimentari', delta: -400, deltaPercent: -6.3, expenseType: 'variable', categoryKey: 'cat-ali' },
  anomalies: ANOMALIES,
  anomalyMonth: { year: 2026, month: 8 },
};

describe('describeAnalisiSubject', () => {
  it('should name the running year as ongoing, compared with last year', () => {
    expect(describeAnalisiSubject(CURRENT, TODAY, 2024)).toEqual({
      subject: 'Nel 2026',
      inPeriod: 'nel 2026',
      ongoing: true,
      comparisonOf: "dell'anno scorso",
      comparisonPlain: "l'anno scorso",
      future: false,
    });
  });

  it('should flag a month of the running year that has not started yet', () => {
    expect(describeAnalisiSubject({ mode: 'current', year: 2026, month: 12 }, TODAY, 2024)).toMatchObject({ subject: 'A dicembre', future: true });
    expect(describeAnalisiSubject(CURRENT_MONTH, TODAY, 2024).future).toBe(false);
    expect(describeAnalisiSubject(PAST_YEAR_MONTH, TODAY, 2024).future).toBe(false);
  });

  it('should name a past year as closed, compared with the year before it', () => {
    expect(describeAnalisiSubject(PAST_YEAR, TODAY, 2024)).toMatchObject({ subject: 'Nel 2025', ongoing: false, comparisonOf: 'del 2024', comparisonPlain: 'il 2024' });
  });

  it('should name a month with the euphonic "ad", the year only when it differs from today', () => {
    expect(describeAnalisiSubject(CURRENT_MONTH, TODAY, 2024)).toMatchObject({ subject: 'Ad agosto', inPeriod: 'ad agosto', ongoing: true, comparisonOf: 'di agosto 2025', comparisonPlain: 'agosto 2025' });
    expect(describeAnalisiSubject(PAST_MONTH, TODAY, 2024)).toMatchObject({ subject: 'A marzo', ongoing: false, comparisonOf: 'di marzo 2025' });
    expect(describeAnalisiSubject(PAST_YEAR_MONTH, TODAY, 2024)).toMatchObject({ subject: 'A novembre 2025', ongoing: false, comparisonOf: 'di novembre 2024' });
  });

  it('should open the history on its floor year, with no comparison', () => {
    expect(describeAnalisiSubject(HISTORY, TODAY, 2024)).toEqual({ subject: 'Dal 2024', inPeriod: 'dal 2024', ongoing: true, comparisonOf: null, comparisonPlain: null, future: false });
  });
});

describe('describeAnalisiScheduledHorizon', () => {
  it('should follow the window: the year to December, a month to its own end', () => {
    expect(describeAnalisiScheduledHorizon(CURRENT, TODAY)).toBe('a fine anno');
    expect(describeAnalisiScheduledHorizon(PAST_YEAR, TODAY)).toBe(`a fine ${PAST_YEAR.year}`);
    expect(describeAnalisiScheduledHorizon({ mode: 'current', year: 2026, month: 8 }, TODAY)).toBe('a fine mese');
    expect(describeAnalisiScheduledHorizon({ mode: 'current', year: 2026, month: 10 }, TODAY)).toBe('a fine ottobre');
  });

  it('should have no horizon for the history — an end nobody can name is not guessed', () => {
    expect(describeAnalisiScheduledHorizon(HISTORY, TODAY)).toBeNull();
  });
});

describe('the ytd mode in words', () => {
  const YTD = { mode: 'ytd' as const, year: 2026, month: null };

  it('should say «finora», so it is never read as the whole year', () => {
    expect(describeAnalisiSubject(YTD, TODAY, 2024).subject).toBe('Nel 2026 finora');
    expect(describeAnalisiSubject(YTD, TODAY, 2024).inPeriod).toBe('nel 2026 finora');
    // The whole running year keeps the bare form — the two must not collide.
    expect(describeAnalisiSubject(CURRENT, TODAY, 2024).subject).toBe('Nel 2026');
  });

  it('should size its aside by the months it covers, with nothing in the calendar', () => {
    expect(plain(describePeriodScope(YTD, TODAY, null, 2024))).toBe('8 mesi');
    // The whole year still says twelve and how many have not started.
    expect(plain(describePeriodScope(CURRENT, TODAY, null, 2024))).toBe('12 mesi · 4 in calendario');
  });
});

describe('describeBaseline', () => {
  it('should name the same months, the whole year or the single month of the comparison year', () => {
    expect(describeBaseline({ kind: 'sameMonths', upToMonth: 8 }, 2025)).toBe('gen–ago 2025');
    expect(describeBaseline({ kind: 'sameMonths', upToMonth: 12 }, 2025)).toBe('2025');
    expect(describeBaseline({ kind: 'fullYear' }, 2024)).toBe('2024');
    expect(describeBaseline({ kind: 'singleMonth', month: 8, inProgress: true }, 2025)).toBe('agosto 2025 (mese in corso)');
    expect(describeBaseline({ kind: 'singleMonth', month: 3 }, 2025)).toBe('marzo 2025');
  });
});

describe('shareInWords', () => {
  it('should say a share in words where a fraction is honest, else as the printed percentage', () => {
    expect(plain(shareInWords(33.3))).toBe('un terzo');
    expect(plain(shareInWords(25.9))).toBe('un quarto');
    expect(plain(shareInWords(49))).toBe('la metà');
    expect(plain(shareInWords(88))).toBe('quasi tutto');
    expect(plain(shareInWords(19.4))).toBe('il 19%');
    expect(plain(shareInWords(8.2))).toBe("l'8%");
  });
});

describe('buildAnalisiVerdict', () => {
  it('should build the canonical verdict: total, pacing, top share, top mover and the anomalies', () => {
    // Act
    const verdict = buildAnalisiVerdict(INPUT);

    // Assert
    expect(verdict.headline).toBe("Nel 2026 spendi più dell'anno scorso.");
    expect(verdict.tone).toBe('warning');
    expect(plain(verdict.sentence)).toBe(
      'Nel 2026 hai speso 31.200 €, +4,2% su gen–ago 2025; Casa pesa un terzo e Vacanze è la categoria cresciuta di più (+1100 €); ad agosto 2 categorie sono fuori scala: Ristoranti e Auto.',
    );
    const rise = segmentOf(verdict.sentence, '+4,2%');
    expect(rise).toMatchObject({ mono: true, sign: 'negative' });
    const mover = segmentOf(verdict.sentence, '+1100 €');
    expect(mover).toMatchObject({ mono: true, sign: 'negative' });
  });

  it('should read a fall as positive and a printed 0,0% as in line', () => {
    const falling = buildAnalisiVerdict({
      ...INPUT,
      pacing: { ...PACING, expenses: { current: 28000, previous: 29943, delta: -1943, deltaPercent: -6.49 } },
      anomalies: [],
    });
    expect(falling.headline).toBe("Nel 2026 spendi meno dell'anno scorso.");
    expect(falling.tone).toBe('positive');
    expect(plain(falling.sentence)).toContain('hai speso 31.200 €, −6,5% su gen–ago 2025;');
    expect(segmentOf(falling.sentence, '−6,5%')).toMatchObject({ sign: 'positive' });

    const flat = buildAnalisiVerdict({
      ...INPUT,
      pacing: { ...PACING, expenses: { current: 29950, previous: 29943, delta: 7, deltaPercent: 0.02 } },
      anomalies: [],
    });
    expect(flat.headline).toBe("Nel 2026 spendi come l'anno scorso.");
    expect(flat.tone).toBe('neutral');
    expect(plain(flat.sentence)).toContain('hai speso 31.200 €, in linea con gen–ago 2025;');
  });

  it('should conjugate a closed year in the past and compare it with the year before', () => {
    const verdict = buildAnalisiVerdict({ ...INPUT, period: PAST_YEAR, baseline: '2024', anomalies: [], anomalyMonth: null });
    expect(verdict.headline).toBe('Nel 2025 hai speso più del 2024.');
    expect(plain(verdict.sentence)).toBe('Nel 2025 hai speso 31.200 €, +4,2% su 2024; Casa pesa un terzo e Vacanze è la categoria cresciuta di più (+1100 €).');
  });

  it('should drop the month count clause for a month and name the anomalies without repeating the month', () => {
    const verdict = buildAnalisiVerdict({ ...INPUT, period: CURRENT_MONTH, baseline: 'agosto 2025', grown: null, shrunk: null });
    expect(verdict.headline).toBe('Ad agosto spendi più di agosto 2025.');
    expect(plain(verdict.sentence)).toBe('Ad agosto hai speso 31.200 €, +4,2% su agosto 2025; Casa pesa un terzo; 2 categorie sono fuori scala: Ristoranti e Auto.');
  });

  it('should fall back to the heaviest category when there is nothing to compare', () => {
    const history = buildAnalisiVerdict({ ...INPUT, period: HISTORY, pacing: null, baseline: null, grown: null, shrunk: null, anomalies: [], anomalyMonth: null });
    expect(history.headline).toBe('Casa è la voce più pesante.');
    expect(history.tone).toBe('neutral');
    expect(plain(history.sentence)).toBe('Dal 2024 hai speso 31.200 €; Casa pesa un terzo.');
  });

  it('should say «ed è anche» when the heaviest category is the one that moved the most', () => {
    const verdict = buildAnalisiVerdict({ ...INPUT, grown: { label: 'Casa', delta: 680, deltaPercent: 7.5, expenseType: 'fixed', categoryKey: 'cat-casa' }, anomalies: [] });
    expect(plain(verdict.sentence)).toContain('Casa pesa un terzo ed è anche la categoria cresciuta di più (+680 €).');
    // A same-named category under another type is a different category.
    const namesake = buildAnalisiVerdict({ ...INPUT, grown: { label: 'Casa', delta: 680, deltaPercent: 7.5, expenseType: 'variable', categoryKey: 'cat-casa-var' }, anomalies: [] });
    expect(plain(namesake.sentence)).toContain('Casa pesa un terzo e Casa è la categoria cresciuta di più (+680 €).');
  });

  it('should name the largest fall when no category grew', () => {
    const verdict = buildAnalisiVerdict({ ...INPUT, grown: null, anomalies: [] });
    expect(plain(verdict.sentence)).toContain('Casa pesa un terzo e Alimentari è la categoria calata di più (−400 €).');
    expect(segmentOf(verdict.sentence, '−400 €')).toMatchObject({ sign: 'positive' });
  });

  it('should say one anomaly in the singular and cut a long list', () => {
    const one = buildAnalisiVerdict({ ...INPUT, grown: null, shrunk: null, anomalies: [ANOMALIES[0]] });
    expect(plain(one.sentence)).toContain('; ad agosto 1 categoria è fuori scala: Ristoranti.');

    const many = buildAnalisiVerdict({
      ...INPUT,
      grown: null,
      shrunk: null,
      anomalies: [...ANOMALIES, { ...ANOMALIES[0], key: 'k3', categoryLabel: 'Sport' }, { ...ANOMALIES[0], key: 'k4', categoryLabel: 'Casa' }, { ...ANOMALIES[0], key: 'k5', categoryLabel: 'Regali' }],
    });
    expect(plain(many.sentence)).toContain('; ad agosto 5 categorie sono fuori scala: Ristoranti, Auto, Sport e altre 2.');
  });

  it('should close by naming what the period still has in the calendar', () => {
    const verdict = buildAnalisiVerdict({ ...INPUT, scheduled: { count: 3, expenses: 1850, income: 500, throughMonth: 12 } });
    expect(plain(verdict.sentence)).toContain('In calendario ci sono ancora 1850 € di spese e 500 € di entrate da qui a fine anno.');
  });

  it('should drop the pacing clause when the baseline is zero and keep the rest', () => {
    const verdict = buildAnalisiVerdict({
      ...INPUT,
      pacing: { ...PACING, expenses: { current: 31200, previous: 0, delta: 31200, deltaPercent: null } },
      anomalies: [],
    });
    expect(verdict.headline).toBe('Casa è la voce più pesante.');
    // No baseline → no pacing AND no mover: «cresciuta» against nothing would name no window.
    expect(plain(verdict.sentence)).toBe('Nel 2026 hai speso 31.200 €; Casa pesa un terzo.');
  });

  it('should refuse a verdict on a month that has not started, naming what is already in the calendar', () => {
    const december = buildAnalisiVerdict({ ...INPUT, period: { mode: 'current', year: 2026, month: 12 }, pacing: null, baseline: null, totals: { ...TOTALS, income: 0, expenses: 800, net: -800, savingsRate: null, coverageRatio: null }, anomalies: [], anomalyMonth: null });
    expect(december.headline).toBe('Dicembre non è ancora iniziato.');
    expect(december.tone).toBe('neutral');
    expect(plain(december.sentence)).toBe('Dicembre non è ancora iniziato: 800 € già in calendario.');
    const empty = buildAnalisiVerdict({ ...INPUT, period: { mode: 'current', year: 2026, month: 12 }, pacing: null, baseline: null, totals: { income: 0, expenses: 0, net: 0, savingsRate: null, coverageRatio: null, transferCount: 0 }, topCategory: null, anomalies: [], anomalyMonth: null });
    expect(plain(empty.sentence)).toBe('Dicembre non è ancora iniziato: nessuna spesa in calendario.');
  });

  it('should state the absence of spending, and of any movement, plainly', () => {
    const noSpending = buildAnalisiVerdict({ ...INPUT, totals: { ...TOTALS, expenses: 0, net: 39400, savingsRate: 100, coverageRatio: null }, pacing: null, topCategory: null, grown: null, shrunk: null, anomalies: [] });
    expect(noSpending.headline).toBe('Nessuna spesa nel 2026.');
    expect(noSpending.tone).toBe('neutral');
    expect(plain(noSpending.sentence)).toBe('Nel 2026 nessuna spesa: entrate 39.400 €.');

    const nothing = buildAnalisiVerdict({ ...INPUT, totals: { income: 0, expenses: 0, net: 0, savingsRate: null, coverageRatio: null, transferCount: 2 }, pacing: null, topCategory: null, grown: null, shrunk: null, anomalies: [] });
    expect(nothing.headline).toBe('Nessun movimento nel 2026.');
    expect(plain(nothing.sentence)).toBe('Solo 2 trasferimenti tra i tuoi conti.');
  });
});

describe('describePeriodScope', () => {
  it('should count the months of a year, the day of the running month, the floor of the history', () => {
    // A running year covers twelve months and says how many have not started.
    expect(plain(describePeriodScope(CURRENT, TODAY, null, 2024))).toBe('12 mesi · 4 in calendario');
    expect(plain(describePeriodScope({ mode: 'current', year: 2026, month: null }, { year: 2026, month: 1 }, null, 2024))).toBe('12 mesi · 11 in calendario');
    expect(plain(describePeriodScope(PAST_YEAR, TODAY, null, 2024))).toBe('12 mesi');
    expect(plain(describePeriodScope(CURRENT_MONTH, TODAY, { dayOfMonth: 25, daysInMonth: 31 }, 2024))).toBe('giorno 25 di 31');
    expect(describePeriodScope(PAST_MONTH, TODAY, null, 2024)).toBeNull();
    expect(plain(describePeriodScope(HISTORY, TODAY, null, 2024))).toBe('dal 2024');
  });
});

describe('describeSpendingChart', () => {
  it('should name the series and the years it draws', () => {
    expect(plain(describeSpendingChart('month', 2026, true, 2024))).toBe('Spese per mese · 2026 e 2025');
    expect(plain(describeSpendingChart('month', 2026, false, 2024))).toBe('Spese per mese · 2026');
    expect(plain(describeSpendingChart('year', null, false, 2024))).toBe('Spese per anno · dal 2024');
  });
});

describe('describeSpendingChartFooter', () => {
  const point = (key: string, label: string, ongoing: boolean, prev: number | null): SpendingPoint => ({ key, label, value: 100, prevYearValue: prev, ongoing, scheduled: false });

  it('should explain the half-tone running month and the previous year, or its absence', () => {
    expect(plain(describeSpendingChartFooter([point('2026-07', 'Lug', false, 90), point('2026-08', 'Ago', true, 80)], 'month', 2026, 2024))).toBe('Agosto è in corso: barra a metà tono; il 2025 è disegnato sugli stessi mesi.');
    expect(plain(describeSpendingChartFooter([point('2026-03', 'Mar', false, null)], 'month', 2026, 2026))).toBe('Lo storico parte dal 2026: nessun 2025 da confrontare.');
    expect(plain(describeSpendingChartFooter([point('2026-03', 'Mar', false, null)], 'month', 2026, 2024))).toBe('Nessuna spesa registrata nel 2025: nessun confronto.');
    expect(plain(describeSpendingChartFooter([point('2025', '2025', false, null), point('2026', '2026', true, null)], 'year', null, 2024))).toBe('Il 2026 è in corso: barra a metà tono.');
    expect(describeSpendingChartFooter([point('2025-03', 'Mar', false, 10)], 'month', 2025, 2024)).toBeNull();
  });
});

describe('describeAnomalies', () => {
  it('should count the categories over their own average, singular and plural, or say none', () => {
    expect(plain(describeAnomalies(ANOMALIES))).toBe('2 categorie oltre la loro media dei 6 mesi precedenti.');
    expect(plain(describeAnomalies([ANOMALIES[0]]))).toBe('1 categoria oltre la sua media dei 6 mesi precedenti.');
    expect(plain(describeAnomalies([]))).toBe('Nessuna categoria oltre la sua media dei 6 mesi precedenti.');
  });
});

describe('describeTopExpenses', () => {
  const row = (label: string, amount: number, sub: string | null = null) => ({
    key: label,
    label,
    subCategoryLabel: sub,
    caption: '1 gen',
    amount,
    percentage: 1,
    expenseType: 'variable' as const,
    categoryKey: label,
    subCategoryKey: null,
  });

  it('should say the share of the top rows and name the largest with its subcategory', () => {
    const top: TopExpenses = { rows: [row('Vacanze', 1180, 'Volo'), row('Auto', 940), row('Casa', 860), row('Vacanze', 720), row('Salute', 650)], shownTotal: 4350, total: 31200, count: 412 };
    expect(plain(describeTopExpenses(top))).toBe('Le cinque più grandi fanno il 14% delle spese; la più grande è Vacanze · Volo (1180 €).');
    // Rows beyond the five that round to 0% must not make the five «il 100%».
    expect(plain(describeTopExpenses({ ...top, shownTotal: 4350, total: 4360, count: 7 }))).toBe('Le cinque più grandi fanno quasi tutte le spese; la più grande è Vacanze · Volo (1180 €).');
  });

  it('should count them all when nothing is cut, and handle a single row', () => {
    const three: TopExpenses = { rows: [row('Casa', 860), row('Auto', 300), row('Cibo', 40)], shownTotal: 1200, total: 1200, count: 3 };
    expect(plain(describeTopExpenses(three))).toBe('3 spese in tutto; la più grande è Casa (860 €).');
    const one: TopExpenses = { rows: [row('Casa', 860)], shownTotal: 860, total: 860, count: 1 };
    expect(plain(describeTopExpenses(one))).toBe('Una sola spesa: Casa (860 €).');
    expect(describeTopExpenses({ rows: [], shownTotal: 0, total: 0, count: 0 })).toBeNull();
  });
});

describe('describeFlow', () => {
  const FLOW: FlowSummary = {
    incomeTotal: 39400,
    incomeSources: 4,
    expensesTotal: 31200,
    categoryCount: 10,
    typeShares: [
      { type: 'fixed', label: 'Fisse', amount: 18100, percentage: 58 },
      { type: 'variable', label: 'Variabili', amount: 11540, percentage: 37 },
      { type: 'debt', label: 'Debiti', amount: 1560, percentage: 5 },
    ],
  };

  it('should describe the flow from the sources to the types and categories, with the savings share', () => {
    expect(plain(describeFlow(FLOW, 20.81))).toBe('Da 4 fonti (39.400 €) a 3 tipi di spesa e 10 categorie; il 21% resta come risparmio. Fisse 58%, variabili 37%, debiti 5%.');
  });

  it('should say when spending exceeds income, and when there is one source or one type', () => {
    expect(plain(describeFlow({ ...FLOW, incomeSources: 1, typeShares: [FLOW.typeShares[0]] }, -12.3))).toBe('Da una fonte (39.400 €) a 1 tipo di spesa e 10 categorie; le spese superano le entrate del 12,3%. Tutte spese fisse.');
    expect(plain(describeFlow({ ...FLOW, typeShares: [FLOW.typeShares[2]] }, 10))).toContain('Tutte spese di debito.');
    expect(plain(describeFlow({ incomeTotal: 3200, incomeSources: 2, expensesTotal: 0, categoryCount: 0, typeShares: [] }, 100))).toBe('Nessuna spesa: 3200 € da 2 fonti, tutto resta come risparmio.');
  });

  it('should describe spending without income, and return null with nothing', () => {
    expect(plain(describeFlow({ ...FLOW, incomeTotal: 0, incomeSources: 0 }, null))).toBe('Nessuna entrata: 31.200 € di spese in 10 categorie. Fisse 58%, variabili 37%, debiti 5%.');
    expect(describeFlow({ incomeTotal: 0, incomeSources: 0, expensesTotal: 0, categoryCount: 0, typeShares: [] }, null)).toBeNull();
  });
});

describe('describeEntityFocus', () => {
  const subject = describeAnalisiSubject(CURRENT, TODAY, 2024);

  it('should state the period total, its shares, the delta on the same months and the pace', () => {
    const reading = describeEntityFocus({
      label: 'Condominio',
      parentLabel: 'Casa',
      isIncome: false,
      subject,
      periodTotal: 1200,
      shareOfPeriod: 0.03846,
      shareOfParent: 0.1154,
      delta: { amount: 90, percent: 8.1, sameMonths: true, comparisonYear: 2025 },
      monthlyAverage: 150,
      hasHistory: true,
      historyStartYear: 2024,
    });
    expect(plain(reading)).toBe("Nel 2026 hai speso 1200 € in Condominio, l'11,5% di Casa e il 3,8% delle spese; +8,1% sugli stessi mesi del 2025, al ritmo di 150 € al mese.");
    expect(segmentOf(reading, '+8,1%')).toMatchObject({ sign: 'negative' });
  });

  it('should read an income entity, a full-year delta and a zero baseline honestly', () => {
    const reading = describeEntityFocus({
      label: 'Stipendio',
      parentLabel: null,
      isIncome: true,
      subject: describeAnalisiSubject(PAST_YEAR, TODAY, 2024),
      periodTotal: 34800,
      shareOfPeriod: 0.883,
      shareOfParent: null,
      delta: { amount: 1200, percent: 3.6, sameMonths: false, comparisonYear: 2024 },
      monthlyAverage: 2900,
      hasHistory: true,
      historyStartYear: 2024,
    });
    expect(plain(reading)).toBe("Nel 2025 hai incassato 34.800 € da Stipendio, l'88,3% delle entrate; +3,6% sul 2024, al ritmo di 2900 € al mese.");
    expect(segmentOf(reading, '+3,6%')).toMatchObject({ sign: 'positive' });

    const fresh = describeEntityFocus({ label: 'Regali', parentLabel: null, isIncome: false, subject, periodTotal: 70, shareOfPeriod: 0.002, shareOfParent: null, delta: { amount: 70, percent: null, sameMonths: true, comparisonYear: 2025 }, monthlyAverage: null, hasHistory: true, historyStartYear: 2024 });
    expect(plain(fresh)).toBe('Nel 2026 hai speso 70 € in Regali, lo 0,2% delle spese; +70 € sugli stessi mesi del 2025, dove non c\'era.');
  });

  it('should say when the entity has nothing in the period, or nothing at all', () => {
    const empty = describeEntityFocus({ label: 'Skipass', parentLabel: 'Viaggi', isIncome: false, subject, periodTotal: 0, shareOfPeriod: null, shareOfParent: null, delta: null, monthlyAverage: null, hasHistory: true, historyStartYear: 2024 });
    expect(plain(empty)).toBe('Nessuna spesa in Skipass nel 2026; la storia sotto copre tutti gli anni.');
    const never = describeEntityFocus({ label: 'Skipass', parentLabel: 'Viaggi', isIncome: false, subject, periodTotal: 0, shareOfPeriod: null, shareOfParent: null, delta: null, monthlyAverage: null, hasHistory: false, historyStartYear: 2024 });
    expect(plain(never)).toBe('Nessuna transazione registrata per Skipass dal 2024.');
  });
});

describe('describeComparison', () => {
  const row = (label: string, delta: number, previous = 1000): CategoryDeltaRow => ({
    key: `variable:${label}`,
    expenseType: 'variable',
    categoryKey: label,
    label,
    current: previous + delta,
    previous,
    delta,
    deltaPercent: previous === 0 ? null : (delta / previous) * 100,
    status: previous === 0 ? 'new' : current(previous, delta) === 0 ? 'gone' : 'ongoing',
  });
  const current = (previous: number, delta: number) => previous + delta;
  const ROWS = [row('Vacanze', 1100), row('Alimentari', -400), row('Ristoranti', 420), row('Auto', 300), row('Salute', 110), row('Sport', -30)];
  const subject = describeAnalisiSubject(CURRENT, TODAY, 2024);

  it('should give the total difference, then the three largest rises and the largest fall', () => {
    const reading = describeComparison({ subject, scope: { kind: 'sameMonths', upToMonth: 8 }, comparisonYear: 2025, expenses: PACING.expenses, rows: ROWS });
    expect(plain(reading)).toBe('Nel 2026 (gen–ago) hai speso 1257 € in più del 2025 (+4,2%); a crescere di più sono state Vacanze (+1100 €), Ristoranti (+420 €) e Auto (+300 €), a calare di più Alimentari (−400 €).');
    expect(segmentOf(reading, '1257 €')).toMatchObject({ sign: 'negative' });
  });

  it('should read a fall, a flat year and a single month', () => {
    const fall = describeComparison({ subject: describeAnalisiSubject(PAST_YEAR, TODAY, 2024), scope: { kind: 'fullYear' }, comparisonYear: 2024, expenses: { current: 28000, previous: 29943, delta: -1943, deltaPercent: -6.49 }, rows: [row('Alimentari', -400), row('Vacanze', 200)] });
    expect(plain(fall)).toBe('Nel 2025 hai speso 1943 € in meno del 2024 (−6,5%); a calare di più è stata Alimentari (−400 €), a crescere di più Vacanze (+200 €).');

    const flat = describeComparison({ subject, scope: { kind: 'sameMonths', upToMonth: 8 }, comparisonYear: 2025, expenses: { current: 29950, previous: 29943, delta: 7, deltaPercent: 0.02 }, rows: [] });
    expect(plain(flat)).toBe('Nel 2026 (gen–ago) hai speso come nel 2025 (29.950 €).');

    const month = describeComparison({ subject: describeAnalisiSubject(CURRENT_MONTH, TODAY, 2024), scope: { kind: 'singleMonth', month: 8, inProgress: true }, comparisonYear: 2025, expenses: { current: 3600, previous: 3543, delta: 57, deltaPercent: 1.6 }, rows: [row('Auto', 57)] });
    expect(plain(month)).toBe('Ad agosto hai speso 57 € in più di agosto 2025 (+1,6%), a mese in corso; a crescere di più è stata Auto (+57 €).');
  });

  it('should return null without a baseline', () => {
    expect(describeComparison({ subject, scope: { kind: 'sameMonths', upToMonth: 8 }, comparisonYear: 2025, expenses: { current: 100, previous: 0, delta: 100, deltaPercent: null }, rows: [] })).toBeNull();
  });
});

describe('describeComparisonSummary', () => {
  it('should restate the module baseline caption and the signed difference', () => {
    expect(plain(describeComparisonSummary(2026, PACING))).toBe('2026 vs 2025 (stessi mesi, gen–ago) · +1257 €');
    expect(plain(describeComparisonSummary(2026, { ...PACING, expenses: { current: 100, previous: 300, delta: -200, deltaPercent: -66.7 } }))).toBe('2026 vs 2025 (stessi mesi, gen–ago) · −200 €');
  });
});
