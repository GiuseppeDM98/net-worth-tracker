/**
 * FIRE › What If's words: the verdict that answers «cosa cambia se…?» before any number, and the
 * reading line under each tile of that tab.
 *
 * Same design as the other `*Narrative.ts` modules: every function is pure and returns a
 * `Narrative` (segments flagged `mono`) rendered by `NarrativeText`; the phrasings are pinned by
 * tests, and a sentence never claims what the data cannot support — a missing input drops its
 * clause, never a placeholder (DESIGN.md → The Narrative Honesty Rule).
 *
 * Two things this tab must keep straight. The event is stated in the terms the pure layer knows
 * — months, an amount, a share of the household income — never a category or a person: which
 * income stops is the UI's business (doc/guide/fire.md § FIRE, What If and Goals). And the only signed
 * figures are the DELTAS: a year later is a loss, a lower FIRE number is a gain, the bounds and
 * the years stay uncoloured, and the headline's tone follows the delta in years.
 *
 * Percentages go through chartService's it-IT formatter (comma decimals), currency through
 * `cachedFormatCurrencyEUR` (no-break space before €) — AGENTS.md → Italian Localization.
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { articleForPercent } from '@/lib/utils/patrimonioNarrative';
import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import type { WhatIfEventType } from '@/types/whatIf';
import type { MetricPair, SensitivityReading, WhatIfDivergence, WhatIfEvent, WhatIfSummary, WhatIfTimeline } from '@/lib/utils/whatIfSummary';

// ─── Formatting helpers ───────────────────────────────────────────────────────

type Sign = 'positive' | 'negative';

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

function formatAmount(value: number): string {
  return cachedFormatCurrencyEUR(Math.round(Math.abs(value)), true);
}

/** An euro amount without cents, set in mono and uncoloured: a bound is neither a gain nor a loss. */
function amount(value: number): NarrativeSegment {
  return figure(formatAmount(value));
}

/** A delta's magnitude, coloured by whether the change is good or bad. */
function signedAmount(value: number, sign: Sign): NarrativeSegment {
  return { text: formatAmount(value), mono: true, sign };
}

function year(value: number): NarrativeSegment {
  return figure(String(value));
}

function formatRate(value: number): string {
  return `${value.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
}

/** «12 mesi» / «1 mese». */
function months(value: number): string {
  return `${value} ${value === 1 ? 'mese' : 'mesi'}`;
}

/** «7 anni» / «1 anno». */
function years(value: number): string {
  return `${value} ${value === 1 ? 'anno' : 'anni'}`;
}

/** A change smaller than half a unit is no change: it would print as «0 €». */
const changed = (delta: number, unit = 0.5): boolean => Math.abs(delta) >= unit;

/** «a, b e c» — the Italian list. */
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Clauses joined as a list: «, » between, « e » before the last. */
function joinClauses(clauses: Narrative[]): Narrative {
  const out: Narrative = [];
  clauses.forEach((clause, index) => {
    if (index > 0) out.push(prose(index === clauses.length - 1 ? ' e ' : ', '));
    out.push(...clause);
  });
  return out;
}

const EVENT_LABELS: Record<WhatIfEventType, string> = {
  jobLoss: 'Perdita di lavoro',
  majorPurchase: 'Acquisto importante',
  cashflowChange: 'Variazione di risparmio e spese',
  windfall: 'Entrata straordinaria',
};

// ─── The event, in the pure layer's terms ─────────────────────────────────────

/** «12 mesi senza 31.800 € l'anno di entrate (il 64% del reddito)» / «una spesa una tantum di 30.000 €» / … */
function eventClause(event: WhatIfEvent): Narrative {
  switch (event.kind) {
    case 'jobLoss': {
      const share: Narrative =
        event.lostShareOfIncomePct !== null
          ? [prose(` (${articleForPercent(event.lostShareOfIncomePct, 0)}`), figure(formatPercentage(event.lostShareOfIncomePct, 0)), prose(' del reddito)')]
          : [];
      return [figure(months(event.months)), prose(' senza '), amount(event.lostAnnualIncome), prose(" l'anno di entrate"), ...share];
    }
    case 'majorPurchase':
      return [prose('una spesa una tantum di '), amount(event.lumpSum)];
    case 'windfall':
      return [prose("un'entrata una tantum di "), amount(event.lumpSum)];
    case 'cashflowChange': {
      const parts: Narrative[] = [];
      if (event.savingsDelta !== 0) parts.push([amount(event.savingsDelta), prose(` l'anno di risparmio in ${event.savingsDelta < 0 ? 'meno' : 'più'}`)]);
      if (event.expensesDelta !== 0) parts.push([amount(event.expensesDelta), prose(` di spese in ${event.expensesDelta > 0 ? 'più' : 'meno'}`)]);
      return joinClauses(parts);
    }
  }
}

// ─── The year clause, shared by the verdict and the Prima e dopo reading ──────

type TimelineCase = 'keeps' | 'loses' | 'gains' | 'neverBoth' | 'leaves' | 'returns' | 'same' | 'moves';

function timelineCase(t: WhatIfTimeline): TimelineCase {
  if (t.reachedBefore && t.reachedAfter) return 'keeps';
  if (t.reachedBefore) return 'loses';
  if (t.reachedAfter) return 'gains';
  if (t.yearsBefore === null && t.yearsAfter === null) return 'neverBoth';
  if (t.yearsAfter === null) return 'leaves';
  if (t.yearsBefore === null) return 'returns';
  if (t.deltaYears === 0) return 'same';
  return 'moves';
}

/** The verdict's year clause, in the list with the other deltas. */
function yearClause(summary: WhatIfSummary): Narrative {
  const t = summary.timeline;
  switch (timelineCase(t)) {
    case 'keeps':
      return [prose('resti sopra il numero FIRE di '), amount(summary.fireNumber.after)];
    case 'loses':
      return t.calendarAfter !== null
        ? [prose('il FIRE tornerebbe nel '), year(t.calendarAfter)]
        : [prose('il FIRE non tornerebbe entro il '), year(t.horizonCalendarYear)];
    case 'gains':
      return [prose('superi il numero FIRE di '), amount(summary.fireNumber.after), prose(' già oggi')];
    case 'neverBoth':
      return [prose('il FIRE non arriva entro il '), year(t.horizonCalendarYear), prose(' né prima né dopo')];
    case 'leaves':
      return [prose('il FIRE non arriva più entro il '), year(t.horizonCalendarYear)];
    case 'returns':
      return [prose('il FIRE arriva nel '), year(t.calendarAfter as number)];
    case 'same':
      return [prose('il FIRE resta nel '), year(t.calendarBefore as number)];
    case 'moves':
      return [prose('il FIRE passa dal '), year(t.calendarBefore as number), prose(' al '), year(t.calendarAfter as number)];
  }
}

function headlineOf(summary: WhatIfSummary): { headline: string; tone: VerdictTone } {
  const t = summary.timeline;
  switch (timelineCase(t)) {
    case 'keeps':
      return { headline: "Resti FIRE anche dopo l'evento.", tone: 'positive' };
    case 'loses':
      return { headline: "L'evento ti toglie il FIRE.", tone: 'negative' };
    case 'gains':
      return { headline: "Con l'evento sei FIRE.", tone: 'positive' };
    case 'neverBoth':
      return { headline: `Il FIRE resta oltre i ${t.horizonYears} anni.`, tone: 'neutral' };
    case 'leaves':
      return { headline: "Il FIRE esce dall'orizzonte.", tone: 'negative' };
    case 'returns':
      return { headline: "Il FIRE rientra nell'orizzonte.", tone: 'positive' };
    case 'same':
      return { headline: `Il FIRE resta nel ${t.calendarBefore}.`, tone: 'neutral' };
    case 'moves': {
      const delta = t.deltaYears as number;
      return delta > 0
        ? { headline: `Il FIRE slitta di ${years(delta)}.`, tone: 'negative' }
        : { headline: `Il FIRE si avvicina di ${years(-delta)}.`, tone: 'positive' };
    }
  }
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface WhatIfVerdictInput {
  /** A positive FIRE-eligible net worth and recorded expenses exist. */
  hasBaseline: boolean;
  event: WhatIfEvent | null;
  summary: WhatIfSummary | null;
}

/** « Sul Coast FIRE ti mancano 47.300 € invece di 15.500 €.» — or what else the Coast does. */
function coastSentence(summary: WhatIfSummary): Narrative {
  const coast = summary.coast;
  if (!coast) return [];
  if (coast.reachedBefore && coast.reachedAfter) {
    return [prose(' Resti sopra il numero Coast FIRE di oggi ('), amount(coast.numberToday.after), prose(').')];
  }
  if (coast.reachedBefore) return [prose(' Sul Coast FIRE perdi il traguardo: ti mancano '), amount(coast.gap.after), prose('.')];
  if (coast.reachedAfter) return [prose(' Sul Coast FIRE superi il numero di oggi ('), amount(coast.numberToday.after), prose(').')];
  if (!changed(coast.numberToday.delta) && !changed(coast.gap.delta)) return [prose(' Il Coast FIRE non cambia.')];
  const gap: Narrative = [prose('ti mancano '), amount(coast.gap.after), prose(' invece di '), amount(coast.gap.before), prose('.')];
  if (changed(coast.numberToday.delta)) {
    return [prose(' Sul Coast FIRE il numero di oggi passa da '), amount(coast.numberToday.before), prose(' a '), amount(coast.numberToday.after), prose(' e '), ...gap];
  }
  return [prose(' Sul Coast FIRE '), ...gap];
}

const BRIDGE_NOTE: Narrative = [prose(' Numeri con il modello ponte: il fondo pensione rientra allo sblocco.')];

/** «Il piano resta quello di oggi: FIRE nel 2033.» — what the plan is while no event is typed. */
function planTodayClause(t: WhatIfTimeline): Narrative {
  if (t.reachedBefore) return [prose('sei già FIRE')];
  if (t.calendarBefore === null) return [prose(`FIRE oltre i ${t.horizonYears} anni`)];
  return [prose('FIRE nel '), year(t.calendarBefore)];
}

export function buildWhatIfVerdict(input: WhatIfVerdictInput): PageVerdictModel {
  if (!input.hasBaseline || !input.event || !input.summary) {
    return {
      headline: 'What If non calcolabile.',
      tone: 'neutral',
      sentence: [prose("Servono un patrimonio FIRE positivo e spese registrate nel Cashflow: l'evento si applica al piano di oggi.")],
    };
  }
  const { event, summary } = input;
  if (event.isEmpty) {
    return {
      headline: 'Nessun evento da simulare.',
      tone: 'neutral',
      sentence: [prose('Il piano resta quello di oggi: '), ...planTodayClause(summary.timeline), prose('. Scegli un evento e inserisci un importo.')],
    };
  }

  const clauses: Narrative[] = [];
  const capital = summary.netWorth;
  if (changed(capital.delta)) {
    clauses.push([
      prose(`il patrimonio FIRE ${capital.delta < 0 ? 'scende' : 'sale'} di `),
      signedAmount(capital.delta, capital.delta < 0 ? 'negative' : 'positive'),
      prose(' (da '),
      amount(capital.before),
      prose(' a '),
      amount(capital.after),
      prose(')'),
    ]);
  }
  const number = summary.fireNumber;
  if (changed(number.delta)) {
    clauses.push([
      prose(`il numero FIRE ${number.delta > 0 ? 'sale' : 'scende'} di `),
      signedAmount(number.delta, number.delta > 0 ? 'negative' : 'positive'),
      prose(' (da '),
      amount(number.before),
      prose(' a '),
      amount(number.after),
      prose(')'),
    ]);
  }
  clauses.push(yearClause(summary));
  const income = summary.monthlyIncome;
  if (changed(income.delta)) {
    clauses.push([
      prose(`il reddito passivo sostenibile ${income.delta < 0 ? 'cala' : 'sale'} di `),
      signedAmount(income.delta, income.delta < 0 ? 'negative' : 'positive'),
      prose(' al mese (da '),
      amount(income.before),
      prose(' a '),
      amount(income.after),
      prose(')'),
    ]);
  }

  return {
    ...headlineOf(summary),
    sentence: [prose('Con '), ...eventClause(event), prose(' '), ...joinClauses(clauses), prose('.'), ...coastSentence(summary), ...(summary.isBridge ? BRIDGE_NOTE : [])],
  };
}

// ─── Prima e dopo ─────────────────────────────────────────────────────────────

/** «Oggi il FIRE arriva nel 2033, dopo l'evento nel 2034.» — the two years, standalone. */
function timelinePairClause(t: WhatIfTimeline): Narrative {
  const horizon = year(t.horizonCalendarYear);
  switch (timelineCase(t)) {
    case 'keeps':
      return [prose("Sei già FIRE oggi e lo resti dopo l'evento.")];
    case 'loses':
      return t.calendarAfter !== null
        ? [prose("Sei già FIRE oggi; dopo l'evento il FIRE tornerebbe nel "), year(t.calendarAfter), prose('.')]
        : [prose("Sei già FIRE oggi; dopo l'evento il FIRE non tornerebbe entro il "), horizon, prose('.')];
    case 'gains':
      return t.calendarBefore !== null
        ? [prose('Oggi il FIRE arriva nel '), year(t.calendarBefore), prose("; con l'evento lo superi già oggi.")]
        : [prose('Oggi il FIRE non arriva entro il '), horizon, prose("; con l'evento lo superi già oggi.")];
    case 'neverBoth':
      return [prose('Il FIRE non arriva entro il '), horizon, prose(", né oggi né dopo l'evento.")];
    case 'leaves':
      return [prose('Oggi il FIRE arriva nel '), year(t.calendarBefore as number), prose("; dopo l'evento non arriva entro il "), horizon, prose('.')];
    case 'returns':
      return [prose('Oggi il FIRE non arriva entro il '), horizon, prose("; dopo l'evento arriva nel "), year(t.calendarAfter as number), prose('.')];
    case 'same':
      return [prose('Il FIRE resta nel '), year(t.calendarBefore as number), prose(" anche dopo l'evento.")];
    case 'moves':
      return [prose('Oggi il FIRE arriva nel '), year(t.calendarBefore as number), prose(", dopo l'evento nel "), year(t.calendarAfter as number), prose('.')];
  }
}

/**
 * «Oggi il FIRE arriva nel 2033, dopo l'evento nel 2034. Nel 2033 il piano di oggi ha 854.600 €,
 * quello dopo l'evento 803.400 €: i 31.800 € persi oggi sono 51.200 € di distanza allora.»
 */
export function describeBeforeAfter(summary: WhatIfSummary, divergence: WhatIfDivergence | null): Narrative {
  const out: Narrative = [...timelinePairClause(summary.timeline)];
  if (!divergence) return out;

  out.push(prose(' Nel '), year(divergence.calendarYear), prose(' il piano di oggi ha '), amount(divergence.before), prose(", quello dopo l'evento "), amount(divergence.after));
  const today = summary.netWorth.delta;
  const sameDirection = today !== 0 && Math.sign(today) === Math.sign(divergence.gapThen);
  if (sameDirection && today < 0) {
    out.push(prose(': i '), amount(today), prose(' persi oggi sono '), amount(divergence.gapThen), prose(' di distanza allora.'));
  } else if (sameDirection) {
    out.push(prose(': i '), amount(today), prose(' in più di oggi sono '), amount(divergence.gapThen), prose(' di vantaggio allora.'));
  } else {
    out.push(prose(' ('), amount(divergence.gapThen), prose(' di distanza).'));
  }
  return out;
}

/** «scenario base · crescita 7% · inflazione 2,5%» */
export function describeBeforeAfterAside(base: { growthRate: number; inflationRate: number }): string {
  return `scenario base · crescita ${formatRate(base.growthRate)} · inflazione ${formatRate(base.inflationRate)}`;
}

export interface BeforeAfterFooterInput {
  isBridge: boolean;
  unlockCalendarYear: number | null;
  /** The last calendar year the chart draws — the step is named only when it is on the plot. */
  lastProjectedYear: number | null;
}

/** The chart's legend in words, and the pension step when it is drawn. */
export function describeBeforeAfterFooter(input: BeforeAfterFooterInput): Narrative {
  const stepOnPlot =
    input.isBridge && input.unlockCalendarYear !== null && input.lastProjectedYear !== null && input.unlockCalendarYear <= input.lastProjectedYear;
  return [
    prose(
      "Entrambe le traiettorie corrono sullo scenario base e fermano il risparmio al FIRE; la linea tratteggiata è il numero FIRE, che cresce con l'inflazione. L'evento è applicato oggi, poi il piano è lo stesso.",
    ),
    ...(stepOnPlot ? [prose(' Il gradino nel '), year(input.unlockCalendarYear as number), prose(' è il fondo pensione che rientra.')] : []),
  ];
}

// ─── Delta ────────────────────────────────────────────────────────────────────

/** «Cambiano il patrimonio, l'anno e il reddito passivo; il numero FIRE non cambia.» */
export function describeDelta(summary: WhatIfSummary): Narrative {
  const t = summary.timeline;
  const rows: { label: string; changed: boolean }[] = [
    { label: 'il patrimonio', changed: changed(summary.netWorth.delta) },
    { label: 'il numero FIRE', changed: changed(summary.fireNumber.delta) },
    { label: "l'anno", changed: t.yearsBefore !== t.yearsAfter },
    { label: 'il reddito passivo', changed: changed(summary.monthlyIncome.delta) },
  ];
  const moved = rows.filter((row) => row.changed).map((row) => row.label);
  const still = rows.filter((row) => !row.changed).map((row) => row.label);
  if (moved.length === 0) return [prose("Nessuna riga cambia: l'evento non tocca il piano.")];
  if (still.length === 0) return [prose('Cambiano tutte e quattro le righe.')];
  return [prose(`${moved.length === 1 ? 'Cambia solo' : 'Cambiano'} ${listOf(moved)}; ${listOf(still)} non ${still.length === 1 ? 'cambia' : 'cambiano'}.`)];
}

export function describeDeltaFooter(hasCoast: boolean): Narrative {
  return [
    prose('Verde e rosso seguono il verso buono di ogni riga: un anno in più è una perdita, un numero FIRE più basso un guadagno.'),
    prose(hasCoast ? " Il Coast legge l'età e le pensioni salvate in Coast FIRE." : " Imposta la tua età in Coast FIRE per vedere l'impatto anche lì."),
  ];
}

export interface DeltaRow {
  key: string;
  label: string;
  before: string;
  after: string;
  /** «+1 anno», «−31.800 €», «−4,6 punti», «invariato»; empty when the delta is unknowable. */
  change: string;
  /** The change coloured by the direction that is good for that row; null when unchanged or unknowable. */
  sign: Sign | null;
}

type Direction = 'lowerBetter' | 'higherBetter';

function signFor(delta: number, direction: Direction): Sign {
  const improved = direction === 'lowerBetter' ? delta < 0 : delta > 0;
  return improved ? 'positive' : 'negative';
}

function currencyRow(key: string, label: string, pair: MetricPair, direction: Direction, overrides: { before?: string; after?: string } = {}): DeltaRow {
  const moved = changed(pair.delta);
  return {
    key,
    label,
    before: overrides.before ?? formatAmount(pair.before),
    after: overrides.after ?? formatAmount(pair.after),
    change: moved ? `${pair.delta < 0 ? '−' : '+'}${formatAmount(pair.delta)}` : 'invariato',
    sign: moved ? signFor(pair.delta, direction) : null,
  };
}

function yearRow(summary: WhatIfSummary): DeltaRow {
  const t = summary.timeline;
  const cell = (years: number | null, calendar: number | null) =>
    years === 0 ? 'Raggiunto' : years === null || calendar === null ? `Oltre ${t.horizonYears} anni` : String(calendar);
  const delta = t.deltaYears;
  return {
    key: 'year',
    label: 'Anno del FIRE',
    before: cell(t.yearsBefore, t.calendarBefore),
    after: cell(t.yearsAfter, t.calendarAfter),
    change: delta === null ? '' : delta === 0 ? 'invariato' : `${delta < 0 ? '−' : '+'}${years(Math.abs(delta))}`,
    sign: delta === null || delta === 0 ? null : signFor(delta, 'lowerBetter'),
  };
}

function progressRow(pair: MetricPair): DeltaRow {
  const moved = changed(pair.delta, 0.05);
  const points = Math.abs(pair.delta).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return {
    key: 'progress',
    label: 'Progresso verso FI',
    before: formatPercentage(pair.before, 1),
    after: formatPercentage(pair.after, 1),
    change: moved ? `${pair.delta < 0 ? '−' : '+'}${points} punti` : 'invariato',
    sign: moved ? signFor(pair.delta, 'higherBetter') : null,
  };
}

/** The Delta tile's rows, formatted: the FIRE block and, when configured, the Coast block. */
export function buildDeltaRows(summary: WhatIfSummary): { fire: DeltaRow[]; coast: DeltaRow[] | null } {
  const fire: DeltaRow[] = [
    yearRow(summary),
    currencyRow('netWorth', 'Patrimonio FIRE', summary.netWorth, 'higherBetter'),
    currencyRow('fireNumber', 'Numero FIRE', summary.fireNumber, 'lowerBetter'),
    progressRow(summary.progressPct),
    currencyRow('monthlyIncome', 'Reddito passivo al mese', summary.monthlyIncome, 'higherBetter'),
  ];
  const coast = summary.coast;
  return {
    fire,
    coast: coast
      ? [
          currencyRow('coastNumber', 'Numero Coast oggi', coast.numberToday, 'lowerBetter'),
          currencyRow('coastGap', 'Mancano al Coast', coast.gap, 'lowerBetter', {
            before: coast.reachedBefore ? 'Raggiunto' : undefined,
            after: coast.reachedAfter ? 'Raggiunto' : undefined,
          }),
        ]
      : null,
  };
}

// ─── Evento ───────────────────────────────────────────────────────────────────

/** The event tile's reading: what is typed, in the pure layer's terms, and what it does to the plan. */
export function describeEvent(event: WhatIfEvent): Narrative {
  const label = EVENT_LABELS[event.kind];
  switch (event.kind) {
    case 'jobLoss': {
      if (event.isEmpty) return [prose(`${label}: indica i mesi senza reddito e le entrate che vengono a mancare.`)];
      const share: Narrative =
        event.lostShareOfIncomePct !== null
          ? [prose(`, ${articleForPercent(event.lostShareOfIncomePct, 0)}`), figure(formatPercentage(event.lostShareOfIncomePct, 0)), prose(' del reddito')]
          : [];
      return [
        prose(`${label}: `),
        figure(months(event.months)),
        prose(' senza '),
        amount(event.lostAnnualIncome),
        prose(" l'anno di entrate"),
        ...share,
        prose('. Il patrimonio perde '),
        signedAmount(event.netWorthDelta, 'negative'),
        prose('.'),
      ];
    }
    case 'majorPurchase':
      if (event.isEmpty) return [prose(`${label}: inserisci l'importo che esce dal patrimonio.`)];
      return [prose(`${label}: `), amount(event.lumpSum), prose(' escono oggi dal patrimonio, che scende a '), amount(event.netWorthAfter), prose('.')];
    case 'windfall':
      if (event.isEmpty) return [prose(`${label}: inserisci l'importo che entra nel patrimonio.`)];
      return [prose(`${label}: `), amount(event.lumpSum), prose(' entrano oggi nel patrimonio, che sale a '), amount(event.netWorthAfter), prose('.')];
    case 'cashflowChange': {
      if (event.isEmpty) return [prose(`${label}: inserisci quanto cambia ogni anno, in più o in meno.`)];
      const inputs: Narrative[] = [];
      const results: Narrative[] = [];
      if (event.savingsDelta !== 0) {
        inputs.push([prose('risparmi '), amount(event.savingsDelta), prose(` l'anno in ${event.savingsDelta < 0 ? 'meno' : 'più'}`)]);
        results.push([prose('il risparmio passa a '), amount(event.savingsAfter)]);
      }
      if (event.expensesDelta !== 0) {
        inputs.push([prose('spendi '), amount(event.expensesDelta), prose(`${inputs.length === 0 ? " l'anno" : ''} in ${event.expensesDelta > 0 ? 'più' : 'meno'}`)]);
        results.push([prose(results.length === 0 ? 'le spese passano a ' : 'le spese a '), amount(event.expensesAfter)]);
      }
      return [prose('Da oggi '), ...joinClauses(inputs), prose(': '), ...joinClauses(results), prose(" l'anno.")];
    }
  }
}

export interface EventFooterInput {
  kind: WhatIfEventType;
  referenceYear: number | null;
  isAnnualized: boolean;
}

/** The rule the job-loss hit follows, or the exploration note; then the cashflow window the figures come from. */
export function describeEventFooter(input: EventFooterInput): Narrative {
  const head =
    input.kind === 'jobLoss'
      ? 'Il reddito che resta copre prima le spese: dal portafoglio esce solo la parte scoperta.'
      : "L'evento è applicato oggi e non viene salvato: è un'esplorazione.";
  const data = input.referenceYear !== null ? ` Dati del cashflow ${input.referenceYear}${input.isAnnualized ? ', annualizzati' : ''}.` : '';
  return [prose(`${head}${data}`)];
}

// ─── Sensibilità ──────────────────────────────────────────────────────────────

export const SENSITIVITY_ASIDE = 'anni al FIRE · scenario base · piano di oggi';

export const SENSITIVITY_FOOTER: Narrative = [
  prose(
    "Ogni cella è lo scenario base con quelle spese e quel risparmio, dal patrimonio di oggi. La cella con il bordo è il piano di oggi; le tinte dicono se ci arrivi prima o dopo. La matrice non applica l'evento: misura quanto conta un'abitudine, non un colpo.",
  ),
];

/**
 * «Con 27.600 € di spese e 22.200 € di risparmio il FIRE arriva in 7 anni; spendendo il 10% in
 * meno ci arrivi in 5, risparmiando il 25% in più in 6.»
 */
export function describeSensitivity(reading: SensitivityReading, horizonYears = 50): Narrative {
  const out: Narrative = [prose('Con '), amount(reading.baselineExpenses), prose(' di spese e ')];
  if (reading.baselineSavings > 0) out.push(amount(reading.baselineSavings), prose(' di risparmio'));
  else out.push(prose('nessun risparmio'));
  if (reading.baselineYears !== null) out.push(prose(' il FIRE arriva in '), figure(years(reading.baselineYears)));
  else out.push(prose(` il FIRE non arriva entro ${horizonYears} anni`));

  // «ci arrivi» is said once, by the first neighbouring cell that reaches the target.
  let arriveSaid = false;
  const clauses: Narrative[] = [];
  const reach = (lead: string, cellYears: number | null): Narrative => {
    if (cellYears === null) return [prose(`${lead} nemmeno`)];
    const clause: Narrative = [prose(`${lead} ${arriveSaid ? 'in ' : 'ci arrivi in '}`), figure(String(cellYears))];
    arriveSaid = true;
    return clause;
  };
  if (reading.lessSpending) clauses.push(reach('spendendo il 10% in meno', reading.lessSpending.years));
  if (reading.moreSaving) {
    const lead = reading.moreSaving.label.startsWith('+')
      ? `risparmiando il ${reading.moreSaving.label.slice(1)} in più`
      : `risparmiando ${formatAmount(reading.moreSaving.annualSavings)} l'anno`;
    clauses.push(reach(lead, reading.moreSaving.years));
  }
  clauses.forEach((clause, index) => out.push(prose(index === 0 ? '; ' : ', '), ...clause));
  out.push(prose('.'));
  return out;
}
