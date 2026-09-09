/**
 * The words of Cashflow › Budget: the verdict that answers «sto rispettando il budget?»
 * before any number, and the one-line reading under each tile.
 *
 * Design: every function is pure and returns a `Narrative` (segments with `mono`/`sign`), so
 * the component sets figures in Geist Mono and colours them by sign while the prose stays
 * prose; no component writes copy. Each phrasing is pinned by a test. The Narrative Honesty
 * Rule holds throughout: the horizon is ALWAYS named (the month, «a fine mese», «da inizio
 * anno»), a projection says «al ritmo attuale», and a clause the data cannot support is
 * dropped — no pace in the first days of the month, no ceiling → the question passes to the
 * category budgets, no budgets → the page says so. Italian grammar is data: articles follow
 * the percentage AS PRINTED (`articleForPercent`, `atThePercent`), «ad» before a vowel month.
 *
 * Percentages go through chartService's it-IT formatter (comma decimals); currency through
 * `cachedFormatCurrencyEUR` (nbsp before €, four-digit amounts ungrouped).
 */

import type { Narrative, NarrativeSegment, PageVerdictModel } from '@/lib/utils/narrative';
import type { BudgetAlert, BudgetRiskSummary } from '@/types/budget';
import type { BudgetAllocationValidation } from '@/lib/utils/budgetUtils';
import type { AnnualBudgetSummary, CeilingSummary, IncomeTargetSummary, SpendingHistory } from '@/lib/utils/budgetSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { articleForPercent, atThePercent } from '@/lib/utils/patrimonioNarrative';
import { getItalyMonth } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';

// ─── Segment helpers ──────────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });
const signed = (text: string, sign: 'positive' | 'negative'): NarrativeSegment => ({ text, mono: true, sign });

/** A whole euro figure, compact (no decimals) — the verdict and the readings never need cents. */
const euro = (value: number) => cachedFormatCurrencyEUR(Math.abs(value), true);
/** A whole percentage, the way every share on the page prints. */
const pct = (value: number) => formatPercentage(value, 0);
const count = (value: number) => figure(String(value));

function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

function monthInSentence(now: Date): string {
  return MONTH_NAMES[getItalyMonth(now) - 1].toLowerCase();
}

/** "a maggio" but "ad agosto" — the euphonic d before a vowel. */
function withPrepositionA(monthName: string): string {
  return /^[aeiou]/i.test(monthName) ? `ad ${monthName}` : `a ${monthName}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "il 73%", "l'8%", "lo 0%" — the printed integer decides the article. */
function percentWithArticle(value: number): NarrativeSegment[] {
  return [prose(articleForPercent(value, 0)), figure(pct(value))];
}

/** "al 71%", "all'8%", "allo 0%". */
function percentWithAt(value: number): NarrativeSegment[] {
  return [prose(atThePercent(value, 0)), figure(pct(value))];
}

/**
 * A day of the month with its article: «il 13», «l'8», «l'11», «il 1°» — the article follows the
 * number's sound (elision before otto/undici), the first carries the ordinal sign, and «dal»
 * elides the same way («dall'8»). The figure stays mono.
 */
export function dayRef(preposition: 'il' | 'dal', day: number): NarrativeSegment[] {
  const elide = day === 8 || day === 11;
  const word = preposition === 'il' ? (elide ? "l'" : 'il ') : elide ? "dall'" : 'dal ';
  return [prose(word), figure(day === 1 ? '1°' : String(day))];
}

/** The first clause of the month's verdict: how far the month is from its end. */
function daysLeftClause(calendar: CeilingSummary['calendar'], midSentence = false): NarrativeSegment[] {
  if (calendar.daysLeft === 0) return [prose(midSentence ? "all'ultimo giorno del mese " : "All'ultimo giorno del mese ")];
  return [prose(midSentence ? 'a ' : 'A '), count(calendar.daysLeft), prose(` ${pluralize(calendar.daysLeft, 'giorno', 'giorni')} dalla fine del mese `)];
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface BudgetVerdictInput {
  /** Null without an overall ceiling. */
  ceiling: CeilingSummary | null;
  risk: BudgetRiskSummary;
  /** Whether the user set any budget at all (ceiling or items). */
  hasItems: boolean;
  now: Date;
}

function ceilingVerdict(c: CeilingSummary, now: Date): PageVerdictModel {
  const month = monthInSentence(now);
  const { calendar } = c;

  if (c.exceeded) {
    // The crossing comes first — it is the fact the page exists to tell — and its tense follows
    // the day: a row already in the calendar can put it after today.
    const ahead = c.crossedOn !== null && c.crossedOn > calendar.dayOfMonth;
    const opening: Narrative = ahead
      ? [prose('Lo superi '), ...dayRef('il', c.crossedOn!), prose(' con le spese già in calendario; ')]
      : c.crossedOn === null
        ? []
        : c.crossedOn === calendar.dayOfMonth
          ? [prose('Lo hai superato oggi; ')]
          : [prose('Lo hai superato '), ...dayRef('il', c.crossedOn), prose('; ')];
    const sentence: Narrative = [
      ...opening,
      ...daysLeftClause(calendar, opening.length > 0),
      prose(ahead ? 'hai impegnato ' : 'hai speso '),
      signed(euro(c.spent), 'negative'),
      prose(' su '),
      figure(euro(c.ceiling)),
      prose(', '),
      signed(euro(c.overBy), 'negative'),
      prose(' oltre'),
    ];
    // The pace after the fact: only when there is one, and only when it adds something (a
    // crossing still ahead is already a projection of sorts — one pace clause is enough).
    if (!ahead && c.projection !== null && calendar.daysLeft > 0) {
      sentence.push(prose(', e al ritmo attuale chiudi a '), signed(euro(c.projection), 'negative'));
    }
    sentence.push(prose('.'));
    return {
      headline: ahead ? `${capitalise(withPrepositionA(month))} supererai il tetto.` : `${capitalise(withPrepositionA(month))} hai superato il tetto.`,
      tone: 'negative',
      sentence,
    };
  }

  const used: Narrative = [
    ...daysLeftClause(calendar),
    prose('hai usato '),
    ...percentWithArticle(c.usedPct),
    prose(' del tetto ('),
    figure(euro(c.spent)),
    prose(' su '),
    figure(euro(c.ceiling)),
    prose(')'),
  ];

  if (c.projection === null) {
    return {
      headline: `${capitalise(month)} è appena iniziato.`,
      tone: 'neutral',
      sentence: [...used, prose('; una proiezione arriva dal quarto giorno.')],
    };
  }

  // The last day has no pace: the month is what it is, and the difference is a fact.
  if (calendar.daysLeft === 0) {
    const under = c.ceiling - c.spent;
    return {
      headline: `Il budget di ${month} tiene.`,
      tone: 'positive',
      sentence: [...used, prose(': '), signed(euro(under), 'positive'), prose(' sotto.')],
    };
  }

  // The gap is measured on the projection AS PRINTED: 3494,5 prints as 3495, and «506 € sotto»
  // beside it would not add up to the ceiling.
  const printedProjection = Math.round(c.projection);
  const over = printedProjection > c.ceiling;
  const gap = Math.abs(printedProjection - c.ceiling);
  if (gap === 0) {
    return {
      headline: `Il budget di ${month} tiene.`,
      tone: 'positive',
      sentence: [...used, prose(': al ritmo attuale chiudi esattamente al tetto.')],
    };
  }
  const sentence: Narrative = [
    ...used,
    prose(': al ritmo attuale chiudi a '),
    signed(euro(c.projection), over ? 'negative' : 'positive'),
    prose(', '),
    signed(euro(gap), over ? 'negative' : 'positive'),
    prose(over ? ' oltre' : ' sotto'),
  ];
  // The day the pace crosses the ceiling, when the arithmetic can name one.
  if (over && c.projectedCrossingDay !== null) sentence.push(prose(', superando il tetto '), ...dayRef('il', c.projectedCrossingDay));
  sentence.push(prose('.'));
  return {
    headline: over ? `${capitalise(month)} rischia di sforare il tetto.` : `Il budget di ${month} tiene.`,
    tone: over ? 'warning' : 'positive',
    sentence,
  };
}

function categoriesVerdict(risk: BudgetRiskSummary, now: Date): PageVerdictModel {
  const month = monthInSentence(now);
  const n = risk.atRisk.length;
  const total = risk.evaluated;

  if (total === 0) {
    return {
      headline: `Nessun budget mensile ${withPrepositionA(month)}.`,
      tone: 'neutral',
      sentence: [prose('Solo budget annuali o obiettivi di entrata: aggiungi un tetto mensile o un budget per categoria per leggere il mese.')],
    };
  }

  if (!risk.canForecast) {
    return {
      headline: `${capitalise(month)} è appena iniziato.`,
      tone: 'neutral',
      sentence: [prose('Nessun tetto complessivo: '), count(total), prose(' budget mensili per categoria, e una proiezione arriva dal quarto giorno.')],
    };
  }

  if (n === 0) {
    return {
      headline: `Tutti i budget di ${month} tengono.`,
      tone: 'positive',
      sentence: [
        prose('Nessun tetto complessivo: le '),
        count(total),
        prose(' categorie con un budget chiudono il mese entro il loro limite al ritmo attuale.'),
      ],
    };
  }

  const worst = risk.atRisk[0];
  return {
    headline: `${n} budget su ${total} ${pluralize(n, 'rischia', 'rischiano')} di sforare.`,
    tone: 'warning',
    sentence: [
      prose(`Nessun tetto complessivo: ${withPrepositionA(month)} `),
      count(n),
      prose(` ${pluralize(n, 'categoria', 'categorie')} su `),
      count(total),
      prose(n === 1 ? ' chiude oltre il suo budget al ritmo attuale, ' : ' chiudono oltre il loro budget al ritmo attuale, '),
      prose(n === 1 ? `${worst.label} (` : `${worst.label} di più (`),
      signed(`+${euro(worst.overBy)}`, 'negative'),
      prose('). Impostane uno nelle impostazioni per leggere il mese nel suo insieme.'),
    ],
  };
}

/** The page's opening sentence: the ceiling when there is one, the category budgets otherwise. */
export function buildBudgetVerdict(input: BudgetVerdictInput): PageVerdictModel {
  if (input.ceiling) return ceilingVerdict(input.ceiling, input.now);
  if (!input.hasItems) {
    return {
      headline: 'Nessun budget impostato.',
      tone: 'neutral',
      sentence: [prose(`Un tetto mensile su tutte le spese, o un budget per categoria, e questa pagina ti dice ogni giorno se ${monthInSentence(input.now)} sta tenendo.`)],
    };
  }
  return categoriesVerdict(input.risk, input.now);
}

// ─── Tetto del mese ───────────────────────────────────────────────────────────

/** "Hai usato il 73% del tetto al 71% del mese: 2 punti avanti rispetto al calendario." */
export function describeCeiling(c: CeilingSummary): Narrative {
  if (c.exceeded) {
    const over: Narrative = [signed(euro(c.overBy), 'negative'), prose(' oltre.')];
    if (c.crossedOn === null) return [prose('Hai superato il tetto: '), ...over];
    if (c.crossedOn > c.calendar.dayOfMonth) return [prose('Le spese già in calendario superano il tetto '), ...dayRef('il', c.crossedOn), prose(': '), ...over];
    // The calendar share OF THE CROSSING DAY, not today's: the reading says when, not where we are.
    const crossingPct = (c.crossedOn / c.calendar.daysInMonth) * 100;
    const when: Narrative = c.crossedOn === c.calendar.dayOfMonth ? [prose('oggi')] : dayRef('il', c.crossedOn);
    return [prose('Hai superato il tetto '), ...when, prose(', '), ...percentWithAt(crossingPct), prose(' del mese: '), ...over];
  }
  // Judged on the printed figures: 72,75% and 70,97% read as 73 and 71, so the gap is 2.
  const gap = Math.round(c.usedPct) - Math.round(c.calendarPct);
  const head: Narrative = [prose('Hai usato '), ...percentWithArticle(c.usedPct), prose(' del tetto '), ...percentWithAt(c.calendarPct), prose(' del mese: ')];
  if (gap === 0) return [...head, prose('in linea con il calendario.')];
  const points = Math.abs(gap);
  return [...head, count(points), prose(` ${pluralize(points, 'punto', 'punti')} ${gap > 0 ? 'avanti' : 'indietro'} rispetto al calendario.`)];
}

/** The caption of the «Al giorno» KPI: the allowance while under, the real pace against the ceiling's once over. */
export function describeDailyCaption(c: CeilingSummary): Narrative {
  if (!c.exceeded) return [prose('per restare nel tetto')];
  return [prose('spesi al giorno · il tetto ne regge '), figure(euro(c.sustainablePace).replace(/\s*€$/, ''))];
}

/** The caption of the «Oltre» KPI: since when. */
export function describeOverCaption(c: CeilingSummary): Narrative {
  if (c.crossedOn === null) return [prose('sul tetto')];
  if (c.crossedOn > c.calendar.dayOfMonth) return [...dayRef('dal', c.crossedOn), prose(', in calendario')];
  if (c.crossedOn === c.calendar.dayOfMonth) return [prose('da oggi')];
  return dayRef('dal', c.crossedOn);
}

/** The caption of the «Fine mese» KPI: the pace, and the day it crosses the ceiling when it does. */
export function describeProjectionCaption(c: CeilingSummary): Narrative {
  if (c.projectedCrossingDay === null) return [prose('al ritmo attuale')];
  return [prose('al ritmo attuale · supera '), ...dayRef('il', c.projectedCrossingDay)];
}

/** "agosto · giorno 22 di 31" */
export function describeCeilingAside(c: CeilingSummary, now: Date): Narrative {
  return [prose(`${monthInSentence(now)} · giorno `), count(c.calendar.dayOfMonth), prose(' di '), count(c.calendar.daysInMonth)];
}

// ─── Categorie a rischio ──────────────────────────────────────────────────────

/** "3 su 12 rischiano di sforare: Ristoranti di più (+73 €)." */
export function describeRisk(risk: BudgetRiskSummary): Narrative {
  const total = risk.evaluated;
  if (total === 0) return [prose('Nessun budget mensile per categoria.')];
  if (!risk.canForecast) return [count(total), prose(' budget mensili; una proiezione arriva dal quarto giorno del mese.')];
  const n = risk.atRisk.length;
  if (n === 0) {
    return total === 1
      ? [prose('La categoria con un budget non rischia di sforare a fine mese.')]
      : [prose('Nessuna delle '), count(total), prose(' categorie rischia di sforare a fine mese.')];
  }
  const worst = risk.atRisk[0];
  return [
    count(n),
    prose(' su '),
    count(total),
    prose(` ${pluralize(n, 'rischia', 'rischiano')} di sforare: ${worst.label}${n === 1 ? '' : ' di più'} (`),
    signed(`+${euro(worst.overBy)}`, 'negative'),
    prose(').'),
  ];
}

/** The tile's footer: horizon and scope, stated because neither is guessable from the rows. */
export const RISK_FOOTER: Narrative = [
  prose('Proiezione al ritmo attuale, solo sulle categorie con un budget mensile; le categorie fisse contano le rate in calendario, non il ritmo.'),
];

// ─── Avvisi ───────────────────────────────────────────────────────────────────

function alertClause(alert: BudgetAlert): NarrativeSegment[] {
  if (alert.level === 'exceeded') {
    return alert.crossedOn === null ? [prose(`${alert.label} ha sforato`)] : [prose(`${alert.label} ha sforato `), ...dayRef('il', alert.crossedOn)];
  }
  return [prose(`${alert.label} è `), ...percentWithAt(alert.usedRatio * 100)];
}

/** "2 soglie superate: Abbonamenti ha sforato, Casa è al 92%." — the rows are the crossed thresholds only. */
export function describeAlerts(rows: BudgetAlert[], enabled: boolean, now: Date): Narrative {
  if (!enabled) return [prose('Nessun avviso: li hai disattivati.')];
  const n = rows.length;
  if (n === 0) return [prose(`Nessuna soglia superata ${withPrepositionA(monthInSentence(now))}.`)];
  const named = rows.slice(0, 2);
  const rest = n - named.length;
  const out: Narrative = [count(n), prose(` ${pluralize(n, 'soglia superata', 'soglie superate')}: `)];
  named.forEach((alert, i) => {
    if (i > 0) out.push(prose(', '));
    out.push(...alertClause(alert));
  });
  if (rest === 1) out.push(prose(" e un'altra"));
  else if (rest > 1) out.push(prose(' e altre '), count(rest));
  out.push(prose('.'));
  return out;
}

export function describeAlertsFooter(enabled: boolean, forecastOnlyCount: number): Narrative {
  if (!enabled) return [prose("Riattivali nelle impostazioni per vedere qui le soglie superate e riceverle nell'email mensile.")];
  if (forecastOnlyCount > 0) {
    return [prose('Gli sforamenti previsti ('), count(forecastOnlyCount), prose(") stanno in Categorie a rischio. Gli stessi avvisi arrivano nell'email mensile.")];
  }
  return [prose("Gli stessi avvisi arrivano nell'email mensile.")];
}

/** "soglie 90 · 100" or "disattivati". */
export function describeAlertsAside(thresholds: number[], enabled: boolean): Narrative {
  if (!enabled) return [prose('disattivati')];
  const out: Narrative = [prose('soglie ')];
  [...thresholds].sort((a, b) => a - b).forEach((t, i) => {
    if (i > 0) out.push(prose(' · '));
    out.push(count(t));
  });
  return out;
}

// ─── Budget annuali ───────────────────────────────────────────────────────────

function annualRowClause(row: AnnualBudgetSummary['rows'][number]): NarrativeSegment[] {
  if (row.exceeded) return [prose(`${row.label} ha già superato il suo (`), signed(pct(row.usedPct), 'negative'), prose(')')];
  return [prose(`${row.label} (`), figure(pct(row.usedPct)), prose(')')];
}

/** The year against the calendar: who is ahead of it, or the most used when nobody is. */
export function describeAnnualBudgets(s: AnnualBudgetSummary): Narrative {
  const n = s.rows.length;
  if (n === 0) return [prose('Nessun budget annuale.')];
  if (n === 1) {
    const row = s.rows[0];
    if (row.exceeded) return [prose(`${row.label} ha già superato il suo budget annuale (`), signed(pct(row.usedPct), 'negative'), prose(').')];
    return [prose(`${row.label} è `), ...percentWithAt(row.usedPct), prose(" con l'anno "), ...percentWithAt(s.yearElapsedPct), prose('.')];
  }
  const ahead = s.rows.filter((row) => row.ahead).sort((a, b) => b.usedPct - a.usedPct);
  if (ahead.length === 0) {
    const most = [...s.rows].sort((a, b) => b.usedPct - a.usedPct)[0];
    return [prose('Nessuno dei '), count(n), prose(" budget è avanti al calendario dell'anno; il più usato è "), ...annualRowClause(most), prose('.')];
  }
  const out: Narrative = [count(ahead.length), prose(' dei '), count(n), prose(` budget ${pluralize(ahead.length, 'è', 'sono')} avanti al calendario dell'anno: `)];
  ahead.forEach((row, i) => {
    if (i > 0) out.push(prose(i === ahead.length - 1 ? ' e ' : ', '));
    out.push(...annualRowClause(row));
  });
  out.push(prose('.'));
  return out;
}

/** "2026, da gennaio · anno al 64%" */
export function describeAnnualAside(s: AnnualBudgetSummary): Narrative {
  return [count(s.year), prose(', da gennaio · anno '), ...percentWithAt(s.yearElapsedPct)];
}

export const ANNUAL_FOOTER: Narrative = [prose('Misurati da inizio anno; non entrano nel tetto mensile. Il segno │ è oggi sull\'anno.')];

// ─── Entrate previste ─────────────────────────────────────────────────────────

/** "Registrate 4580 € su 4500 € previste" — the hero's footer row. */
export function describeIncomeTargets(income: IncomeTargetSummary): Narrative {
  return [
    prose('Registrate '),
    signed(euro(income.registered), income.registered >= income.expected ? 'positive' : 'negative'),
    prose(' su '),
    figure(euro(income.expected)),
    prose(' previste'),
  ];
}

// ─── Per categoria ────────────────────────────────────────────────────────────

/** The allocation against the ceiling — the one place the validator speaks. */
export function describeAllocation(v: BudgetAllocationValidation, monthlyExpenseCount: number): Narrative {
  if (v.overall <= 0) {
    if (monthlyExpenseCount === 0) return [prose('Nessun budget mensile di spesa.')];
    return [count(monthlyExpenseCount), prose(` ${pluralize(monthlyExpenseCount, 'budget mensile', 'budget mensili')} per `), figure(euro(v.allocated)), prose(' al mese, senza un tetto complessivo.')];
  }
  if (!v.valid) {
    return [
      prose('Hai assegnato '),
      signed(euro(v.allocated), 'negative'),
      prose(' su un tetto di '),
      figure(euro(v.overall)),
      prose(': '),
      signed(euro(-v.available), 'negative'),
      prose(' di troppo, le modifiche non si salvano finché non rientri.'),
    ];
  }
  if (v.available === 0) return [prose('Hai assegnato alle categorie tutto il tetto di '), figure(euro(v.overall)), prose('.')];
  return [prose('Hai assegnato '), figure(euro(v.allocated)), prose(' dei '), figure(euro(v.overall)), prose(' del tetto: '), figure(euro(v.available)), prose(' non sono in nessuna categoria.')];
}

/** "agosto · 12 budget di spesa, 2 obiettivi di entrata" */
export function describeBudgetCounts(expenseCount: number, incomeCount: number, now: Date): Narrative {
  const out: Narrative = [prose(`${monthInSentence(now)} · `), count(expenseCount), prose(' budget di spesa')];
  if (incomeCount > 0) out.push(prose(', '), count(incomeCount), prose(` ${pluralize(incomeCount, 'obiettivo', 'obiettivi')} di entrata`));
  return out;
}

export const CATEGORY_FOOTER: Narrative = [
  prose('Il tetto è su tutte le spese del mese; «assegnato» somma solo i budget mensili di spesa per categoria — annuali, entrate e sottocategorie restano fuori. Il segno │ è oggi sul mese. Una categoria fissa non segue il ritmo: «Fine mese» conta solo le rate in calendario.'),
];

// ─── Impostazioni ─────────────────────────────────────────────────────────────

/** The ceiling setting's reading: the allocation as a fact, the overrun as the reason nothing saves. */
export function describeCeilingSetting(v: BudgetAllocationValidation): Narrative {
  if (v.overall <= 0) return [prose('Un limite su tutte le spese del mese, sopra i budget per categoria.')];
  if (!v.valid) {
    return [prose('Assegnati '), signed(euro(v.allocated), 'negative'), prose(': la somma dei budget mensili supera il tetto di '), signed(euro(-v.available), 'negative'), prose('.')];
  }
  return [prose('Assegnati '), figure(euro(v.allocated)), prose(', disponibili '), figure(euro(v.available)), prose('.')];
}

export const ALERTS_SETTING_READING: Narrative = [prose('Un avviso quando una categoria o il tetto supera una soglia.')];
export const ALERTS_SETTING_FOOTER: Narrative = [prose('Gli sforamenti previsti si vedono in Categorie a rischio anche senza avvisi.')];
export const CEILING_SETTING_FOOTER: Narrative = [prose('«Assegnati» somma i budget mensili di spesa per categoria; annuali, entrate e sottocategorie restano fuori. Si salva da solo.')];
export const CEILING_SETTING_INVALID: Narrative = [prose('La somma dei budget mensili supera il tetto: le modifiche non vengono salvate finché non rientri nel limite.')];

// ─── Ultimi mesi ──────────────────────────────────────────────────────────────

/**
 * The caption beside the hero's bars: closed months over THEIR ceiling — the recorded one
 * where the cron captured it, today's before the records began — and which of the two.
 */
export function describeHistory(h: SpendingHistory): Narrative {
  if (h.overCount === null) return [prose('Spese totali per mese.')];
  const allRecorded = h.recordedCount === h.closedCount && h.closedCount > 0;
  const scope: NarrativeSegment[] =
    h.recordedCount === 0
      ? [prose('il tetto attuale')]
      : allRecorded
        ? [prose('il loro tetto')]
        : [prose(`il tetto (il loro da ${h.recordedFrom!.toLowerCase()}, prima quello attuale)`)];
  if (h.overCount === 0) return [prose('Nessun mese oltre '), ...scope, prose(' negli ultimi '), count(h.closedCount), prose(' chiusi.')];
  return [count(h.overCount), prose(` ${pluralize(h.overCount, 'mese', 'mesi')} su `), count(h.closedCount), prose(' oltre '), ...scope, prose('.')];
}

