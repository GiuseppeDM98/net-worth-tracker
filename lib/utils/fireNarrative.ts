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
import type { FanVerdict, FireLock, FireTarget, FireTargetHonest, FireTimeline, PassiveIncome, ScenarioRow } from '@/lib/utils/fireSummary';
import type { FireYearDistribution, RetirementSurvival, TailLever } from '@/lib/utils/fireDistribution';

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

/** «4%», «3,5%» — the ONE rate formatter of the FIRE tab; the tiles import it (Rule of Three). */
export function formatRate(value: number): string {
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
  /** What is inside the number besides expenses ÷ SWR; absent = nothing declared. */
  honest?: FireTargetHonest;
}

/** «, tasse comprese» / «; dal 2060 la pensione statale ne copre 13.000 € l'anno». */
function honestClauses(honest: FireTargetHonest | undefined): { tax: Narrative; pension: Narrative } {
  if (!honest) return { tax: [], pension: [] };
  const tax: Narrative = honest.taxConsidered ? [prose(', tasse sui prelievi comprese')] : [];
  const pension: Narrative =
    honest.pensionsConsidered && honest.pensionStartCalendarYear !== null && honest.pensionNetAnnual > 0
      ? [
          prose(honest.pensionCount > 1 ? '; dal ' : '; dal '),
          year(honest.pensionStartCalendarYear),
          prose(honest.pensionCount > 1 ? ' le pensioni statali ne coprono ' : ' la pensione statale ne copre '),
          amount(honest.pensionNetAnnual),
          prose(" l'anno"),
        ]
      : [];
  return { tax, pension };
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
function passiveIncomeClause(timeline: FireTimeline, swr: number, bridgeUntil: number | null, honest?: FireTargetHonest): Narrative {
  const { tax, pension } = honestClauses(honest);
  const head: Narrative =
    bridgeUntil !== null
      ? [prose(', e da allora gli asset liberi coprono le tue spese fino al '), year(bridgeUntil), ...tax, prose(', poi rientra il fondo pensione')]
      : [prose(', e da allora il '), rate(swr), prose(' del patrimonio copre le tue spese'), ...tax];
  const atFire = timeline.monthlyExpensesAtFire;
  const sameMoney = atFire === null || Math.abs(atFire - timeline.monthlyExpensesToday) < 0.5;
  if (sameMoney) return [...head, prose(', '), amount(timeline.monthlyExpensesToday), prose(' al mese'), ...pension];
  return [
    ...head,
    prose(': '),
    amount(timeline.monthlyExpensesToday),
    prose(' al mese di oggi, '),
    amount(atFire),
    prose(` del ${timeline.calendarYear} con l'inflazione al `),
    rate(timeline.inflationRate),
    ...pension,
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
      ...passiveIncomeClause(timeline, input.swr, bridgeUntil, input.honest),
      prose('.'),
      ...lockSentence(input.lock),
    ],
  };
}

// ─── Nothing recorded: the four tiles keep their question ─────────────────────

export type FireEmptyKind = 'no-net-worth' | 'no-expenses';

export interface FireEmptyTiles {
  traguardo: string;
  base: string;
  /** Null when the Reddito passivo tile can still answer (a net worth exists, only the expenses are missing). */
  passiveIncome: string | null;
  scenarios: string;
  /** The ONE action of the page, owned by the Traguardo: the surface that owns the missing thing. */
  action: { label: string; href: string };
}

/**
 * The «nothing recorded» readings (DESIGN.md → The Absence-Has-Three-Names Rule): every tile
 * keeps its eyebrow and says why it cannot answer, and only the Traguardo offers the action —
 * until 2026-09-22 this state dropped the whole grid and linked nowhere.
 */
export function describeEmptyTiles(kind: FireEmptyKind): FireEmptyTiles {
  if (kind === 'no-net-worth') {
    return {
      traguardo: 'Il numero FIRE si misura contro il patrimonio: senza asset con un valore positivo non c\'è un traguardo da misurare.',
      base: 'La base è patrimonio, spese e SWR: manca il patrimonio.',
      passiveIncome: 'Il reddito passivo è il SWR del patrimonio: senza patrimonio non c\'è un prelievo da stimare.',
      scenarios: 'Gli scenari proiettano il patrimonio anno per anno: senza patrimonio non c\'è nulla da proiettare.',
      action: { label: 'Aggiungi il primo asset', href: '/dashboard/assets' },
    };
  }
  return {
    traguardo: 'Il numero FIRE è spese annue ÷ SWR: senza spese registrate nel Cashflow non c\'è un traguardo.',
    base: 'Il patrimonio c\'è; mancano le spese dell\'ultimo anno, che danno il numero FIRE e il ritmo.',
    passiveIncome: null,
    scenarios: 'Gli scenari partono dalle spese: senza spese non c\'è un numero FIRE da raggiungere.',
    action: { label: 'Registra le spese nel Cashflow', href: '/dashboard/cashflow' },
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

/** «, meno la pensione dal 2060, tasse sui prelievi comprese» — what the formula carries besides expenses ÷ SWR. */
function captionHonestClauses(honest: FireTargetHonest): Narrative {
  const out: Narrative = [];
  if (honest.pensionsConsidered && honest.pensionStartCalendarYear !== null) {
    out.push(prose(honest.pensionCount > 1 ? ', meno le pensioni dal ' : ', meno la pensione dal '), year(honest.pensionStartCalendarYear));
  }
  if (honest.taxConsidered) out.push(prose(', tasse sui prelievi comprese'));
  return out;
}

/**
 * The caption under the hero number: its formula, or what the bridge changes. The SWR is
 * `annualExpenses / standardFireNumber` only while nothing else is in the number; with the
 * pensions or the tax in, the rate is passed as the page reads it.
 */
export function describeTargetCaption(target: FireTarget, annualExpenses: number, swrPct?: number): Narrative {
  const swr = swrPct ?? (annualExpenses > 0 && target.standardFireNumber > 0 ? (annualExpenses / target.standardFireNumber) * 100 : 0);
  if (!target.isBridge) {
    return [amount(annualExpenses), prose(' di spese ÷ SWR del '), rate(swr), ...captionHonestClauses(target.honest)];
  }
  return [
    prose('modello ponte: gli asset liberi coprono le spese fino allo sblocco, poi il fondo rientra'),
    ...captionHonestClauses(target.honest),
    prose('; senza il vincolo sarebbe '),
    amount(target.standardFireNumber),
  ];
}

export type ProjectionView = 'scenari' | 'ventaglio' | 'distribuzione';

export interface TargetFooterInput {
  view: ProjectionView;
  /** The fan's verdict while the Ventaglio view is open; null before it runs. */
  fan: FanVerdict | null;
  /** The FIRE-year distribution while the Distribuzione view is open; null before the fan runs. */
  distribution?: FireYearDistribution | null;
  /** False when the portfolio has no allocation in the four Monte Carlo classes. */
  fanAvailable: boolean;
  lock: FireLock;
  simulationCount: number;
  allocationLabel: string;
  /** The last calendar year the Scenari chart draws — the step is named only when it is on the plot. */
  lastProjectedYear: number | null;
  /** What the dashed target carries besides expenses ÷ SWR; absent = nothing. */
  honest?: FireTargetHonest;
}

/**
 * The Traguardo footer: the chart's legend in words (Scenari), the fan's one number (Ventaglio),
 * or what the bars are (Distribuzione — the method sits behind «Come si calcola»).
 */
export function describeTargetFooter(input: TargetFooterInput): Narrative | null {
  if (input.view === 'distribuzione') {
    if (!input.fanAvailable) {
      return [prose("La distribuzione richiede un'allocazione in azioni, obbligazioni, immobili o materie prime.")];
    }
    const distribution = input.distribution ?? null;
    if (!distribution) return null;
    const inflows: Narrative =
      input.lock.active && input.lock.lockedValue > 0 ? [prose(" Il fondo pensione entra all'anno di sblocco al valore di oggi; fino ad allora il target è il numero del modello ponte.")] : [];
    const border: Narrative =
      distribution.baseCalendarYear !== null
        ? [prose('; il bordo segna la classe dell\'anno del base')]
        : [prose('; nessun bordo, perché nel base il FIRE non arriva entro l\'orizzonte')];
    const beyond: Narrative =
      distribution.neverCount > 0 ? [prose(', la classe grigia i percorsi che non ci arrivano entro il '), year(distribution.horizonCalendarYear)] : [];
    return [
      prose(`${integer(input.simulationCount)} percorsi con l'allocazione attuale (${input.allocationLabel}), stessi rendimenti a ogni confronto`),
      ...border,
      ...beyond,
      prose('.'),
      ...inflows,
    ];
  }
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
    // The dashed line is the requirement of each year (2026-09-24): expenses ÷ SWR grown with
    // the inflation when nothing else is in, less the pensions from their start, tax in, the
    // bridge until the unlock — the line says what it carries.
    const carries: string[] = [];
    if (input.honest?.pensionsConsidered) carries.push('meno le pensioni statali dal loro avvio');
    if (input.honest?.taxConsidered) carries.push('tasse sui prelievi comprese');
    if (input.lock.active && input.lock.lockedValue > 0) carries.push('con il ponte fino allo sblocco');
    const head = carries.length > 0 ? `Linea tratteggiata: quanto serve nello scenario base in ogni anno, ${carries.join(', ')}` : "Linea tratteggiata: il numero FIRE dello scenario base, che cresce con l'inflazione";
    return [prose(`${head}; il risparmio si ferma al FIRE.`), ...step];
  }
  if (!input.fanAvailable) {
    return [prose("Il ventaglio richiede un'allocazione in azioni, obbligazioni, immobili o materie prime.")];
  }
  if (!input.fan) return null;
  // Since 2026-09-24 the paths aim at the bridge requirement while the unlock is ahead (the
  // walk's own test), and the clause says so: before, they aimed at the number without the lock.
  const inflows: Narrative =
    input.lock.active && input.lock.lockedValue > 0 ? [prose(" Il fondo pensione entra all'anno di sblocco al valore di oggi; fino ad allora il target è il numero del modello ponte.")] : [];
  // Every path starts from the same portfolio, so a target already cleared today is cleared in
  // all of them: «probabilità entro il 2026: 100%» would be true and say nothing.
  if (input.fan.atStart) {
    return [
      prose(`FIRE già raggiunto oggi, quindi in tutti i ${integer(input.simulationCount)} percorsi con l'allocazione attuale (${input.allocationLabel}): il ventaglio mostra come il patrimonio può evolvere da qui.`),
      ...inflows,
    ];
  }
  return [
    prose('Probabilità di FIRE entro il '),
    year(input.fan.calendarYear),
    prose(input.fan.onHorizon ? ' (orizzonte della simulazione): ' : ': '),
    figure(`${input.fan.probabilityPct}%`),
    prose(` su ${integer(input.simulationCount)} percorsi con l'allocazione attuale (${input.allocationLabel}).`),
    ...inflows,
  ];
}

// ─── Distribuzione: the FIRE year across the paths ────────────────────────────

/**
 * «Metà dei percorsi è FIRE entro il 2034, come nel base; un percorso su dieci entro il 2030,
 * nove su dieci entro il 2041; 37 su 1000 non ci arrivano entro il 2066.» Each percentile is
 * said as the share that IS FIRE by that year (nearest rank, so it is exactly true); a percentile
 * the horizon cuts drops its clause, and the «never» count is its own clause, so a reader never
 * has to infer it.
 */
export function describeFireYearDistribution(d: FireYearDistribution): Narrative {
  if (d.atStart) {
    return [prose(`FIRE già raggiunto oggi, quindi in tutti i ${integer(d.pathCount)} percorsi: non c'è una coda da misurare.`)];
  }
  const reached = d.pathCount - d.neverCount;
  const never: Narrative =
    d.neverCount > 0 ? [prose('; '), figure(integer(d.neverCount)), prose(` su ${integer(d.pathCount)} non ci arrivano entro il `), year(d.horizonCalendarYear)] : [];

  if (d.p50Year === null) {
    const out: Narrative = [prose('Meno di metà dei percorsi è FIRE entro il '), year(d.horizonCalendarYear), prose(': ci arrivano '), figure(integer(reached)), prose(` su ${integer(d.pathCount)}`)];
    if (d.p10Year !== null) out.push(prose('; un percorso su dieci entro il '), year(d.p10Year));
    out.push(prose('.'));
    return out;
  }

  const out: Narrative = [prose('Metà dei percorsi è FIRE entro il '), year(d.p50Year)];
  if (d.baseCalendarYear !== null) {
    if (d.baseCalendarYear === d.p50Year) out.push(prose(', come nel base'));
    else out.push(prose(d.p50Year < d.baseCalendarYear ? ', prima del base (' : ', dopo il base ('), year(d.baseCalendarYear), prose(')'));
  }
  if (d.p10Year !== null) out.push(prose('; un percorso su dieci entro il '), year(d.p10Year));
  if (d.p90Year !== null) out.push(prose(d.p10Year !== null ? ', nove su dieci entro il ' : '; nove percorsi su dieci entro il '), year(d.p90Year));
  out.push(...never, prose('.'));
  return out;
}

/** «nove percorsi su dieci» — the tail in words, from its percentile. */
function tailInWords(percentile: number): string {
  const tenths = Math.round(percentile * 10);
  return tenths === 5 ? 'metà dei percorsi' : `${['zero', 'un percorso', 'due percorsi', 'tre percorsi', 'quattro percorsi', 'cinque percorsi', 'sei percorsi', 'sette percorsi', 'otto percorsi', 'nove percorsi'][tenths] ?? `${tenths} percorsi`} su dieci`;
}

/**
 * «Perché anche nove percorsi su dieci siano FIRE entro il 2034 servirebbero 6.000 € l'anno di
 * risparmio in più (500 € al mese); il 10% più fortunato passerebbe dal 2030 al 2029.» The lucky
 * tail is named because more saving weighs on it too — the lever is not free.
 */
export function describeTailLever(lever: TailLever, startCalendarYear: number): Narrative {
  const target = year(startCalendarYear + lever.targetYears);
  const tail = tailInWords(lever.percentile);
  const calendar = (offset: number | null) => (offset === null ? null : startCalendarYear + offset);

  if (lever.extraAnnualSavings === 0) {
    return [prose(`Già oggi ${tail} sono FIRE entro il `), target, prose(': la coda è dentro il piano.')];
  }
  if (lever.extraAnnualSavings === null) {
    const after = calendar(lever.tailYearsAfter);
    return [
      prose('Nemmeno '),
      amount(lever.extraCap),
      prose(` l'anno di risparmio in più porta ${tail} entro il `),
      target,
      ...(after !== null ? [prose(': con quella cifra ci arriverebbero entro il '), year(after)] : [prose(": con quella cifra non ci arriverebbero entro l'orizzonte")]),
      prose('.'),
    ];
  }
  const out: Narrative = [
    prose(`Perché anche ${tail} siano FIRE entro il `),
    target,
    prose(' servirebbero '),
    amount(lever.extraAnnualSavings),
    prose(" l'anno di risparmio in più ("),
    amount(lever.extraAnnualSavings / 12),
    prose(' al mese)'),
  ];
  const before = calendar(lever.luckyYearsBefore);
  const after = calendar(lever.luckyYearsAfter);
  if (before !== null && after !== null) {
    if (before === after) out.push(prose('; il 10% più fortunato resterebbe al '), year(after));
    else out.push(prose('; il 10% più fortunato passerebbe dal '), year(before), prose(' al '), year(after));
  }
  out.push(prose('.'));
  return out;
}

/**
 * «Prelevando le spese dal proprio anno FIRE, il capitale dura fino al 2076 (a 90 anni) in 940
 * percorsi su 963; nel 10% peggiore si esaurisce entro il 2068.» Among the paths that retire only:
 * the ones that never reach FIRE are the distribution's «never» clause, not this sentence's.
 */
export function describeRetirementSurvival(s: RetirementSurvival, honest?: FireTargetHonest): Narrative {
  const until: Narrative = [prose('fino al '), year(s.horizonCalendarYear), ...(s.horizonAge !== null ? [prose(' (a '), figure(`${s.horizonAge} anni`), prose(')')] : [])];
  // What the ledger withdraws: the expenses, less the pensions when they are in, tax in.
  const what = honest?.pensionsConsidered && honest.taxConsidered ? 'le spese meno le pensioni, tasse comprese,' : honest?.pensionsConsidered ? 'le spese meno le pensioni' : honest?.taxConsidered ? 'le spese, tasse comprese,' : 'le spese';
  if (s.ruinedCount === 0) {
    return [prose(`Prelevando ${what} dal proprio anno FIRE, il capitale dura `), ...until, prose(` in tutti i ${integer(s.retiredCount)} percorsi che ci arrivano.`)];
  }
  const out: Narrative = [prose(`Prelevando ${what} dal proprio anno FIRE, il capitale dura `), ...until, prose(' in '), figure(integer(s.survivedCount)), prose(` percorsi su ${integer(s.retiredCount)}`)];
  if (s.p10RuinCalendarYear !== null) {
    out.push(prose('; nel 10% peggiore si esaurisce entro il '), year(s.p10RuinCalendarYear));
  } else if (s.medianYearsLastedWhenRuined !== null) {
    out.push(
      prose(s.ruinedCount === 1 ? "; nell'unico che lo esaurisce dura " : `; nei ${integer(s.ruinedCount)} che lo esauriscono dura in mediana `),
      figure(years(s.medianYearsLastedWhenRuined, 0)),
      prose(' dal FIRE'),
    );
  }
  out.push(prose('.'));
  return out;
}

/** The method behind «Come si calcola» on the Distribuzione view, as paragraphs. */
export function describeFireDistributionMethod(binWidthYears: number, honest?: FireTargetHonest): string[] {
  const perBin = binWidthYears === 1 ? 'un anno' : `${binWidthYears} anni`;
  const pensionPart = honest?.pensionsConsidered ? 'meno le pensioni statali dal loro avvio' : 'nessuna pensione statale (non ne risulta una datata in Coast FIRE)';
  const taxPart = honest?.taxConsidered ? 'ogni prelievo vende quanto serve a pagare la tassa sulla plusvalenza' : 'nessuna tassa sui prelievi (nessun PMC in euro da cui stimarla)';
  return [
    "Ogni percorso è una sequenza di rendimenti annui estratti a caso con l'allocazione attuale; il suo anno FIRE è il primo in cui il patrimonio supera quanto serve in quell'anno — lo stesso requisito del verdetto, anno per anno.",
    `Le classi raccolgono i percorsi per anno FIRE, ${perBin} per classe; l'ultima, in grigio, quelli che non ci arrivano entro l'orizzonte della simulazione. I percentili sono anni: il 90° è l'anno entro cui nove percorsi su dieci sono FIRE.`,
    "La leva ripete la simulazione con più risparmio, sugli stessi rendimenti estratti, finché anche nove percorsi su dieci sono FIRE entro l'anno del base; la cifra è arrotondata ai 100 € l'anno. Il seme è fisso, quindi la distribuzione non cambia tra un'apertura e l'altra.",
    `Dal FIRE in poi: dal suo anno FIRE ogni percorso smette di risparmiare e preleva le spese, che continuano a crescere con l'inflazione, con gli stessi rendimenti; ${pensionPart}; ${taxPart}.`,
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
  /** The pensions and the tax, considered or declared absent — the tile's two last rows. */
  honest?: FireTargetHonest;
}

/**
 * «Calcolato su 412.500 € di patrimonio, spese di 27.600 € l'anno e un SWR del 4%; nel numero
 * anche la pensione statale dal 2060, 13.000 € netti l'anno, e le tasse sui prelievi (26% sulla
 * plusvalenza).» A pension left out for a missing age is said; none saved is the row's business.
 */
export function describeBase(base: FireBase): Narrative {
  const out: Narrative = [
    prose('Calcolato su '),
    amount(base.netWorth),
    prose(' di patrimonio, spese di '),
    amount(base.annualExpenses),
    prose(" l'anno e un SWR del "),
    rate(base.swr),
  ];
  const honest = base.honest;
  const parts: Narrative[] = [];
  if (honest?.pensionsConsidered && honest.pensionStartCalendarYear !== null) {
    parts.push(
      honest.pensionCount > 1
        ? [prose('le pensioni statali, '), amount(honest.pensionNetAnnual), prose(" netti l'anno dall'ultima nel "), year(honest.pensionStartCalendarYear)]
        : [prose('la pensione statale dal '), year(honest.pensionStartCalendarYear), prose(', '), amount(honest.pensionNetAnnual), prose(" netti l'anno")],
    );
  }
  if (honest?.taxConsidered) parts.push([prose('le tasse sui prelievi ('), figure(formatRate(honest.taxRate)), prose(' sulla plusvalenza)')]);
  if (parts.length > 0) {
    out.push(prose('; nel numero anche '));
    parts.forEach((part, index) => {
      if (index > 0) out.push(prose(' e '));
      out.push(...part);
    });
  }
  if (honest?.pensionsSkipped === 'no-age') out.push(prose("; le pensioni statali restano fuori: manca l'età in Coast FIRE"));
  out.push(prose('.'));
  return out;
}

/** The Pensioni statali row: its value and its caption, one of three states. */
export function describePensionRow(honest: FireTargetHonest, currentYear: number): { value: string | null; caption: string } {
  if (honest.pensionsConsidered && honest.pensionStartCalendarYear !== null) {
    const when = honest.pensionStartCalendarYear <= currentYear ? 'già in corso' : `dal ${honest.pensionStartCalendarYear}`;
    return { value: cachedFormatCurrencyEUR(Math.round(honest.pensionNetAnnual), true), caption: honest.pensionCount > 1 ? `${honest.pensionCount} pensioni, nette l'anno, l'ultima ${when} · da Coast FIRE › Ipotesi` : `netti l'anno, ${when} · da Coast FIRE › Ipotesi` };
  }
  if (honest.pensionsSkipped === 'no-age') return { value: null, caption: "non considerate: manca l'età in Coast FIRE › Ipotesi" };
  return { value: null, caption: 'nessuna in Coast FIRE › Ipotesi: il numero le esclude' };
}

/** The Tasse sui prelievi row: the rate on today's gain share, or why it is not estimated. */
export function describeTaxRow(honest: FireTargetHonest): { value: string | null; caption: string } {
  if (honest.taxConsidered) {
    return { value: formatRate(honest.taxRate), caption: `sul ${formatRate(Math.round(honest.gainSharePct))} di plusvalenza latente oggi · dentro il numero` };
  }
  return { value: null, caption: 'non stimate: nessun PMC in euro nel portafoglio' };
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

/**
 * «Nel base il FIRE arriva nel 2032; l'orso lo sposta al 2036, il toro lo anticipa al 2030.»
 * A scenario at year 0 is «già raggiunto»: the walk tests today before stepping, and a reader
 * who is FIRE must never be told «tra 1 anno» under a verdict that says «Sei già FIRE.».
 */
export function describeScenarios(rows: ScenarioRow[]): Narrative {
  const bear = rows.find((row) => row.key === 'bear');
  const base = rows.find((row) => row.key === 'base');
  const bull = rows.find((row) => row.key === 'bull');
  if (!bear || !base || !bull) return [];

  if (base.calendarYear === null && bear.calendarYear === null && bull.calendarYear === null) {
    return [prose(`In nessuno scenario il FIRE arriva entro ${HORIZON_YEARS} anni.`)];
  }

  if (bear.yearsToFire === 0 && base.yearsToFire === 0 && bull.yearsToFire === 0) {
    return [prose('Il FIRE è già raggiunto in tutti e tre gli scenari: il patrimonio supera il numero FIRE di oggi.')];
  }

  if (base.yearsToFire === 0) {
    const later = (row: ScenarioRow, subject: string): Narrative => {
      if (row.yearsToFire === 0) return [prose(`${subject} concorda`)];
      if (row.calendarYear === null) return [prose(`${subject} non ci arriva entro ${HORIZON_YEARS} anni`)];
      return [prose(`${subject} lo sposta al `), year(row.calendarYear)];
    };
    return [prose('Nel base il FIRE è già raggiunto; '), ...later(bear, "l'orso"), prose(', '), ...later(bull, 'il toro'), prose('.')];
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
    if (row.yearsToFire === 0) return [prose(`${subject} lo dà per raggiunto oggi`)];
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

/**
 * The Parametri disclosure's description: every saved setting, in one line. The scenarios name
 * their growth in words («crescita orso 4%, base 7%, toro 10%»): «4/3,5 · 7/2,5» was a code the
 * reader had to open the panel to decode, and the inflation it carried has its own field there.
 */
export function describeParametri(input: ParametriDescriptionInput): string {
  return [
    `SWR ${formatRate(input.swr)}`,
    `casa di abitazione ${input.includesResidence ? 'inclusa' : 'esclusa'}`,
    input.lockActive ? `fondo pensione bloccato (INPS ${input.inpsRetirementAge}, RITA a ${input.ritaUnlockAge})` : 'fondo pensione non vincolato',
    `crescita orso ${formatRate(input.scenarios.bear.growthRate)}, base ${formatRate(input.scenarios.base.growthRate)}, toro ${formatRate(input.scenarios.bull.growthRate)}`,
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
