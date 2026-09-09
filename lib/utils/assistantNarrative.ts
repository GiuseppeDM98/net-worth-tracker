/**
 * The Assistente page's words: the verdict that states the CONTEXT the assistant answers on
 * («Luglio è andato bene.») before any number, and the reading line under each tile of that
 * page — the period's net worth, its cashflow, what the memory holds, the conversation, the
 * compact header's description.
 *
 * Same design as the other `*Narrative.ts` modules: every function is pure and returns a
 * `Narrative` (segments flagged `mono`/`sign`) rendered by `NarrativeText`; the phrasings are
 * pinned by tests, and a sentence never claims what the data cannot support — a missing input
 * drops its clause, never a placeholder (DESIGN.md → The Narrative Honesty Rule).
 *
 * Two things this page must never confuse. A period bundle carries NO market attribution
 * (its allocation changes are purchases and prices together), so a falling period is «in
 * calo», never «il mercato ha pesato» — that clause exists only where the Panoramica's payload
 * can measure it. And the tense follows the period: a closed month «è andato», the running
 * year «finora va», the history «è cresciuto». The one case with no period at all — a free
 * question on today's numbers — reuses `buildOverviewVerdict` verbatim: the Panoramica already
 * answers «come va?» on the same payload, and a second phrasing of it would drift.
 *
 * Percentages go through chartService's it-IT formatter (comma decimals), currency through
 * `cachedFormatCurrencyEUR` (no-break space before €) — AGENTS.md → Italian Localization.
 */

import { cachedFormatCurrencyEUR, formatDate } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { MONTH_NAMES } from '@/lib/constants/months';
import {
  buildOverviewVerdict,
  describeCashflow,
  type OverviewVerdictInput,
} from '@/lib/utils/overviewNarrative';
import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import type { AssistantGoalEvaluationResult, AssistantMonthContextBundle } from '@/types/assistant';
import type { DashboardOverviewPayload } from '@/types/dashboardOverview';

// ─── Inputs ─────────────────────────────────────────────────────────────────

/** The slice of a context bundle the words depend on — the rest of the bundle is the model's. */
export type AssistantPeriodInput = Pick<AssistantMonthContextBundle, 'selector' | 'netWorth'> & {
  cashflow: Pick<AssistantMonthContextBundle['cashflow'], 'totalIncome' | 'totalDividends' | 'totalExpenses' | 'netCashFlow'>;
  dataQuality: Pick<AssistantMonthContextBundle['dataQuality'], 'hasSnapshot' | 'hasCashflowData' | 'isPartialMonth'>;
};

/** Today in the Italian calendar — a parameter, never `new Date()` inside the module. */
export interface AssistantToday {
  year: number;
  month: number;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });
const MINUS = '−';

/** True when a formatted figure prints as a zero: the sign is decided on the TEXT (The Comma Rule). */
function isPrintedZero(text: string): boolean {
  return !/[1-9]/.test(text);
}

/** «+4180 €», «−7350 €», «0 €» — signed and coloured on the printed amount. */
function signedCurrency(value: number): NarrativeSegment {
  const unsigned = cachedFormatCurrencyEUR(Math.abs(value), true);
  if (isPrintedZero(unsigned) || value === 0) return figure(unsigned);
  const negative = value < 0;
  return { text: `${negative ? MINUS : '+'}${unsigned}`, mono: true, sign: negative ? 'negative' : 'positive' };
}

/** «+1,36%», «−2,35%» — signed and coloured on the printed figure. */
function signedPercent(value: number, decimals = 2): NarrativeSegment {
  const unsigned = formatPercentage(Math.abs(value), decimals);
  if (isPrintedZero(unsigned) || value === 0) return figure(unsigned);
  const negative = value < 0;
  return { text: `${negative ? MINUS : '+'}${unsigned}`, mono: true, sign: negative ? 'negative' : 'positive' };
}

/** An unsigned amount in the numeric face, with no colour. */
const amount = (value: number): NarrativeSegment => figure(cachedFormatCurrencyEUR(Math.abs(value), true));

/** Lower-case month name for use inside a sentence («a fine luglio»). */
function monthInSentence(month: number): string {
  return MONTH_NAMES[month - 1].toLowerCase();
}

function previousMonthIndex(month: number): number {
  return month === 1 ? 12 : month - 1;
}

/** «a maggio» but «ad agosto» — the euphonic d before a vowel. */
function withPrepositionA(monthName: string): string {
  return /^[aeiou]/i.test(monthName) ? `ad ${monthName}` : `a ${monthName}`;
}

const plural = (n: number, singular: string, pluralForm: string): string => (n === 1 ? singular : pluralForm);

// ─── Period kinds ─────────────────────────────────────────────────────────────

type PeriodKind = 'month' | 'year' | 'ytd' | 'history';

/** The `selector.month` encoding of the bundle: >0 a month, 0 a year, −1 the year to date, −2 the history. */
function periodKind(selector: AssistantPeriodInput['selector']): PeriodKind {
  if (selector.month > 0) return 'month';
  if (selector.month === 0) return 'year';
  if (selector.month === -1) return 'ytd';
  return 'history';
}

/** «luglio», or «dicembre 2025» when the month is not in the running year. */
function monthSubject(selector: AssistantPeriodInput['selector'], today: AssistantToday, capitalised: boolean): string {
  const name = capitalised ? MONTH_NAMES[selector.month - 1] : monthInSentence(selector.month);
  return selector.year === today.year ? name : `${name} ${selector.year}`;
}

// ─── Savings rate ─────────────────────────────────────────────────────────────

/**
 * The share of what came in (income and dividends) that stayed: the net cash flow over the
 * inflows, in percent. Null without inflows — a rate needs a denominator.
 */
export function resolveSavingsRate(cashflow: AssistantPeriodInput['cashflow']): number | null {
  const inflows = cashflow.totalIncome + cashflow.totalDividends;
  if (inflows <= 0) return null;
  return (cashflow.netCashFlow / inflows) * 100;
}

/** « Hai messo da parte il 31% delle entrate.» / « Hai speso più di quanto è entrato.» — or nothing. */
function savingsClause(savingsRate: number | null): Narrative {
  if (savingsRate === null) return [];
  if (savingsRate < 0) return [prose(' Hai speso più di quanto è entrato.')];
  return [prose(' Hai messo da parte il '), figure(`${Math.round(savingsRate)}%`), prose(' delle entrate.')];
}

/** «entrate 3900 €, uscite 2690 €: hai messo da parte il 31%.» — the cashflow-only sentence body. */
function cashflowOnlyClause(cashflow: AssistantPeriodInput['cashflow']): Narrative {
  const savingsRate = resolveSavingsRate(cashflow);
  const inflows = cashflow.totalIncome + cashflow.totalDividends;
  if (savingsRate === null) return [prose('uscite '), amount(cashflow.totalExpenses), prose('.')];
  const clause: Narrative = [prose('entrate '), amount(inflows), prose(', uscite '), amount(cashflow.totalExpenses)];
  if (savingsRate < 0) clause.push(prose(': hai speso più di quanto è entrato.'));
  else clause.push(prose(': hai messo da parte il '), figure(`${Math.round(savingsRate)}%`), prose('.'));
  return clause;
}

// ─── The verdict on a period ─────────────────────────────────────────────────

/** Tone of a measured change: a fall is a fall, growth with spending over income is a warning. */
function resolveTone(delta: number, savingsRate: number | null): VerdictTone {
  if (delta < 0) return 'negative';
  return savingsRate !== null && savingsRate < 0 ? 'warning' : 'positive';
}

/** The headline for each period kind and tone; `subject` is «Luglio» / «Dicembre 2025» / the year. */
function resolveHeadline(kind: PeriodKind, tone: VerdictTone, subject: string, partial: boolean): string {
  if (kind === 'month') {
    if (tone === 'negative') return `${subject} è andato in calo.`;
    if (tone === 'warning') return `${subject} è cresciuto, ma le spese hanno superato le entrate.`;
    return `${subject} è andato bene.`;
  }
  if (kind === 'history') {
    if (tone === 'negative') return `Dal ${subject} il patrimonio è diminuito.`;
    if (tone === 'warning') return `Dal ${subject} il patrimonio cresce, ma le spese superano le entrate.`;
    return `Dal ${subject} il patrimonio è cresciuto.`;
  }
  // A closed year is read in the past; the running year and the year to date in the present.
  if (kind === 'year' && !partial) {
    if (tone === 'negative') return `Il ${subject} è stato un anno in calo.`;
    if (tone === 'warning') return `Il ${subject} è cresciuto, ma le spese hanno superato le entrate.`;
    return `Il ${subject} è stato un anno in crescita.`;
  }
  if (tone === 'negative') return `Il ${subject} finora è in calo.`;
  if (tone === 'warning') return `Il ${subject} cresce, ma le spese superano le entrate.`;
  return `Il ${subject} finora va bene.`;
}

/** «Nessun dato per febbraio 2023.» — the period, named the way the picker names it. */
function noDataHeadline(kind: PeriodKind, selector: AssistantPeriodInput['selector']): string {
  if (kind === 'month') return `Nessun dato per ${monthInSentence(selector.month)} ${selector.year}.`;
  if (kind === 'year') return `Nessun dato per il ${selector.year}.`;
  if (kind === 'ytd') return 'Nessun dato da inizio anno.';
  return 'Nessun dato nello storico.';
}

/**
 * The verdict on a period bundle: headline, tone and the sentence under it, assembled clause
 * by clause so that a missing input drops its clause — no snapshot at the end of the period →
 * the cashflow alone; no baseline → the value alone; no inflows → no savings clause.
 */
export function buildAssistantPeriodVerdict(input: AssistantPeriodInput, today: AssistantToday): PageVerdictModel {
  const { selector, netWorth, cashflow, dataQuality } = input;
  const kind = periodKind(selector);
  const savingsRate = resolveSavingsRate(cashflow);

  if (!dataQuality.hasSnapshot && !dataQuality.hasCashflowData) {
    return {
      headline: noDataHeadline(kind, selector),
      tone: 'neutral',
      sentence: [prose('Scegli un altro periodo, oppure fai una domanda libera.')],
    };
  }

  // No snapshot closes the period: the numbers the assistant has are the cashflow's.
  if (netWorth.end === null) {
    if (kind === 'month' && dataQuality.isPartialMonth) {
      return {
        headline: `${MONTH_NAMES[selector.month - 1]} è ancora in corso.`,
        tone: 'neutral',
        sentence: [prose('Nessuna rilevazione di fine mese ancora; finora '), ...cashflowOnlyClause(cashflow)],
      };
    }
    const headline =
      kind === 'month'
        ? `Di ${monthSubject(selector, today, false)} conosco solo il cashflow.`
        : kind === 'year'
          ? `Del ${selector.year} conosco solo il cashflow.`
          : kind === 'ytd'
            ? 'Da inizio anno conosco solo il cashflow.'
            : 'Dello storico conosco solo il cashflow.';
    const where = kind === 'month' ? ` a fine ${monthSubject(selector, today, false)}` : kind === 'year' ? ` a fine ${selector.year}` : '';
    return {
      headline,
      tone: 'neutral',
      sentence: [prose(`Nessuna rilevazione del patrimonio${where}; `), ...cashflowOnlyClause(cashflow)],
    };
  }

  const partial = dataQuality.isPartialMonth;
  const running = kind === 'ytd' || (kind === 'year' && partial);

  // The value alone: there is no earlier snapshot to measure the change against.
  if (netWorth.delta === null || netWorth.deltaPct === null) {
    if (kind === 'month') {
      const monthName = monthSubject(selector, today, false);
      return {
        headline: `Il tuo patrimonio ${withPrepositionA(monthName)}.`,
        tone: 'neutral',
        sentence: [
          prose(`A fine ${monthName} il patrimonio valeva `),
          amount(netWorth.end),
          prose('; nessun mese precedente con cui misurare la variazione.'),
          ...savingsClause(savingsRate),
        ],
      };
    }
    const headline = kind === 'history' ? `Il tuo patrimonio dal ${selector.year}.` : `Il tuo patrimonio nel ${selector.year}.`;
    const missing = kind === 'history' ? 'nessuna prima rilevazione' : running ? 'nessuna rilevazione a inizio anno' : "nessuna rilevazione dell'anno prima";
    return {
      headline,
      tone: 'neutral',
      sentence: [
        prose(running || kind === 'history' ? 'Il patrimonio vale ' : `A fine ${selector.year} il patrimonio valeva `),
        amount(netWorth.end),
        prose(`; ${missing} con cui misurare la variazione.`),
        ...savingsClause(savingsRate),
      ],
    };
  }

  const tone = resolveTone(netWorth.delta, savingsRate);
  const subject = kind === 'month' ? monthSubject(selector, today, true) : String(selector.year);
  const headline = resolveHeadline(kind, tone, subject, partial);
  const change: Narrative = [prose(': '), signedCurrency(netWorth.delta), prose(' ('), signedPercent(netWorth.deltaPct), prose(')')];

  let sentence: Narrative;
  if (kind === 'month') {
    sentence = [
      prose(`A fine ${monthSubject(selector, today, false)} il patrimonio valeva `),
      amount(netWorth.end),
      ...change,
      prose(` su ${monthInSentence(previousMonthIndex(selector.month))}.`),
    ];
  } else if (kind === 'year' && !partial) {
    sentence = [prose(`A fine ${selector.year} il patrimonio valeva `), amount(netWorth.end), ...change, prose(" sull'anno.")];
  } else {
    const opening = kind === 'history' ? `Dal ${selector.year} a oggi il patrimonio è passato da ` : 'Da inizio anno il patrimonio è passato da ';
    sentence =
      netWorth.start !== null
        ? [prose(opening), amount(netWorth.start), prose(' a '), amount(netWorth.end), ...change, prose('.')]
        : [prose('Il patrimonio vale '), amount(netWorth.end), ...change, prose('.')];
  }

  return { headline, tone, sentence: [...sentence, ...savingsClause(savingsRate)] };
}

/**
 * The Panoramica's verdict input from its payload, for the free question with no period: the
 * same eight fields the Panoramica page assembles, with the savings rate as that page computes
 * it — the month's income less its expenses, over the income, null without income.
 */
export function toNoContextVerdictInput(overview: DashboardOverviewPayload, month: number): OverviewVerdictInput {
  const current = overview.expenseStats?.currentMonth;
  const savingsRate = current && current.income > 0 ? ((current.income - current.expenses) / current.income) * 100 : null;
  return {
    month,
    totalValue: overview.metrics.totalValue,
    monthlyVariation: overview.variations.monthly,
    yearlyVariation: overview.variations.yearly,
    isNewATH: overview.ath?.isNewATH ?? false,
    savingsRate,
    marketEffect: overview.marketEffect ?? null,
    topMover: overview.topMovers?.[0] ?? null,
  };
}

/**
 * The verdict of a free question with no period attached: the Panoramica's own verdict on the
 * live payload, reused verbatim — the assistant reasons on today's numbers, and «come va?» has
 * one answer per account. Without the payload the page says what it is answering on instead.
 */
export function buildNoContextVerdict(overview: OverviewVerdictInput | null): PageVerdictModel {
  if (overview) return buildOverviewVerdict(overview);
  return {
    headline: 'Una domanda libera, senza un periodo.',
    tone: 'neutral',
    sentence: [prose("L'assistente risponde sui dati di oggi; collega un periodo per ragionare sui suoi numeri.")],
  };
}

// ─── Tile readings ────────────────────────────────────────────────────────────

/**
 * «Da 308.270 € a 312.450 € tra fine giugno e fine luglio.» — the journey the hero figure does
 * not state (the start), on the window of the period. Absent without a closing snapshot.
 */
export function describePeriodNetWorth(input: AssistantPeriodInput, today: AssistantToday): Narrative | null {
  const { selector, netWorth, dataQuality } = input;
  if (netWorth.end === null) return null;
  const kind = periodKind(selector);
  const running = kind === 'ytd' || (kind === 'year' && dataQuality.isPartialMonth);

  if (netWorth.start === null) {
    if (kind === 'month') {
      return [amount(netWorth.end), prose(` a fine ${monthSubject(selector, today, false)}; nessuna rilevazione del mese prima.`)];
    }
    if (kind === 'history') return [amount(netWorth.end), prose(' oggi; nessuna prima rilevazione.')];
    if (running) return [amount(netWorth.end), prose(' oggi; nessuna rilevazione a inizio anno.')];
    return [amount(netWorth.end), prose(` a fine ${selector.year}; nessuna rilevazione dell'anno prima.`)];
  }

  const window =
    kind === 'month'
      ? ` tra fine ${monthInSentence(previousMonthIndex(selector.month))} e fine ${monthSubject(selector, today, false)}.`
      : kind === 'history'
        ? ` dal ${selector.year} a oggi.`
        : running
          ? ' da inizio anno.'
          : ` nel corso del ${selector.year}.`;
  return [prose('Da '), amount(netWorth.start), prose(' a '), amount(netWorth.end), prose(window)];
}

/** «Vale 312.450 € a prezzi correnti, 16 asset in portafoglio.» — the basis of today's figure. */
export function describeNetWorthToday(totalValue: number | null, assetCount: number): Narrative | null {
  if (totalValue === null) return null;
  const tail =
    assetCount > 0
      ? [prose(' a prezzi correnti, '), figure(String(assetCount)), prose(` asset in portafoglio.`)]
      : [prose(' a prezzi correnti; nessun asset in portafoglio.')];
  return [prose('Vale '), amount(totalValue), ...tail];
}

/**
 * The Cashflow tile's reading — the Panoramica's `describeCashflow` on the period's savings rate
 * (no month-over-month delta: the bundle carries one period), with the no-income case said
 * instead of dropped, since the tile still shows the spending.
 */
export function describeAssistantCashflow(cashflow: AssistantPeriodInput['cashflow']): Narrative | null {
  const savingsRate = resolveSavingsRate(cashflow);
  if (savingsRate === null) {
    if (cashflow.totalExpenses === 0) return [prose('Nessun movimento registrato.')];
    return [prose('Nessuna entrata registrata; uscite '), amount(cashflow.totalExpenses), prose('.')];
  }
  return describeCashflow(savingsRate, 0, 1);
}

/** «3 obiettivi attivi, 1 raggiunto; 3 altri fatti guidano le risposte.» */
export function describeMemory(counts: { activeGoals: number; reachedGoals: number; otherFacts: number }): Narrative {
  const { activeGoals, reachedGoals, otherFacts } = counts;
  if (activeGoals === 0 && otherFacts === 0) {
    return [prose("Nessun fatto in memoria: l'assistente impara dagli obiettivi e dalle preferenze che dichiari.")];
  }
  const narrative: Narrative = [];
  if (activeGoals > 0) {
    narrative.push(figure(String(activeGoals)), prose(plural(activeGoals, ' obiettivo attivo', ' obiettivi attivi')));
    if (reachedGoals > 0) narrative.push(prose(', '), figure(String(reachedGoals)), prose(plural(reachedGoals, ' raggiunto', ' raggiunti')));
  } else {
    narrative.push(prose('Nessun obiettivo'));
  }
  if (otherFacts > 0) {
    const noun = activeGoals > 0 ? plural(otherFacts, ' altro fatto guida', ' altri fatti guidano') : plural(otherFacts, ' fatto guida', ' fatti guidano');
    narrative.push(prose('; '), figure(String(otherFacts)), prose(`${noun} le risposte.`));
  } else {
    narrative.push(prose('.'));
  }
  return narrative;
}

export interface GoalProgressReading {
  kind: 'reached' | 'progress' | 'untracked';
  text: string;
}

/**
 * How a goal stands at its last check: «Raggiunto», «14.300 € / 20.000 €» in the goal's own
 * unit (a null metric is an absence, not a zero), or «Non tracciato» for a goal with no
 * structure — a legitimate state the row states out loud.
 */
export function describeGoalProgress(
  evaluation: Pick<AssistantGoalEvaluationResult, 'matched' | 'metricValue' | 'targetValue' | 'unit'> | undefined,
): GoalProgressReading {
  if (!evaluation) return { kind: 'untracked', text: 'Non tracciato' };
  if (evaluation.matched) return { kind: 'reached', text: 'Raggiunto' };
  const fmt = (value: number) => (evaluation.unit === 'percent' ? formatPercentage(value, 1) : cachedFormatCurrencyEUR(value, true));
  const current = evaluation.metricValue === null ? '—' : fmt(evaluation.metricValue);
  return { kind: 'progress', text: `${current} / ${fmt(evaluation.targetValue)}` };
}

/** «1 obiettivo su 2 tracciati è raggiunto; l'ultima verifica è del 27/08/2026.» */
export function describeGoalsTile(counts: { tracked: number; reached: number; lastEvaluationAt: Date | null }): Narrative {
  const { tracked, reached, lastEvaluationAt } = counts;
  if (tracked === 0) return [prose('Nessun obiettivo tracciabile automaticamente.')];
  const trackedNoun = plural(tracked, ' tracciato', ' tracciati');
  const narrative: Narrative =
    reached === 0
      ? [prose(`Nessuno ${tracked === 1 ? "dell'obiettivo tracciato" : `dei ${tracked} obiettivi tracciati`} è raggiunto`)]
      : [
          figure(String(reached)),
          prose(`${plural(reached, ' obiettivo', ' obiettivi')} su `),
          figure(String(tracked)),
          prose(`${trackedNoun} ${plural(reached, 'è raggiunto', 'sono raggiunti')}`),
        ];
  if (lastEvaluationAt) narrative.push(prose("; l'ultima verifica è del "), figure(formatDate(lastEvaluationAt)), prose('.'));
  else narrative.push(prose('.'));
  return narrative;
}

/** «3 fatti che ogni risposta tiene presenti: 1 sul rischio, 2 preferenze.» */
export function describeFactsTile(counts: { risk: number; preference: number; fact: number }): Narrative | null {
  const total = counts.risk + counts.preference + counts.fact;
  if (total === 0) return null;
  const parts: Narrative[] = [];
  if (counts.risk > 0) parts.push([figure(String(counts.risk)), prose(' sul rischio')]);
  if (counts.preference > 0) parts.push([figure(String(counts.preference)), prose(plural(counts.preference, ' preferenza', ' preferenze'))]);
  if (counts.fact > 0) parts.push([figure(String(counts.fact)), prose(plural(counts.fact, ' fatto utile', ' fatti utili'))]);
  const narrative: Narrative = [
    figure(String(total)),
    prose(plural(total, ' fatto che ogni risposta tiene presente: ', ' fatti che ogni risposta tiene presenti: ')),
  ];
  parts.forEach((part, i) => {
    if (i > 0) narrative.push(prose(', '));
    narrative.push(...part);
  });
  narrative.push(prose('.'));
  return narrative;
}

/** «di luglio 2026», «del 2025», «da inizio anno», «dello storico» — the period inside a sentence. */
export function formatPeriodInSentence(selector: AssistantPeriodInput['selector']): string {
  const kind = periodKind(selector);
  if (kind === 'month') return `di ${monthInSentence(selector.month)} ${selector.year}`;
  if (kind === 'year') return `del ${selector.year}`;
  if (kind === 'ytd') return 'da inizio anno';
  return 'dello storico';
}

/**
 * The Conversazione tile's reading: the period question while the thread is empty, then the
 * count of messages and what the answer rests on (the period's numbers, a web search).
 */
export function describeConversation(input: {
  messageCount: number;
  /** The period-phrased question of the empty state («Cosa vuoi sapere su luglio 2026?»). */
  question: string;
  /** The period the answer's numbers come from, with its preposition (`formatPeriodInSentence`); null for a free question. */
  periodLabel: string | null;
  webSearchUsed: boolean;
}): Narrative {
  const { messageCount, question, periodLabel, webSearchUsed } = input;
  if (messageCount === 0) return [prose(`${question} Scegli una domanda o scrivine una qui sotto.`)];
  const narrative: Narrative = [figure(String(messageCount)), prose(plural(messageCount, ' messaggio; ', ' messaggi; '))];
  if (periodLabel) {
    narrative.push(prose(`la risposta usa i numeri ${periodLabel}${webSearchUsed ? ' e una ricerca web' : ''}.`));
  } else {
    narrative.push(prose(`una domanda libera, senza un periodo collegato${webSearchUsed ? ', con una ricerca web' : ''}.`));
  }
  return narrative;
}

/** «6 conversazioni · 3 obiettivi e 3 fatti in memoria» — the compact header's description. */
export function describeAssistantHeader(counts: { threads: number; goals: number; facts: number }): string {
  const { threads, goals, facts } = counts;
  const conversations = threads === 0 ? 'Nessuna conversazione' : `${threads} ${plural(threads, 'conversazione', 'conversazioni')}`;
  if (goals === 0 && facts === 0) return `${conversations} · memoria vuota`;
  const memory: string[] = [];
  if (goals > 0) memory.push(`${goals} ${plural(goals, 'obiettivo', 'obiettivi')}`);
  if (facts > 0) memory.push(`${facts} ${plural(facts, 'fatto', 'fatti')}`);
  return `${conversations} · ${memory.join(' e ')} in memoria`;
}
