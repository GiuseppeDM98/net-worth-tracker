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
import { summarizeSpendingRoleShares, type FlowAbsence, type SpendingRoleShares, type SpendingRolesSummary } from '@/lib/utils/spendingRoles';
import type { AnalisiPeriod, CategoryMover, FlowSummary, MonthRef, SpendingPoint, SpendingType, TopExpenses, TypeFlowBreakdown } from '@/lib/utils/analisiSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import type { SavingsReading } from '@/lib/utils/savingsRate';
import { formatPercentage } from '@/lib/services/chartService';
import { articleForPercent, monthWithPrepositionA, ofThePercent } from '@/lib/utils/patrimonioNarrative';
import { describeCategoryShareAnswer, printedDelta, scheduledScope, scheduledSentence } from '@/lib/utils/cashflowNarrative';
import type { CategoryRanking } from '@/lib/utils/tracciamentoSummary';
import { ANALISI_SECTION_IDS } from '@/lib/utils/analisiSummary';
import type { RowAnswerMap } from '@/components/ui/row-answers';
import { formatStripFigure, type StripFigure } from '@/lib/utils/verdictStrip';
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
    // The history has two ends: the floor and the current year (calendar included) — «Dal
    // 2025 al 2026», never a bare «Dal 2025» that a materialised plan would stretch to 2043.
    const span = today.year > historyStartYear ? `dal ${historyStartYear} al ${today.year}` : `nel ${historyStartYear}`;
    return { subject: capitalise(span), inPeriod: span, ongoing: true, comparisonOf: null, comparisonPlain: null, future: false };
  }
  if (period.month !== null) {
    const sameYear = period.year === today.year;
    const yearSuffix = sameYear ? '' : ` ${period.year}`;
    const ongoing = sameYear && period.month === today.month;
    // «A settembre finora» — the running month is judged on its lived days, and the subject
    // says so, like «Nel 2026 finora» does for the year.
    const inPeriod = `${monthWithPrepositionA(period.month)}${yearSuffix}${ongoing ? ' finora' : ''}`;
    const previous = `${monthInSentence(period.month)} ${period.year - 1}`;
    return {
      subject: capitalise(inPeriod),
      inPeriod,
      ongoing,
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
      // The running month is compared on the same days of the baseline month («primi 14
      // giorni»); without a day to cut at, the baseline says the window is partial instead.
      if (scope.inProgress && scope.throughDay !== undefined) return `${monthInSentence(scope.month)} ${comparisonYear} (primi ${scope.throughDay} giorni)`;
      return `${monthInSentence(scope.month)} ${comparisonYear}${scope.inProgress ? ' (mese in corso)' : ''}`;
    case 'fullYear':
      return String(comparisonYear);
  }
}

/**
 * Why there is no comparison, when the baseline window exists but holds no row at all: the
 * Periodo tile prints it where the pacing caption would stand, so a dropped delta is never a
 * silent one. On the real account September 2025 was recorded in one batch from the 21st, so
 * the first fourteen days of it are empty and the running month has nothing to pace against
 * (2026-09-14). Null when a comparison exists.
 */
export function describeMissingBaseline(scope: ComparisonMonthScope, comparisonYear: number): string {
  const where = (() => {
    switch (scope.kind) {
      case 'sameMonths':
        return scope.upToMonth === 12 ? `nel ${comparisonYear}` : `in ${describeBaseline(scope, comparisonYear)}`;
      case 'singleMonth':
        if (scope.inProgress && scope.throughDay !== undefined) return `nei primi ${scope.throughDay} giorni di ${monthInSentence(scope.month)} ${comparisonYear}`;
        return `${monthWithPrepositionA(scope.month)} ${comparisonYear}`;
      case 'fullYear':
        return `nel ${comparisonYear}`;
    }
  })();
  return `Nessun movimento ${where}: nessun confronto.`;
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
 * of `describeScheduledHorizon` for the `Period` type. The history closes on the current year
 * (calendar included), so its horizon is the year's end like the running year's.
 */
export function describeAnalisiScheduledHorizon(period: AnalisiPeriod, today: MonthRef): string | null {
  if (period.mode === 'history' || period.year === null) return 'a fine anno';
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
 * The headline + the sentence under it: the total, the pacing against the SAME window of the
 * previous year (the period's own span — see `resolveComparisonScope`), the heaviest category's
 * share, the category that moved the most, and the anomalies of the month — each clause only
 * when its input exists.
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
    return { headline, tone, sentence };
  }
  if (totals.expenses <= 0) {
    const noSpending: Narrative = [prose(`${subject.subject} nessuna spesa: entrate `), figure(euro(totals.income)), prose('.')];
    return { headline, tone, sentence: noSpending };
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

  // The first sentence ends here: the total and its pacing — what a phone keeps under the title
  // (The Binding-Clause Rule; the cut needs a full stop, at 1440 too: «; Casa pesa» became «. Casa pesa»).
  sentence.push(prose('.'));
  const leadLength = sentence.length;

  if (input.topCategory) {
    sentence.push(prose(` ${input.topCategory.label} pesa `), ...shareInWords(input.topCategory.percentage));
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
  if (anomalies.length > 0) {
    // After the category the anomalies close its sentence; alone they open one of their own.
    if (input.topCategory) sentence.push(prose('; '), ...anomalies);
    else sentence.push(prose(' '), ...capitaliseClause(anomalies));
  }
  if (sentence.length === leadLength) return { headline, tone, sentence };
  sentence.push(prose('.'));
  const restLabel = anomalies.length === 0 ? 'le categorie' : input.topCategory ? 'categorie e fuori scala' : 'il fuori scala';
  return { headline, tone, sentence, leadLength, restLabel };
}

/** The first prose of a clause with a capital, when the clause opens a sentence and no figure comes before it. */
function capitaliseClause(clause: Narrative): Narrative {
  const index = clause.findIndex((segment) => segment.mono || segment.text.trim() !== '');
  if (index === -1 || clause[index].mono) return clause;
  return clause.map((segment, i) => (i === index ? { ...segment, text: capitalise(segment.text) } : segment));
}

/**
 * The verdict's `scope` (since 2026-10-14; DESIGN.md → The Binding-Clause Rule): the rows still
 * in the calendar inside the period's totals, «Nel totale ci sono ancora 1850 € di spese già in
 * calendario da qui a fine anno.» — a caption of its own under the strip on a phone and under the
 * paragraph at 1440, no longer the sentence's last clause. The same form as Tracciamento's
 * `describeTrackingScope`, on Analisi's own horizon; `null` with nothing in the calendar.
 */
export function describeAnalisiScope(input: Pick<AnalisiVerdictInput, 'scheduled' | 'period' | 'today'>): Narrative | null {
  return scheduledScope(input.scheduled, describeAnalisiScheduledHorizon(input.period, input.today));
}

/**
 * What a closed row of Analisi says beside its eyebrow (The Closed-Row Rule): words, never an
 * amount. Fuori scala names its month and the Scheda its entity at the call site; the Flusso
 * says its view («per ruolo» / «per tipo»), which `FlussoTile` knows.
 */
export const ANALISI_CLOSED_ASIDES = {
  maggiori: 'per importo',
  spese: 'per categoria',
  entrate: 'per categoria',
  flussoRoles: 'per ruolo',
  flussoTypes: 'per tipo',
} as const;

/**
 * The figures the first screen already prints, as the texts of their magnitudes («30.000 €»): the
 * verdict's first sentence and the strip's cells. A Flusso caption drawn as a bar (a cell narrower
 * than 608px since 2026-10-16) drops an amount whose text is among them (2026-10-14) — a figure
 * repeated a hand's width lower is one more figure to read and no more to know.
 */
export function collectPrintedFigures(lead: Narrative, strip: readonly StripFigure[]): ReadonlySet<string> {
  const unsigned = (text: string) => text.replace(/^[~+−-]+/, '');
  const texts = new Set<string>();
  for (const segment of lead) if (segment.mono) texts.add(unsigned(segment.text));
  for (const figure of strip) {
    const segment = formatStripFigure(figure);
    if (segment) texts.add(unsigned(segment.text));
  }
  return texts;
}

// ─── Tile readings ────────────────────────────────────────────────────────────

/**
 * The aside of the Periodo tile: «12 mesi · 4 in calendario» for a year still running,
 * «12 mesi» for a closed one, «giorno 25 di 31», «dal 2024 al 2026»; null for a closed month.
 */
export function describePeriodScope(
  period: AnalisiPeriod,
  today: MonthRef,
  calendar: { dayOfMonth: number; daysInMonth: number } | null,
  historyStartYear: number,
): Narrative | null {
  if (period.mode === 'history' || period.year === null) {
    const span: Narrative = [prose('dal '), figure(String(historyStartYear))];
    if (today.year > historyStartYear) span.push(prose(' al '), figure(String(today.year)));
    return span;
  }
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

/**
 * A share of the Flusso as a sentence prints it: the whole percent, or «meno dell'1%» for a share
 * that holds money and rounds to zero (owner's decision, 2026-09-27). Every share that reaches
 * here belongs to a role or a type with money in it — the empty ones are not listed — so «0%»
 * would say «nothing» over something. The shares still add up to 100 with this one counted as zero.
 */
export function describeShare(percentage: number): Narrative {
  if (percentage === 0) return [prose("meno dell'"), figure(formatPercentage(1, 0))];
  return [figure(formatPercentage(percentage, 0))];
}

/** The same share where there is no room for words — a legend beside a swatch: «<1%». */
export function describeShareCompact(percentage: number): string {
  return percentage === 0 ? `<${formatPercentage(1, 0)}` : formatPercentage(percentage, 0);
}

/** «fisse» is an adjective, «debiti» a noun: the single-type clause needs the adjectival form. */
const SPENDING_TYPE_ADJECTIVES: Record<SpendingType, string> = { fixed: 'fisse', variable: 'variabili', debt: 'di debito' };

/**
 * «Da 4 fonti (39.400 €) a 3 tipi di spesa e 10 categorie; il 21% resta come risparmio.
 * Fisse 58%, variabili 37%, debiti 5%.» — what the Sankey draws, in one sentence. `reading` is
 * the period's `readSavings(totals.income, totals.expenses)`: a deficit beyond the savings floor
 * is said in euros, «le spese superano le entrate di 497 €» (2026-11-12).
 */
export function describeFlow(flow: FlowSummary, reading: SavingsReading): Narrative | null {
  if (flow.incomeTotal <= 0 && flow.expensesTotal <= 0) return null;

  const types = flow.typeShares.length;
  const typeClause = (): Narrative => {
    if (types === 0) return [];
    if (types === 1) return [prose(` Tutte spese ${SPENDING_TYPE_ADJECTIVES[flow.typeShares[0].type]}.`)];
    // The printed share, not `percentage`: the phone's legend prints the same whole figures, and
    // rounded one by one three equal types would read 33% + 33% + 33%.
    const parts = flow.typeShares.map((share, index): Narrative => [
      prose(`${index === 0 ? share.label : share.label.toLowerCase()} `),
      ...describeShare(share.printedPercentage),
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
  if (reading.kind === 'deficit') {
    narrative.push(prose('; le spese superano le entrate di '), figure(euro(reading.deficit)));
  } else if (reading.kind === 'rate') {
    const savingsRate = reading.rate;
    if (savingsRate < 0) narrative.push(prose(`; le spese superano le entrate ${ofThePercent(Math.abs(savingsRate))}`), figure(formatPercentage(Math.abs(savingsRate), 1)));
    else if (Math.round(savingsRate) === 0) narrative.push(prose('; nulla resta come risparmio'));
    else narrative.push(prose('; '), ...percentWithArticle(savingsRate), prose(' resta come risparmio'));
  }
  narrative.push(prose('.'), ...typeClause());
  return narrative;
}

/**
 * « (di cui 300 € accantonati e 450 € avanzati)» — what Risparmi is made of, whenever rows are
 * classified as saving (owner's decision, 2026-09-27). The word «Risparmi» stays, but it then
 * names two different things from the type view's surplus, and this clause is what tells them
 * apart. Without saving rows Risparmi IS the surplus, and nothing is said.
 */
function savingsSplitClause(roleShares: SpendingRoleShares): Narrative {
  if (roleShares.saved <= 0) return [];
  if (roleShares.surplus <= 0) return [prose(' (tutti accantonati)')];
  return [
    prose(' (di cui '),
    figure(euro(roleShares.saved)),
    prose(' accantonati e '),
    figure(euro(roleShares.surplus)),
    prose(' avanzati)'),
  ];
}

/**
 * Flusso in its 50/30/20 view — the sentence over the roles flow.
 *
 * Shares are of everything that left the budget: income plus what the patrimony covered, the same
 * total both sides of the Sankey carry. They come from `summarizeSpendingRoleShares`, the one source
 * the phone bar reads too, so they add up to exactly 100 as printed and follow
 * SPENDING_ROLE_FLOW_ORDER, the order the Sankey and the bar draw. A deficit is named first,
 * because it is why Risparmi is missing; «Da classificare» is named whenever it is not zero,
 * because those euros belong to no role yet. Null when there is no flow at all.
 */
export function describeSpendingRolesFlow(summary: SpendingRolesSummary): Narrative | null {
  const roleShares = summarizeSpendingRoleShares(summary);
  if (roleShares.absence !== null) return null;

  const parts = roleShares.shares.map((share): Narrative => [
    prose(`${share.label.toLowerCase()} `),
    ...describeShare(share.percentage),
    ...(share.bucket === 'saving' ? savingsSplitClause(roleShares) : []),
  ]);

  let lead: Narrative;
  if (roleShares.noIncome) {
    lead = [prose('Nessuna entrata: '), figure(euro(summary.spending)), prose(' di spese tutti coperti dal patrimonio, ')];
  } else if (roleShares.deficit > 0) {
    lead = [
      prose('Le spese superano le entrate di '),
      figure(euro(roleShares.deficit)),
      prose(', coperti dal patrimonio. Di quanto è uscito: '),
    ];
  } else {
    lead = [prose('Delle entrate ('), figure(euro(summary.income)), prose('): ')];
  }
  return [...lead, ...joinClauses(parts, ', '), prose('. Il riferimento è 50/30/20.')];
}

// ─── Flusso on a phone ────────────────────────────────────────────────────────
//
// In a cell narrower than 608px (`FLUSSO_SANKEY_MIN_CELL`, since 2026-10-16) the Flusso is a share
// bar and rows, not a Sankey (FlowShareMobile). Its caption, its surplus note and its empty line are
// sentences, so they live here like every other Analisi word.

/** « Nessuna entrata: tutto è coperto dal patrimonio.» — the no-income tail of both captions. */
const NO_INCOME_TAIL: Narrative = [prose(' Nessuna entrata: tutto è coperto dal patrimonio.')];

/**
 * « Oltre la linea delle entrate: 400 € dal patrimonio.» — the deficit tail, beside the red line;
 * without its amount when the first screen prints it already (the strip's «Risparmio» is the same
 * deficit).
 */
function deficitTail(deficit: number, printed: ReadonlySet<string>): Narrative {
  if (printed.has(euro(deficit))) return [prose(' Oltre la linea delle entrate, il resto viene dal patrimonio.')];
  return [prose(' Oltre la linea delle entrate: '), figure(euro(deficit)), prose(' dal patrimonio.')];
}

const NOTHING_PRINTED: ReadonlySet<string> = new Set();

/**
 * A group's total on the Flusso drawn as a bar, in a cell narrower than 608px (`FlowShareMobile`'s
 * header, «Risparmio» included): whole euros, like every aggregate of the page — the strip's
 * «Risparmio» cell prints the same text (`__tests__/analisiSummary.test.ts` holds the identity).
 */
export function formatFlowAmount(value: number): string {
  return cachedFormatCurrencyEUR(value, true);
}

/**
 * The line under the 50/30/20 bar: what the bar is a share of, the reference its ticks mark, and
 * where the money beyond the income came from. Null when there is no flow (the caller prints
 * `describeFlowAbsence` instead).
 */
export function describeSpendingRolesBar(roleShares: SpendingRoleShares, printed: ReadonlySet<string> = NOTHING_PRINTED): Narrative | null {
  if (roleShares.absence !== null) return null;
  const narrative: Narrative = printed.has(euro(roleShares.base))
    ? [prose('Quote di quanto è uscito; tacche a 50 e 80, il riferimento 50/30/20.')]
    : [prose('Quote di quanto è uscito ('), figure(euro(roleShares.base)), prose('); tacche a 50 e 80, il riferimento 50/30/20.')];
  if (roleShares.noIncome) return [...narrative, ...NO_INCOME_TAIL];
  if (roleShares.deficit > 0) return [...narrative, ...deficitTail(roleShares.deficit, printed)];
  return narrative;
}

/**
 * The line under the type bar: the bar is the SPENDING (the reading's own base for the type
 * shares), then the deficit or the absence of income. «Nessuna spesa nel periodo.» when only
 * income moved — the surplus note says the rest. Null when there is no flow.
 */
export function describeTypeFlowBar(breakdown: TypeFlowBreakdown, printed: ReadonlySet<string> = NOTHING_PRINTED): Narrative | null {
  if (breakdown.absence !== null) return null;
  if (breakdown.spending <= 0) return [prose('Nessuna spesa nel periodo.')];
  const narrative: Narrative = printed.has(euro(breakdown.spending))
    ? [prose('Quote delle spese.')]
    : [prose('Quote delle spese ('), figure(euro(breakdown.spending)), prose(').')];
  if (breakdown.noIncome) return [...narrative, ...NO_INCOME_TAIL];
  if (breakdown.deficit > 0) return [...narrative, ...deficitTail(breakdown.deficit, printed)];
  return narrative;
}

export interface FlowSurplusInput {
  /** income − spending when positive (`TypeFlowBreakdown.surplus` / `SpendingRoleShares.surplus`). */
  surplus: number;
  /**
   * The note closes a group that already lists rows (the roles view's Risparmi, when categories
   * are classified as saving): it then opens on «Più», because the surplus comes on top of them.
   */
  afterRows: boolean;
  /**
   * The period's not-yet-happened slice (`summarizeScheduled` — AnalisiTab's `scheduled`, the
   * one the verdict reads). A running year's surplus includes the calendar, so the note then
   * carries the SAME clause Tracciamento and the verdict use.
   */
  scheduled: ScheduledSlice;
  /** `describeAnalisiScheduledHorizon(period, today)` — how far that calendar reaches. */
  horizon: string | null;
}

/**
 * «600 € avanzati nel periodo.» under the savings group — plus «Nel totale ci sono ancora … già
 * in calendario» when the period holds scheduled rows (owner's decision, 2026-09-27: the past
 * tense stays, the calendar is declared, never a second wording). Null without a surplus.
 */
export function describeFlowSurplus({ surplus, afterRows, scheduled, horizon }: FlowSurplusInput): Narrative | null {
  if (surplus <= 0) return null;
  const singular = Math.round(surplus) === 1;
  return [
    ...(afterRows ? [prose('Più ')] : []),
    figure(euro(surplus)),
    prose(` ${singular ? 'avanzato' : 'avanzati'} nel periodo.`),
    ...(scheduledSentence(scheduled, horizon) ?? []),
  ];
}

/**
 * The Flusso with nothing to draw, in the absence's own name (DESIGN.md → The
 * Absence-Has-Three-Names Rule): nothing recorded, or rows that net to nothing. A failed read
 * never reaches here — the page's `loadFailed` branch is checked first.
 */
export function describeFlowAbsence(absence: FlowAbsence): Narrative {
  if (absence === 'missing') return [prose('Nessuna entrata né spesa registrata nel periodo.')];
  return [prose('I movimenti del periodo fanno zero: nessun flusso da disegnare.')];
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
  /**
   * The newest year row's delta; null without a baseline. A same-months delta carries the
   * window it was measured on (`livedTotal` over `livedMonths`) whenever that is not the
   * period total: a whole running year prints its calendar in the total, and the sentence
   * must not hang a nine-month delta on a twelve-month figure (DESIGN.md → one sentence, one
   * window).
   */
  delta: { amount: number; percent: number | null; sameMonths: boolean; comparisonYear: number; livedTotal?: number; livedMonths?: number } | null;
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
    const { amount, percent, sameMonths, comparisonYear, livedTotal, livedMonths } = input.delta;
    const sign: 'positive' | 'negative' = isIncome ? (amount >= 0 ? 'positive' : 'negative') : spendingSign(amount);
    const against = sameMonths ? `sugli stessi mesi del ${comparisonYear}` : `sul ${comparisonYear}`;
    // The delta's own window, named with its figure when the total above spans more months.
    const ownWindow = sameMonths && livedTotal !== undefined && livedMonths !== undefined && Math.round(livedTotal) !== Math.round(input.periodTotal);
    if (ownWindow) narrative.push(prose(`; nei primi ${livedMonths} mesi `), figure(euro(livedTotal)), prose(', '));
    else narrative.push(prose('; '));
    if (percent === null) narrative.push(signed(signedEuro(amount), sign), prose(` ${against}, dove non c'era`));
    else if (printedDelta(percent) === 0) narrative.push(prose(`in linea con ${sameMonths ? `gli stessi mesi del ${comparisonYear}` : `il ${comparisonYear}`}`));
    else narrative.push(signed(signedPercent(percent), sign), prose(` ${against}`));
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
    if (scope.kind === 'singleMonth' && scope.inProgress) narrative.push(prose(scope.throughDay !== undefined ? `, sui primi ${scope.throughDay} giorni` : ', a mese in corso'));
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

// ─── The closed rows' answers (2026-10-16) ────────────────────────────────────

export interface AnalisiClosedAnswersInput {
  /** `detectSpendingAnomalies` of the month, highest share first — as Fuori scala lists them. */
  anomalies: SpendingAnomaly[];
  topExpenses: TopExpenses;
  /** The two category tiles' rankings, as the page hands them to `describeCategoryShare`. */
  expenseRanking: CategoryRanking;
  incomeRanking: CategoryRanking;
  flow: FlowSummary;
  /** The 50/30/20 totals; null with the setting off (the Flusso has its type view only). */
  spendingRoles: SpendingRolesSummary | null;
}

/**
 * What Analisi's closed rows answer in the landscape index (components/ui/row-answers.tsx), none of
 * them the strip's Entrate and Risparmio nor THE tile's trio and rate:
 * - Fuori scala: the furthest category over its average, «Ristoranti +80%» in red as its row
 *   prints it; «nessuna fuori scala» without one (the row exists only on a month);
 * - Spese maggiori: «la più grande 2505 €»;
 * - the two category rows: the first category and its share (`describeCategoryShareAnswer`);
 * - Flusso: the LARGEST printed share of the view the tile opens on — by 50/30/20 role when the
 *   setting is on (the tile's default at every mount), else by type, «Variabili 91%» — never the
 *   savings rate, which THE tile prints. The view is the tile's own state: switched by hand while
 *   open, the closed row still answers for the default view.
 * The Scheda keeps its scope: the entity's name IS the answer to «quale?», and it opens by itself.
 */
export function describeAnalisiClosedAnswers(input: AnalisiClosedAnswersInput): RowAnswerMap {
  return {
    [ANALISI_SECTION_IDS.fuoriScala]: describeAnomaliesAnswer(input.anomalies),
    [ANALISI_SECTION_IDS.maggiori]: input.topExpenses.rows[0] ? [prose('la più grande'), figure(euro(input.topExpenses.rows[0].amount))] : null,
    [ANALISI_SECTION_IDS.spese]: describeCategoryShareAnswer(input.expenseRanking, 'expenses'),
    [ANALISI_SECTION_IDS.entrate]: describeCategoryShareAnswer(input.incomeRanking, 'income'),
    [ANALISI_SECTION_IDS.scheda]: null,
    [ANALISI_SECTION_IDS.flusso]: input.spendingRoles ? describeRolesFlowAnswer(input.spendingRoles) : describeTypesFlowAnswer(input.flow),
  };
}

function describeAnomaliesAnswer(anomalies: SpendingAnomaly[]): Narrative {
  const first = anomalies[0];
  if (!first) return [prose('nessuna fuori scala')];
  return [prose(first.categoryLabel), signed(`+${formatPercentage(first.deltaPercent, 0)}`, 'negative')];
}

/** The largest of the printed shares — the first that reaches the maximum, so a tie keeps the view's order. */
function largestPrinted<T>(items: T[], printed: (item: T) => number): T | null {
  return items.reduce<T | null>((best, item) => (best === null || printed(item) > printed(best) ? item : best), null);
}

function describeTypesFlowAnswer(flow: FlowSummary): Narrative | null {
  if (flow.typeShares.length === 0) return null;
  // One type is the whole spending: the reading's words, no 100%.
  if (flow.typeShares.length === 1) return [prose(`tutte ${SPENDING_TYPE_ADJECTIVES[flow.typeShares[0].type]}`)];
  const largest = largestPrinted(flow.typeShares, (share) => share.printedPercentage)!;
  return [prose(largest.label), figure(formatPercentage(largest.printedPercentage, 0))];
}

function describeRolesFlowAnswer(summary: SpendingRolesSummary): Narrative | null {
  const roleShares = summarizeSpendingRoleShares(summary);
  if (roleShares.absence !== null) return null;
  const largest = largestPrinted(roleShares.shares, (share) => share.percentage);
  if (!largest) return null;
  return [prose(largest.label), figure(formatPercentage(largest.percentage, 0))];
}
