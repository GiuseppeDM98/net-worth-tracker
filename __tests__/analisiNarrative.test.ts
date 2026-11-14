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

import { narrativeToText, splitVerdict, type Narrative } from '@/lib/utils/narrative';
import type { StripFigure } from '@/lib/utils/verdictStrip';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { readSavings } from '@/lib/utils/savingsRate';
import type { PeriodCashflowTotals, ScheduledSlice } from '@/lib/utils/tracciamentoSummary';
import type { CategoryDeltaRow, TotalsPacing } from '@/lib/utils/comparisonDeltas';
import type { SpendingAnomaly } from '@/lib/utils/cashflowComposition';
import type { AnalisiPeriod, FlowSummary, SpendingPoint, TopExpenses, TypeFlowBreakdown } from '@/lib/utils/analisiSummary';
import { summarizeSpendingRoleShares, type SpendingRolesSummary } from '@/lib/utils/spendingRoles';
import { scheduledSentence } from '@/lib/utils/cashflowNarrative';
import {
  buildAnalisiVerdict,
  collectPrintedFigures,
  describeAnalisiScope,
  describeAnalisiSubject,
  describeAnalisiScheduledHorizon,
  describeAnomalies,
  describeBaseline,
  describeComparison,
  describeComparisonSummary,
  describeEntityFocus,
  describeFlow,
  describeFlowAbsence,
  describeFlowSurplus,
  describeMissingBaseline,
  describeShareCompact,
  describePeriodScope,
  describeSpendingRolesBar,
  describeSpendingRolesFlow,
  describeTypeFlowBar,
  describeSpendingChart,
  describeSpendingChartFooter,
  describeTopExpenses,
  shareInWords,
  describeAnalisiClosedAnswers,
  type AnalisiVerdictInput,
} from '@/lib/utils/analisiNarrative';
import { ANALISI_SECTION_IDS } from '@/lib/utils/analisiSummary';
import { SPENDING_BUCKET_LABELS } from '@/lib/utils/spendingRoles';

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
    // The running month is judged on its lived days, and says so — like «Nel 2026 finora».
    expect(describeAnalisiSubject(CURRENT_MONTH, TODAY, 2024)).toMatchObject({ subject: 'Ad agosto finora', inPeriod: 'ad agosto finora', ongoing: true, comparisonOf: 'di agosto 2025', comparisonPlain: 'agosto 2025' });
    expect(describeAnalisiSubject(PAST_MONTH, TODAY, 2024)).toMatchObject({ subject: 'A marzo', ongoing: false, comparisonOf: 'di marzo 2025' });
    expect(describeAnalisiSubject(PAST_YEAR_MONTH, TODAY, 2024)).toMatchObject({ subject: 'A novembre 2025', ongoing: false, comparisonOf: 'di novembre 2024' });
  });

  it('should span the history from its floor year to the current one, with no comparison', () => {
    // Two ends: a materialised plan reaching 2043 must not stretch «Dal 2024» into the future.
    expect(describeAnalisiSubject(HISTORY, TODAY, 2024)).toEqual({ subject: 'Dal 2024 al 2026', inPeriod: 'dal 2024 al 2026', ongoing: true, comparisonOf: null, comparisonPlain: null, future: false });
    // A history that starts this year is just this year.
    expect(describeAnalisiSubject(HISTORY, TODAY, 2026)).toMatchObject({ subject: 'Nel 2026', inPeriod: 'nel 2026' });
  });
});

describe('describeAnalisiScheduledHorizon', () => {
  it('should follow the window: the year to December, a month to its own end', () => {
    expect(describeAnalisiScheduledHorizon(CURRENT, TODAY)).toBe('a fine anno');
    expect(describeAnalisiScheduledHorizon(PAST_YEAR, TODAY)).toBe(`a fine ${PAST_YEAR.year}`);
    expect(describeAnalisiScheduledHorizon({ mode: 'current', year: 2026, month: 8 }, TODAY)).toBe('a fine mese');
    expect(describeAnalisiScheduledHorizon({ mode: 'current', year: 2026, month: 10 }, TODAY)).toBe('a fine ottobre');
  });

  it('should close the history on the current year, like the running year', () => {
    expect(describeAnalisiScheduledHorizon(HISTORY, TODAY)).toBe('a fine anno');
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
    // Cut at today's day on both sides: the baseline names the days, not a partial window.
    expect(describeBaseline({ kind: 'singleMonth', month: 8, inProgress: true, throughDay: 14 }, 2025)).toBe('agosto 2025 (primi 14 giorni)');
    expect(describeBaseline({ kind: 'singleMonth', month: 3 }, 2025)).toBe('marzo 2025');
  });
});

describe('describeMissingBaseline', () => {
  it('should say which baseline window is empty, so a dropped comparison is never silent', () => {
    expect(describeMissingBaseline({ kind: 'singleMonth', month: 9, inProgress: true, throughDay: 14 }, 2025)).toBe('Nessun movimento nei primi 14 giorni di settembre 2025: nessun confronto.');
    expect(describeMissingBaseline({ kind: 'singleMonth', month: 8 }, 2025)).toBe('Nessun movimento ad agosto 2025: nessun confronto.');
    expect(describeMissingBaseline({ kind: 'sameMonths', upToMonth: 8 }, 2025)).toBe('Nessun movimento in gen–ago 2025: nessun confronto.');
    expect(describeMissingBaseline({ kind: 'sameMonths', upToMonth: 12 }, 2025)).toBe('Nessun movimento nel 2025: nessun confronto.');
    expect(describeMissingBaseline({ kind: 'fullYear' }, 2024)).toBe('Nessun movimento nel 2024: nessun confronto.');
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
      'Nel 2026 hai speso 31.200 €, +4,2% su gen–ago 2025. Casa pesa un terzo e Vacanze è la categoria cresciuta di più (+1100 €); ad agosto 2 categorie sono fuori scala: Ristoranti e Auto.',
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
    expect(plain(falling.sentence)).toContain('hai speso 31.200 €, −6,5% su gen–ago 2025.');
    expect(segmentOf(falling.sentence, '−6,5%')).toMatchObject({ sign: 'positive' });

    const flat = buildAnalisiVerdict({
      ...INPUT,
      pacing: { ...PACING, expenses: { current: 29950, previous: 29943, delta: 7, deltaPercent: 0.02 } },
      anomalies: [],
    });
    expect(flat.headline).toBe("Nel 2026 spendi come l'anno scorso.");
    expect(flat.tone).toBe('neutral');
    expect(plain(flat.sentence)).toContain('hai speso 31.200 €, in linea con gen–ago 2025.');
  });

  it('should conjugate a closed year in the past and compare it with the year before', () => {
    const verdict = buildAnalisiVerdict({ ...INPUT, period: PAST_YEAR, baseline: '2024', anomalies: [], anomalyMonth: null });
    expect(verdict.headline).toBe('Nel 2025 hai speso più del 2024.');
    expect(plain(verdict.sentence)).toBe('Nel 2025 hai speso 31.200 €, +4,2% su 2024. Casa pesa un terzo e Vacanze è la categoria cresciuta di più (+1100 €).');
  });

  it('should drop the month count clause for a month and name the anomalies without repeating the month', () => {
    const verdict = buildAnalisiVerdict({ ...INPUT, period: CURRENT_MONTH, baseline: 'agosto 2025', grown: null, shrunk: null });
    expect(verdict.headline).toBe('Ad agosto finora spendi più di agosto 2025.');
    expect(plain(verdict.sentence)).toBe('Ad agosto finora hai speso 31.200 €, +4,2% su agosto 2025. Casa pesa un terzo; 2 categorie sono fuori scala: Ristoranti e Auto.');
  });

  it('should fall back to the heaviest category when there is nothing to compare', () => {
    const history = buildAnalisiVerdict({ ...INPUT, period: HISTORY, pacing: null, baseline: null, grown: null, shrunk: null, anomalies: [], anomalyMonth: null });
    expect(history.headline).toBe('Casa è la voce più pesante.');
    expect(history.tone).toBe('neutral');
    expect(plain(history.sentence)).toBe('Dal 2024 al 2026 hai speso 31.200 €. Casa pesa un terzo.');
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

  it('should name what the period still has in the calendar in the scope, never in the sentence', () => {
    // Since 2026-10-14 (The Scheduled-Is-Not-Spent Rule): the clause left the sentence and became the verdict's
    // `scope`, rendered at every width. Seen red with `scheduledSentence` left at the sentence's end.
    const input = { ...INPUT, scheduled: { count: 3, expenses: 1850, income: 500, throughMonth: 12 } };
    expect(plain(buildAnalisiVerdict(input).sentence)).not.toContain('in calendario');
    expect(plain(describeAnalisiScope(input)!)).toBe('Nel totale ci sono ancora 1850 € di spese e 500 € di entrate già in calendario da qui a fine anno.');
    expect(describeAnalisiScope(INPUT)).toBeNull();
  });

  it('should drop the pacing clause when the baseline is zero and keep the rest', () => {
    const verdict = buildAnalisiVerdict({
      ...INPUT,
      pacing: { ...PACING, expenses: { current: 31200, previous: 0, delta: 31200, deltaPercent: null } },
      anomalies: [],
    });
    expect(verdict.headline).toBe('Casa è la voce più pesante.');
    // No baseline → no pacing AND no mover: «cresciuta» against nothing would name no window.
    expect(plain(verdict.sentence)).toBe('Nel 2026 hai speso 31.200 €. Casa pesa un terzo.');
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
    expect(plain(describePeriodScope(HISTORY, TODAY, null, 2024))).toBe('dal 2024 al 2026');
    expect(plain(describePeriodScope(HISTORY, TODAY, null, 2026))).toBe('dal 2026');
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
    scheduled: false,
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
      { type: 'fixed', label: 'Fisse', amount: 18100, percentage: 58, printedPercentage: 58 },
      { type: 'variable', label: 'Variabili', amount: 11540, percentage: 37, printedPercentage: 37 },
      { type: 'debt', label: 'Debiti', amount: 1560, percentage: 5, printedPercentage: 5 },
    ],
  };

  it('should print the shares summarizeFlow rounded, so three equal types add up to 100', () => {
    const third = 100 / 3;
    const flow: FlowSummary = {
      ...FLOW,
      expensesTotal: 3000,
      typeShares: [
        { type: 'fixed', label: 'Fisse', amount: 1000, percentage: third, printedPercentage: 34 },
        { type: 'variable', label: 'Variabili', amount: 1000, percentage: third, printedPercentage: 33 },
        { type: 'debt', label: 'Debiti', amount: 1000, percentage: third, printedPercentage: 33 },
      ],
    };
    expect(plain(describeFlow(flow, readSavings(1000, 800)))).toContain('Fisse 34%, variabili 33%, debiti 33%.');
  });

  it('should write a type that holds money but rounds to zero as «meno dell’1%», never «0%»', () => {
    const flow: FlowSummary = {
      ...FLOW,
      expensesTotal: 10000,
      typeShares: [
        { type: 'fixed', label: 'Fisse', amount: 9960, percentage: 99.6, printedPercentage: 100 },
        { type: 'debt', label: 'Debiti', amount: 40, percentage: 0.4, printedPercentage: 0 },
      ],
    };
    expect(plain(describeFlow(flow, readSavings(1000, 800)))).toContain("Fisse 100%, debiti meno dell'1%.");
  });

  it('should describe the flow from the sources to the types and categories, with the savings share', () => {
    expect(plain(describeFlow(FLOW, readSavings(10000, 7919)))).toBe('Da 4 fonti (39.400 €) a 3 tipi di spesa e 10 categorie; il 21% resta come risparmio. Fisse 58%, variabili 37%, debiti 5%.');
  });

  it('should say when spending exceeds income, and when there is one source or one type', () => {
    expect(plain(describeFlow({ ...FLOW, incomeSources: 1, typeShares: [FLOW.typeShares[0]] }, readSavings(1000, 1123)))).toBe('Da una fonte (39.400 €) a 1 tipo di spesa e 10 categorie; le spese superano le entrate del 12,3%. Tutte spese fisse.');
    expect(plain(describeFlow({ ...FLOW, typeShares: [FLOW.typeShares[2]] }, readSavings(1000, 900)))).toContain('Tutte spese di debito.');
    expect(plain(describeFlow({ incomeTotal: 3200, incomeSources: 2, expensesTotal: 0, categoryCount: 0, typeShares: [] }, readSavings(3200, 0)))).toBe('Nessuna spesa: 3200 € da 2 fonti, tutto resta come risparmio.');
  });

  it('should describe spending without income, and return null with nothing', () => {
    expect(plain(describeFlow({ ...FLOW, incomeTotal: 0, incomeSources: 0 }, readSavings(0, 31200)))).toBe('Nessuna entrata: 31.200 € di spese in 10 categorie. Fisse 58%, variabili 37%, debiti 5%.');
    expect(describeFlow({ incomeTotal: 0, incomeSources: 0, expensesTotal: 0, categoryCount: 0, typeShares: [] }, readSavings(0, 0))).toBeNull();
  });

  // The savings floor (owner, 2026-11-12): 3 € in and 500 € out is said in euros, a true −30% keeps its percentage (F1).
  it('should say a deficit beyond the floor in euros and keep a true negative rate', () => {
    const tiny = { ...FLOW, incomeTotal: 3, incomeSources: 1, expensesTotal: 500, typeShares: [FLOW.typeShares[0]] };
    expect(plain(describeFlow(tiny, readSavings(3, 500)))).toContain('; le spese superano le entrate di 497 €.');
    expect(plain(describeFlow(tiny, readSavings(3, 500)))).not.toContain('%.');
    expect(plain(describeFlow({ ...tiny, incomeTotal: 2000, expensesTotal: 2600 }, readSavings(2000, 2600)))).toContain('; le spese superano le entrate del 30,0%.');
  });
});

/** A roles summary built from bucket totals — the words depend on nothing else. */
const rolesSummary = (overrides: {
  income: number;
  need?: number;
  want?: number;
  saving?: number;
  unclassified?: number;
  rowCount?: number;
}): SpendingRolesSummary => {
  const bucket = (total = 0) => ({ total, categories: [] });
  const spending = (overrides.need ?? 0) + (overrides.want ?? 0) + (overrides.saving ?? 0) + (overrides.unclassified ?? 0);
  const surplus = Math.max(0, overrides.income - spending);
  return {
    income: overrides.income,
    incomeCategories: [],
    spending,
    byBucket: { need: bucket(overrides.need), want: bucket(overrides.want), saving: bucket(overrides.saving), unclassified: bucket(overrides.unclassified) },
    surplus,
    deficit: Math.max(0, spending - overrides.income),
    savings: (overrides.saving ?? 0) + surplus,
    rowCount: overrides.rowCount ?? 1,
  };
};

describe('describeSpendingRolesFlow', () => {
  const summary = rolesSummary;

  it('reads the three roles as shares of the income when something is left', () => {
    // Risparmi is the surplus: 10.000 − 5.700 − 2.100 = 2.200.
    expect(plain(describeSpendingRolesFlow(summary({ income: 10000, need: 5700, want: 2100 })))).toBe(
      'Delle entrate (10.000 €): necessità 57%, desideri 21%, risparmi 22%. Il riferimento è 50/30/20.'
    );
  });

  it('names the deficit first and reads the shares of what left, with no risparmi', () => {
    // 10.300 € left against 10.000 € in: the shares are of the 10.300.
    expect(plain(describeSpendingRolesFlow(summary({ income: 10000, need: 5600, want: 4700 })))).toBe(
      'Le spese superano le entrate di 300 €, coperti dal patrimonio. Di quanto è uscito: necessità 54%, desideri 46%. Il riferimento è 50/30/20.'
    );
  });

  it('names what is still unclassified, in the order the flow draws it — before risparmi', () => {
    expect(plain(describeSpendingRolesFlow(summary({ income: 2000, need: 1000, unclassified: 500 })))).toBe(
      'Delle entrate (2000 €): necessità 50%, da classificare 25%, risparmi 25%. Il riferimento è 50/30/20.'
    );
  });

  it('prints shares that add up to 100, the rounding carried by risparmi', () => {
    // Three thirds would print 33 + 33 + 33; risparmi is the remainder by definition.
    expect(plain(describeSpendingRolesFlow(summary({ income: 3000, need: 1000, want: 1000 })))).toBe(
      'Delle entrate (3000 €): necessità 33%, desideri 33%, risparmi 34%. Il riferimento è 50/30/20.'
    );
  });

  it('writes a role that holds money but rounds to zero as «meno dell’1%», never «0%»', () => {
    // Found on the owner's tour (2026-09-27): 40 € of 10.000 printed «necessità 0%» over a role
    // that was not empty. The other shares still add up to 100 with this one counted as zero.
    expect(plain(describeSpendingRolesFlow(summary({ income: 10000, need: 40, want: 1100, unclassified: 7400 })))).toBe(
      "Delle entrate (10.000 €): necessità meno dell'1%, desideri 11%, da classificare 74%, risparmi 15%. Il riferimento è 50/30/20."
    );
  });

  it('prints the same share in a legend as «<1%», where there is no room for words', () => {
    expect(describeShareCompact(0)).toBe('<1%');
    expect(describeShareCompact(15)).toBe('15%');
  });

  it('splits risparmi into what was put aside and what was left over when rows are classified as saving', () => {
    expect(plain(describeSpendingRolesFlow(summary({ income: 3000, need: 1500, saving: 600 })))).toBe(
      'Delle entrate (3000 €): necessità 50%, risparmi 50% (di cui 600 € accantonati e 900 € avanzati). Il riferimento è 50/30/20.'
    );
  });

  it('says risparmi were all put aside when nothing was left over', () => {
    expect(plain(describeSpendingRolesFlow(summary({ income: 1000, need: 800, saving: 200 })))).toBe(
      'Delle entrate (1000 €): necessità 80%, risparmi 20% (tutti accantonati). Il riferimento è 50/30/20.'
    );
  });

  it('reads spending without income, and returns null with nothing', () => {
    expect(plain(describeSpendingRolesFlow(summary({ income: 0, want: 300 })))).toBe(
      'Nessuna entrata: 300 € di spese tutti coperti dal patrimonio, desideri 100%. Il riferimento è 50/30/20.'
    );
    expect(describeSpendingRolesFlow(summary({ income: 0 }))).toBeNull();
    // A lone reversal of income is no flow either, not a division by zero.
    expect(describeSpendingRolesFlow(summary({ income: -200 }))).toBeNull();
  });
});

describe('the Flusso on a phone', () => {
  const breakdown = (overrides: Partial<TypeFlowBreakdown>): TypeFlowBreakdown => ({
    blocks: [],
    spending: 2000,
    income: 3000,
    surplus: 1000,
    deficit: 0,
    incomeEdge: null,
    noIncome: false,
    absence: null,
    ...overrides,
  });
  const IN_CALENDAR: ScheduledSlice = { count: 4, expenses: 1850, income: 2000, throughMonth: 12 };

  it('captions the roles bar with its base and the 50/30/20 ticks', () => {
    expect(plain(describeSpendingRolesBar(summarizeSpendingRoleShares(rolesSummary({ income: 3000, need: 1500, want: 900 }))))).toBe(
      'Quote di quanto è uscito (3000 €); tacche a 50 e 80, il riferimento 50/30/20.'
    );
  });

  it('adds where the money beyond the income came from, or that there was no income', () => {
    expect(plain(describeSpendingRolesBar(summarizeSpendingRoleShares(rolesSummary({ income: 1000, need: 1250 }))))).toBe(
      'Quote di quanto è uscito (1250 €); tacche a 50 e 80, il riferimento 50/30/20. Oltre la linea delle entrate: 250 € dal patrimonio.'
    );
    expect(plain(describeSpendingRolesBar(summarizeSpendingRoleShares(rolesSummary({ income: 0, want: 300 }))))).toBe(
      'Quote di quanto è uscito (300 €); tacche a 50 e 80, il riferimento 50/30/20. Nessuna entrata: tutto è coperto dal patrimonio.'
    );
    expect(describeSpendingRolesBar(summarizeSpendingRoleShares(rolesSummary({ income: 0, rowCount: 0 })))).toBeNull();
  });

  it('captions the type bar as a share of the spending, deficit and no-income included', () => {
    expect(plain(describeTypeFlowBar(breakdown({})))).toBe('Quote delle spese (2000 €).');
    expect(plain(describeTypeFlowBar(breakdown({ income: 1500, surplus: 0, deficit: 500, incomeEdge: 75 })))).toBe(
      'Quote delle spese (2000 €). Oltre la linea delle entrate: 500 € dal patrimonio.'
    );
    expect(plain(describeTypeFlowBar(breakdown({ income: 0, surplus: 0, deficit: 2000, noIncome: true })))).toBe(
      'Quote delle spese (2000 €). Nessuna entrata: tutto è coperto dal patrimonio.'
    );
    expect(plain(describeTypeFlowBar(breakdown({ spending: 0 })))).toBe('Nessuna spesa nel periodo.');
    expect(describeTypeFlowBar(breakdown({ spending: 0, surplus: 0, absence: 'missing' }))).toBeNull();
  });

  it('notes the surplus in the past tense, «Più» after listed rows, and nothing without one', () => {
    expect(plain(describeFlowSurplus({ surplus: 600, afterRows: false, scheduled: NOTHING_SCHEDULED, horizon: 'a fine anno' }))).toBe(
      '600 € avanzati nel periodo.'
    );
    expect(plain(describeFlowSurplus({ surplus: 600, afterRows: true, scheduled: NOTHING_SCHEDULED, horizon: 'a fine anno' }))).toBe(
      'Più 600 € avanzati nel periodo.'
    );
    expect(plain(describeFlowSurplus({ surplus: 1, afterRows: false, scheduled: NOTHING_SCHEDULED, horizon: null }))).toBe('1 € avanzato nel periodo.');
    expect(describeFlowSurplus({ surplus: 0, afterRows: false, scheduled: IN_CALENDAR, horizon: 'a fine anno' })).toBeNull();
  });

  it('declares the calendar a running year still holds, with the verdict’s own clause', () => {
    const note = describeFlowSurplus({ surplus: 600, afterRows: false, scheduled: IN_CALENDAR, horizon: 'a fine anno' });
    expect(plain(note)).toBe(
      '600 € avanzati nel periodo. Nel totale ci sono ancora 1850 € di spese e 2000 € di entrate già in calendario da qui a fine anno.'
    );
    // The SAME words as the verdict's closing sentence, not a second wording.
    expect(plain(note)!.endsWith(plain(scheduledSentence(IN_CALENDAR, 'a fine anno'))!)).toBe(true);
  });

  it('names an empty flow by its absence', () => {
    expect(plain(describeFlowAbsence('missing'))).toBe('Nessuna entrata né spesa registrata nel periodo.');
    expect(plain(describeFlowAbsence('zero'))).toBe('I movimenti del periodo fanno zero: nessun flusso da disegnare.');
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

  it('should name the delta\'s own window when the period total spans the whole calendar year', () => {
    // «Anno corrente» prints twelve months of a mortgage (6710 €) while the year row compares
    // nine against nine (5032 €): one sentence, two windows, each with its figure (2026-09-14).
    const reading = describeEntityFocus({
      label: 'Mutuo',
      parentLabel: null,
      isIncome: false,
      subject,
      periodTotal: 6710,
      shareOfPeriod: 0.168,
      shareOfParent: null,
      delta: { amount: 0, percent: 0, sameMonths: true, comparisonYear: 2025, livedTotal: 5032, livedMonths: 8 },
      monthlyAverage: 559,
      hasHistory: true,
      historyStartYear: 2024,
    });
    expect(plain(reading)).toBe("Nel 2026 hai speso 6710 € in Mutuo, il 16,8% delle spese; nei primi 8 mesi 5032 €, in linea con gli stessi mesi del 2025, al ritmo di 559 € al mese.");
    // When the two figures coincide (a «Da inizio anno» cut), the window is not repeated.
    const cut = describeEntityFocus({ label: 'Mutuo', parentLabel: null, isIncome: false, subject, periodTotal: 5032, shareOfPeriod: 0.168, shareOfParent: null, delta: { amount: 0, percent: 0, sameMonths: true, comparisonYear: 2025, livedTotal: 5032, livedMonths: 8 }, monthlyAverage: 559, hasHistory: true, historyStartYear: 2024 });
    expect(plain(cut)).toBe('Nel 2026 hai speso 5032 € in Mutuo, il 16,8% delle spese; in linea con gli stessi mesi del 2025, al ritmo di 559 € al mese.');
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
    expect(plain(month)).toBe('Ad agosto finora hai speso 57 € in più di agosto 2025 (+1,6%), a mese in corso; a crescere di più è stata Auto (+57 €).');

    const sameDays = describeComparison({ subject: describeAnalisiSubject(CURRENT_MONTH, TODAY, 2024), scope: { kind: 'singleMonth', month: 8, inProgress: true, throughDay: 14 }, comparisonYear: 2025, expenses: { current: 3600, previous: 3543, delta: 57, deltaPercent: 1.6 }, rows: [row('Auto', 57)] });
    expect(plain(sameDays)).toBe('Ad agosto finora hai speso 57 € in più di agosto 2025 (+1,6%), sui primi 14 giorni; a crescere di più è stata Auto (+57 €).');
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

/**
 * The phone's cut of the verdict and the Flusso's captions on the first screen
 * (2026-10-14; DESIGN.md → The Binding-Clause Rule; doc/guide/cashflow-analisi.md). Seen red: «; Casa pesa» glued
 * back (the lead swallowed the categories); `scheduledSentence` left at the sentence's end (the
 * scope test above); the caption's amount kept with `printed` ignored.
 */
describe('buildAnalisiVerdict — the phone composition', () => {
  it('should close the lead on the total and its pacing, the categories behind «Il perché»', () => {
    const split = splitVerdict(buildAnalisiVerdict(INPUT));
    expect(plain(split.lead)).toBe('Nel 2026 hai speso 31.200 €, +4,2% su gen–ago 2025.');
    expect(plain(split.rest)).toBe(' Casa pesa un terzo e Vacanze è la categoria cresciuta di più (+1100 €); ad agosto 2 categorie sono fuori scala: Ristoranti e Auto.');
    expect(split.restLabel).toBe('categorie e fuori scala');
    expect(splitVerdict(buildAnalisiVerdict({ ...INPUT, anomalies: [] })).restLabel).toBe('le categorie');
  });

  it('should open a sentence of their own for anomalies without a category', () => {
    const verdict = buildAnalisiVerdict({ ...INPUT, topCategory: null });
    expect(plain(verdict.sentence)).toBe('Nel 2026 hai speso 31.200 €, +4,2% su gen–ago 2025. Ad agosto 2 categorie sono fuori scala: Ristoranti e Auto.');
    expect(verdict.restLabel).toBe('il fuori scala');
  });

  it('should not cut a verdict with nothing after its first sentence, nor one without spending', () => {
    expect(buildAnalisiVerdict({ ...INPUT, topCategory: null, anomalies: [] }).leadLength).toBeUndefined();
    expect(buildAnalisiVerdict({ ...INPUT, totals: { ...TOTALS, expenses: 0, net: TOTALS.income } }).leadLength).toBeUndefined();
  });
});

describe('the Flusso captions beside the first screen', () => {
  const strip: StripFigure[] = [
    { label: 'Entrate', value: 1000, format: 'currency', opens: 'analisi-entrate' },
    { label: 'Risparmio', value: -250, format: 'currency', opens: 'analisi-flusso' },
  ];

  it('should collect the magnitudes the lead and the strip print', () => {
    const printed = collectPrintedFigures([{ text: 'Nel 2026 hai speso ' }, { text: '1250 €', mono: true }, { text: ', ' }, { text: '+4,2%', mono: true }], strip);
    expect([...printed].map((text) => text.replace(/[  ]/g, ' ')).sort()).toEqual(['1000 €', '1250 €', '250 €', '4,2%']);
  });

  it('should drop an amount the first screen prints and keep one it does not', () => {
    const printed = collectPrintedFigures([{ text: cachedFormatCurrencyEUR(2000, true), mono: true }], [{ label: 'Risparmio', value: -500, format: 'currency', opens: 'analisi-flusso' }]);
    const deficit = { blocks: [], spending: 2000, income: 1500, surplus: 0, deficit: 500, incomeEdge: 75, noIncome: false, absence: null } satisfies TypeFlowBreakdown;
    expect(plain(describeTypeFlowBar(deficit, printed))).toBe('Quote delle spese. Oltre la linea delle entrate, il resto viene dal patrimonio.');
    // The roles' base in a deficit is what left — income + deficit = the SPENDING, which the first
    // sentence prints as a mono figure («hai speso 1250 €»): the amount drops there too
    // (2026-10-15; until then this case built the lead without its mono figure and asserted it stayed).
    const roles = summarizeSpendingRoleShares(rolesSummary({ income: 1000, need: 1250 }));
    const rolesStrip: StripFigure[] = [{ label: 'Entrate', value: 1000, format: 'currency', opens: 'analisi-entrate' }, { label: 'Risparmio', value: -250, format: 'currency', opens: 'analisi-flusso' }];
    const rolesPrinted = collectPrintedFigures([{ text: 'Nel 2026 hai speso ' }, { text: cachedFormatCurrencyEUR(1250, true), mono: true }], rolesStrip);
    expect(plain(describeSpendingRolesBar(roles, rolesPrinted))).toBe(
      'Quote di quanto è uscito; tacche a 50 e 80, il riferimento 50/30/20. Oltre la linea delle entrate, il resto viene dal patrimonio.',
    );
    // A base the first screen does not print keeps its amount.
    expect(plain(describeSpendingRolesBar(roles, collectPrintedFigures([], rolesStrip)))).toBe(
      'Quote di quanto è uscito (1250 €); tacche a 50 e 80, il riferimento 50/30/20. Oltre la linea delle entrate, il resto viene dal patrimonio.',
    );
    // Without a deficit the base IS the income the strip prints.
    const balanced = summarizeSpendingRoleShares(rolesSummary({ income: 3000, need: 1500, want: 900 }));
    const incomePrinted = collectPrintedFigures([], [{ label: 'Entrate', value: 3000, format: 'currency', opens: 'analisi-entrate' }]);
    expect(plain(describeSpendingRolesBar(balanced, incomePrinted))).toBe('Quote di quanto è uscito; tacche a 50 e 80, il riferimento 50/30/20.');
  });
});

/**
 * The closed rows' answers of Analisi (2026-10-16): what each row says in the landscape index, the
 * segments joined with a space as the index's gap sets them. Falsified on 2026-10-16, one at a
 * time: «the LARGEST printed share» went red with `typeShares[0]` in its place; «the roles view when
 * the setting is on» went red with the type answer always; «the Scheda keeps its scope» went red
 * with the Scheda answering the first expense category.
 */
describe('describeAnalisiClosedAnswers', () => {
  const answer = (narrative: Narrative | null | undefined) => (narrative ? narrative.map((s) => s.text).join(' ').replace(/ /g, ' ') : null);
  const topRow = (label: string, amount: number) => ({
    key: label,
    label,
    subCategoryLabel: null,
    caption: '5 ago',
    scheduled: false,
    amount,
    percentage: 10,
    expenseType: 'variable' as const,
    categoryKey: label,
    subCategoryKey: null,
  });
  const TOP: TopExpenses = { rows: [topRow('Vacanze', 2500), topRow('Auto', 900)], shownTotal: 3400, total: 25000, count: 40 };
  const rankRow = (category: string, amount: number, percentage: number) => ({ category, categoryKey: category, amount, percentage });
  const EXPENSES = { rows: [rankRow('Casa', 7800, 78), rankRow('Svago', 2200, 22)], total: 10000, remainder: null };
  const INCOME = { rows: [rankRow('Stipendio', 30000, 100)], total: 30000, remainder: null };
  // The types in the order the Sankey lists them, NOT by size: the answer must pick the largest.
  const FLOW: FlowSummary = {
    incomeTotal: 30000,
    incomeSources: 1,
    expensesTotal: 10000,
    categoryCount: 2,
    typeShares: [
      { type: 'fixed', label: 'Fisse', amount: 900, percentage: 9, printedPercentage: 9 },
      { type: 'variable', label: 'Variabili', amount: 9100, percentage: 91, printedPercentage: 91 },
    ],
  };
  const input = (overrides: Partial<Parameters<typeof describeAnalisiClosedAnswers>[0]> = {}) =>
    describeAnalisiClosedAnswers({ anomalies: ANOMALIES, topExpenses: TOP, expenseRanking: EXPENSES, incomeRanking: INCOME, flow: FLOW, spendingRoles: null, ...overrides });

  it('should answer Fuori scala with the furthest category over its average, in red as its row prints it', () => {
    const fuori = input()[ANALISI_SECTION_IDS.fuoriScala];
    expect(answer(fuori)).toBe('Ristoranti +48%');
    expect(fuori?.[1]).toMatchObject({ mono: true, sign: 'negative' });
    expect(answer(input({ anomalies: [] })[ANALISI_SECTION_IDS.fuoriScala])).toBe('nessuna fuori scala');
  });

  it('should answer Spese maggiori with the largest expense', () => {
    expect(answer(input()[ANALISI_SECTION_IDS.maggiori])).toBe('la più grande 2500 €');
    expect(input({ topExpenses: { rows: [], shownTotal: 0, total: 0, count: 0 } })[ANALISI_SECTION_IDS.maggiori]).toBeNull();
  });

  it('should answer the category rows with the first category and its share', () => {
    expect(answer(input()[ANALISI_SECTION_IDS.spese])).toBe('Casa 78%');
    expect(answer(input()[ANALISI_SECTION_IDS.entrate])).toBe('tutto da Stipendio');
    const empty = { rows: [], total: 0, remainder: null };
    expect(input({ expenseRanking: empty, incomeRanking: empty })).toMatchObject({ [ANALISI_SECTION_IDS.spese]: null, [ANALISI_SECTION_IDS.entrate]: null });
  });

  it('should answer the Flusso by type with the LARGEST printed share, wherever it sits', () => {
    expect(answer(input()[ANALISI_SECTION_IDS.flusso])).toBe('Variabili 91%');
    const one: FlowSummary = { ...FLOW, typeShares: [{ type: 'variable', label: 'Variabili', amount: 10000, percentage: 100, printedPercentage: 100 }] };
    expect(answer(input({ flow: one })[ANALISI_SECTION_IDS.flusso])).toBe('tutte variabili');
    expect(input({ flow: { ...FLOW, expensesTotal: 0, typeShares: [] } })[ANALISI_SECTION_IDS.flusso]).toBeNull();
  });

  it('should answer the Flusso by role when the 50/30/20 setting is on (the tile opens on that view)', () => {
    // 3000 of income: needs 1500 (50%), wants 900 (30%), the rest saved (20%).
    const roles = rolesSummary({ income: 3000, need: 1500, want: 900 });
    expect(answer(input({ spendingRoles: roles })[ANALISI_SECTION_IDS.flusso])).toBe(`${SPENDING_BUCKET_LABELS.need} 50%`);
    expect(input({ spendingRoles: rolesSummary({ income: 0, rowCount: 0 }) })[ANALISI_SECTION_IDS.flusso]).toBeNull();
  });

  it('should leave the Scheda its scope (null): the entity’s name is the answer', () => {
    expect(input()[ANALISI_SECTION_IDS.scheda]).toBeNull();
  });

  it('should fit 22 visible characters on round figures', () => {
    for (const narrative of Object.values(input())) {
      if (narrative) expect(answer(narrative)!.length).toBeLessThanOrEqual(22);
    }
  });
});
