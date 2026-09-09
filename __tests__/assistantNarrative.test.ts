/**
 * Tests for lib/utils/assistantNarrative.ts — the words of the Assistente page: the verdict
 * that states the CONTEXT the assistant answers on («Luglio è andato bene.») and the reading
 * line of every tile (the period's net worth, the cashflow, what the memory holds, the
 * conversation, the compact header's description).
 *
 * Same mocking as overviewNarrative.test.ts: the module reaches chartService's it-IT
 * percentage formatter through overviewNarrative, whose Firebase chain is mocked away. Every
 * phrasing is pinned here, and a missing input drops its clause instead of printing a
 * placeholder (The Narrative Honesty Rule).
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

import {
  buildAssistantPeriodVerdict,
  buildNoContextVerdict,
  describeAssistantCashflow,
  describeAssistantHeader,
  describeConversation,
  describeFactsTile,
  describeGoalProgress,
  describeGoalsTile,
  describeMemory,
  describeNetWorthToday,
  describePeriodNetWorth,
  formatPeriodInSentence,
  resolveSavingsRate,
  toNoContextVerdictInput,
  type AssistantPeriodInput,
} from '@/lib/utils/assistantNarrative';
import type { DashboardOverviewPayload } from '@/types/dashboardOverview';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';

/**
 * The screen prints a no-break space before € (the browser U+00A0, Node's ICU the narrow
 * U+202F); the tests read both as a normal one.
 */
const NBSP = /[\u00A0\u202F]/g;
const plain = (narrative: Narrative | null) => (narrative ? narrativeToText(narrative).replace(NBSP, ' ') : null);

const TODAY = { year: 2026, month: 8 };

function period(overrides: Partial<AssistantPeriodInput> = {}): AssistantPeriodInput {
  return {
    selector: { year: 2026, month: 7 },
    netWorth: { start: 308_270, end: 312_450, delta: 4180, deltaPct: 1.3559 },
    cashflow: { totalIncome: 3758, totalDividends: 142, totalExpenses: -2690, netCashFlow: 1210 },
    dataQuality: { hasSnapshot: true, hasCashflowData: true, isPartialMonth: false },
    ...overrides,
  };
}

// ─── The verdict on a period ─────────────────────────────────────────────────

describe('buildAssistantPeriodVerdict — a closed month', () => {
  it('says the month went well, in the past tense, with the value, the change and the savings', () => {
    const verdict = buildAssistantPeriodVerdict(period(), TODAY);

    expect(verdict.headline).toBe('Luglio è andato bene.');
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe(
      'A fine luglio il patrimonio valeva 312.450 €: +4180 € (+1,36%) su giugno. Hai messo da parte il 31% delle entrate.',
    );
  });

  it('names the year when the month is not in the running year', () => {
    const verdict = buildAssistantPeriodVerdict(period({ selector: { year: 2025, month: 12 } }), TODAY);

    expect(verdict.headline).toBe('Dicembre 2025 è andato bene.');
    expect(plain(verdict.sentence)).toContain('A fine dicembre 2025 il patrimonio valeva 312.450 €');
    expect(plain(verdict.sentence)).toContain('su novembre.');
  });

  it('calls a falling month a fall, never blaming the market it cannot see', () => {
    const verdict = buildAssistantPeriodVerdict(
      period({ netWorth: { start: 312_450, end: 305_100, delta: -7350, deltaPct: -2.3524 } }),
      TODAY,
    );

    expect(verdict.headline).toBe('Luglio è andato in calo.');
    expect(verdict.tone).toBe('negative');
    expect(plain(verdict.sentence)).toContain('−7350 € (−2,35%) su giugno');
    expect(plain(verdict.sentence)).not.toContain('mercato');
  });

  it('warns when the month grew but the spending beat the income', () => {
    const verdict = buildAssistantPeriodVerdict(
      period({ cashflow: { totalIncome: 2100, totalDividends: 0, totalExpenses: -2690, netCashFlow: -590 } }),
      TODAY,
    );

    expect(verdict.headline).toBe('Luglio è cresciuto, ma le spese hanno superato le entrate.');
    expect(verdict.tone).toBe('warning');
    expect(plain(verdict.sentence)).toContain('Hai speso più di quanto è entrato.');
  });

  it('drops the savings clause when nothing came in', () => {
    const verdict = buildAssistantPeriodVerdict(
      period({ cashflow: { totalIncome: 0, totalDividends: 0, totalExpenses: -2690, netCashFlow: -2690 } }),
      TODAY,
    );

    expect(plain(verdict.sentence)).toBe('A fine luglio il patrimonio valeva 312.450 €: +4180 € (+1,36%) su giugno.');
  });

  it('states the value alone when there is no month before to measure against', () => {
    const verdict = buildAssistantPeriodVerdict(
      period({ netWorth: { start: null, end: 312_450, delta: null, deltaPct: null } }),
      TODAY,
    );

    expect(verdict.headline).toBe('Il tuo patrimonio a luglio.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe(
      'A fine luglio il patrimonio valeva 312.450 €; nessun mese precedente con cui misurare la variazione. Hai messo da parte il 31% delle entrate.',
    );
  });

  it('says it only knows the cashflow when the month has no snapshot', () => {
    const verdict = buildAssistantPeriodVerdict(
      period({
        netWorth: { start: 308_270, end: null, delta: null, deltaPct: null },
        dataQuality: { hasSnapshot: false, hasCashflowData: true, isPartialMonth: false },
      }),
      TODAY,
    );

    expect(verdict.headline).toBe('Di luglio conosco solo il cashflow.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe(
      'Nessuna rilevazione del patrimonio a fine luglio; entrate 3900 €, uscite 2690 €: hai messo da parte il 31%.',
    );
  });

  it('calls the running month a month in progress', () => {
    const verdict = buildAssistantPeriodVerdict(
      period({
        selector: { year: 2026, month: 8 },
        netWorth: { start: 312_450, end: null, delta: null, deltaPct: null },
        dataQuality: { hasSnapshot: false, hasCashflowData: true, isPartialMonth: true },
      }),
      TODAY,
    );

    expect(verdict.headline).toBe('Agosto è ancora in corso.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe(
      'Nessuna rilevazione di fine mese ancora; finora entrate 3900 €, uscite 2690 €: hai messo da parte il 31%.',
    );
  });

  it('says there is no data at all instead of printing placeholders', () => {
    const verdict = buildAssistantPeriodVerdict(
      period({
        selector: { year: 2023, month: 2 },
        netWorth: { start: null, end: null, delta: null, deltaPct: null },
        cashflow: { totalIncome: 0, totalDividends: 0, totalExpenses: 0, netCashFlow: 0 },
        dataQuality: { hasSnapshot: false, hasCashflowData: false, isPartialMonth: false },
      }),
      TODAY,
    );

    expect(verdict.headline).toBe('Nessun dato per febbraio 2023.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe('Scegli un altro periodo, oppure fai una domanda libera.');
  });
});

describe('buildAssistantPeriodVerdict — a year, the year to date, the history', () => {
  it('reads a closed year in the past tense, on the year', () => {
    const verdict = buildAssistantPeriodVerdict(
      period({
        selector: { year: 2025, month: 0 },
        netWorth: { start: 266_800, end: 298_000, delta: 31_200, deltaPct: 11.694 },
        cashflow: { totalIncome: 44_600, totalDividends: 1400, totalExpenses: -33_100, netCashFlow: 12_900 },
      }),
      TODAY,
    );

    expect(verdict.headline).toBe('Il 2025 è stato un anno in crescita.');
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe(
      "A fine 2025 il patrimonio valeva 298.000 €: +31.200 € (+11,69%) sull'anno. Hai messo da parte il 28% delle entrate.",
    );
  });

  it('reads a falling year as a fall', () => {
    const verdict = buildAssistantPeriodVerdict(
      period({
        selector: { year: 2022, month: 0 },
        netWorth: { start: 200_000, end: 188_000, delta: -12_000, deltaPct: -6 },
      }),
      TODAY,
    );

    expect(verdict.headline).toBe('Il 2022 è stato un anno in calo.');
    expect(verdict.tone).toBe('negative');
  });

  it('reads the running year in the present, from the start of the year', () => {
    const verdict = buildAssistantPeriodVerdict(
      period({
        selector: { year: 2026, month: 0 },
        netWorth: { start: 298_000, end: 312_450, delta: 14_450, deltaPct: 4.849 },
        cashflow: { totalIncome: 28_400, totalDividends: 900, totalExpenses: -20_100, netCashFlow: 9200 },
        dataQuality: { hasSnapshot: true, hasCashflowData: true, isPartialMonth: true },
      }),
      TODAY,
    );

    expect(verdict.headline).toBe('Il 2026 finora va bene.');
    expect(plain(verdict.sentence)).toBe(
      'Da inizio anno il patrimonio è passato da 298.000 € a 312.450 €: +14.450 € (+4,85%). Hai messo da parte il 31% delle entrate.',
    );
  });

  it('reads the year to date exactly like the running year', () => {
    const verdict = buildAssistantPeriodVerdict(
      period({
        selector: { year: 2026, month: -1 },
        netWorth: { start: 298_000, end: 312_450, delta: 14_450, deltaPct: 4.849 },
        dataQuality: { hasSnapshot: true, hasCashflowData: true, isPartialMonth: true },
      }),
      TODAY,
    );

    expect(verdict.headline).toBe('Il 2026 finora va bene.');
    expect(plain(verdict.sentence)).toContain('Da inizio anno il patrimonio è passato da 298.000 € a 312.450 €');
  });

  it('warns on a running year whose spending beats the income', () => {
    const verdict = buildAssistantPeriodVerdict(
      period({
        selector: { year: 2026, month: -1 },
        cashflow: { totalIncome: 10_000, totalDividends: 0, totalExpenses: -12_000, netCashFlow: -2000 },
        dataQuality: { hasSnapshot: true, hasCashflowData: true, isPartialMonth: true },
      }),
      TODAY,
    );

    expect(verdict.headline).toBe('Il 2026 cresce, ma le spese superano le entrate.');
    expect(verdict.tone).toBe('warning');
  });

  it('reads the history from its first year to today', () => {
    const verdict = buildAssistantPeriodVerdict(
      period({
        selector: { year: 2021, month: -2 },
        netWorth: { start: 96_500, end: 312_450, delta: 215_950, deltaPct: 223.78 },
        cashflow: { totalIncome: 230_000, totalDividends: 5200, totalExpenses: -160_000, netCashFlow: 75_200 },
        dataQuality: { hasSnapshot: true, hasCashflowData: true, isPartialMonth: true },
      }),
      TODAY,
    );

    expect(verdict.headline).toBe('Dal 2021 il patrimonio è cresciuto.');
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe(
      'Dal 2021 a oggi il patrimonio è passato da 96.500 € a 312.450 €: +215.950 € (+223,78%). Hai messo da parte il 32% delle entrate.',
    );
  });

  it('reads a shrinking history as a decrease', () => {
    const verdict = buildAssistantPeriodVerdict(
      period({
        selector: { year: 2024, month: -2 },
        netWorth: { start: 120_000, end: 110_000, delta: -10_000, deltaPct: -8.333 },
        dataQuality: { hasSnapshot: true, hasCashflowData: true, isPartialMonth: true },
      }),
      TODAY,
    );

    expect(verdict.headline).toBe('Dal 2024 il patrimonio è diminuito.');
    expect(verdict.tone).toBe('negative');
  });
});

describe('buildNoContextVerdict', () => {
  it('is the Panoramica verdict, reused verbatim, on the live payload', () => {
    const verdict = buildNoContextVerdict({
      month: 8,
      totalValue: 312_450,
      monthlyVariation: { value: 3210, percentage: 1.04 },
      yearlyVariation: { value: 14_450, percentage: 4.85 },
      isNewATH: false,
      savingsRate: 31,
      marketEffect: 2890,
      topMover: { assetClass: 'equity', delta: 2890 },
    });

    expect(verdict.headline).toBe('Agosto sta andando bene.');
    expect(plain(verdict.sentence)).toBe(
      'Il patrimonio vale 312.450,00 €: +3210,00 € (+1,04%) su luglio, +4,85% da inizio anno. Hai messo da parte il 31% delle entrate e le azioni hanno fatto il grosso del lavoro (+2890 €).',
    );
  });

  it('says the page has nothing to reason on when the overview is missing', () => {
    const verdict = buildNoContextVerdict(null);

    expect(verdict.headline).toBe('Una domanda libera, senza un periodo.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe(
      "L'assistente risponde sui dati di oggi; collega un periodo per ragionare sui suoi numeri.",
    );
  });
});

// ─── Savings rate ───────────────────────────────────────────────────────────

describe('resolveSavingsRate', () => {
  it('is the net cash flow over income and dividends, in percent', () => {
    expect(resolveSavingsRate({ totalIncome: 3758, totalDividends: 142, totalExpenses: -2690, netCashFlow: 1210 })).toBeCloseTo(31.03, 2);
  });

  it('is null without income: a rate needs a denominator', () => {
    expect(resolveSavingsRate({ totalIncome: 0, totalDividends: 0, totalExpenses: -500, netCashFlow: -500 })).toBeNull();
  });
});

// ─── Tile readings ──────────────────────────────────────────────────────────

describe('describePeriodNetWorth', () => {
  it('names the journey of a closed month, from the month before', () => {
    expect(plain(describePeriodNetWorth(period(), TODAY))).toBe('Da 308.270 € a 312.450 € tra fine giugno e fine luglio.');
  });

  it('names the year of a closed year', () => {
    expect(
      plain(describePeriodNetWorth(period({ selector: { year: 2025, month: 0 }, netWorth: { start: 266_800, end: 298_000, delta: 31_200, deltaPct: 11.7 } }), TODAY)),
    ).toBe('Da 266.800 € a 298.000 € nel corso del 2025.');
  });

  it('reads the running year and the year to date from the start of the year', () => {
    const input = period({
      selector: { year: 2026, month: -1 },
      netWorth: { start: 298_000, end: 312_450, delta: 14_450, deltaPct: 4.85 },
      dataQuality: { hasSnapshot: true, hasCashflowData: true, isPartialMonth: true },
    });
    expect(plain(describePeriodNetWorth(input, TODAY))).toBe('Da 298.000 € a 312.450 € da inizio anno.');
  });

  it('reads the history from its first year', () => {
    const input = period({ selector: { year: 2021, month: -2 }, netWorth: { start: 96_500, end: 312_450, delta: 215_950, deltaPct: 223.8 } });
    expect(plain(describePeriodNetWorth(input, TODAY))).toBe('Da 96.500 € a 312.450 € dal 2021 a oggi.');
  });

  it('states the end value alone when the start is unknown', () => {
    const input = period({ netWorth: { start: null, end: 312_450, delta: null, deltaPct: null } });
    expect(plain(describePeriodNetWorth(input, TODAY))).toBe('312.450 € a fine luglio; nessuna rilevazione del mese prima.');
  });

  it('is absent without a snapshot at the end of the period', () => {
    const input = period({ netWorth: { start: 308_270, end: null, delta: null, deltaPct: null }, dataQuality: { hasSnapshot: false, hasCashflowData: true, isPartialMonth: false } });
    expect(describePeriodNetWorth(input, TODAY)).toBeNull();
  });
});

describe('describeNetWorthToday', () => {
  it('names the basis and the count', () => {
    expect(plain(describeNetWorthToday(312_450, 16))).toBe('Vale 312.450 € a prezzi correnti, 16 asset in portafoglio.');
  });

  it('keeps the singular for one asset', () => {
    expect(plain(describeNetWorthToday(1200, 1))).toBe('Vale 1200 € a prezzi correnti, 1 asset in portafoglio.');
  });

  it('is absent without a total', () => {
    expect(describeNetWorthToday(null, 0)).toBeNull();
  });
});

describe('describeAssistantCashflow', () => {
  it('reuses the Panoramica reading for the savings rate', () => {
    expect(plain(describeAssistantCashflow(period().cashflow))).toBe('Messo da parte il 31%.');
  });

  it('says when more went out than came in', () => {
    expect(plain(describeAssistantCashflow({ totalIncome: 2100, totalDividends: 0, totalExpenses: -2690, netCashFlow: -590 }))).toBe(
      'Speso più di quanto è entrato.',
    );
  });

  it('names the spending when there is no income to measure against', () => {
    expect(plain(describeAssistantCashflow({ totalIncome: 0, totalDividends: 0, totalExpenses: -2690, netCashFlow: -2690 }))).toBe(
      'Nessuna entrata registrata; uscite 2690 €.',
    );
  });
});

describe('describeMemory', () => {
  it('counts the goals, the reached ones and the other facts', () => {
    expect(plain(describeMemory({ activeGoals: 3, reachedGoals: 1, otherFacts: 3 }))).toBe(
      '3 obiettivi attivi, 1 raggiunto; 3 altri fatti guidano le risposte.',
    );
  });

  it('keeps the singular', () => {
    expect(plain(describeMemory({ activeGoals: 1, reachedGoals: 0, otherFacts: 1 }))).toBe(
      '1 obiettivo attivo; 1 altro fatto guida le risposte.',
    );
  });

  it('says when there are facts but no goals', () => {
    expect(plain(describeMemory({ activeGoals: 0, reachedGoals: 0, otherFacts: 2 }))).toBe('Nessun obiettivo; 2 fatti guidano le risposte.');
  });

  it('says when the memory is empty', () => {
    expect(plain(describeMemory({ activeGoals: 0, reachedGoals: 0, otherFacts: 0 }))).toBe(
      "Nessun fatto in memoria: l'assistente impara dagli obiettivi e dalle preferenze che dichiari.",
    );
  });
});

describe('describeGoalProgress', () => {
  it('reads a reached goal as reached', () => {
    expect(describeGoalProgress({ matched: true, metricValue: 14_300, targetValue: 10_000, unit: 'eur' })).toEqual({ kind: 'reached', text: 'Raggiunto' });
  });

  it('prints current over target in the goal own unit, with the comma', () => {
    expect(describeGoalProgress({ matched: false, metricValue: 57.83, targetValue: 60, unit: 'percent' })).toEqual({
      kind: 'progress',
      text: '57,8% / 60,0%',
    });
    expect(describeGoalProgress({ matched: false, metricValue: 14_300, targetValue: 20_000, unit: 'eur' }).text.replace(NBSP, ' ')).toBe(
      '14.300 € / 20.000 €',
    );
  });

  it('reads a null metric as an absence, not a zero', () => {
    expect(describeGoalProgress({ matched: false, metricValue: null, targetValue: 20_000, unit: 'eur' }).text.replace(NBSP, ' ')).toBe('— / 20.000 €');
  });

  it('says a goal without structure is not tracked', () => {
    expect(describeGoalProgress(undefined)).toEqual({ kind: 'untracked', text: 'Non tracciato' });
  });
});

describe('describeGoalsTile', () => {
  it('counts the reached goals over the tracked ones and dates the last check', () => {
    expect(plain(describeGoalsTile({ tracked: 2, reached: 1, lastEvaluationAt: new Date(2026, 7, 27, 12) }))).toBe(
      "1 obiettivo su 2 tracciati è raggiunto; l'ultima verifica è del 27/08/2026.",
    );
  });

  it('drops the date when no goal was ever checked', () => {
    expect(plain(describeGoalsTile({ tracked: 2, reached: 2, lastEvaluationAt: null }))).toBe('2 obiettivi su 2 tracciati sono raggiunti.');
  });

  it('says when nothing is tracked', () => {
    expect(plain(describeGoalsTile({ tracked: 0, reached: 0, lastEvaluationAt: null }))).toBe('Nessun obiettivo tracciabile automaticamente.');
  });
});

describe('describeFactsTile', () => {
  it('counts by kind', () => {
    expect(plain(describeFactsTile({ risk: 1, preference: 2, fact: 0 }))).toBe('3 fatti che ogni risposta tiene presenti: 1 sul rischio, 2 preferenze.');
  });

  it('lists only the kinds that exist', () => {
    expect(plain(describeFactsTile({ risk: 0, preference: 0, fact: 1 }))).toBe('1 fatto che ogni risposta tiene presente: 1 fatto utile.');
  });

  it('is null when there is nothing', () => {
    expect(describeFactsTile({ risk: 0, preference: 0, fact: 0 })).toBeNull();
  });
});

describe('describeConversation', () => {
  it('asks the period question when the thread is empty', () => {
    expect(plain(describeConversation({ messageCount: 0, question: 'Cosa vuoi sapere su luglio 2026?', periodLabel: null, webSearchUsed: false }))).toBe(
      'Cosa vuoi sapere su luglio 2026? Scegli una domanda o scrivine una qui sotto.',
    );
  });

  it('counts the messages and names the numbers and the web search', () => {
    expect(plain(describeConversation({ messageCount: 2, question: '', periodLabel: 'di luglio 2026', webSearchUsed: true }))).toBe(
      '2 messaggi; la risposta usa i numeri di luglio 2026 e una ricerca web.',
    );
  });

  it('keeps the singular and drops what was not used', () => {
    expect(plain(describeConversation({ messageCount: 1, question: '', periodLabel: null, webSearchUsed: false }))).toBe(
      '1 messaggio; una domanda libera, senza un periodo collegato.',
    );
  });
});

describe('formatPeriodInSentence', () => {
  it('gives every period kind its preposition', () => {
    expect(formatPeriodInSentence({ year: 2026, month: 7 })).toBe('di luglio 2026');
    expect(formatPeriodInSentence({ year: 2025, month: 0 })).toBe('del 2025');
    expect(formatPeriodInSentence({ year: 2026, month: -1 })).toBe('da inizio anno');
    expect(formatPeriodInSentence({ year: 2021, month: -2 })).toBe('dello storico');
  });
});

describe('toNoContextVerdictInput', () => {
  const overview = {
    metrics: { totalValue: 312_450 },
    variations: { monthly: { value: 3210, percentage: 1.04 }, yearly: null },
    expenseStats: { currentMonth: { income: 3900, expenses: 2690 } },
    ath: { previousAllTimeHigh: 300_000, isNewATH: true },
    marketEffect: 2890,
    topMovers: [{ assetClass: 'equity', label: 'Azioni', delta: 2890 }],
  } as unknown as DashboardOverviewPayload;

  it('maps the payload the way the Panoramica page does, savings rate included', () => {
    const input = toNoContextVerdictInput(overview, 8);

    expect(input.month).toBe(8);
    expect(input.totalValue).toBe(312_450);
    expect(input.monthlyVariation).toEqual({ value: 3210, percentage: 1.04 });
    expect(input.yearlyVariation).toBeNull();
    expect(input.isNewATH).toBe(true);
    expect(input.savingsRate).toBeCloseTo(31.03, 2);
    expect(input.marketEffect).toBe(2890);
    expect(input.topMover?.assetClass).toBe('equity');
  });

  it('has no savings rate without income and no market driver without attribution', () => {
    const input = toNoContextVerdictInput(
      { ...overview, expenseStats: null, marketEffect: null, topMovers: [], ath: undefined } as unknown as DashboardOverviewPayload,
      8,
    );

    expect(input.savingsRate).toBeNull();
    expect(input.marketEffect).toBeNull();
    expect(input.topMover).toBeNull();
    expect(input.isNewATH).toBe(false);
  });
});

describe('describeAssistantHeader', () => {
  it('counts conversations, goals and facts', () => {
    expect(describeAssistantHeader({ threads: 6, goals: 3, facts: 3 })).toBe('6 conversazioni · 3 obiettivi e 3 fatti in memoria');
  });

  it('keeps the singular and says when the memory is empty', () => {
    expect(describeAssistantHeader({ threads: 1, goals: 0, facts: 0 })).toBe('1 conversazione · memoria vuota');
    expect(describeAssistantHeader({ threads: 0, goals: 1, facts: 0 })).toBe('Nessuna conversazione · 1 obiettivo in memoria');
    expect(describeAssistantHeader({ threads: 0, goals: 0, facts: 2 })).toBe('Nessuna conversazione · 2 fatti in memoria');
  });
});
