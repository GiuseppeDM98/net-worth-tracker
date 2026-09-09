/**
 * The words of Cashflow › Centri di Costo: the verdict that answers «quanto sta costando il
 * progetto?» for the list and for one center, and the reading line under every tile.
 *
 * Design: every function is pure and returns a `Narrative` (segments with `mono`/`sign`) so
 * the component sets figures in Geist Mono and colours them by sign while the prose stays
 * prose; no component writes copy, and each phrasing is pinned by a test. The Narrative
 * Honesty Rule throughout: the page has no period axis, so every figure is «in totale» unless
 * its window is named («ad agosto», «nel 2026», «quest'anno», «al ritmo attuale»); a crossed
 * ceiling is a fact and a projected one a risk (the verdict ranks over > risk > most
 * expensive); a dormant or archived center gets no projection; a missing input drops its
 * clause (no ceiling → no ceiling clause, nothing dormant → no dormant clause), never a
 * placeholder. Italian grammar is data: articles follow the percentage AS PRINTED
 * (`articleForPercent`, `atThePercent`), «ad» before a vowel month, «impegnato» when a row
 * dated after today is counted, «speso» otherwise.
 *
 * Percentages go through chartService's it-IT formatter, currency through
 * `cachedFormatCurrencyEUR` (nbsp before €, four-digit amounts ungrouped).
 */

import type { Narrative, NarrativeSegment, PageVerdictModel } from '@/lib/utils/narrative';
import type { CostCenterCategorySlice, CostCenterSubCategorySlice } from '@/types/costCenters';
import type { CenterBudgetSummary, CenterMonthStack, CenterSummary, CostCentersSummary } from '@/lib/utils/costCenterSummary';
import { DORMANT_THRESHOLD_DAYS } from '@/lib/utils/costCenterUtils';
import { cachedFormatCurrencyEUR, formatDate } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { articleForPercent, atThePercent } from '@/lib/utils/patrimonioNarrative';
import { dayRef } from '@/lib/utils/budgetNarrative';
import { resolveBudgetCalendar } from '@/lib/utils/budgetUtils';
import { getItalyDate, getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';

// ─── Segment helpers ──────────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });
const signed = (text: string, sign: 'positive' | 'negative'): NarrativeSegment => ({ text, mono: true, sign });
const euro = (value: number) => cachedFormatCurrencyEUR(Math.abs(value), true);
const pct = (value: number) => formatPercentage(value, 0);
const count = (value: number) => figure(String(value));
const DOT = ' · ';

function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

function monthName(now: Date): string {
  return MONTH_NAMES[getItalyMonth(now) - 1].toLowerCase();
}

/** "a maggio" but "ad agosto". */
function withPrepositionA(month: string): string {
  return /^[aeiou]/i.test(month) ? `ad ${month}` : `a ${month}`;
}

/** «marzo 2023» — the month a center started. */
function monthYear(date: Date): string {
  return `${MONTH_NAMES[getItalyMonth(date) - 1].toLowerCase()} ${getItalyYear(date)}`;
}

/** «18/08» — a day of this year in a list row. */
function shortDate(date: Date): string {
  const italy = getItalyDate(date);
  return `${String(italy.getDate()).padStart(2, '0')}/${String(italy.getMonth() + 1).padStart(2, '0')}`;
}

/** "il 73%", "l'8%", "lo 0%" — the printed integer decides the article. */
function percentWithArticle(value: number): NarrativeSegment[] {
  return [prose(articleForPercent(value, 0)), figure(pct(value))];
}

/** "al 71%", "all'8%", "allo 0%". */
function percentWithAt(value: number): NarrativeSegment[] {
  return [prose(atThePercent(value, 0)), figure(pct(value))];
}

function centersCount(n: number): NarrativeSegment[] {
  return [count(n), prose(` ${pluralize(n, 'centro', 'centri')}`)];
}

function movementsCount(n: number): NarrativeSegment[] {
  return [count(n), prose(` ${pluralize(n, 'movimento', 'movimenti')}`)];
}

/** The ceiling's window as the headline names it («di agosto», «del 2026»). */
function windowOf(budget: CenterBudgetSummary, now: Date): string {
  return budget.period === 'monthly' ? `di ${monthName(now)}` : `del ${getItalyYear(now)}`;
}

/** The ceiling's window inside a sentence («ad agosto», «nel 2026»). */
function windowIn(budget: CenterBudgetSummary, now: Date): string {
  return budget.period === 'monthly' ? withPrepositionA(monthName(now)) : `nel ${getItalyYear(now)}`;
}

/** «hai impegnato» once a row dated after today counts, «hai speso» otherwise. */
function spentVerb(budget: CenterBudgetSummary): string {
  return budget.scheduled > 0 ? 'impegnato' : 'speso';
}

/** The gap of a projection past its ceiling, measured on the figure AS PRINTED. */
function projectedGap(projection: number, amount: number): number {
  return Math.round(projection) - amount;
}

// ─── The list's verdict ───────────────────────────────────────────────────────

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

function dormantClause(summary: CostCentersSummary): Narrative {
  const idle = summary.dormant.filter((center) => center.idleDays !== null);
  const never = summary.dormant.filter((center) => center.idleDays === null);
  const out: Narrative = [];
  if (idle.length === 1) out.push(prose(`; ${idle[0].center.name} è fermo da `), count(idle[0].idleDays!), prose(' giorni'));
  else if (idle.length > 1) out.push(prose('; '), count(idle.length), prose(` centri sono fermi da oltre ${DORMANT_THRESHOLD_DAYS} giorni`));
  if (never.length === 1) out.push(prose(`; ${never[0].center.name} non ha ancora spese`));
  else if (never.length > 1) out.push(prose('; '), count(never.length), prose(' centri non hanno ancora spese'));
  return out;
}

/** «Automobile è il più caro (5200 €, il 42%)» — the subject changes with the sentence around it. */
function topClause(summary: CostCentersSummary, verb: 'è il più caro' | 'pesa' | 'ed è anche il più caro'): Narrative {
  const top = summary.active[0];
  const name = top.summary.center.name;
  if (verb === 'pesa') return [prose(`${name} pesa `), figure(euro(top.summary.total)), prose(' ('), ...percentWithArticle(top.share), prose(')')];
  // «ed è anche…» continues a clause whose subject is already the top center.
  const subject = verb === 'ed è anche il più caro' ? '' : `${name} `;
  return [prose(`${subject}${verb} (`), figure(euro(top.summary.total)), prose(', '), ...percentWithArticle(top.share), prose(')')];
}

function overClause(center: CenterSummary, now: Date): Narrative {
  const budget = center.budget!;
  return [
    prose(`${center.center.name} è a `),
    signed(euro(budget.spent), 'negative'),
    prose(' su '),
    figure(euro(budget.amount)),
    prose(` ${windowIn(budget, now)}, `),
    signed(euro(budget.overBy), 'negative'),
    prose(' oltre'),
  ];
}

function riskClause(center: CenterSummary, now: Date, withSubject: boolean): Narrative {
  const budget = center.budget!;
  return [
    prose(withSubject ? `${center.center.name} ${windowIn(budget, now)} è ` : `${windowIn(budget, now)} è `),
    ...percentWithAt(budget.usedPct),
    prose(' del tetto, al ritmo attuale chiude a '),
    signed(`~${euro(budget.projection!)}`, 'negative'),
    prose(' su '),
    figure(euro(budget.amount)),
  ];
}

export function buildCostCentersVerdict(summary: CostCentersSummary, now: Date): PageVerdictModel {
  const active = summary.active;
  if (active.length === 0 && summary.archived.length === 0) {
    return { headline: 'Nessun centro di costo.', tone: 'neutral', sentence: [prose('Crea il primo centro per raggruppare le spese di un oggetto o di un progetto.')] };
  }
  if (active.length === 0) {
    const n = summary.archived.length;
    return {
      headline: 'Nessun centro attivo.',
      tone: 'neutral',
      sentence: [
        ...centersCount(n),
        prose(` ${pluralize(n, 'archiviato', 'archiviati')} per `),
        figure(euro(summary.archivedTotal)),
        prose(n === 1 ? ': ripristinalo dal suo dettaglio o creane uno nuovo.' : ': ripristinane uno dal suo dettaglio o creane uno nuovo.'),
      ],
    };
  }
  if (summary.total === 0) {
    const n = active.length;
    return {
      headline: 'Nessuna spesa nei centri di costo.',
      tone: 'neutral',
      sentence: [...centersCount(n), prose(` ${pluralize(n, 'creato', 'creati')}, ancora senza movimenti: collega una spesa da Tracciamento per vederla qui.`)],
    };
  }

  const top = active[0].summary;
  const opening: Narrative = [...centersCount(active.length), prose(` ${pluralize(active.length, 'attivo', 'attivi')} per `), figure(euro(summary.total)), prose(' in totale: ')];
  const { over, atRisk } = summary;
  let headline: string;
  let tone: PageVerdictModel['tone'];
  let body: Narrative;

  if (over.length >= 2) {
    headline = `${over.length} centri hanno superato il tetto.`;
    tone = 'negative';
    body = [...topClause(summary, 'è il più caro'), prose(`; ${joinNames(over.map((c) => c.center.name))} hanno superato il tetto`)];
    if (atRisk.length > 0) body.push(prose(`, ${joinNames(atRisk.map((c) => c.center.name))} ${pluralize(atRisk.length, 'rischia', 'rischiano')} di sforarlo`));
  } else if (over.length === 1) {
    const center = over[0];
    headline = `${center.center.name} ha superato il tetto ${windowOf(center.budget!, now)}.`;
    tone = 'negative';
    body =
      center === top
        ? [...overClause(center, now), prose(', '), ...topClause(summary, 'ed è anche il più caro')]
        : [...overClause(center, now), prose('; '), ...topClause(summary, 'è il più caro')];
    if (atRisk.length > 0) body.push(prose(`; ${joinNames(atRisk.map((c) => c.center.name))} ${pluralize(atRisk.length, 'rischia', 'rischiano')} di sforarlo`));
  } else if (atRisk.length >= 2) {
    headline = `${atRisk.length} centri rischiano di sforare il tetto.`;
    tone = 'warning';
    body = [...topClause(summary, 'è il più caro'), prose(`; ${joinNames(atRisk.map((c) => c.center.name))} rischiano di sforare il tetto al ritmo attuale`)];
  } else if (atRisk.length === 1) {
    const center = atRisk[0];
    headline = `${center.center.name} rischia di sforare il tetto ${windowOf(center.budget!, now)}.`;
    tone = 'warning';
    body =
      center === top
        ? [...topClause(summary, 'è il più caro'), prose(' e '), ...riskClause(center, now, false)]
        : [...topClause(summary, 'è il più caro'), prose('; '), ...riskClause(center, now, true)];
  } else {
    headline = `${top.center.name} è il centro più caro.`;
    tone = 'neutral';
    body = [...topClause(summary, 'pesa')];
    if (summary.withBudget > 0) body.push(prose(' e nessun tetto è a rischio'));
  }

  return { headline, tone, sentence: [...opening, ...body, ...dormantClause(summary), prose('.')] };
}

// ─── The detail's verdict ─────────────────────────────────────────────────────

/** «; in tutto ti è costato 5200 € da marzo 2023» — the lifetime clause that closes every budget sentence. */
function lifetimeClause(center: CenterSummary, leading = '; '): Narrative {
  if (center.total === 0 || !center.firstDate) return [];
  return [prose(`${leading}in tutto ti è costato `), figure(euro(center.total)), prose(` da ${monthYear(center.firstDate)}`)];
}

function monthDaysLeftClause(now: Date, midSentence: boolean): Narrative {
  const calendar = resolveBudgetCalendar(now);
  if (calendar.daysLeft === 0) return [prose(midSentence ? "all'ultimo giorno del mese " : "All'ultimo giorno del mese ")];
  return [prose(midSentence ? 'a ' : 'A '), count(calendar.daysLeft), prose(` ${pluralize(calendar.daysLeft, 'giorno', 'giorni')} dalla fine del mese `)];
}

function windowOpening(budget: CenterBudgetSummary, now: Date, midSentence: boolean): Narrative {
  return budget.period === 'monthly' ? monthDaysLeftClause(now, midSentence) : [prose(midSentence ? 'da gennaio ' : 'Da gennaio ')];
}

function exceededVerdict(center: CenterSummary, now: Date): PageVerdictModel {
  const budget = center.budget!;
  const name = center.center.name;
  const calendar = resolveBudgetCalendar(now);
  const ahead = budget.crossedOn !== null && budget.crossedOn > calendar.dayOfMonth;
  const opening: Narrative = ahead
    ? [prose('Lo superi '), ...dayRef('il', budget.crossedOn!), prose(' con le spese già in calendario; ')]
    : budget.crossedOn === null
      ? []
      : budget.crossedOn === calendar.dayOfMonth
        ? [prose('Lo hai superato oggi; ')]
        : [prose('Lo hai superato '), ...dayRef('il', budget.crossedOn), prose('; ')];
  return {
    headline: ahead ? `${name} supererà il tetto ${windowOf(budget, now)}.` : `${name} ha superato il tetto ${windowOf(budget, now)}.`,
    tone: 'negative',
    sentence: [
      ...opening,
      ...windowOpening(budget, now, opening.length > 0),
      prose(`hai ${spentVerb(budget)} `),
      signed(euro(budget.spent), 'negative'),
      prose(' su '),
      figure(euro(budget.amount)),
      prose(', '),
      signed(euro(budget.overBy), 'negative'),
      prose(' oltre'),
      ...lifetimeClause(center),
      prose('.'),
    ],
  };
}

function holdingVerdict(center: CenterSummary, now: Date): PageVerdictModel {
  const budget = center.budget!;
  const name = center.center.name;
  const sentence: Narrative = [...windowOpening(budget, now, false), prose(`hai ${spentVerb(budget)} `), figure(euro(budget.spent)), prose(' su '), figure(euro(budget.amount))];
  // The share against the calendar («il 32% al 64% dell'anno») is the reading of a holding
  // ceiling; on the year it stays even at risk, because «da gennaio» names no calendar the
  // way «a 9 giorni dalla fine del mese» does.
  if (!budget.atRisk || budget.period === 'annual') {
    sentence.push(prose(', '), ...percentWithArticle(budget.usedPct), prose(' '), ...percentWithAt(budget.calendarPct), prose(budget.period === 'monthly' ? ' del mese' : " dell'anno"));
  }
  if (budget.atRisk) {
    sentence.push(prose(', e al ritmo attuale chiudi a '), signed(`~${euro(budget.projection!)}`, 'negative'), prose(', '), signed(euro(projectedGap(budget.projection!, budget.amount)), 'negative'), prose(' oltre'));
  } else if (budget.projection !== null) {
    sentence.push(prose(', e al ritmo attuale chiudi a '), figure(`~${euro(budget.projection)}`));
  }
  sentence.push(...lifetimeClause(center), prose('.'));
  return {
    headline: budget.atRisk ? `${name} rischia di sforare il tetto ${windowOf(budget, now)}.` : `${name} resta nel tetto ${windowOf(budget, now)}.`,
    tone: budget.atRisk ? 'warning' : 'positive',
    sentence,
  };
}

export function buildCostCenterVerdict(center: CenterSummary, now: Date): PageVerdictModel {
  const name = center.center.name;
  if (center.lifecycle === 'archived') {
    const sentence: Narrative = [prose(`Chiuso il ${formatDate(toDate(center.center.archivedAt!))}: `)];
    if (center.count > 0) sentence.push(figure(euro(center.total)), prose(' in '), ...movementsCount(center.count), prose(', escluso dal totale dei centri.'));
    else sentence.push(prose('nessuna spesa registrata, escluso dal totale dei centri.'));
    return { headline: `${name} è archiviato.`, tone: 'neutral', sentence };
  }
  if (center.count === 0) {
    return { headline: `${name} non ha ancora spese.`, tone: 'neutral', sentence: [prose('Collega una spesa da Tracciamento per vederla qui.')] };
  }
  if (center.budget?.exceeded) return exceededVerdict(center, now);
  if (center.lifecycle === 'dormant') {
    return {
      headline: `${name} è fermo da ${center.idleDays} giorni.`,
      tone: 'neutral',
      sentence: [prose(`Ultima spesa il ${formatDate(center.lastDate!)}`), ...lifetimeClause(center), prose('.')],
    };
  }
  if (center.budget) return holdingVerdict(center, now);

  const sentence: Narrative = [figure(euro(center.total)), prose(' in '), ...movementsCount(center.count), prose(` da ${monthYear(center.firstDate!)}`)];
  if (center.ytd > 0) sentence.push(prose(', '), figure(euro(center.ytd)), prose(" quest'anno"));
  if (center.yearProjection !== null) sentence.push(prose("; al ritmo attuale l'anno chiude a "), figure(`~${euro(center.yearProjection)}`));
  sentence.push(prose('.'));
  return { headline: `${name} costa ${euro(center.averageMonthly)} al mese.`, tone: 'neutral', sentence };
}

// ─── The list's tiles ─────────────────────────────────────────────────────────

export function describeTotale(summary: CostCentersSummary): Narrative {
  const spenders = summary.active.filter((row) => row.summary.total > 0);
  if (spenders.length === 0 || !summary.firstDate) return [prose('Nessuna spesa registrata nei centri attivi.')];
  const opening: Narrative = [figure(euro(summary.total)), prose(` dal ${monthYear(summary.firstDate)}: `)];
  const [first, second] = spenders;
  if (spenders.length === 1) return [...opening, prose(`${first.summary.center.name} è l'unico centro con spese.`)];
  if (spenders.length === 2) {
    return [...opening, prose(`${first.summary.center.name} pesa `), ...percentWithArticle(first.share), prose(`, ${second.summary.center.name} `), ...percentWithArticle(second.share), prose('.')];
  }
  return [...opening, prose(`${first.summary.center.name} pesa `), ...percentWithArticle(first.share), prose(', i primi '), count(2), prose(' '), ...percentWithArticle(first.share + second.share), prose('.')];
}

export function describeTotaleAside(summary: CostCentersSummary): Narrative {
  const n = summary.active.length;
  return [count(n), prose(` ${pluralize(n, 'centro attivo', 'centri attivi')} · in totale`)];
}

export function describeTotaleFooter(summary: CostCentersSummary): Narrative | null {
  const n = summary.archived.length;
  if (n === 0) return null;
  return n === 1
    ? [prose('Escluso '), count(1), prose(' centro archiviato ('), figure(euro(summary.archivedTotal)), prose('): è sotto la griglia.')]
    : [prose('Esclusi '), count(n), prose(' centri archiviati ('), figure(euro(summary.archivedTotal)), prose('): sono sotto la griglia.')];
}

/** «2025, intero» — the KPI caption that names last year. */
export function describeLastYearCaption(now: Date): Narrative {
  return [figure(String(getItalyYear(now) - 1)), prose(', intero')];
}

export function describeTrailingCaption(stack: CenterMonthStack, now: Date): Narrative {
  if (stack.centers.length === 0) return [prose('nessuna spesa negli ultimi '), count(stack.months.length), prose(' mesi')];
  return [prose(`per centro · ${monthName(now)} in corso`)];
}

/** The detail's bars have one series, so the caption names only the running month. */
export function describeCenterTrailingCaption(stack: CenterMonthStack, now: Date): Narrative {
  if (stack.centers.length === 0) return [prose('nessuna spesa negli ultimi '), count(stack.months.length), prose(' mesi')];
  return [prose(`${monthName(now)} in corso`)];
}

export function describeCentri(summary: CostCentersSummary): Narrative {
  const spenders = summary.active.filter((row) => row.summary.total > 0);
  const budgets: Narrative =
    summary.withBudget === 0
      ? [prose('nessuno ha un tetto.')]
      : [count(summary.withBudget), prose(` ${pluralize(summary.withBudget, 'centro ha', 'centri hanno')} un tetto.`)];
  if (spenders.length === 0) return [prose('Nessuna spesa registrata; '), ...budgets];
  if (spenders.length === 1) return [prose(`${spenders[0].summary.center.name} è l'unico centro con spese; `), ...budgets];
  const [first, second] = spenders;
  return [prose(`${first.summary.center.name} e ${second.summary.center.name} fanno `), ...percentWithArticle(first.share + second.share), prose(' del totale; '), ...budgets];
}

/** The caption under a center's name: its count, its last expense, its own window. */
export function describeCenterRow(center: CenterSummary, now: Date): Narrative {
  if (center.count === 0) {
    return center.scheduled.count > 0 ? [prose('nessuna spesa, '), count(center.scheduled.count), prose(' in calendario')] : [prose('nessuna spesa')];
  }
  const out: Narrative = [...movementsCount(center.count), prose(`${DOT}ultima spesa il `), figure(shortDate(center.lastDate!))];
  const budget = center.budget;
  if (budget?.exceeded) {
    out.push(prose(DOT), signed(euro(budget.spent), 'negative'), prose(' su '), figure(euro(budget.amount)), prose(` ${windowIn(budget, now)}, `), signed(euro(budget.overBy), 'negative'), prose(' oltre'));
  } else if (budget?.atRisk) {
    out.push(prose(`${DOT}al ritmo attuale `), signed(`~${euro(budget.projection!)}`, 'negative'), prose(' su '), figure(euro(budget.amount)), prose(` ${windowIn(budget, now)}`));
  } else if (budget) {
    out.push(prose(DOT), ...percentWithAt(budget.usedPct), prose(` del tetto ${budget.period === 'monthly' ? 'mensile' : 'annuale'}`));
  } else if (center.lifecycle === 'active' && center.ytd > 0) {
    out.push(prose(`${DOT}quest'anno `), figure(euro(center.ytd)));
  }
  return out;
}

export interface CenterChip {
  label: string;
  tone: 'neutral' | 'warning' | 'negative';
}

/** The one chip a list row may carry: its lifecycle, or where it stands against its ceiling. */
export function describeCenterChip(center: CenterSummary): CenterChip | null {
  if (center.lifecycle === 'archived') return { label: 'archiviato', tone: 'neutral' };
  if (center.count === 0) return { label: 'nessuna spesa', tone: 'neutral' };
  if (center.lifecycle === 'dormant') return { label: `fermo da ${center.idleDays} giorni`, tone: 'neutral' };
  const budget = center.budget;
  if (!budget) return null;
  if (budget.exceeded) return { label: 'oltre il tetto', tone: 'negative' };
  const label = `tetto ${budget.period === 'monthly' ? 'mensile' : 'annuale'} ${atThePercent(budget.usedPct, 0)}${pct(budget.usedPct)}`;
  return { label, tone: budget.atRisk ? 'warning' : 'neutral' };
}

export const CENTRI_FOOTER: Narrative = [prose('Ordinati per costo totale; la barra è il rango, la percentuale la quota. Tocca un centro per aprirlo.')];

export function describeDormienti(summary: CostCentersSummary): Narrative {
  if (summary.active.length === 0) return [prose('Nessun centro attivo.')];
  const { dormant } = summary;
  if (dormant.length === 0) return [prose(`Nessun centro fermo: tutti hanno spese negli ultimi ${DORMANT_THRESHOLD_DAYS} giorni.`)];
  const first = dormant[0];
  const opening: Narrative = [...centersCount(dormant.length), prose(` ${pluralize(dormant.length, 'fermo', 'fermi')}: `)];
  if (first.idleDays === null) return [...opening, prose(`${first.center.name} non ha ancora spese.`)];
  return [...opening, prose(`${first.center.name} non ha spese da `), count(first.idleDays), prose(' giorni.')];
}

export function describeDormantRow(center: CenterSummary): Narrative {
  if (!center.lastDate) return [prose('nessuna spesa registrata')];
  return [prose('ultima spesa il '), figure(formatDate(center.lastDate)), prose(DOT), figure(euro(center.total)), prose(' in totale')];
}

export function describeIdle(center: CenterSummary): { value: string; caption: string } {
  return center.idleDays === null ? { value: 'mai', caption: 'nessuna spesa' } : { value: `${center.idleDays} giorni`, caption: 'senza spese' };
}

/** «soglia 90 giorni» — the Dormienti tile's scope. */
export const DORMIENTI_ASIDE: Narrative = [prose('soglia '), count(DORMANT_THRESHOLD_DAYS), prose(' giorni')];

export const DORMIENTI_FOOTER: Narrative = [
  prose(`Un centro è fermo dopo ${DORMANT_THRESHOLD_DAYS} giorni senza spese, sull'intera storia. Archivialo dal suo dettaglio se il progetto è finito.`),
];

export function describeArchiviati(summary: CostCentersSummary): Narrative {
  const n = summary.archived.length;
  return [...centersCount(n), prose(DOT), figure(euro(summary.archivedTotal)), prose(`${DOT}${pluralize(n, 'escluso', 'esclusi')} dal totale`)];
}

export function describeArchivedRow(center: CenterSummary): Narrative {
  return [prose('archiviato il '), figure(formatDate(toDate(center.center.archivedAt!))), prose(DOT), ...movementsCount(center.count)];
}

// ─── The detail's tiles ───────────────────────────────────────────────────────

export function describeCosto(center: CenterSummary): Narrative {
  if (center.count === 0) return [prose('Nessuna spesa registrata.')];
  const out: Narrative = [figure(euro(center.total)), prose(' in '), ...movementsCount(center.count), prose(', '), figure(euro(center.averageMonthly)), prose(' al mese in media; ')];
  if (center.ytd > 0) out.push(prose("quest'anno "), figure(euro(center.ytd)), prose(', '), ...percentWithArticle(center.ytdPct), prose('.'));
  else out.push(prose("nessuna spesa quest'anno."));
  return out;
}

export function describeCostoAside(center: CenterSummary): Narrative {
  return center.firstDate ? [prose(`dal ${monthYear(center.firstDate)} · in totale`)] : [prose('in totale')];
}

export function describeCostoFooter(center: CenterSummary): Narrative {
  const { recurring, oneOff, recurringPct } = center.recurring;
  if (recurring === 0) return [prose('Tutto una tantum: nessuna spesa ricorrente o a rate.')];
  return [prose('Fisso '), figure(euro(recurring)), prose(' ('), ...percentWithArticle(recurringPct * 100), prose(', ricorrenti e rate) · una tantum '), figure(euro(oneOff)), prose('.')];
}

export function describeBudgetLabel(budget: CenterBudgetSummary, now: Date): string {
  return budget.period === 'monthly' ? `Tetto mensile · ${monthName(now)}` : `Tetto annuale · ${getItalyYear(now)}`;
}

export function describeBudgetUsed(budget: CenterBudgetSummary): Narrative {
  const spent = budget.exceeded ? signed(euro(budget.spent), 'negative') : figure(euro(budget.spent));
  return [spent, prose(' su '), figure(euro(budget.amount))];
}

export function describeBudgetCaptions(budget: CenterBudgetSummary): { left: Narrative; right: Narrative } {
  return {
    left: [prose(`${spentVerb(budget)}, `), ...percentWithAt(budget.usedPct)],
    right: [prose('│ oggi, '), ...percentWithArticle(budget.calendarPct), prose(budget.period === 'monthly' ? ' del mese' : " dell'anno")],
  };
}

export interface KpiReading {
  value: string;
  caption: Narrative;
  tone: 'neutral' | 'negative' | 'muted';
}

export function describeMonthEndKpi(center: CenterSummary, now: Date): KpiReading {
  if (center.monthProjection === null) {
    if (center.monthSpentToDate === 0) return { value: '—', caption: [prose(`nessuna spesa ${withPrepositionA(monthName(now))}`)], tone: 'muted' };
    if (!resolveBudgetCalendar(now).canForecast) return { value: '—', caption: [prose('dal quarto giorno')], tone: 'muted' };
    return { value: '—', caption: [prose('centro fermo')], tone: 'muted' };
  }
  const budget = center.budget;
  const over = budget?.period === 'monthly' && projectedGap(center.monthProjection, budget.amount) > 0;
  return {
    value: `~${euro(center.monthProjection)}`,
    caption: over ? [prose('al ritmo attuale, '), signed(euro(projectedGap(center.monthProjection, budget!.amount)), 'negative'), prose(' oltre')] : [prose('al ritmo attuale')],
    tone: over ? 'negative' : 'neutral',
  };
}

export function describeYearEndKpi(center: CenterSummary): KpiReading {
  if (center.yearProjection === null) {
    if (center.lifecycle === 'archived') return { value: '—', caption: [prose('archiviato')], tone: 'muted' };
    if (center.lifecycle === 'dormant') return { value: '—', caption: [prose('centro fermo')], tone: 'muted' };
    if (center.ytd === 0) return { value: '—', caption: [prose("nessuna spesa quest'anno")], tone: 'muted' };
    return { value: '—', caption: [prose('da febbraio')], tone: 'muted' };
  }
  const budget = center.budget;
  const over = budget?.period === 'annual' && projectedGap(center.yearProjection, budget.amount) > 0;
  return {
    value: `~${euro(center.yearProjection)}`,
    caption: over ? [prose("al ritmo di quest'anno, "), signed(euro(projectedGap(center.yearProjection, budget!.amount)), 'negative'), prose(' oltre')] : [prose("al ritmo di quest'anno")],
    tone: over ? 'negative' : 'neutral',
  };
}

export function describeAverageKpi(center: CenterSummary): KpiReading {
  if (center.count === 0) return { value: '—', caption: [prose('nessuna spesa')], tone: 'muted' };
  return { value: euro(center.averageMonthly), caption: [prose('media su '), count(center.monthsSpan), prose(` ${pluralize(center.monthsSpan, 'mese', 'mesi')}`)], tone: 'neutral' };
}

const OTHER_KEY = 'Altro';

export function describeCategorie(slices: CostCenterCategorySlice[]): Narrative {
  if (slices.length === 0) return [prose('Nessuna spesa registrata.')];
  const named = slices.filter((slice) => slice.key !== OTHER_KEY);
  const top = slices[0];
  const tail = named.length < slices.length ? [count(named.length), prose(' categorie principali.')] : [count(named.length), prose(` ${pluralize(named.length, 'categoria', 'categorie')}.`)];
  return [prose(`${top.categoryName} è `), ...percentWithArticle(top.pct * 100), prose(' del costo; '), ...tail];
}

export const CATEGORIE_FOOTER: Narrative = [prose('La barra è il rango, la percentuale la quota del totale.')];

export function describeSottocategorie(slices: CostCenterSubCategorySlice[], excludedKeys: ReadonlySet<string>, netTotal: number): Narrative {
  if (slices.length === 0) return [prose('Nessuna spesa registrata.')];
  const included = slices.filter((slice) => !excludedKeys.has(slice.key));
  if (included.length === 0) return [prose('Tutte le voci sono escluse.')];
  const top = included[0];
  const topShare: Narrative = [prose(`${top.subCategoryName} pesa `), ...percentWithArticle(netTotal > 0 ? (top.total / netTotal) * 100 : 0), prose('.')];
  const excluded = slices.filter((slice) => excludedKeys.has(slice.key));
  if (excluded.length === 0) return [count(slices.length), prose(` ${pluralize(slices.length, 'sottocategoria', 'sottocategorie')}; `), ...topShare];
  const subject = excluded.length === 1 ? `Al netto di ${excluded[0].subCategoryName}, ` : `Al netto di ${excluded.length} voci, `;
  return [prose(subject), figure(euro(netTotal)), prose(': '), ...topShare];
}

export function describeSottocategorieAside(excludedCount: number): Narrative | null {
  if (excludedCount === 0) return null;
  return [count(excludedCount), prose(` ${pluralize(excludedCount, 'esclusa', 'escluse')}`)];
}

export const SOTTOCATEGORIE_FOOTER: Narrative = [prose('Tocca una voce per escluderla dal totale — solo qui: le altre tessere non cambiano.')];

export function describeCiclo(center: CenterSummary): Narrative {
  if (center.lifecycle === 'archived') return [prose('Archiviato il '), figure(formatDate(toDate(center.center.archivedAt!))), prose('.')];
  if (center.count === 0 || !center.lastDate) return [prose('Nessuna spesa ancora.')];
  if (center.lifecycle === 'dormant') return [prose('Fermo da '), count(center.idleDays!), prose(' giorni: ultima spesa il '), figure(formatDate(center.lastDate)), prose('.')];
  const days = center.idleDays ?? 0;
  if (days === 0) return [prose("Attivo: l'ultima spesa è di oggi.")];
  if (days === 1) return [prose("Attivo: l'ultima spesa è di ieri.")];
  return [prose("Attivo: l'ultima spesa è di "), count(days), prose(' giorni fa.')];
}

export function describeCicloAside(center: CenterSummary): string {
  return center.lifecycle === 'archived' ? 'archiviato' : center.lifecycle === 'dormant' ? 'fermo' : 'attivo';
}

export function describeCicloFooter(center: CenterSummary): Narrative {
  if (center.lifecycle === 'archived') return [prose('Ripristinarlo lo riporta nel totale; eliminarlo scollega i suoi movimenti, che restano in Cashflow.')];
  return [prose(`Fermo dopo ${DORMANT_THRESHOLD_DAYS} giorni senza spese. Archiviarlo lo toglie dal totale; eliminarlo scollega i suoi movimenti, che restano in Cashflow.`)];
}

export function describeMovimenti(center: CenterSummary): Narrative {
  if (center.count === 0) {
    return center.scheduled.count > 0
      ? [prose('Nessuna spesa registrata, '), count(center.scheduled.count), prose(' in calendario ('), figure(euro(center.scheduled.total)), prose(').')]
      : [prose('Nessuna spesa registrata.')];
  }
  const booked = center.expenses.filter((expense) => toDate(expense.date) <= (center.lastDate as Date));
  const largest = booked.reduce((max, expense) => (Math.abs(expense.amount) > Math.abs(max.amount) ? expense : max), booked[0]);
  const label = largest.subCategoryName ? `${largest.categoryName} · ${largest.subCategoryName}` : largest.categoryName;
  const out: Narrative = [
    count(center.count),
    prose(` ${pluralize(center.count, 'spesa', 'spese')} dal `),
    figure(formatDate(center.firstDate!)),
    prose(' al '),
    figure(formatDate(center.lastDate!)),
    prose(`; la più grande è ${label} (`),
    figure(euro(largest.amount)),
    prose(') del '),
    figure(formatDate(toDate(largest.date))),
  ];
  if (center.scheduled.count > 0) {
    out.push(prose(', e '), count(center.scheduled.count), prose(` ${pluralize(center.scheduled.count, 'è', 'sono')} in calendario (`), figure(euro(center.scheduled.total)), prose(')'));
  }
  out.push(prose('.'));
  return out;
}

export function describeMovimentiAside(center: CenterSummary): Narrative {
  const n = center.count + center.scheduled.count;
  return [count(n), prose(` ${pluralize(n, 'voce', 'voci')}`)];
}
