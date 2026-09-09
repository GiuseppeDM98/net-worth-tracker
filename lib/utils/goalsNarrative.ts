/**
 * FIRE › Obiettivi's words: the verdict that answers «sono in rotta?» before any number, and the
 * reading line under each tile of that tab.
 *
 * Same design as the other `*Narrative.ts` modules: every function is pure and returns a
 * `Narrative` (segments flagged `mono`) rendered by `NarrativeText`; the phrasings are pinned by
 * tests, and a sentence never claims what the data cannot support — a goal without a deadline is
 * said to have none, a pace that never reaches the target gets «nessuna data», a deadline already
 * passed is said as such instead of a pace over zero months (DESIGN.md → The Narrative Honesty
 * Rule). The verdict per goal is the trajectory's own (the projected value at the deadline against
 * the target, 1% tolerance), never contribution ≥ required.
 *
 * No figure on this page wears a sign token: a gap to a target is not a loss and a surplus is not a
 * gain. The headline's tone follows the dated goals: every one on track is positive, some late is
 * warning, all late is negative, nothing to judge is neutral.
 *
 * Percentages go through chartService's it-IT formatter (comma decimals), currency through
 * `cachedFormatCurrencyEUR` (no-break space before €) — AGENTS.md → Italian Localization.
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { MONTH_NAMES } from '@/lib/constants/months';
import { articleForPercent, atThePercent, monthWithPrepositionA, ofThePercent } from '@/lib/utils/patrimonioNarrative';
import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import type { GoalContributionSlice } from '@/lib/utils/goalTrajectory';
import type { AssignmentsView, DerivedAllocationView, GoalDate, GoalLine, GoalsOverview, MilestoneEntry, TrajectoryView } from '@/lib/utils/goalsSummary';

// ─── Formatting helpers ───────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

function formatAmount(value: number): string {
  return cachedFormatCurrencyEUR(Math.round(Math.abs(value)), true);
}

const amount = (value: number): NarrativeSegment => figure(formatAmount(value));
const count = (value: number): NarrativeSegment => figure(String(value));

/** One decimal, dropped when it is zero: «65%», «26,2%», «3,3%». */
function pctDecimals(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? 0 : 1;
}

function formatPct(value: number): string {
  return formatPercentage(Math.round(value * 10) / 10, pctDecimals(value));
}

const pct = (value: number): NarrativeSegment => figure(formatPct(value));

/** «giugno 2029» / «giu 2029». */
export function formatGoalDate(date: GoalDate, style: 'long' | 'short' = 'long'): string {
  const month = MONTH_NAMES[date.month - 1].toLowerCase();
  return `${style === 'short' ? month.slice(0, 3) : month} ${date.year}`;
}

/** «a giugno 2029» / «ad agosto 2034». */
function atDate(date: GoalDate): string {
  return `${monthWithPrepositionA(date.month)} ${date.year}`;
}

/** «a Casa» / «ad Auto» — the euphonic d before a name that starts with a vowel. */
function toName(name: string): string {
  return /^[aeiou]/i.test(name) ? `ad ${name}` : `a ${name}`;
}

const plural = (n: number, singular: string, pluralForm: string): string => (n === 1 ? singular : pluralForm);

const NUMBER_WORDS = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'];

/** A count in words up to nine — the headline is prose, not a figure. */
function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** «a, b e c» — the Italian list, on narratives. */
function joinList(items: Narrative[]): Narrative {
  const out: Narrative = [];
  items.forEach((item, index) => {
    if (index > 0) out.push(prose(index === items.length - 1 ? ' e ' : ', '));
    out.push(...item);
  });
  return out;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

const PRIORITY_WORDS: Record<GoalLine['priority'], string> = { alta: 'alta', media: 'media', bassa: 'bassa' };

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface GoalsVerdictInput {
  /** `goalBasedInvestingEnabled` in the settings. */
  enabled: boolean;
  overview: GoalsOverview | null;
}

/** The headline and its tone, from the dated goals alone: they are the only ones a plan can miss. */
function resolveHeadline(overview: GoalsOverview): { headline: string; tone: VerdictTone } {
  const { total, reached, dated, offTrack } = overview.counts;

  if (dated === 0) {
    if (reached === total) return { headline: total === 1 ? "Hai raggiunto l'obiettivo." : 'Hai raggiunto ogni obiettivo.', tone: 'positive' };
    return { headline: 'Nessun obiettivo in corso ha una scadenza.', tone: 'neutral' };
  }
  if (offTrack === 0) return { headline: dated === 1 ? 'Sei in rotta.' : 'Sei in rotta su ogni obiettivo.', tone: 'positive' };
  if (offTrack === dated) return { headline: dated === 1 ? "L'obiettivo è in ritardo." : 'Ogni obiettivo datato è in ritardo.', tone: 'negative' };
  return {
    headline: offTrack === 1 ? `Un obiettivo su ${numberWord(dated)} è in ritardo.` : `${capitalize(numberWord(offTrack))} obiettivi su ${numberWord(dated)} sono in ritardo.`,
    tone: 'warning',
  };
}

interface GoalClause {
  /** The full clause, subject included. */
  full: Narrative;
  /** The clause with the verb elided, for the second goal of the same kind («e Auto 70 € al mese…»). */
  elided: Narrative | null;
}

/** «Casa richiede 270 € al mese in più per arrivare a giugno 2029» — or the deadline already passed. */
function lateClause(goal: GoalLine): GoalClause {
  if (goal.monthsToDeadline === 0 && goal.deadline) {
    return { full: [prose(`${goal.name} ha superato la scadenza di ${formatGoalDate(goal.deadline)} senza raggiungere il target`)], elided: null };
  }
  const extra = goal.plannedMonthly > 0 ? Math.max(0, (goal.requiredMonthly ?? 0) - goal.plannedMonthly) : (goal.requiredMonthly ?? 0);
  const tail: Narrative = [amount(extra), prose(goal.plannedMonthly > 0 ? ' al mese in più' : ' al mese'), prose(goal.deadline ? ` per arrivare ${atDate(goal.deadline)}` : '')];
  return { full: [prose(`${goal.name} richiede `), ...tail], elided: [prose(`${goal.name} `), ...tail] };
}

/** «Auto è in rotta per marzo 2028», then «Studi figli per settembre 2034». */
function onTrackClause(goal: GoalLine): GoalClause {
  const deadline = goal.deadline ? ` per ${formatGoalDate(goal.deadline)}` : '';
  return { full: [prose(`${goal.name} è in rotta${deadline}`)], elided: [prose(`${goal.name}${deadline}`)] };
}

/** «Pensione non ha una scadenza (al ritmo attuale arriva a marzo 2041)». */
function undatedClause(goal: GoalLine): GoalClause {
  const arrival = goal.projectedDate ? ` (al ritmo attuale arriva ${atDate(goal.projectedDate)})` : '';
  return { full: [prose(`${goal.name} non ha una scadenza${arrival}`)], elided: null };
}

/** Joins the clauses of one kind: the first in full, the next ones with the verb elided when they can. */
function joinClauses(clauses: GoalClause[]): Narrative {
  return joinList(clauses.map((clause, index) => (index > 0 && clause.elided ? clause.elided : clause.full)));
}

/** Goals that share one predicate: «Figli e Nipoti sono aperti, senza un importo». */
function sharedClause(names: string[], singular: string, pluralForm: string): Narrative {
  return [prose(`${joinNames(names)} ${names.length === 1 ? singular : pluralForm}`)];
}

/**
 * «Sono in rotta?» — the headline judges the dated goals, the sentence gives every goal its
 * clause: the late ones with the extra pace their deadline asks, the ones in time with their
 * deadline, the undated with their arrival, the open ones as open, the reached ones last.
 */
export function buildGoalsVerdict({ enabled, overview }: GoalsVerdictInput): PageVerdictModel {
  if (!enabled || !overview) {
    return {
      headline: 'Gli obiettivi non sono attivi.',
      tone: 'neutral',
      sentence: [prose('Attiva il Goal-Based Investing nelle Impostazioni per assegnare quote del portafoglio a un obiettivo e sapere se sei in rotta.')],
    };
  }
  if (overview.counts.total === 0) {
    return {
      headline: 'Nessun obiettivo ancora.',
      tone: 'neutral',
      sentence: [prose('Crea il primo obiettivo e assegnagli una quota del portafoglio per sapere se sei in rotta.')],
    };
  }

  const { headline, tone } = resolveHeadline(overview);
  const { inProgress, reached } = overview.counts;
  const byVerdict = (verdict: GoalLine['verdict']) => overview.goals.filter((g) => g.verdict === verdict);

  const opening: Narrative =
    inProgress > 0
      ? [count(inProgress), prose(` ${plural(inProgress, 'obiettivo', 'obiettivi')} in corso`), ...(reached > 0 ? [prose(' e '), count(reached), prose(` ${plural(reached, 'raggiunto', 'raggiunti')}`)] : []), prose(': ')]
      : [count(reached), prose(` ${plural(reached, 'obiettivo raggiunto', 'obiettivi raggiunti')}: `)];

  const groups: Narrative[] = [];
  const late = byVerdict('offTrack');
  if (late.length) groups.push(joinClauses(late.map(lateClause)));
  const inTime = byVerdict('onTrack');
  if (inTime.length) groups.push(joinClauses(inTime.map(onTrackClause)));
  const undated = byVerdict('noDeadline');
  if (undated.length) {
    groups.push(undated.some((g) => g.projectedDate) ? joinClauses(undated.map(undatedClause)) : sharedClause(undated.map((g) => g.name), 'non ha una scadenza', 'non hanno una scadenza'));
  }
  const open = byVerdict('noTarget');
  if (open.length) groups.push(sharedClause(open.map((g) => g.name), 'è aperto, senza un importo', 'sono aperti, senza un importo'));
  const done = byVerdict('reached');
  if (done.length) groups.push(sharedClause(done.map((g) => g.name), 'è raggiunto', 'sono raggiunti'));

  const sentence: Narrative = [...opening];
  groups.forEach((group, index) => {
    if (index > 0) sentence.push(prose('; '));
    sentence.push(...group);
  });
  sentence.push(prose('.'));

  return { headline, tone, sentence };
}

// ─── Obiettivi ────────────────────────────────────────────────────────────────

/** «4 obiettivi, 111.400 € assegnati (il 48,9% del patrimonio): 2 in rotta, 1 in ritardo, 1 raggiunto.» */
export function describeObiettivi(overview: GoalsOverview): Narrative {
  const { counts } = overview;
  const out: Narrative = [count(counts.total), prose(` ${plural(counts.total, 'obiettivo', 'obiettivi')}, `)];

  if (overview.allocatedTotal > 0) {
    out.push(amount(overview.allocatedTotal), prose(' assegnati'));
    if (overview.allocatedShare !== null) {
      out.push(prose(` (${articleForPercent(overview.allocatedShare, pctDecimals(overview.allocatedShare))}`), pct(overview.allocatedShare), prose(' del patrimonio)'));
    }
  } else {
    out.push(prose('niente ancora assegnato'));
  }
  out.push(prose(': '));

  const parts: Narrative[] = [];
  if (counts.onTrack) parts.push([count(counts.onTrack), prose(' in rotta')]);
  if (counts.offTrack) parts.push([count(counts.offTrack), prose(' in ritardo')]);
  if (counts.reached) parts.push([count(counts.reached), prose(` ${plural(counts.reached, 'raggiunto', 'raggiunti')}`)]);
  if (counts.noDeadline) parts.push([count(counts.noDeadline), prose(' senza scadenza')]);
  if (counts.noTarget) parts.push([count(counts.noTarget), prose(` ${plural(counts.noTarget, 'aperto', 'aperti')}`)]);
  parts.forEach((part, index) => {
    if (index > 0) out.push(prose(', '));
    out.push(...part);
  });
  out.push(prose('.'));
  return out;
}

/** «78.000 € di 120.000 € · mancano 42.000 € · giugno 2029 · priorità alta» — the row's second line. */
export function describeGoalCaption(goal: GoalLine): Narrative {
  const priority = `priorità ${PRIORITY_WORDS[goal.priority]}`;
  if (goal.targetAmount === null) return [amount(goal.currentValue), prose(` assegnati · ${priority}`)];

  const out: Narrative = [amount(goal.currentValue), prose(' di '), amount(goal.targetAmount)];
  if (goal.remaining !== null && goal.remaining > 0) out.push(prose(' · mancano '), amount(goal.remaining));
  out.push(prose(` · ${goal.deadline ? formatGoalDate(goal.deadline) : 'senza scadenza'} · ${priority}`));
  return out;
}

/** The words after the verdict chip of a row; null when the chip says it all (reached). */
export function describeGoalStatus(goal: GoalLine): Narrative | null {
  switch (goal.verdict) {
    case 'offTrack':
      if (goal.monthsToDeadline === 0) return [prose('scadenza superata')];
      return [prose('richiede '), amount(goal.requiredMonthly ?? 0), prose(' al mese, '), ...(goal.plannedMonthly > 0 ? [prose('ne versi '), amount(goal.plannedMonthly)] : [prose('oggi non versi nulla')])];
    case 'onTrack':
      return [
        prose(goal.projectedDate ? `arriva ${atDate(goal.projectedDate)}` : 'arriva in tempo'),
        ...(goal.plannedMonthly > 0 ? [prose(' con '), amount(goal.plannedMonthly), prose(' al mese')] : [prose(' senza versamenti')]),
      ];
    case 'noDeadline':
      return [prose(goal.projectedDate ? `al ritmo attuale arriva ${atDate(goal.projectedDate)}` : 'al ritmo attuale non ha una data')];
    case 'noTarget':
      return [prose('senza un importo obiettivo')];
    case 'reached':
      return null;
  }
}

/** «Per arrivare a ogni scadenza servono 1531 € al mese in tutto; oggi ne versi 1300 €.» */
export function describeObiettiviFooter(overview: GoalsOverview): Narrative | null {
  const { dated } = overview.counts;
  if (dated === 0) return null;
  const out: Narrative = dated === 1 ? [prose('Per arrivare alla scadenza servono '), amount(overview.requiredMonthlyTotal), prose(' al mese; ')] : [prose('Per arrivare a ogni scadenza servono '), amount(overview.requiredMonthlyTotal), prose(' al mese in tutto; ')];
  if (overview.plannedMonthlyTotal > 0) out.push(prose('oggi ne versi '), amount(overview.plannedMonthlyTotal), prose('.'));
  else out.push(prose('oggi non versi nulla.'));
  return out;
}

// ─── Traiettoria ──────────────────────────────────────────────────────────────

/** «Con 700 € al mese e il 3,3% l'anno, » / «Senza versamenti, al 3,3% l'anno, ». */
function paceOpening(t: TrajectoryView, comma: boolean): Narrative {
  const rate = pctDecimals(t.annualReturn);
  const end = comma ? ', ' : ' ';
  if (t.plannedMonthly > 0) return [prose('Con '), amount(t.plannedMonthly), prose(` al mese e ${articleForPercent(t.annualReturn, rate)}`), pct(t.annualReturn), prose(` l'anno${end}`)];
  if (t.annualReturn > 0) return [prose(`Senza versamenti, ${atThePercent(t.annualReturn, rate)}`), pct(t.annualReturn), prose(` l'anno${end}`)];
  return [prose(`Senza versamenti e senza rendimento${comma ? ',' : ''} `)];
}

/** The reading line of the Traiettoria tile, one shape per verdict. */
export function describeTraiettoria(t: TrajectoryView): Narrative {
  if (t.verdict === 'noTarget' || t.targetAmount === null) {
    return [prose(`${t.name} non ha un importo obiettivo: senza un target non c'è una traiettoria da misurare.`)];
  }
  if (t.verdict === 'reached') return [prose(`${t.name} ha raggiunto i `), amount(t.targetAmount), prose(' del target.')];

  if (t.verdict === 'noDeadline') {
    if (t.projectedDate) return [...paceOpening(t, false), prose(`${t.name} raggiunge i `), amount(t.targetAmount), prose(` ${atDate(t.projectedDate)}; non ha una scadenza.`)];
    return [...paceOpening(t, false), prose(`${t.name} non raggiunge i `), amount(t.targetAmount), prose(': nessuna data.')];
  }

  // Dated: on track or late.
  if (t.monthsToDeadline === 0 && t.deadline) {
    const out: Narrative = [prose(`La scadenza di ${formatGoalDate(t.deadline)} è passata con ${t.name} a `), amount(t.currentValue)];
    if (t.gapAtDeadline !== null && t.gapAtDeadline > 0) out.push(prose(', '), amount(t.gapAtDeadline), prose(' sotto il target di '), amount(t.targetAmount));
    out.push(prose(t.projectedDate ? `; al ritmo attuale arriva ${atDate(t.projectedDate)}.` : '.'));
    return out;
  }

  const out: Narrative = [...paceOpening(t, true)];
  if (t.deadline) out.push(prose(`${atDate(t.deadline)} `));
  out.push(prose(`${t.name} arriva a `), amount(t.projectedAtDeadline ?? t.currentValue));
  const gap = t.gapAtDeadline ?? 0;
  if (gap > 0) {
    out.push(prose(', '), amount(gap), prose(' sotto il target di '), amount(t.targetAmount), prose(': servono '), amount(t.requiredMonthly ?? 0), prose(' al mese.'));
  } else {
    out.push(prose(', '), amount(-gap), prose(' oltre il target di '), amount(t.targetAmount), prose(t.projectedDate ? `; lo raggiungi ${atDate(t.projectedDate)}.` : '.'));
  }
  return out;
}

/** The tile's one figure: what the goal is worth at the deadline, else when it arrives, else what it holds. */
export function resolveTraiettoriaHero(t: TrajectoryView): { label: string; value: string } | null {
  if (t.verdict === 'noTarget' || t.targetAmount === null) return null;
  if ((t.verdict === 'onTrack' || t.verdict === 'offTrack') && t.deadline && t.monthsToDeadline !== 0 && t.projectedAtDeadline !== null) {
    return { label: `Valore previsto ${atDate(t.deadline)}`, value: formatAmount(t.projectedAtDeadline) };
  }
  if (t.verdict === 'noDeadline' && t.projectedDate) return { label: 'Arrivo al ritmo attuale', value: formatGoalDate(t.projectedDate) };
  return { label: 'Valore assegnato', value: formatAmount(t.currentValue) };
}

export interface TraiettoriaChip {
  value: string;
  words?: string;
  caption: string;
}

/** The grouped chips under the hero: the pace paid, the pace required, the months left, the return. */
export function buildTraiettoriaChips(t: TrajectoryView): TraiettoriaChip[] {
  const chips: TraiettoriaChip[] = [{ value: formatAmount(t.plannedMonthly), words: '/mese', caption: 'versi oggi' }];
  if (t.requiredMonthly !== null && t.monthsToDeadline !== 0) chips.push({ value: formatAmount(t.requiredMonthly), words: '/mese', caption: 'richiesti per la scadenza' });
  if (t.deadline && t.monthsToDeadline !== null && t.monthsToDeadline > 0) chips.push({ value: String(t.monthsToDeadline), words: plural(t.monthsToDeadline, 'mese', 'mesi'), caption: atDate(t.deadline) });
  chips.push({ value: formatPct(t.annualReturn), caption: 'rendimento atteso' });
  return chips;
}

/** Where the return comes from, and what the dashed lines are. */
export function describeTraiettoriaFooter(t: TrajectoryView): Narrative {
  const out: Narrative = [];
  if (t.allocation.length > 0) {
    out.push(prose("Rendimento nominale dall'allocazione consigliata ("));
    t.allocation.forEach((share, index) => {
      if (index > 0) out.push(prose(', '));
      out.push(pct(share.pct), prose(` ${share.label.toLowerCase()}`));
    });
    out.push(prose('): una stima, non un consiglio.'));
  } else {
    out.push(prose(`Rendimento nominale ${ofThePercent(t.annualReturn, pctDecimals(t.annualReturn))}`), pct(t.annualReturn), prose(" l'anno, il valore predefinito senza un'allocazione consigliata: una stima, non un consiglio."));
  }
  out.push(prose(t.deadline ? ' Tratteggiata orizzontale: il target; verticale: la scadenza.' : ' Tratteggiata orizzontale: il target.'));
  return out;
}

// ─── Milestone ────────────────────────────────────────────────────────────────

export const MILESTONE_ASIDE = 'al ritmo attuale';

export const MILESTONE_FOOTER: Narrative = [prose('Date proiettate ai versamenti e ai rendimenti attesi di oggi; un obiettivo senza versamenti né rendimento non ha una data.')];

/** «Il prossimo traguardo è Auto a gennaio 2028; Casa arriva a settembre 2030, 15 mesi oltre la scadenza.» */
export function describeMilestone(entries: MilestoneEntry[]): Narrative {
  if (entries.length === 0) return [prose('Nessun obiettivo con un importo da raggiungere.')];
  const dated = entries.filter((e) => e.kind === 'dated' && e.date);
  if (dated.length === 0) {
    return [prose(entries.some((e) => e.kind === 'never') ? 'Nessun obiettivo ha una data al ritmo attuale.' : 'Ogni obiettivo con un importo è già raggiunto.')];
  }

  const next = dated[0];
  const late = dated.find((e) => e.monthsPastDeadline !== null);
  const out: Narrative = [prose(`Il prossimo traguardo è ${next.name} ${atDate(next.date!)}`)];

  if (late && late === next) {
    out.push(prose(', '), count(late.monthsPastDeadline!), prose(` ${plural(late.monthsPastDeadline!, 'mese', 'mesi')} oltre la scadenza.`));
  } else if (late) {
    out.push(prose(`; ${late.name} arriva ${atDate(late.date!)}, `), count(late.monthsPastDeadline!), prose(` ${plural(late.monthsPastDeadline!, 'mese', 'mesi')} oltre la scadenza.`));
  } else if (dated.length > 1) {
    const last = dated[dated.length - 1];
    out.push(prose(`; l'ultimo ${last.name} ${atDate(last.date!)}.`));
  } else {
    out.push(prose('.'));
  }
  return out;
}

/** The note under a milestone row: the lateness, or the absence of a date. Null when in time. */
export function describeMilestoneNote(entry: MilestoneEntry): string | null {
  if (entry.kind === 'never') return 'mai, al ritmo attuale';
  if (entry.monthsPastDeadline !== null && entry.deadline) {
    return `${entry.monthsPastDeadline} ${plural(entry.monthsPastDeadline, 'mese', 'mesi')} dopo la scadenza di ${formatGoalDate(entry.deadline)}`;
  }
  return null;
}

// ─── Allocazione derivata ─────────────────────────────────────────────────────

export const ALLOCAZIONE_DERIVATA_ASIDE = 'gap × priorità';

export const ALLOCAZIONE_DERIVATA_FOOTER: Narrative = [
  prose('È il target che Allocazione usa: peso = gap × priorità (Alta '),
  figure('3×'),
  prose(' · Media '),
  figure('2×'),
  prose(' · Bassa '),
  figure('1×'),
  prose('); i raggiunti non pesano.'),
];

/**
 * «Gli obiettivi da colmare chiedono il 65% in obbligazioni, il 26,2% in azioni e l'8,8% in
 * liquidità; le quote assegnate sono al 64,6%, 6,2% e 29,2%.» — the derived target largest
 * first, the assigned shares in the same order, and a class only the quotas hold named as such.
 */
export function describeAllocazioneDerivata(view: DerivedAllocationView): Narrative {
  const asked = view.rows.filter((r) => r.derivedPct > 0).sort((a, b) => b.derivedPct - a.derivedPct);
  const unasked = view.rows.filter((r) => r.derivedPct <= 0 && r.assignedPct > 0);

  const out: Narrative = [prose('Gli obiettivi da colmare chiedono ')];
  out.push(...joinList(asked.map((r) => [prose(articleForPercent(r.derivedPct, pctDecimals(r.derivedPct))), pct(r.derivedPct), prose(` in ${r.label.toLowerCase()}`)])));
  out.push(prose(`; le quote assegnate sono ${atThePercent(asked[0]?.assignedPct ?? 0, pctDecimals(asked[0]?.assignedPct ?? 0))}`));
  out.push(...joinList(asked.map((r) => [pct(r.assignedPct)])));
  if (unasked.length > 0) {
    out.push(prose(', più '));
    out.push(...joinList(unasked.map((r) => [prose(articleForPercent(r.assignedPct, pctDecimals(r.assignedPct))), pct(r.assignedPct), prose(` in ${r.label.toLowerCase()}`)])));
    out.push(prose(' che nessun obiettivo chiede'));
  }
  out.push(prose('.'));
  return out;
}

// ─── Assegnazioni ─────────────────────────────────────────────────────────────

/** «111.400 € assegnati con 7 quote su 6 strumenti; 116.600 € (il 51,1% del patrimonio) restano liberi su 5 strumenti.» */
export function describeAssegnazioni(view: AssignmentsView): Narrative {
  if (view.assignedTotal <= 0) {
    return [prose('Nessuna quota assegnata: '), amount(view.freeTotal), prose(' liberi su '), count(view.totalInstrumentCount), prose(` ${plural(view.totalInstrumentCount, 'strumento', 'strumenti')}.`)];
  }
  const out: Narrative = [amount(view.assignedTotal), prose(' assegnati con '), count(view.quotaCount), prose(` ${plural(view.quotaCount, 'quota', 'quote')} su `), count(view.instrumentCount), prose(` ${plural(view.instrumentCount, 'strumento', 'strumenti')}; `)];
  if (view.freeTotal > 0) {
    out.push(amount(view.freeTotal));
    if (view.freeShare !== null) out.push(prose(` (${articleForPercent(view.freeShare, pctDecimals(view.freeShare))}`), pct(view.freeShare), prose(' del patrimonio)'));
    out.push(prose(' restano liberi su '), count(view.freeInstrumentCount), prose(` ${plural(view.freeInstrumentCount, 'strumento', 'strumenti')}.`));
  } else {
    out.push(prose('tutto il patrimonio è assegnato.'));
  }
  return out;
}

/** «8 strumenti · 7 quote». */
export function describeAssegnazioniAside(view: AssignmentsView): string {
  return `${view.totalInstrumentCount} ${plural(view.totalInstrumentCount, 'strumento', 'strumenti')} · ${view.quotaCount} ${plural(view.quotaCount, 'quota', 'quote')}`;
}

/** The footer explains what a quota is — or, in the warning tone, names an instrument past 100%. */
export function describeAssegnazioniFooter(view: AssignmentsView): { narrative: Narrative; tone: 'neutral' | 'warning' } {
  if (view.overAssigned.length === 1) {
    const [over] = view.overAssigned;
    return { tone: 'warning', narrative: [prose(`${over.name} è assegnato ${atThePercent(over.percentage, 0)}`), pct(over.percentage), prose(': riduci una quota, il limite è il '), pct(100), prose('.')] };
  }
  if (view.overAssigned.length > 1) {
    return { tone: 'warning', narrative: [prose(`${joinNames(view.overAssigned.map((o) => o.name))} sono assegnati oltre il `), pct(100), prose(': riduci una quota.')] };
  }
  return { tone: 'neutral', narrative: [prose('Una quota è la percentuale del valore di uno strumento; lo stesso strumento può servire più obiettivi fino al '), pct(100), prose('.')] };
}

// ─── Dettaglio ────────────────────────────────────────────────────────────────

export const DETTAGLIO_DESCRIPTION = 'Dove indirizzare il prossimo versamento, e come funziona il calcolo';

/** «Con 1000 € in più, 732 € vanno a Casa, 192 € a Studi figli e 76 € ad Auto.» */
export function describeVersamento(slices: GoalContributionSlice[], contribution: number): Narrative {
  if (contribution <= 0) return [prose('Inserisci un importo per vedere come ripartirlo tra gli obiettivi sotto target.')];
  if (slices.length === 0) return [prose('Nessun obiettivo con un importo ancora da colmare: i '), amount(contribution), prose(' non hanno una destinazione.')];
  const out: Narrative = [prose('Con '), amount(contribution), prose(' in più, ')];
  out.push(...joinList(slices.map((slice, index) => [amount(slice.add), prose(`${index === 0 ? ' vanno' : ''} ${toName(slice.goalName)}`)])));
  out.push(prose('.'));
  return out;
}

export const EXPLAINER: { title: string; body: string }[] = [
  {
    title: 'Il verdetto',
    body: 'Per ogni obiettivo con un importo e una scadenza il valore assegnato oggi cresce al rendimento atteso, più il versamento mensile, fino alla scadenza: se il valore così proiettato copre il target (con l\'1% di tolleranza) l\'obiettivo è in rotta, altrimenti è in ritardo e la pagina dice quanto servirebbe al mese. Un obiettivo senza scadenza non può essere in ritardo: ha solo una data di arrivo, o nessuna.',
  },
  {
    title: 'Il rendimento atteso',
    body: 'È la media, pesata sull\'allocazione consigliata dell\'obiettivo, di rendimenti nominali prudenti per classe (azioni 7%, obbligazioni 2,5%, liquidità 1%, immobili 4%, materie prime 3%, criptovalute 12%); senza un\'allocazione consigliata vale il 4%. È una stima indicativa, non un consiglio finanziario.',
  },
  {
    title: 'Le quote e l\'allocazione derivata',
    body: 'Una quota è la percentuale del valore di uno strumento assegnata a un obiettivo; lo stesso strumento può servire più obiettivi fino al 100%. Con l\'allocazione da obiettivi attiva, il target della pagina Allocazione è la media delle allocazioni consigliate pesata su quanto manca a ciascun obiettivo per la sua priorità (Alta 3× · Media 2× · Bassa 1×); gli obiettivi raggiunti non pesano.',
  },
];
