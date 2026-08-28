/**
 * The words of Analisi: the verdict that answers «dove vanno i soldi, e cosa è cambiato?»
 * before any number, and the one-line reading under each tile.
 *
 * Every function is pure and returns a `Narrative` (segments with `mono`/`sign`) rendered by
 * `NarrativeText`; no component writes copy, and each phrasing is pinned by a test. The
 * Narrative Honesty Rule holds throughout: a missing input drops its clause (no baseline → no
 * pacing, no comparison rows → no mover, no anomaly → no anomaly clause), never a placeholder.
 * Italian grammar is data, not a guess at render: the tense follows whether the period is
 * still running, the article follows the percentage AS PRINTED, «ad» before a vowel month.
 *
 * Percentages go through chartService's it-IT formatter (comma decimals); currency through
 * `cachedFormatCurrencyEUR` (nbsp before €, four-digit amounts ungrouped); the minus is the
 * typographic one.
 */

import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import type { PeriodCashflowTotals, ScheduledSlice } from '@/lib/utils/tracciamentoSummary';
import type { CategoryDeltaRow, ComparisonMonthScope, PacingSide, TotalsPacing } from '@/lib/utils/comparisonDeltas';
import type { SpendingAnomaly } from '@/lib/utils/cashflowComposition';
import type { ExpenseType } from '@/types/expenses';
import type { AnalisiPeriod, CategoryMover, FlowSummary, MonthRef, SpendingPoint, SpendingType, TopExpenses } from '@/lib/utils/analisiSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { articleForPercent, monthWithPrepositionA, ofThePercent } from '@/lib/utils/patrimonioNarrative';
import { printedDelta, scheduledSentence } from '@/lib/utils/cashflowNarrative';
import { MONTH_NAMES } from '@/lib/constants/months';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';

// ─── Segment helpers ──────────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });
const signed = (text: string, sign: 'positive' | 'negative'): NarrativeSegment => ({ text, mono: true, sign });

/** A whole euro figure, compact — the verdict and the readings never need cents. */
const euro = (value: number): string => cachedFormatCurrencyEUR(Math.abs(value), true);

/** «+1100 €» / «−400 €» with the typographic minus. */
const signedEuro = (value: number): string => `${value < 0 ? '−' : '+'}${euro(value)}`;

/** «+4,2%» / «−6,5%» on the printed figure. */
const signedPercent = (value: number, decimals = 1): string => `${value < 0 ? '−' : '+'}${formatPercentage(printedDelta(value), decimals)}`;

/** A spending delta coloured the DESIGN.md way: a rise in spending is the loss colour, a fall the gain colour. */
const spendingSign = (delta: number): 'positive' | 'negative' => (delta > 0 ? 'negative' : 'positive');

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function monthInSentence(month: number): string {
  return MONTH_NAMES[month - 1].toLowerCase();
}

/** "il 40%", "l'8%", "lo 0%" — the printed integer decides the article. */
function percentWithArticle(value: number, decimals = 0): NarrativeSegment[] {
  return [prose(articleForPercent(value, decimals)), figure(formatPercentage(value, decimals))];
}

/** «A, B e C» — an Italian list; the last item joined by «e». */
function listInWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Join clauses with a separator into one narrative. */
function joinClauses(clauses: Narrative[], separator: string): Narrative {
  const narrative: Narrative = [];
  clauses.forEach((clause, index) => {
    if (index > 0) narrative.push(prose(separator));
    narrative.push(...clause);
  });
  return narrative;
}

// ─── The period as a grammatical subject ──────────────────────────────────────

export interface AnalisiSubject {
  /** The subject of the headline: "Nel 2026", "Ad agosto", "A marzo 2025", "Dal 2024". */
  subject: string;
  /** The in-sentence form: "nel 2026", "ad agosto", "dal 2024". */
  inPeriod: string;
  /** Whether the period is still running today — decides the tense. */
  ongoing: boolean;
  /** «dell'anno scorso», «del 2024», «di agosto 2025» — after «più»/«meno»; null without a predecessor. */
  comparisonOf: string | null;
  /** «l'anno scorso», «il 2024», «agosto 2025» — after «come»; null without a predecessor. */
  comparisonPlain: string | null;
  /** A month of the running year that has not started yet — nothing happened in it, whatever is already in the calendar. */
  future: boolean;
}

export function describeAnalisiSubject(period: AnalisiPeriod, today: MonthRef, historyStartYear: number): AnalisiSubject {
  if (period.mode === 'history' || period.year === null) {
    return { subject: `Dal ${historyStartYear}`, inPeriod: `dal ${historyStartYear}`, ongoing: true, comparisonOf: null, comparisonPlain: null, future: false };
  }
  if (period.month !== null) {
    const sameYear = period.year === today.year;
    const yearSuffix = sameYear ? '' : ` ${period.year}`;
    const inPeriod = `${monthWithPrepositionA(period.month)}${yearSuffix}`;
    const previous = `${monthInSentence(period.month)} ${period.year - 1}`;
    return {
      subject: capitalise(inPeriod),
      inPeriod,
      ongoing: sameYear && period.month === today.month,
      comparisonOf: `di ${previous}`,
      comparisonPlain: previous,
      future: (sameYear && period.month > today.month) || period.year > today.year,
    };
  }
  const ongoing = period.year === today.year;
  // «Nel 2026 finora» — never the bare year, which names all twelve months and carries what
  // is only scheduled. Same wording as the Cashflow axis, for the same window.
  const finora = period.mode === 'ytd' ? ' finora' : '';
  return {
    subject: `Nel ${period.year}${finora}`,
    inPeriod: `nel ${period.year}${finora}`,
    ongoing,
    comparisonOf: ongoing ? "dell'anno scorso" : `del ${period.year - 1}`,
    comparisonPlain: ongoing ? "l'anno scorso" : `il ${period.year - 1}`,
    future: period.year > today.year,
  };
}

/**
 * «gen–ago 2025», «2025», «agosto 2025» — the baseline of a comparison, in words that fit
 * after «su». The scope comes from `resolveComparisonScope`, so it cannot disagree with the
 * figures the pacing was computed on.
 */
export function describeBaseline(scope: ComparisonMonthScope, comparisonYear: number): string {
  switch (scope.kind) {
    case 'sameMonths':
      if (scope.upToMonth === 12) return String(comparisonYear);
      return `${MONTH_NAMES_SHORT[0].toLowerCase()}–${MONTH_NAMES_SHORT[scope.upToMonth - 1].toLowerCase()} ${comparisonYear}`;
    case 'singleMonth':
      // The running month is compared with a COMPLETE month: the baseline says so.
      return `${monthInSentence(scope.month)} ${comparisonYear}${scope.inProgress ? ' (mese in corso)' : ''}`;
    case 'fullYear':
      return String(comparisonYear);
  }
}

/**
 * A share said the way a person says it — «un terzo», «un quarto», «la metà», «quasi tutto» —
 * only where the fraction is honest on the printed figure, else the percentage itself.
 */
export function shareInWords(percentage: number): Narrative {
  const printed = Math.round(percentage);
  if (printed >= 85) return [prose('quasi tutto')];
  if (printed >= 45 && printed <= 55) return [prose('la metà')];
  if (printed >= 30 && printed <= 36) return [prose('un terzo')];
  if (printed >= 22 && printed <= 28) return [prose('un quarto')];
  return percentWithArticle(percentage);
}

/**
 * How far the scheduled figure reaches, in Analisi's own period vocabulary — the counterpart
 * of `describeScheduledHorizon` for the `Period` type. The history has no end to name, so its
 * clause is dropped rather than guessed.
 */
export function describeAnalisiScheduledHorizon(period: AnalisiPeriod, today: MonthRef): string | null {
  if (period.mode === 'history' || period.year === null) return null;
  if (period.month !== null) {
    return period.year === today.year && period.month === today.month ? 'a fine mese' : `a fine ${monthInSentence(period.month)}`;
  }
  // «Da inizio anno» stops at today's month; every other year window runs to December.
  if (period.mode === 'ytd') return 'a fine mese';
  return period.year === today.year ? 'a fine anno' : `a fine ${period.year}`;
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface AnalisiVerdictInput {
  period: AnalisiPeriod;
  today: MonthRef;
  historyStartYear: number;
  totals: PeriodCashflowTotals;
  /**
   * The part of the period that has not happened yet — instalments and recurring rows dated
   * ahead. `totals` INCLUDE it, so the verdict closes by naming it: without that sentence a
   * forecast would read as a fact.
   */
  scheduled: ScheduledSlice;
  /** Against the previous year's same window; null when there is none. */
  pacing: TotalsPacing | null;
  /** The baseline in words («gen–ago 2025»), from `describeBaseline`; null with no pacing. */
  baseline: string | null;
  /** The heaviest spending category of the period and its share, keyed like the movers so the two can be told to be the same category. */
  topCategory: { label: string; percentage: number; categoryKey: string; expenseType: ExpenseType } | null;
  grown: CategoryMover | null;
  shrunk: CategoryMover | null;
  anomalies: SpendingAnomaly[];
  /** The month the anomalies were measured on; null when none could be. */
  anomalyMonth: MonthRef | null;
}

/** The spending pacing as the reader sees it; null when there is no baseline to pace against. */
function resolveSpendingPacing(pacing: TotalsPacing | null): { printed: number; delta: number } | null {
  if (!pacing || pacing.expenses.previous <= 0 || pacing.expenses.deltaPercent === null) return null;
  return { printed: printedDelta(pacing.expenses.deltaPercent), delta: pacing.expenses.deltaPercent };
}

function resolveHeadline(subject: AnalisiSubject, input: AnalisiVerdictInput): { headline: string; tone: VerdictTone } {
  const { totals } = input;
  // A month not lived yet has no verdict: what it holds is the calendar, not spending.
  if (subject.future) return { headline: `${capitalise(subject.inPeriod.replace(/^ad? /, ''))} non è ancora iniziato.`, tone: 'neutral' };
  if (totals.income <= 0 && totals.expenses <= 0) return { headline: `Nessun movimento ${subject.inPeriod}.`, tone: 'neutral' };
  if (totals.expenses <= 0) return { headline: `Nessuna spesa ${subject.inPeriod}.`, tone: 'neutral' };

  const pacing = resolveSpendingPacing(input.pacing);
  if (pacing && subject.comparisonOf && subject.comparisonPlain) {
    const verb = subject.ongoing ? 'spendi' : 'hai speso';
    if (pacing.printed === 0) return { headline: `${subject.subject} ${verb} come ${subject.comparisonPlain}.`, tone: 'neutral' };
    const rising = pacing.delta > 0;
    return { headline: `${subject.subject} ${verb} ${rising ? 'più' : 'meno'} ${subject.comparisonOf}.`, tone: rising ? 'warning' : 'positive' };
  }
  if (input.topCategory) return { headline: `${input.topCategory.label} è la voce più pesante.`, tone: 'neutral' };
  return { headline: `${subject.subject} hai speso ${euro(totals.expenses)}.`, tone: 'neutral' };
}

/** «; ad agosto 2 categorie sono fuori scala: Ristoranti e Auto» — or nothing. */
function anomaliesClause(input: AnalisiVerdictInput): Narrative {
  const { anomalies, anomalyMonth, period } = input;
  if (anomalies.length === 0 || !anomalyMonth) return [];
  const isThePeriod = period.month === anomalyMonth.month && period.year === anomalyMonth.year;
  const where = isThePeriod ? '' : `${monthWithPrepositionA(anomalyMonth.month)} `;
  const names = anomalies.slice(0, 3).map((anomaly) => anomaly.categoryLabel);
  const hidden = anomalies.length - names.length;
  const list = hidden > 0 ? `${names.join(', ')} e ${hidden === 1 ? "un'altra" : `altre ${hidden}`}` : listInWords(names);
  const count = anomalies.length;
  return [
    prose(`${where}`),
    figure(String(count)),
    prose(` ${pluralize(count, 'categoria è', 'categorie sono')} fuori scala: ${list}`),
  ];
}

/**
 * The headline + the sentence under it: the total with the months lived, the pacing against
 * the same window of the previous year, the heaviest category's share, the category that
 * moved the most, and the anomalies of the month — each clause only when its input exists.
 */
export function buildAnalisiVerdict(input: AnalisiVerdictInput): PageVerdictModel {
  const subject = describeAnalisiSubject(input.period, input.today, input.historyStartYear);
  const { headline, tone } = resolveHeadline(subject, input);
  const { totals } = input;

  if (subject.future) {
    const sentence: Narrative =
      totals.expenses > 0
        ? [prose(`${capitalise(subject.inPeriod.replace(/^ad? /, ''))} non è ancora iniziato: `), figure(euro(totals.expenses)), prose(' già in calendario.')]
        : [prose(`${capitalise(subject.inPeriod.replace(/^ad? /, ''))} non è ancora iniziato: nessuna spesa in calendario.`)];
    return { headline, tone, sentence };
  }

  if (totals.income <= 0 && totals.expenses <= 0) {
    const sentence: Narrative =
      totals.transferCount > 0
        ? [prose(`Solo ${totals.transferCount} ${pluralize(totals.transferCount, 'trasferimento', 'trasferimenti')} tra i tuoi conti.`)]
        : [prose('Nessun movimento registrato.')];
    return { headline, tone, sentence: [...sentence, ...(scheduledSentence(input.scheduled, describeAnalisiScheduledHorizon(input.period, input.today)) ?? [])] };
  }
  if (totals.expenses <= 0) {
    const noSpending: Narrative = [prose(`${subject.subject} nessuna spesa: entrate `), figure(euro(totals.income)), prose('.')];
    return { headline, tone, sentence: [...noSpending, ...(scheduledSentence(input.scheduled, describeAnalisiScheduledHorizon(input.period, input.today)) ?? [])] };
  }

  // Opening: «Nel 2026 hai speso 31.200 €». A period now always covers its whole calendar
  // span, so there is no shortened month count to print — what has not happened yet is named
  // by the closing sentence instead.
  const sentence: Narrative = [prose(`${subject.subject} hai speso `), figure(euro(totals.expenses))];

  const pacing = resolveSpendingPacing(input.pacing);
  if (pacing && input.baseline) {
    if (pacing.printed === 0) sentence.push(prose(`, in linea con ${input.baseline}`));
    else sentence.push(prose(', '), signed(signedPercent(pacing.delta), spendingSign(pacing.delta)), prose(` su ${input.baseline}`));
  }

  if (input.topCategory) {
    sentence.push(prose(`; ${input.topCategory.label} pesa `), ...shareInWords(input.topCategory.percentage));
    // A mover is a delta against the baseline: without a spending baseline there is none to name.
    const mover = pacing && input.baseline ? (input.grown ?? input.shrunk) : null;
    if (mover) {
      // The heaviest category may also be the one that moved the most: one subject, not two «Casa».
      const sameCategory = mover.categoryKey === input.topCategory.categoryKey && mover.expenseType === input.topCategory.expenseType;
      sentence.push(
        prose(` ${sameCategory ? 'ed è anche' : `e ${mover.label} è`} la categoria ${mover.delta > 0 ? 'cresciuta' : 'calata'} di più (`),
        signed(signedEuro(mover.delta), spendingSign(mover.delta)),
        prose(')'),
      );
    }
  }

  const anomalies = anomaliesClause(input);
  if (anomalies.length > 0) sentence.push(prose('; '), ...anomalies);
  sentence.push(prose('.'));
  sentence.push(...(scheduledSentence(input.scheduled, describeAnalisiScheduledHorizon(input.period, input.today)) ?? []));
  return { headline, tone, sentence };
}

// ─── Tile readings ────────────────────────────────────────────────────────────

/**
 * The aside of the Periodo tile: «12 mesi · 4 in calendario» for a year still running,
 * «12 mesi» for a closed one, «giorno 25 di 31», «dal 2024»; null for a closed month.
 */
export function describePeriodScope(
  period: AnalisiPeriod,
  today: MonthRef,
  calendar: { dayOfMonth: number; daysInMonth: number } | null,
  historyStartYear: number,
): Narrative | null {
  if (period.mode === 'history' || period.year === null) return [prose('dal '), figure(String(historyStartYear))];
  if (period.month !== null) {
    if (!calendar || period.year !== today.year || period.month !== today.month) return null;
    return [prose('giorno '), figure(String(calendar.dayOfMonth)), prose(' di '), figure(String(calendar.daysInMonth))];
  }
  // Year-to-date says the months it covers; a whole year says twelve and how many of them
  // have not started, so «12 mesi» is never read as twelve months lived.
  if (period.mode === 'ytd') {
    return [figure(String(today.month)), prose(` ${pluralize(today.month, 'mese', 'mesi')}`)];
  }
  const ahead = period.year === today.year ? 12 - today.month : 0;
  const months: Narrative = [figure('12'), prose(' mesi')];
  return ahead > 0 ? [...months, prose(' · '), figure(String(ahead)), prose(' in calendario')] : months;
}

/** The sub-eyebrow of the spending chart: «Spese per mese · 2026 e 2025», «Spese per anno · dal 2024». */
export function describeSpendingChart(kind: 'month' | 'year', year: number | null, hasPrevYear: boolean, historyStartYear: number): Narrative {
  if (kind === 'year' || year === null) return [prose('Spese per anno · dal '), figure(String(historyStartYear))];
  const narrative: Narrative = [prose('Spese per mese · '), figure(String(year))];
  if (hasPrevYear) narrative.push(prose(' e '), figure(String(year - 1)));
  return narrative;
}

/**
 * The footer under the chart: why a bar is at half tone (the bucket is running) and what the
 * previous year is, or why there is none — only when there is something to explain.
 */
export function describeSpendingChartFooter(points: SpendingPoint[], kind: 'month' | 'year', year: number | null, historyStartYear: number): Narrative | null {
  const clauses: Narrative[] = [];
  const running = points.find((point) => point.ongoing);
  if (running) {
    const name = kind === 'year' ? `Il ${running.label}` : MONTH_NAMES[Number(running.key.slice(5)) - 1];
    clauses.push([prose(`${name} è in corso: barra a metà tono`)]);
  }
  if (kind === 'month' && year !== null) {
    const hasPrev = points.some((point) => point.prevYearValue !== null);
    // A closed year needs no note on its baseline: the legend names both years. A running one
    // does — its previous year is cut at the same month, which the bars alone cannot say.
    if (hasPrev && running) clauses.push([prose('il '), figure(String(year - 1)), prose(' è disegnato sugli stessi mesi')]);
    else if (hasPrev) return null;
    else if (year - 1 < historyStartYear) clauses.push([prose('lo storico parte dal '), figure(String(historyStartYear)), prose(': nessun '), figure(String(year - 1)), prose(' da confrontare')]);
    else clauses.push([prose('nessuna spesa registrata nel '), figure(String(year - 1)), prose(': nessun confronto')]);
  }
  if (clauses.length === 0) return null;
  const narrative = joinClauses(clauses, '; ');
  narrative[0] = { ...narrative[0], text: capitalise(narrative[0].text) };
  narrative.push(prose('.'));
  return narrative;
}

/** «2 categorie oltre la loro media dei 6 mesi precedenti.» — or the honest none. */
export function describeAnomalies(anomalies: SpendingAnomaly[]): Narrative {
  if (anomalies.length === 0) return [prose('Nessuna categoria oltre la sua media dei 6 mesi precedenti.')];
  const count = anomalies.length;
  return [figure(String(count)), prose(` ${pluralize(count, 'categoria oltre la sua', 'categorie oltre la loro')} media dei 6 mesi precedenti.`)];
}

const COUNT_WORDS = ['', 'una', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci'];

/** «Le cinque più grandi fanno il 14% delle spese; la più grande è Vacanze · Volo (1180 €).» */
export function describeTopExpenses(top: TopExpenses): Narrative | null {
  const [largest] = top.rows;
  if (!largest) return null;
  const largestLabel = largest.subCategoryLabel ? `${largest.label} · ${largest.subCategoryLabel}` : largest.label;
  const largestClause: Narrative = [prose(`la più grande è ${largestLabel} (`), figure(euro(largest.amount)), prose(')')];

  if (top.count === 1) return [prose(`Una sola spesa: ${largestLabel} (`), figure(euro(largest.amount)), prose(').')];
  if (top.count <= top.rows.length) return [figure(String(top.count)), prose(' spese in tutto; '), ...largestClause, prose('.')];

  const shown = top.rows.length;
  const word = COUNT_WORDS[shown] ?? String(shown);
  const share = top.total > 0 ? (top.shownTotal / top.total) * 100 : 0;
  // Decided on the printed integer: rows beyond the top five that round to 0% must not print «il 100%».
  if (Math.round(share) >= 100) return [prose(`Le ${word} più grandi fanno quasi tutte le spese; `), ...largestClause, prose('.')];
  return [prose(`Le ${word} più grandi fanno `), ...percentWithArticle(share), prose(' delle spese; '), ...largestClause, prose('.')];
}

/** «fisse» is an adjective, «debiti» a noun: the single-type clause needs the adjectival form. */
const SPENDING_TYPE_ADJECTIVES: Record<SpendingType, string> = { fixed: 'fisse', variable: 'variabili', debt: 'di debito' };

/**
 * «Da 4 fonti (39.400 €) a 3 tipi di spesa e 10 categorie; il 21% resta come risparmio.
 * Fisse 58%, variabili 37%, debiti 5%.» — what the Sankey draws, in one sentence.
 */
export function describeFlow(flow: FlowSummary, savingsRate: number | null): Narrative | null {
  if (flow.incomeTotal <= 0 && flow.expensesTotal <= 0) return null;

  const types = flow.typeShares.length;
  const typeClause = (): Narrative => {
    if (types === 0) return [];
    if (types === 1) return [prose(` Tutte spese ${SPENDING_TYPE_ADJECTIVES[flow.typeShares[0].type]}.`)];
    const parts = flow.typeShares.map((share, index): Narrative => [
      prose(`${index === 0 ? share.label : share.label.toLowerCase()} `),
      figure(formatPercentage(share.percentage, 0)),
    ]);
    return [prose(' '), ...joinClauses(parts, ', '), prose('.')];
  };

  if (flow.incomeTotal <= 0) {
    return [
      prose('Nessuna entrata: '),
      figure(euro(flow.expensesTotal)),
      prose(` di spese in ${flow.categoryCount} ${pluralize(flow.categoryCount, 'categoria', 'categorie')}.`),
      ...typeClause(),
    ];
  }

  const sources = flow.incomeSources === 1 ? 'una fonte' : `${flow.incomeSources} fonti`;
  // Income and no spending: the Sankey is one link to the savings, the sentence says just that.
  if (flow.expensesTotal <= 0) return [prose('Nessuna spesa: '), figure(euro(flow.incomeTotal)), prose(` da ${sources}, tutto resta come risparmio.`)];
  const narrative: Narrative = [
    prose(`Da ${sources} (`),
    figure(euro(flow.incomeTotal)),
    prose(`) a ${types} ${pluralize(types, 'tipo', 'tipi')} di spesa e ${flow.categoryCount} ${pluralize(flow.categoryCount, 'categoria', 'categorie')}`),
  ];
  if (savingsRate !== null) {
    if (savingsRate < 0) narrative.push(prose(`; le spese superano le entrate ${ofThePercent(Math.abs(savingsRate))}`), figure(formatPercentage(Math.abs(savingsRate), 1)));
    else if (Math.round(savingsRate) === 0) narrative.push(prose('; nulla resta come risparmio'));
    else narrative.push(prose('; '), ...percentWithArticle(savingsRate), prose(' resta come risparmio'));
  }
  narrative.push(prose('.'), ...typeClause());
  return narrative;
}

export interface EntityFocusInput {
  label: string;
  /** The category, when the focus is a subcategory. */
  parentLabel: string | null;
  isIncome: boolean;
  subject: AnalisiSubject;
  periodTotal: number;
  /** Share of the same-side period total, 0-1; null without a denominator. */
  shareOfPeriod: number | null;
  /** Share of the parent category in the period, 0-1; null at category level. */
  shareOfParent: number | null;
  /** The newest year row's delta; null without a baseline. */
  delta: { amount: number; percent: number | null; sameMonths: boolean; comparisonYear: number } | null;
  /** The period's monthly average; null for a month or the history. */
  monthlyAverage: number | null;
  /** Whether the entity has any row at or after the floor. */
  hasHistory: boolean;
  historyStartYear: number;
}

/**
 * «Nel 2026 hai speso 1200 € in Condominio, l'11,5% di Casa e il 3,8% delle spese; +8,1%
 * sugli stessi mesi del 2025, al ritmo di 150 € al mese.» — the Scheda tile's reading.
 */
export function describeEntityFocus(input: EntityFocusInput): Narrative {
  const { subject, label, isIncome } = input;
  if (!input.hasHistory) return [prose(`Nessuna transazione registrata per ${label} dal `), figure(String(input.historyStartYear)), prose('.')];
  if (input.periodTotal <= 0) {
    return [prose(`${isIncome ? 'Nessuna entrata da' : 'Nessuna spesa in'} ${label} ${subject.inPeriod}; la storia sotto copre tutti gli anni.`)];
  }

  const narrative: Narrative = [prose(`${subject.subject} hai ${isIncome ? 'incassato' : 'speso'} `), figure(euro(input.periodTotal)), prose(` ${isIncome ? 'da' : 'in'} ${label}`)];

  const shares: Narrative[] = [];
  if (input.shareOfParent !== null && input.parentLabel) shares.push([...percentWithArticle(input.shareOfParent * 100, 1), prose(` di ${input.parentLabel}`)]);
  if (input.shareOfPeriod !== null) shares.push([...percentWithArticle(input.shareOfPeriod * 100, 1), prose(` ${isIncome ? 'delle entrate' : 'delle spese'}`)]);
  if (shares.length > 0) narrative.push(prose(', '), ...joinClauses(shares, ' e '));

  if (input.delta) {
    const { amount, percent, sameMonths, comparisonYear } = input.delta;
    const sign: 'positive' | 'negative' = isIncome ? (amount >= 0 ? 'positive' : 'negative') : spendingSign(amount);
    const against = sameMonths ? `sugli stessi mesi del ${comparisonYear}` : `sul ${comparisonYear}`;
    if (percent === null) narrative.push(prose('; '), signed(signedEuro(amount), sign), prose(` ${against}, dove non c'era`));
    else if (printedDelta(percent) === 0) narrative.push(prose(`; in linea con ${sameMonths ? `gli stessi mesi del ${comparisonYear}` : `il ${comparisonYear}`}`));
    else narrative.push(prose('; '), signed(signedPercent(percent), sign), prose(` ${against}`));
  }

  if (input.monthlyAverage !== null && input.monthlyAverage > 0) {
    narrative.push(prose(input.delta ? ', al ritmo di ' : '; al ritmo di '), figure(euro(input.monthlyAverage)), prose(' al mese'));
  }
  narrative.push(prose('.'));
  return narrative;
}

export interface ComparisonInput {
  subject: AnalisiSubject;
  scope: ComparisonMonthScope;
  comparisonYear: number;
  /** The spending side of the totals pacing. */
  expenses: PacingSide;
  /** The per-category comparison, sorted by |delta| — the movers are picked here. */
  rows: CategoryDeltaRow[];
}

/** «Vacanze (+1100 €), Ristoranti (+420 €) e Auto (+300 €)» */
function moversInWords(rows: CategoryDeltaRow[]): Narrative {
  const parts = rows.map((row): Narrative => [prose(`${row.label} (`), signed(signedEuro(row.delta), spendingSign(row.delta)), prose(')')]);
  const narrative: Narrative = [];
  parts.forEach((part, index) => {
    if (index > 0) narrative.push(prose(index === parts.length - 1 ? ' e ' : ', '));
    narrative.push(...part);
  });
  return narrative;
}

/**
 * «Nel 2026 (gen–ago) hai speso 1257 € in più del 2025 (+4,2%); a crescere di più sono state
 * Vacanze (+1100 €), Ristoranti (+420 €) e Auto (+300 €), a calare di più Alimentari (−400 €).»
 */
export function describeComparison(input: ComparisonInput): Narrative | null {
  const { subject, scope, comparisonYear, expenses, rows } = input;
  if (expenses.previous <= 0 || expenses.deltaPercent === null || !subject.comparisonOf) return null;

  // The comparison year is the user's pick, not necessarily the year before: name it explicitly.
  const comparisonOf = scope.kind === 'singleMonth' ? `di ${monthInSentence(scope.month)} ${comparisonYear}` : `del ${comparisonYear}`;
  const comparisonPlain = scope.kind === 'singleMonth' ? `${monthInSentence(scope.month)} ${comparisonYear}` : `nel ${comparisonYear}`;

  const window = scope.kind === 'sameMonths' && scope.upToMonth < 12 ? ` (${MONTH_NAMES_SHORT[0].toLowerCase()}–${MONTH_NAMES_SHORT[scope.upToMonth - 1].toLowerCase()})` : '';
  const opening = `${subject.subject}${window} hai speso `;
  const printed = printedDelta(expenses.deltaPercent);
  const narrative: Narrative = [prose(opening)];

  if (printed === 0) {
    narrative.push(prose(`come ${comparisonPlain} (`), figure(euro(expenses.current)), prose(')'));
  } else {
    const rising = expenses.delta > 0;
    narrative.push(
      signed(euro(expenses.delta), spendingSign(expenses.delta)),
      prose(` in ${rising ? 'più' : 'meno'} ${comparisonOf} (`),
      signed(signedPercent(expenses.deltaPercent), spendingSign(expenses.delta)),
      prose(')'),
    );
    if (scope.kind === 'singleMonth' && scope.inProgress) narrative.push(prose(', a mese in corso'));
  }

  const grown = rows.filter((row) => row.delta > 0).sort((a, b) => b.delta - a.delta);
  const shrunk = rows.filter((row) => row.delta < 0).sort((a, b) => a.delta - b.delta);
  const rising = expenses.delta >= 0;
  const first = rising ? grown.slice(0, 3) : shrunk.slice(0, 3);
  const second = rising ? shrunk.slice(0, 1) : grown.slice(0, 1);
  const verbOf = (list: CategoryDeltaRow[], up: boolean) => `a ${up ? 'crescere' : 'calare'} di più ${list.length === 1 ? 'è stata' : 'sono state'}`;

  if (first.length > 0) {
    narrative.push(prose(`; ${verbOf(first, rising)} `), ...moversInWords(first));
    if (second.length > 0) narrative.push(prose(`, a ${rising ? 'calare' : 'crescere'} di più `), ...moversInWords(second));
  } else if (second.length > 0) {
    narrative.push(prose(`; ${verbOf(second, !rising)} `), ...moversInWords(second));
  }
  narrative.push(prose('.'));
  return narrative;
}

/** The disclosure row of the Confronto: «2026 vs 2025 (stessi mesi, gen–ago) · +1257 €». */
export function describeComparisonSummary(year: number, pacing: TotalsPacing): Narrative {
  return [figure(String(year)), prose(` ${pacing.baselineLabel} · `), signed(signedEuro(pacing.expenses.delta), spendingSign(pacing.expenses.delta))];
}
