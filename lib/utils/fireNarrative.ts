/**
 * FIRE › Calcolatore's words: the verdict that answers «quando?» before any number, and the
 * reading line under each tile of that tab.
 *
 * Same design as the other `*Narrative.ts` modules: every function is pure and returns a
 * `Narrative` (segments flagged `mono`) rendered by `NarrativeText`; the phrasings are pinned by
 * tests, and a sentence never claims what the data cannot support — a missing input drops its
 * clause, never a placeholder (DESIGN.md → The Narrative Honesty Rule).
 *
 * Two things this page must keep straight. A projection is neither a gain nor a loss, so no
 * figure here carries a sign colour — the only signed figure on the page is the current
 * withdrawal rate against the SWR, and that lives in the tile, not in the prose. And the passive
 * income at the FIRE year is a NOMINAL figure: the sentence gives it beside today's expenses and
 * names the inflation that separates them, so «2.667 €» can never be read as «more than my
 * expenses» (the reviewer of the canvas read it exactly that way).
 *
 * Percentages go through chartService's it-IT formatter (comma decimals), currency through
 * `cachedFormatCurrencyEUR` (no-break space before €) — AGENTS.md → Italian Localization.
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { articleForPercent } from '@/lib/utils/patrimonioNarrative';
import type { Narrative, NarrativeSegment, PageVerdictModel } from '@/lib/utils/narrative';
import type { FIREProjectionScenarios } from '@/types/assets';
import type { FanVerdict, FireLock, FireTarget, FireTimeline, PassiveIncome, ScenarioRow } from '@/lib/utils/fireSummary';

// ─── Formatting helpers ───────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/** An euro amount without cents, set in mono and uncoloured: a projection is neither a gain nor a loss. */
function amount(value: number): NarrativeSegment {
  return figure(cachedFormatCurrencyEUR(Math.round(Math.abs(value)), true));
}

/** «4%», «2,5%» — a rate as the user typed it: no trailing decimals when whole. */
function rate(value: number): NarrativeSegment {
  return figure(formatRate(value));
}

function formatRate(value: number): string {
  return `${value.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
}

function percent(value: number, decimals = 1): NarrativeSegment {
  return figure(formatPercentage(Math.abs(value), decimals));
}

function year(value: number): NarrativeSegment {
  return figure(String(value));
}

/** «14,9 anni» / «1 anno». */
function years(value: number, decimals = 1): string {
  const printed = value.toLocaleString('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${printed} ${printed === '1' || printed === '1,0' ? 'anno' : 'anni'}`;
}

function integer(value: number): string {
  return value.toLocaleString('it-IT', { maximumFractionDigits: 0 });
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface FireVerdictInput {
  /** A positive FIRE-eligible net worth exists. */
  hasNetWorth: boolean;
  /** Null when there is no FIRE number (no expenses in the cashflow year the page runs on). */
  target: FireTarget | null;
  /** Null when the projection cannot run. */
  timeline: FireTimeline | null;
  monthlySavings: number;
  swr: number;
  /** Today's sustainable monthly allowance — the reached verdict compares it with the expenses. */
  monthlyAllowance: number;
  lock: FireLock;
}

/** « al numero FIRE di 604.000 € (modello ponte)» */
function targetClause(target: FireTarget): Narrative {
  return [prose(' al numero FIRE di '), amount(target.fireNumber), ...(target.isBridge ? [prose(' (modello ponte)')] : [])];
}

/** « Il fondo pensione, 48.000 €, resta bloccato fino al 2050 e non conta nel patrimonio di oggi.» */
function lockSentence(lock: FireLock): Narrative {
  if (!lock.active || lock.lockedValue <= 0 || lock.unlockCalendarYear === null) return [];
  const plural = lock.lockedFundCount > 1;
  return [
    prose(plural ? ' I fondi pensione, ' : ' Il fondo pensione, '),
    amount(lock.lockedValue),
    prose(plural ? ', restano bloccati fino al ' : ', resta bloccato fino al '),
    year(lock.unlockCalendarYear),
    prose(plural ? ' e non contano nel patrimonio di oggi.' : ' e non conta nel patrimonio di oggi.'),
  ];
}

/** «al ritmo di 1.850 € al mese ci arrivi nel » / «senza nuovi risparmi, con la sola crescita del 7%, ci arrivi nel » */
function paceClause(monthlySavings: number, growthRate: number): Narrative {
  if (monthlySavings > 0) return [prose('al ritmo di '), amount(monthlySavings), prose(' al mese ci arrivi nel ')];
  return [prose('senza nuovi risparmi, con la sola crescita del '), rate(growthRate), prose(', ci arrivi nel ')];
}

/**
 * «, e da allora il 4% del patrimonio copre le tue spese: 2.300 € al mese di oggi, 2.667 € del 2032
 * con l'inflazione al 2,5%». Under the bridge model, when the FIRE year comes BEFORE the unlock,
 * it is the free assets that cover the expenses until the fund re-enters — the 4% of a net worth
 * that does not yet include the fund would not — and the clause says so.
 */
function passiveIncomeClause(timeline: FireTimeline, swr: number, bridgeUntil: number | null): Narrative {
  const head: Narrative =
    bridgeUntil !== null
      ? [prose(', e da allora gli asset liberi coprono le tue spese fino al '), year(bridgeUntil), prose(', poi rientra il fondo pensione')]
      : [prose(', e da allora il '), rate(swr), prose(' del patrimonio copre le tue spese')];
  const atFire = timeline.monthlyExpensesAtFire;
  const sameMoney = atFire === null || Math.abs(atFire - timeline.monthlyExpensesToday) < 0.5;
  if (sameMoney) return [...head, prose(', '), amount(timeline.monthlyExpensesToday), prose(' al mese')];
  return [
    ...head,
    prose(': '),
    amount(timeline.monthlyExpensesToday),
    prose(' al mese di oggi, '),
    amount(atFire),
    prose(` del ${timeline.calendarYear} con l'inflazione al `),
    rate(timeline.inflationRate),
  ];
}

export function buildFireVerdict(input: FireVerdictInput): PageVerdictModel {
  if (!input.hasNetWorth) {
    return {
      headline: 'Nessun patrimonio FIRE.',
      tone: 'neutral',
      sentence: [prose('Aggiungi asset con un valore positivo: il calcolatore parte dal patrimonio che può sostenere i prelievi.')],
    };
  }
  const { target } = input;
  if (!target) {
    return {
      headline: 'Numero FIRE non calcolabile.',
      tone: 'neutral',
      sentence: [prose('Servono spese registrate nel Cashflow: il numero FIRE è spese annue ÷ SWR.')],
    };
  }

  if (target.reached) {
    const monthlyExpenses = input.timeline?.monthlyExpensesToday ?? null;
    return {
      headline: 'Sei già FIRE.',
      tone: 'positive',
      sentence: [
        prose('Il patrimonio FIRE di '),
        amount(target.netWorth),
        prose(' supera il numero FIRE di '),
        amount(target.fireNumber),
        prose(': al '),
        rate(input.swr),
        prose(' rende '),
        amount(input.monthlyAllowance),
        prose(' al mese'),
        ...(monthlyExpenses !== null ? [prose(', contro spese di '), amount(monthlyExpenses)] : []),
        prose('.'),
        ...lockSentence(input.lock),
      ],
    };
  }

  const opening: Narrative = [prose('Ti mancano '), amount(target.gap), ...targetClause(target), prose('; ')];
  const { timeline } = input;

  if (!timeline) {
    return {
      headline: 'Proiezione non disponibile.',
      tone: 'neutral',
      sentence: [...opening, prose('senza il cashflow di un anno non posso stimare quando ci arrivi.'), ...lockSentence(input.lock)],
    };
  }

  if (timeline.yearsToFire === null || timeline.calendarYear === null) {
    const pace: Narrative =
      input.monthlySavings > 0 ? [prose('al ritmo di '), amount(input.monthlySavings), prose(' al mese, ')] : [prose('senza nuovi risparmi, ')];
    return {
      headline: `FIRE oltre i ${timeline.horizonYears} anni.`,
      tone: 'warning',
      sentence: [
        ...opening,
        ...pace,
        prose('con crescita del '),
        rate(timeline.growthRate),
        prose(' e inflazione al '),
        rate(timeline.inflationRate),
        prose(', il traguardo non arriva entro il '),
        year(timeline.horizonCalendarYear),
        prose('.'),
        ...lockSentence(input.lock),
      ],
    };
  }

  const ageClause: Narrative = timeline.ageAtFire !== null ? [prose(', a '), figure(`${timeline.ageAtFire} anni`)] : [];
  const bridgeUntil =
    target.isBridge && input.lock.unlockCalendarYear !== null && timeline.calendarYear < input.lock.unlockCalendarYear
      ? input.lock.unlockCalendarYear
      : null;
  return {
    headline: `FIRE nel ${timeline.calendarYear}${timeline.ageAtFire !== null ? `, a ${timeline.ageAtFire} anni` : ''}.`,
    tone: 'neutral',
    sentence: [
      ...opening,
      ...paceClause(input.monthlySavings, timeline.growthRate),
      year(timeline.calendarYear),
      ...ageClause,
      ...passiveIncomeClause(timeline, input.swr, bridgeUntil),
      prose('.'),
      ...lockSentence(input.lock),
    ],
  };
}

// ─── Traguardo ────────────────────────────────────────────────────────────────

/** «Sei al 68,3% del numero FIRE: 412.500 € su 604.000 €, ne mancano 191.500 €.» */
export function describeTarget(target: FireTarget): Narrative {
  if (target.reached) {
    return [
      prose('Hai superato il numero FIRE: '),
      amount(target.netWorth),
      prose(' su '),
      amount(target.fireNumber),
      prose(`, ${articleForPercent(target.progressPct)}`),
      percent(target.progressPct),
      prose('.'),
    ];
  }
  return [
    prose('Sei al '),
    percent(target.progressPct),
    prose(' del numero FIRE: '),
    amount(target.netWorth),
    prose(' su '),
    amount(target.fireNumber),
    prose(', ne mancano '),
    amount(target.gap),
    prose('.'),
  ];
}

/** The caption under the hero number: its formula, or what the bridge changes. */
export function describeTargetCaption(target: FireTarget, annualExpenses: number): Narrative {
  const swr = annualExpenses > 0 && target.standardFireNumber > 0 ? (annualExpenses / target.standardFireNumber) * 100 : 0;
  if (!target.isBridge) {
    return [amount(annualExpenses), prose(' di spese ÷ SWR del '), rate(swr)];
  }
  return [
    prose('modello ponte: gli asset liberi coprono le spese fino allo sblocco, poi il fondo rientra; senza il vincolo sarebbe '),
    amount(target.standardFireNumber),
  ];
}

export type ProjectionView = 'scenari' | 'ventaglio';

export interface TargetFooterInput {
  view: ProjectionView;
  /** The fan's verdict while the Ventaglio view is open; null before it runs. */
  fan: FanVerdict | null;
  /** False when the portfolio has no allocation in the four Monte Carlo classes. */
  fanAvailable: boolean;
  lock: FireLock;
  simulationCount: number;
  allocationLabel: string;
  /** The last calendar year the Scenari chart draws — the step is named only when it is on the plot. */
  lastProjectedYear: number | null;
}

/** The Traguardo footer: the chart's legend in words (Scenari) or the fan's one number (Ventaglio). */
export function describeTargetFooter(input: TargetFooterInput): Narrative | null {
  if (input.view === 'scenari') {
    // The walk stops five years after the last scenario reaches FIRE: an unlock beyond that year
    // is real but not drawn, and a footer that named a step the plot does not show would lie.
    const stepOnPlot =
      input.lock.active &&
      input.lock.lockedValue > 0 &&
      input.lock.unlockCalendarYear !== null &&
      input.lastProjectedYear !== null &&
      input.lock.unlockCalendarYear <= input.lastProjectedYear;
    const step: Narrative = stepOnPlot
      ? [prose(' Il gradino nel '), year(input.lock.unlockCalendarYear as number), prose(' è il fondo pensione che rientra.')]
      : [];
    return [prose("Linea tratteggiata: il numero FIRE dello scenario base, che cresce con l'inflazione; il risparmio si ferma al FIRE."), ...step];
  }
  if (!input.fanAvailable) {
    return [prose("Il ventaglio richiede un'allocazione in azioni, obbligazioni, immobili o materie prime.")];
  }
  if (!input.fan) return null;
  const inflows: Narrative =
    input.lock.active && input.lock.lockedValue > 0 ? [prose(" Il fondo pensione entra all'anno di sblocco al valore di oggi.")] : [];
  return [
    prose('Probabilità di FIRE entro il '),
    year(input.fan.calendarYear),
    prose(input.fan.onHorizon ? ' (orizzonte della simulazione): ' : ': '),
    figure(`${input.fan.probabilityPct}%`),
    prose(` su ${integer(input.simulationCount)} percorsi con l'allocazione attuale (${input.allocationLabel}).`),
    ...inflows,
  ];
}

// ─── Base di calcolo ──────────────────────────────────────────────────────────

export interface FireBase {
  netWorth: number;
  annualExpenses: number;
  monthlyExpenses: number;
  annualSavings: number;
  monthlySavings: number;
  swr: number;
  referenceYear: number | null;
  isAnnualized: boolean;
  includesResidence: boolean;
}

/** «Calcolato su 412.500 € di patrimonio, spese di 27.600 € l'anno e un SWR del 4%.» */
export function describeBase(base: FireBase): Narrative {
  return [
    prose('Calcolato su '),
    amount(base.netWorth),
    prose(' di patrimonio, spese di '),
    amount(base.annualExpenses),
    prose(" l'anno e un SWR del "),
    rate(base.swr),
    prose('.'),
  ];
}

/** «cashflow 2025» / «cashflow 2026, annualizzato» — the window the expenses and savings come from. */
export function describeBaseAside(base: Pick<FireBase, 'referenceYear' | 'isAnnualized'>): string | null {
  if (base.referenceYear === null) return null;
  return `cashflow ${base.referenceYear}${base.isAnnualized ? ', annualizzato' : ''}`;
}

export function describeBaseFooter(includesResidence: boolean): Narrative {
  return [prose(`Casa di abitazione ${includesResidence ? 'inclusa' : 'esclusa'}; SWR, casa e regola RITA si modificano in Parametri.`)];
}

/** The caption under the pension-lock switch: what is locked, until when, and by which rule. */
export function describeLock(lock: FireLock): Narrative {
  if (!lock.active) return [prose('Il fondo pensione conta nel patrimonio di oggi.')];
  if (lock.lockedValue <= 0 || lock.unlockCalendarYear === null) {
    return lock.unmodellableCount > 0
      ? [prose('Nessun fondo bloccato: manca la tua età (in Coast FIRE) o una data di sblocco sul fondo.')]
      : [prose('Nessun fondo pensione risulta bloccato.')];
  }
  const rule =
    lock.source === 'rita' && lock.unlockAge !== null
      ? [prose(', a '), figure(`${lock.unlockAge} anni`), prose(' (regola RITA)')]
      : lock.source === 'override'
        ? [prose(' (data impostata sul fondo)')]
        : [prose(' (date sui fondi e regola RITA)')];
  const unmodelled: Narrative =
    lock.unmodellableCount > 0
      ? [prose(lock.unmodellableCount === 1 ? '; un fondo senza età né data resta non bloccato' : `; ${lock.unmodellableCount} fondi senza età né data restano non bloccati`)]
      : [];
  return [amount(lock.lockedValue), prose(' fino al '), year(lock.unlockCalendarYear), ...rule, ...unmodelled];
}

// ─── Reddito passivo ──────────────────────────────────────────────────────────

/** «Oggi il patrimonio renderebbe 1.375 € al mese, il 60% delle spese; copre 14,9 anni di spesa, 9,4 con i soli liquidi.» */
export function describePassiveIncome(income: PassiveIncome): Narrative {
  const out: Narrative = [prose('Oggi il patrimonio renderebbe '), amount(income.monthly), prose(' al mese')];
  if (income.shareOfExpensesPct !== null) {
    out.push(prose(`, ${articleForPercent(income.shareOfExpensesPct, 0)}`), percent(income.shareOfExpensesPct, 0), prose(' delle spese'));
  }
  if (income.yearsOfExpenses > 0) {
    out.push(prose('; copre '), figure(years(income.yearsOfExpenses)), prose(' di spesa'));
    if (income.liquidYears > 0) {
      out.push(prose(', '), figure(income.liquidYears.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })), prose(' con i soli liquidi'));
    }
  }
  out.push(prose('.'));
  return out;
}

// ─── Scenari ──────────────────────────────────────────────────────────────────

const HORIZON_YEARS = 50;

/** «Nel base il FIRE arriva nel 2032; l'orso lo sposta al 2036, il toro lo anticipa al 2030.» */
export function describeScenarios(rows: ScenarioRow[]): Narrative {
  const bear = rows.find((row) => row.key === 'bear');
  const base = rows.find((row) => row.key === 'base');
  const bull = rows.find((row) => row.key === 'bull');
  if (!bear || !base || !bull) return [];

  if (base.calendarYear === null && bear.calendarYear === null && bull.calendarYear === null) {
    return [prose(`In nessuno scenario il FIRE arriva entro ${HORIZON_YEARS} anni.`)];
  }

  if (base.calendarYear === null) {
    const out: Narrative = [prose(`Nel base il FIRE non arriva entro ${HORIZON_YEARS} anni; `)];
    out.push(...(bear.calendarYear === null ? [prose("nemmeno nell'orso")] : [prose("l'orso lo raggiunge nel "), year(bear.calendarYear)]));
    out.push(...(bull.calendarYear === null ? [prose(', nemmeno il toro.')] : [prose(', il toro lo raggiunge nel '), year(bull.calendarYear), prose('.')]));
    return out;
  }

  // The verb follows the COMPARISON with the base year, never the scenario's name: the user edits
  // the parameters, and a «toro» with 8% inflation can land after the base.
  const baseYear = base.calendarYear;
  const relative = (row: ScenarioRow, subject: string): Narrative => {
    if (row.calendarYear === null) return [prose(`${subject} non ci arriva entro ${HORIZON_YEARS} anni`)];
    if (row.calendarYear === baseYear) return [prose(`${subject} lo lascia al `), year(row.calendarYear)];
    const moves = row.calendarYear < baseYear ? 'anticipa' : 'sposta';
    return [prose(`${subject} lo ${moves} al `), year(row.calendarYear)];
  };

  return [
    prose('Nel base il FIRE arriva nel '),
    year(baseYear),
    prose('; '),
    ...relative(bear, "l'orso"),
    prose(', '),
    ...relative(bull, 'il toro'),
    prose('.'),
  ];
}

export function describeScenariosFooter(): Narrative {
  return [
    prose(
      "Ogni anno il patrimonio cresce del rendimento dello scenario e riceve il risparmio finché il FIRE non è raggiunto; le spese crescono con l'inflazione dello scenario.",
    ),
  ];
}

// ─── Disclosures ──────────────────────────────────────────────────────────────

export interface ParametriDescriptionInput {
  swr: number;
  includesResidence: boolean;
  lockActive: boolean;
  inpsRetirementAge: number;
  ritaUnlockAge: number;
  scenarios: FIREProjectionScenarios;
}

function scenarioPair(params: { growthRate: number; inflationRate: number }): string {
  const one = (value: number) => value.toLocaleString('it-IT', { maximumFractionDigits: 2 });
  return `${one(params.growthRate)}/${one(params.inflationRate)}`;
}

/** The Parametri disclosure's description: every saved setting, in one line. */
export function describeParametri(input: ParametriDescriptionInput): string {
  return [
    `SWR ${formatRate(input.swr)}`,
    `casa di abitazione ${input.includesResidence ? 'inclusa' : 'esclusa'}`,
    input.lockActive ? `fondo pensione bloccato (INPS ${input.inpsRetirementAge}, RITA a ${input.ritaUnlockAge})` : 'fondo pensione non vincolato',
    `scenari ${scenarioPair(input.scenarios.bear)} · ${scenarioPair(input.scenarios.base)} · ${scenarioPair(input.scenarios.bull)}`,
  ].join(' · ');
}

export interface DettaglioDescriptionInput {
  runwayYears: number | null;
  /** Change of the runway against twelve months earlier, in years. */
  runwayDelta: number | null;
}

/** The Dettaglio disclosure's description: what it holds, each with its one figure when known. */
export function describeDettaglio(input: DettaglioDescriptionInput): string {
  const parts: string[] = [];
  if (input.runwayYears !== null) {
    const delta = input.runwayDelta !== null ? `, ${signedYears(input.runwayDelta)} in 12 mesi` : '';
    parts.push(`Runway storica (${years(input.runwayYears)}${delta})`);
  } else {
    parts.push('Runway storica');
  }
  parts.push('Cashflow e reddito passivo', 'Come funziona il FIRE');
  return parts.join(' · ');
}

/** «+1,2» / «−0,4» — a change in years, typographic minus. */
function signedYears(delta: number): string {
  const printed = Math.abs(delta).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${delta < 0 ? '−' : '+'}${printed}`;
}

export function describeImpostazioni(hasUnsavedChanges: boolean): Narrative {
  return hasUnsavedChanges
    ? [prose('Anteprima non salvata: il verdetto e le tessere leggono i valori inseriti qui.')]
    : [prose("Salvate nel profilo: ogni modifica qui è un'anteprima finché non la salvi.")];
}

export function describeScenarioParams(): Narrative {
  return [prose('Tre ipotesi di mercato: il verdetto usa il base, il grafico del Traguardo le disegna tutte e tre.')];
}

/**
 * Under the RITA controls: the unlock they imply — «Sblocco stimato con la regola RITA: 2050, a
 * 62 anni.» — or, without a user age, what is missing to estimate it. The per-fund override is
 * the Base di calcolo caption's business (`describeLock`), not this line's.
 */
export function describeRitaPreview(input: { ritaUnlockAge: number; unlockCalendarYear: number | null; alreadyUnlockable: boolean }): Narrative {
  if (input.alreadyUnlockable) {
    return [prose('Regola RITA a '), figure(`${input.ritaUnlockAge} anni`), prose(': hai già quell\'età, il fondo non risulta bloccato dalla regola.')];
  }
  if (input.unlockCalendarYear === null) {
    return [prose('Regola RITA a '), figure(`${input.ritaUnlockAge} anni`), prose(": imposta la tua età in Coast FIRE per stimare l'anno di sblocco.")];
  }
  return [prose('Sblocco stimato con la regola RITA: '), year(input.unlockCalendarYear), prose(', a '), figure(`${input.ritaUnlockAge} anni`), prose('.')];
}

/** The reading of the cashflow history tile — a description of the chart, no figure to compute. */
export const CASHFLOW_CHART_READING: Narrative = [
  prose('Entrate, uscite e il reddito passivo che il patrimonio FIRE dello stesso mese avrebbe sostenuto al SWR.'),
];

/** The reading of the explainer tile. */
export const EXPLAINER_READING: Narrative = [prose('Le regole del calcolatore, in sei definizioni.')];

export interface RunwayReadingInput {
  years: number | null;
  liquidYears: number | null;
  delta: number | null;
  targetYears: number | null;
  /** The month of the latest point, already in words («luglio 2026»). */
  monthLabel: string | null;
  /** Points of the runway series: with points but no years, the last twelve months had no expenses. */
  pointCount: number;
}

/** «A luglio 2026 il patrimonio FIRE copre 14,9 anni di spese (rolling 12 mesi), 9,4 con i soli liquidi: +1,2 anni rispetto a 12 mesi fa, contro un obiettivo di 25 anni.» */
export function describeRunway(input: RunwayReadingInput): Narrative {
  if (input.years === null) {
    return input.pointCount > 0
      ? [prose('Nessuna spesa negli ultimi 12 mesi: la runway non è misurabile.')]
      : [prose('Servono almeno 12 snapshot mensili per la runway storica.')];
  }
  const out: Narrative = [
    prose(input.monthLabel ? `A ${input.monthLabel} il patrimonio FIRE copre ` : 'Il patrimonio FIRE copre '),
    figure(years(input.years)),
    prose(' di spese (rolling 12 mesi)'),
  ];
  if (input.liquidYears !== null && input.liquidYears > 0) {
    out.push(prose(', '), figure(input.liquidYears.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })), prose(' con i soli liquidi'));
  }
  const tail: Narrative = [];
  if (input.delta !== null) tail.push(prose(': '), figure(`${signedYears(input.delta)} anni`), prose(' rispetto a 12 mesi fa'));
  if (input.targetYears !== null) {
    tail.push(prose(tail.length > 0 ? ', contro un obiettivo di ' : ', contro un obiettivo di '), figure(years(input.targetYears, 0)));
  }
  out.push(...tail, prose('.'));
  return out;
}
