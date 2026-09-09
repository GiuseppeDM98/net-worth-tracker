/**
 * FIRE › Monte Carlo's words: the verdict that answers «quanto è probabile?» before any number,
 * and the reading line under each tile of that tab.
 *
 * Same design as the other `*Narrative.ts` modules: every function is pure and returns a
 * `Narrative` (segments flagged `mono`) rendered by `NarrativeText`; the phrasings are pinned by
 * tests, and a sentence never claims what the data cannot support — no saved age drops the age
 * and reads the horizon in years, a 10th percentile that never touches zero reads its floor, a
 * median at zero says the median case runs out (DESIGN.md → The Narrative Honesty Rule).
 *
 * No figure on this page wears a sign token: a probability is not a gain and a projected value
 * is not a loss. The headline's tone follows the success rate through `resolveSuccessTone`.
 *
 * Percentages go through chartService's it-IT formatter (comma decimals), currency through
 * `cachedFormatCurrencyEUR` (no-break space before €) — AGENTS.md → Italian Localization.
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { articleForPercent, startsWithVowel } from '@/lib/utils/patrimonioNarrative';
import type { FireLock } from '@/lib/utils/fireSummary';
import type { Narrative, NarrativeSegment, PageVerdictModel } from '@/lib/utils/narrative';
import { resolveSuccessTone, type MonteCarloPlan, type MonteCarloRun, type PlanInflow, type ScenarioComparison, type ScenarioRunSummary } from '@/lib/utils/monteCarloSummary';

// ─── Formatting helpers ───────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

function formatAmount(value: number): string {
  return cachedFormatCurrencyEUR(Math.round(Math.abs(value)), true);
}

const amount = (value: number): NarrativeSegment => figure(formatAmount(value));
const count = (value: number): NarrativeSegment => figure(value.toLocaleString('it-IT'));
const year = (value: number): NarrativeSegment => figure(String(value));

/** «84,2%», one decimal, or «95%» when the decimal is zero — the way the hero prints it. */
function ratePct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return formatPercentage(rounded, Number.isInteger(rounded) ? 0 : 1);
}

/** «nel 57,3%» / «nell'84,2%» / «nello 0,5%» — the elision follows the printed figure. */
function inThePercent(value: number): string {
  const leading = Math.floor(Math.round(value * 10) / 10);
  if (leading === 0) return 'nello ';
  return startsWithVowel(leading) ? "nell'" : 'nel ';
}

/** «7 anni» / «1 anno». */
function years(value: number): string {
  return `${value} ${value === 1 ? 'anno' : 'anni'}`;
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

const SCENARIO_NAMES: Record<ScenarioRunSummary['key'], string> = { bear: 'orso', base: 'base', bull: 'toro' };

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface MonteCarloVerdictInput {
  /** A positive starting portfolio and a positive withdrawal exist. */
  runnable: boolean;
  run: MonteCarloRun | null;
  scenarios: ScenarioComparison | null;
  lock: FireLock;
}

/** «fino a 81 anni (2061)» with a saved age, «per 35 anni (fino al 2061)» without. */
function horizonClause(run: MonteCarloRun): Narrative {
  if (run.endAge !== null) return [prose('fino a '), figure(years(run.endAge)), prose(' ('), year(run.endCalendarYear), prose(')')];
  return [prose('per '), figure(years(run.years)), prose(' (fino al '), year(run.endCalendarYear), prose(')')];
}

/** «entro il 2053 (73 anni)» / «entro il 2053». */
function depletionClause(calendarYear: number, age: number | null): Narrative {
  const out: Narrative = [prose('entro il '), year(calendarYear)];
  if (age !== null) out.push(prose(' ('), figure(years(age)), prose(')'));
  return out;
}

/** The median and the worst tenth, as one clause pair after the semicolon. */
function outcomesClause(run: MonteCarloRun): Narrative {
  const medianRunsOut = run.medianFinal <= 0;
  const median: Narrative = medianRunsOut
    ? [prose('nel caso mediano i soldi finiscono prima del '), year(run.endCalendarYear)]
    : [prose('nel caso mediano chiudi con '), amount(run.medianFinal)];
  if (run.p10DepletionCalendarYear !== null) {
    return [...median, prose(medianRunsOut ? ', nel 10% peggiore ' : ', nel 10% peggiore i soldi finiscono '), ...depletionClause(run.p10DepletionCalendarYear, run.p10DepletionAge)];
  }
  return [...median, prose(', e anche nel 10% peggiore chiudi con almeno '), amount(run.finalPercentiles.p10)];
}

/** « Nello scenario orso regge nel 61,5% dei casi, nel toro nel 96,8%.» */
function scenariosSentence(scenarios: ScenarioComparison | null): Narrative {
  if (!scenarios) return [];
  const bear = scenarios.rows.find((row) => row.key === 'bear');
  const bull = scenarios.rows.find((row) => row.key === 'bull');
  if (!bear || !bull) return [];
  return [prose(' Nello scenario orso regge '), prose(inThePercent(bear.successRate)), figure(ratePct(bear.successRate)), prose(' dei casi, nel toro '), prose(inThePercent(bull.successRate)), figure(ratePct(bull.successRate)), prose('.')];
}

/** « Numeri con il modello ponte: i 31.400 € del fondo pensione entrano nel 2045 al valore di oggi.» */
function bridgeSentence(lock: FireLock): Narrative {
  if (!lock.active || lock.lockedValue <= 0 || lock.unlockCalendarYear === null) return [];
  return [prose(' Numeri con il modello ponte: i '), amount(lock.lockedValue), prose(' del fondo pensione entrano nel '), year(lock.unlockCalendarYear), prose(' al valore di oggi.')];
}

export function buildMonteCarloVerdict(input: MonteCarloVerdictInput): PageVerdictModel {
  if (!input.runnable) {
    return {
      headline: 'Monte Carlo non calcolabile.',
      tone: 'neutral',
      sentence: [prose('Servono un patrimonio iniziale e un prelievo annuo maggiori di zero: inseriscili nella tessera Parametri.')],
    };
  }
  const run = input.run;
  if (!run) {
    return {
      headline: 'Simulazione non ancora eseguita.',
      tone: 'neutral',
      sentence: [prose('Premi Esegui simulazione nella tessera Parametri: i tre scenari girano insieme.')],
    };
  }

  const everySimulation = run.successRate >= 99.95;
  const headline = everySimulation ? 'Il piano regge in ogni simulazione.' : `Il piano regge ${inThePercent(run.successRate)}${ratePct(run.successRate)} dei casi.`;
  const opening: Narrative = everySimulation
    ? [prose('In tutte le '), count(run.simulations), prose(' simulazioni il capitale regge ')]
    : [prose(inThePercent(run.successRate).replace(/^n/, 'N')), figure(ratePct(run.successRate)), prose(' delle '), count(run.simulations), prose(' simulazioni il capitale regge ')];

  return {
    headline,
    tone: resolveSuccessTone(run.successRate),
    sentence: [...opening, ...horizonClause(run), prose('; '), ...outcomesClause(run), prose('.'), ...scenariosSentence(input.scenarios), ...bridgeSentence(input.lock)],
  };
}

// ─── Probabilità ──────────────────────────────────────────────────────────────

/**
 * «8.421 simulazioni su 10.000 arrivano al 2061 con capitale positivo; le 1.579 che falliscono
 * esauriscono il capitale in media nell'anno 24 (2050).»
 */
export function describeProbabilita(run: MonteCarloRun): Narrative {
  if (run.failureCount === 0) {
    return [prose('Tutte le '), count(run.simulations), prose(' simulazioni arrivano al '), year(run.endCalendarYear), prose(' con capitale positivo.')];
  }
  const out: Narrative = [count(run.successCount), prose(' simulazioni su '), count(run.simulations), prose(' arrivano al '), year(run.endCalendarYear), prose(' con capitale positivo')];
  if (run.failureAverageYear === null || run.failureAverageCalendarYear === null) return [...out, prose('.')];
  if (run.failureCount === 1) {
    return [...out, prose("; l'unica che fallisce esaurisce il capitale nell'anno "), figure(String(run.failureAverageYear)), prose(' ('), year(run.failureAverageCalendarYear), prose(').')];
  }
  return [
    ...out,
    prose('; le '),
    count(run.failureCount),
    prose(" che falliscono esauriscono il capitale in media nell'anno "),
    figure(String(run.failureAverageYear)),
    prose(' ('),
    year(run.failureAverageCalendarYear),
    prose(').'),
  ];
}

/** «scenario base · 10.000 simulazioni · 35 anni» */
export function describeProbabilitaAside(run: MonteCarloRun): string {
  return `scenario base · ${run.simulations.toLocaleString('it-IT')} simulazioni · ${years(run.years)}`;
}

/** The fan's legend in words, the pension step when a fund enters, and what the euros are. */
export function describeProbabilitaFooter(run: MonteCarloRun, lock: FireLock): Narrative {
  const out: Narrative = [
    prose('La linea è la mediana delle '),
    figure(run.simulations.toLocaleString('it-IT')),
    prose(' traiettorie, le bande il 25–75 e il 10–90; la tratteggiata in basso è il capitale esaurito.'),
  ];
  if (lock.active && lock.lockedValue > 0 && lock.unlockCalendarYear !== null && lock.unlockCalendarYear <= run.endCalendarYear) {
    out.push(prose(' Il gradino nel '), year(lock.unlockCalendarYear), prose(' è il fondo pensione che entra, al valore di oggi.'));
  }
  out.push(prose(" Valori nominali: il prelievo cresce con l'inflazione."));
  return out;
}

// ─── Distribuzione ────────────────────────────────────────────────────────────

/**
 * «Metà delle simulazioni chiude sopra 612.400 €, un quarto sopra 1.310.000 € e un quarto sotto
 * 118.000 €, zero compreso.»
 */
export function describeDistribuzione(run: MonteCarloRun): Narrative {
  const { p25, p50, p75 } = run.finalPercentiles;
  if (p50 <= 0) {
    return [prose('Più di metà delle simulazioni finisce i soldi; un quarto chiude sopra '), amount(p75), prose('.')];
  }
  const out: Narrative = [prose('Metà delle simulazioni chiude sopra '), amount(p50), prose(', un quarto sopra '), amount(p75)];
  if (p25 <= 0) return [...out, prose(' e almeno un quarto finisce i soldi.')];
  return [...out, prose(' e un quarto sotto '), amount(p25), prose(', zero compreso.')];
}

/** «valori finali nel 2061 · scenario base» */
export function describeDistribuzioneAside(run: MonteCarloRun): string {
  return `valori finali nel ${run.endCalendarYear} · scenario base`;
}

export function describeDistribuzioneFooter(run: MonteCarloRun): Narrative {
  return [
    prose(`${run.histogram.length === 10 ? 'Dieci' : run.histogram.length} classi di uguale ampiezza fino al 95° percentile (`),
    amount(run.histogramCap),
    prose("); l'ultima raccoglie anche gli esiti oltre, fino a "),
    amount(run.histogramMax),
    prose(', la prima le simulazioni finite a zero; la classe con il bordo contiene la mediana. Valori nominali del '),
    year(run.endCalendarYear),
    prose('.'),
  ];
}

// ─── Scenari a confronto ──────────────────────────────────────────────────────

export const SCENARI_ASIDE = 'stesso piano, mercati diversi';

export const SCENARI_FOOTER: Narrative = [
  prose(
    'Le tre esecuzioni condividono patrimonio, prelievo, durata e allocazione; cambiano solo rendimenti, volatilità e inflazione (tessera Parametri). La riga Base è il riferimento delle altre tessere.',
  ),
];

/** «Lo scenario orso regge nel 61,5% dei casi, il toro nel 96,8%: 35 punti di distanza attorno al base.» */
export function describeScenari(comparison: ScenarioComparison): Narrative {
  const bear = comparison.rows.find((row) => row.key === 'bear');
  const bull = comparison.rows.find((row) => row.key === 'bull');
  if (!bear || !bull) return [];
  const spread = Math.round(comparison.spreadPoints);
  const tail: Narrative = Math.abs(comparison.spreadPoints) < 0.5 ? [prose('i tre scenari non si distinguono.')] : [figure(`${spread} ${Math.abs(spread) === 1 ? 'punto' : 'punti'}`), prose(' di distanza attorno al base.')];
  return [prose('Lo scenario orso regge '), prose(inThePercent(bear.successRate)), figure(ratePct(bear.successRate)), prose(' dei casi, il toro '), prose(inThePercent(bull.successRate)), figure(ratePct(bull.successRate)), prose(': '), ...tail];
}

/** «mediana finale 198.000 € · nel 10% peggiore esaurito nel 2045» */
export function describeScenarioNote(row: ScenarioRunSummary): Narrative {
  const median: Narrative = row.medianFinal <= 0 ? [prose('nel caso mediano i soldi finiscono')] : [prose('mediana finale '), amount(row.medianFinal)];
  const worst: Narrative = row.p10DepletionCalendarYear !== null ? [prose('nel 10% peggiore esaurito nel '), year(row.p10DepletionCalendarYear)] : [prose('anche il 10% peggiore regge')];
  return [...median, prose(' · '), ...worst];
}

/** The scenario's name as the tiles print it («Orso»). */
export function scenarioLabel(key: ScenarioRunSummary['key']): string {
  const name = SCENARIO_NAMES[key];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ─── Parametri ────────────────────────────────────────────────────────────────

export const PARAMETRI_ASIDE = 'esplorazione, non salvati · gli scenari si salvano nel profilo';

/**
 * «Parti da 488.600 € — il patrimonio senza i 31.400 € del fondo pensione bloccato — e prelevi
 * 22.000 € l'anno, indicizzati all'inflazione, per 35 anni, con il 58% in azioni, …»
 */
export function describeParametri(plan: MonteCarloPlan): Narrative {
  const out: Narrative = [prose('Parti da '), amount(plan.initialPortfolio)];
  if (plan.lockedValue > 0) out.push(prose(' — il patrimonio senza i '), amount(plan.lockedValue), prose(' del fondo pensione bloccato —'));
  out.push(prose(' e prelevi '), amount(plan.annualWithdrawal), prose(plan.isIndexed ? " l'anno, indicizzati all'inflazione, per " : " l'anno, fissi, per "), figure(years(plan.years)));
  if (plan.allocation.length > 0) {
    out.push(prose(', con '));
    out.push(...joinList(plan.allocation.map((entry) => [prose(articleForPercent(entry.pct, 0)), figure(formatPercentage(entry.pct, 0)), prose(` in ${entry.label}`)])));
  }
  out.push(prose('.'));
  return out;
}

/** «Fondo pensione: +31.400 € aggiunti da soli nell'anno 19 (2045), al valore di oggi.» */
export function describePensionInflowRow(inflow: PlanInflow): Narrative {
  return [prose('Fondo pensione: '), figure(`+${formatAmount(inflow.amount)}`), prose(" aggiunti da soli nell'anno "), figure(String(inflow.yearOffset)), prose(' ('), year(inflow.calendarYear), prose('), al valore di oggi.')];
}

export interface ParametriFooterInput {
  /** The typed inputs differ from the ones the shown results were run with. */
  stale: boolean;
  simulations: number;
}

export function describeParametriFooter(input: ParametriFooterInput): Narrative {
  if (input.stale) return [prose("I risultati sopra usano i parametri dell'ultima esecuzione: premi Esegui simulazione per aggiornarli.")];
  return [prose('Ultima esecuzione con questi parametri · '), figure((input.simulations * 3).toLocaleString('it-IT')), prose(' traiettorie, '), figure(input.simulations.toLocaleString('it-IT')), prose(' per scenario.')];
}

// ─── Dettaglio ────────────────────────────────────────────────────────────────

export const DETTAGLIO_DESCRIPTION = 'Traiettorie dei tre scenari, percentili a passi di 5 anni, come funziona';

/** «Le tre mediane partono dagli stessi 488.600 €; nel 2061 l'orso chiude a 198.000 €, il base a 612.400 €, il toro a 1.420.000 €.» */
export function describeTraiettorie(comparison: ScenarioComparison, plan: MonteCarloPlan): Narrative {
  const out: Narrative = [prose('Le tre mediane partono dagli stessi '), amount(plan.initialPortfolio), prose('; nel '), year(plan.endCalendarYear), prose(' ')];
  // «chiude a» is said once, by the first scenario that closes with money; the next ones read «a».
  let closeSaid = false;
  comparison.rows.forEach((row, index) => {
    const article = row.key === 'bear' ? "l'orso" : `il ${SCENARIO_NAMES[row.key]}`;
    if (index > 0) out.push(prose(', '));
    out.push(prose(article));
    if (row.medianFinal <= 0) {
      out.push(prose(' finisce i soldi'));
      return;
    }
    out.push(prose(closeSaid ? ' a ' : ' chiude a '), amount(row.medianFinal));
    closeSaid = true;
  });
  out.push(prose('.'));
  return out;
}

/** «Il 10° percentile scende a zero dal 2053: da lì in poi almeno una simulazione su dieci ha finito i soldi.» */
export function describePercentili(run: MonteCarloRun): Narrative {
  if (run.p10DepletionCalendarYear !== null) {
    return [prose('Il 10° percentile scende a zero dal '), year(run.p10DepletionCalendarYear), prose(': da lì in poi almeno una simulazione su dieci ha finito i soldi.')];
  }
  return [prose('Nessun percentile tocca zero: anche il 10° chiude il '), year(run.endCalendarYear), prose(' con '), amount(run.finalPercentiles.p10), prose('.')];
}

export const EXPLAINER: { title: string; body: string }[] = [
  {
    title: 'La simulazione',
    body: 'Ogni traiettoria parte dal patrimonio iniziale e, anno per anno, incassa gli afflussi previsti, applica un rendimento casuale estratto da una normale con la media e la volatilità dello scenario, poi preleva la spesa annua indicizzata. Se il capitale scende a zero la traiettoria fallisce.',
  },
  {
    title: 'La probabilità',
    body: "È la quota di traiettorie che arrivano alla fine dell'orizzonte con capitale positivo. Sopra il 90% il piano è solido, fra 80 e 90 va tenuto d'occhio, sotto l'80 conviene rivedere prelievo o patrimonio.",
  },
  {
    title: 'I limiti',
    body: 'Rendimenti indipendenti anno per anno, nessuna sequenza di crisi forzata, fondo pensione al valore di oggi: la simulazione misura la dispersione, non predice il futuro. Con la stessa allocazione il Ventaglio del Calcolatore mostra la fase di accumulo.',
  },
];
