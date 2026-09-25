/**
 * Coast FIRE — the pure layer between `fireService` and the tab's components: the numbers AND
 * the words of FIRE › Coast FIRE, «a verdict over tiles» (2026-08-25).
 *
 * Three parts. The draft plumbing of the Ipotesi form (strings in, `CoastFirePensionInput`s
 * out). The NUMBERS the tiles read — the target with its progress and gap, the three scenarios
 * as rows, the state pensions as the verdict names them, the inflow events — each read off
 * `fireService`'s own result objects (`CoastFIREScenarioMetrics`, `resolvePensionLockState`),
 * never re-derived from the walk. And the WORDS: `buildCoastVerdict` answers «posso smettere di
 * versare?» before any number, and every `describe*` is a tile's reading line, rendered by
 * `NarrativeText`. The verdict is born here and not in a `coastFireNarrative.ts` on purpose:
 * this tab chooses what to show of the service, and one module is where that choice is tested.
 *
 * WHY IT IS A MODULE AND NOT A HOOK
 * Every figure the tiles render must be the SAME figure the service computed, and the only way
 * to make that testable is to choose it in one place, outside React.
 *
 * NO MATH LIVES HERE beyond a ratio (liquid progress), a difference (surplus) and — since
 * 2026-09-23 — the savings pace (`resolveCoastPace`): the year the CURRENT savings, added on top of
 * the projection's own base series, cross the Coast number of that year. It is the one figure the
 * projection does not carry and the one the verdict owed the reader («non ancora» had no «quando»).
 * A sentence never claims what the data cannot support — a missing input drops its clause, never
 * a placeholder (DESIGN.md → The Narrative Honesty Rule); a Coast figure is a projection, so no
 * segment carries a sign colour.
 */

import type { CoastFirePensionInput, CoastFireTaxBracket, FIREProjectionScenarios } from '@/types/assets';
import type {
  CoastFIREPensionBreakdown,
  CoastFIREProjectionPoint,
  CoastFIREProjectionResult,
} from '@/lib/services/fireService';
import {
  normalizeCoastFirePensions,
  normalizeCoastFireTaxBrackets,
} from '@/lib/services/fireService';
// From chartService, NOT from lib/utils/formatters: the two modules declare same-named
// formatters that disagree on percentages — `formatters.formatPercentage` is `toFixed` (a dot
// decimal separator), `chartService`'s is `Intl('it-IT')` (a comma). The components on this tab
// read chartService's, so a string built here has to come from the same one or the page would
// print "40.71%" beside "40,71%". The tests mock the Firebase chain chartService drags in.
import { formatPercentage } from '@/lib/services/chartService';
import { cachedFormatCurrencyEUR, formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import { articleForPercent } from '@/lib/utils/patrimonioNarrative';
import type { Narrative, NarrativeSegment, PageVerdictModel } from '@/lib/utils/narrative';
import type { FireLock } from '@/lib/utils/fireSummary';

/** `fireService` keeps the per-scenario shape internal; this is the only public handle on it. */
export type CoastScenarioMetrics = CoastFIREProjectionResult['scenarios']['base'];

export interface CoastFirePensionDraft {
  id: string;
  label: string;
  grossMonthlyAmount: string;
  monthsPerYear: string;
  startDate: string;
}

export interface CoastFireTaxBracketDraft {
  id: string;
  upTo: string;
  rate: string;
}

export interface PensionDraftIssue {
  pensionId: string;
  severity: 'info' | 'warning' | 'error';
  kind: 'informational' | 'incomplete';
  message: string;
}

export type PensionConfigurationState = 'empty' | 'incomplete' | 'informational' | 'valid';

// ─────────────────────────────────────────────────────────────────────────────
// Draft plumbing — the configuration form edits strings, the model wants numbers
// ─────────────────────────────────────────────────────────────────────────────

export function parseOptionalInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isValidAge(value: number | null): value is number {
  return value !== null && value >= 18 && value <= 100;
}

export function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addYearsToDate(date: Date, years: number): Date {
  const nextDate = new Date(date);
  nextDate.setFullYear(nextDate.getFullYear() + years);
  return nextDate;
}

export function parseDraftDate(value: string): Date | null {
  if (!value.trim()) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isPensionDraftStarted(draft: CoastFirePensionDraft): boolean {
  return (
    draft.label.trim().length > 0 ||
    draft.grossMonthlyAmount.trim().length > 0 ||
    draft.monthsPerYear.trim().length > 0 ||
    draft.startDate.trim().length > 0
  );
}

/**
 * Receives `now` as an explicit parameter so callers control the reference date.
 * This makes the function pure and easier to test in isolation.
 */
export function buildPensionDraftIssues(
  drafts: CoastFirePensionDraft[],
  currentAge: number | null,
  retirementAge: number | null,
  now: Date
): PensionDraftIssue[] {
  const issues: PensionDraftIssue[] = [];

  drafts.forEach((draft, index) => {
    if (!isPensionDraftStarted(draft)) return;

    const grossMonthlyAmount = Number.parseFloat(draft.grossMonthlyAmount.trim());
    const monthsPerYear = Number.parseInt(draft.monthsPerYear.trim(), 10);
    const startDate = parseDraftDate(draft.startDate);
    const label = draft.label.trim() || `Pensione ${index + 1}`;

    if (!Number.isFinite(grossMonthlyAmount) || grossMonthlyAmount <= 0) {
      issues.push({
        pensionId: draft.id,
        severity: 'warning',
        kind: 'incomplete',
        message: `${label}: inserisci un lordo mensile maggiore di zero per includerla nel calcolo.`,
      });
    }

    if (!Number.isFinite(monthsPerYear) || monthsPerYear <= 0) {
      issues.push({
        pensionId: draft.id,
        severity: 'warning',
        kind: 'incomplete',
        message: `${label}: le mensilità annue devono essere maggiori di zero.`,
      });
    }

    if (!startDate) {
      issues.push({
        pensionId: draft.id,
        severity: 'warning',
        kind: 'incomplete',
        message: `${label}: aggiungi una data di decorrenza per stimarne l'impatto nel tempo.`,
      });
      return;
    }

    if (startDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      issues.push({
        pensionId: draft.id,
        severity: 'info',
        kind: 'informational',
        message: `${label}: la data di decorrenza è nel passato, verifica che rispecchi la tua stima effettiva.`,
      });
    }

    if (currentAge !== null && retirementAge !== null) {
      const retirementDate = addYearsToDate(now, Math.max(retirementAge - currentAge, 0));
      if (startDate > retirementDate) {
        const bridgeYears = Math.max(
          Math.ceil((startDate.getTime() - retirementDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)),
          1
        );
        issues.push({
          pensionId: draft.id,
          severity: 'info',
          kind: 'informational',
          message: `${label}: decorre ${bridgeYears} ${bridgeYears === 1 ? 'anno' : 'anni'} dopo il target, nel periodo ponte il portafoglio copre ancora il fabbisogno per intero.`,
        });
      }
    }
  });

  return issues;
}

export function getPensionConfigurationState(
  pensions: CoastFirePensionInput[],
  issues: PensionDraftIssue[]
): PensionConfigurationState {
  if (pensions.length === 0) return 'empty';
  if (issues.length === 0) return 'valid';

  const hasIncompleteIssues = issues.some((issue) => issue.kind === 'incomplete');
  if (!hasIncompleteIssues) return 'informational';

  return 'incomplete';
}

export function createPensionDraft(defaultStartDate: string): CoastFirePensionDraft {
  return {
    id: createLocalId('coast-pension'),
    label: '',
    grossMonthlyAmount: '',
    monthsPerYear: '13',
    startDate: defaultStartDate,
  };
}

export function createTaxBracketDraft(bracket: CoastFireTaxBracket): CoastFireTaxBracketDraft {
  return {
    id: bracket.id,
    upTo: bracket.upTo !== null ? String(bracket.upTo) : '',
    rate: String(bracket.rate),
  };
}

export function toPensionDrafts(
  pensions: CoastFirePensionInput[] | undefined,
  currentAge: number | undefined,
  today: Date = new Date()
): CoastFirePensionDraft[] {
  const normalized = normalizeCoastFirePensions(pensions);

  return normalized.map((pension) => ({
    id: pension.id,
    label: pension.label,
    grossMonthlyAmount: pension.grossMonthlyAmount.toString(),
    monthsPerYear: pension.monthsPerYear.toString(),
    startDate:
      pension.startDate ??
      (currentAge !== undefined && pension.startAge !== undefined
        ? addYearsToDate(today, Math.max(pension.startAge - currentAge, 0)).toISOString().slice(0, 10)
        : ''),
  }));
}

export function toTaxBracketDrafts(
  brackets: CoastFireTaxBracket[] | undefined
): CoastFireTaxBracketDraft[] {
  return normalizeCoastFireTaxBrackets(brackets).map(createTaxBracketDraft);
}

export function parsePensionDrafts(drafts: CoastFirePensionDraft[]): CoastFirePensionInput[] {
  return normalizeCoastFirePensions(
    drafts.map((draft, index) => {
      const grossMonthlyAmount = Number.parseFloat(draft.grossMonthlyAmount.trim());
      const monthsPerYear = Number.parseInt(draft.monthsPerYear.trim(), 10);

      return {
        id: draft.id,
        label: draft.label.trim() || `Pensione ${index + 1}`,
        grossMonthlyAmount: Number.isFinite(grossMonthlyAmount) ? grossMonthlyAmount : 0,
        monthsPerYear: Number.isFinite(monthsPerYear) ? monthsPerYear : 0,
        startDate: draft.startDate.trim() || undefined,
      };
    })
  );
}

export function parseTaxBracketDrafts(drafts: CoastFireTaxBracketDraft[]): CoastFireTaxBracket[] {
  return normalizeCoastFireTaxBrackets(
    drafts.map((draft) => {
      const upTo = draft.upTo.trim();
      const rate = Number.parseFloat(draft.rate.trim());

      return {
        id: draft.id,
        upTo: upTo ? Number.parseFloat(upTo) : null,
        rate: Number.isFinite(rate) ? rate : NaN,
      };
    })
  );
}

/**
 * Dirty-state keys: only the persisted fields, so a re-render of equivalent drafts never reads
 * as an unsaved change (doc/guide/impostazioni.md § Settings — the FIVE places).
 */
export function buildPensionSnapshotKey(pensions: CoastFirePensionInput[]): string {
  return JSON.stringify(
    pensions.map((pension) => ({
      id: pension.id,
      label: pension.label,
      grossMonthlyAmount: pension.grossMonthlyAmount,
      monthsPerYear: pension.monthsPerYear,
      startDate: pension.startDate ?? null,
      startAge: pension.startAge ?? null,
    }))
  );
}

export function buildTaxBracketSnapshotKey(brackets: CoastFireTaxBracket[]): string {
  return JSON.stringify(
    brackets.map((bracket) => ({
      id: bracket.id,
      upTo: bracket.upTo,
      rate: bracket.rate,
    }))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared label helpers
// ─────────────────────────────────────────────────────────────────────────────

export function formatCurrencyPerYear(value: number): string {
  return `${formatAmount(value)} l'anno`;
}

export function formatAgeYears(age: number): string {
  return `${Math.round(age)} anni`;
}

export function formatYearCount(years: number): string {
  return `${years} ${years === 1 ? 'anno' : 'anni'}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Narrative helpers — prose stays prose, figures are mono and uncoloured
// ─────────────────────────────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/** «30.300 €» — no cents, no sign colour: a Coast figure is a projection, neither a gain nor a loss. */
function formatAmount(value: number): string {
  return cachedFormatCurrencyEUR(Math.round(Math.abs(value)), true);
}

function amount(value: number): NarrativeSegment {
  return figure(formatAmount(value));
}

function percent(value: number, decimals = 1): NarrativeSegment {
  return figure(formatPercentage(Math.abs(value), decimals));
}

/** «4,5%» — a rate as the scenario states it: no trailing decimals when whole. */
function formatRate(value: number): string {
  return `${value.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
}

function rate(value: number): NarrativeSegment {
  return figure(formatRate(value));
}

function year(value: number): NarrativeSegment {
  return figure(String(value));
}

function age(value: number): NarrativeSegment {
  return figure(formatAgeYears(value));
}

/**
 * «la Pensione INPS» for a label that already says what it is, «la pensione di Giuseppe» for any
 * other (a household names a row after the person: «Giuseppe», «Marco»).
 */
function pensionName(label: string): string {
  const trimmed = label.trim();
  return /^pension/i.test(trimmed) ? `la ${trimmed}` : `la pensione di ${trimmed}`;
}

/**
 * «dal 2052 la Pensione estera, dal 2055 la Pensione INPS e dal 2061 la pensione di Marco» — EVERY
 * pension, each with its own start year, joined with commas and a final «e». Never a count: a
 * verdict that said «3 pensioni» would drop the one fact the user typed the rows for.
 */
function pensionList(entries: CoastPensionEntry[]): Narrative {
  const out: Narrative = [];
  entries.forEach((entry, index) => {
    if (index > 0) out.push(prose(index === entries.length - 1 ? ' e dal ' : ', dal '));
    else out.push(prose('dal '));
    out.push(year(entry.startYear), prose(` ${pensionName(entry.label)}`));
  });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Numbers — read off fireService's base scenario, never re-derived from the walk
// ─────────────────────────────────────────────────────────────────────────────

export interface CoastTarget {
  /** The capital needed TODAY for the free assets to compound to the requirement by the target age. */
  coastNumberToday: number;
  /** The FIRE-eligible net worth the page runs on (locked pension capital already subtracted). */
  netWorth: number;
  liquidNetWorth: number;
  /** `netWorth / coastNumberToday × 100`, not clamped: a reached target reads above 100. */
  progressPct: number;
  /** The conservative read: the liquid assets alone against the same number. */
  liquidProgressPct: number;
  gap: number;
  /** `max(netWorth − coastNumberToday, 0)` — the amount the verdict names once the target is behind. */
  surplus: number;
  reached: boolean;
  /** A locked pension fund re-enters the walk: the number is a bridge number. */
  isBridge: boolean;
  realReturnRate: number;
  currentAge: number;
  retirementAge: number;
  yearsToRetirement: number;
  /** The free capital grown to the target age with no new contributions, in today's money. */
  futureValueAtRetirement: number;
  /** What the free capital must reach at the target age — net of the fund that re-enters. */
  retirementCapitalRequired: number;
}

export interface CoastTargetInput {
  currentNetWorth: number;
  liquidNetWorth: number;
  currentAge: number;
  retirementAge: number;
  isBridge: boolean;
}

/**
 * The target as the page reads it. The liquid progress and the surplus are the only figures
 * not on the scenario itself — one ratio and one difference, exactly what the old hero did.
 */
export function summarizeCoastTarget(base: CoastScenarioMetrics, input: CoastTargetInput): CoastTarget {
  return {
    coastNumberToday: base.coastFireNumberToday,
    netWorth: input.currentNetWorth,
    liquidNetWorth: input.liquidNetWorth,
    progressPct: base.progressToCoastFI,
    liquidProgressPct: base.coastFireNumberToday > 0 ? (input.liquidNetWorth / base.coastFireNumberToday) * 100 : 0,
    gap: base.gapToCoastFI,
    surplus: Math.max(input.currentNetWorth - base.coastFireNumberToday, 0),
    reached: base.isCoastReached,
    isBridge: input.isBridge,
    realReturnRate: base.realReturnRate,
    currentAge: input.currentAge,
    retirementAge: input.retirementAge,
    yearsToRetirement: base.yearsToRetirement,
    futureValueAtRetirement: base.futureValueAtRetirementWithoutNewContributions,
    retirementCapitalRequired: base.retirementCapitalRequired,
  };
}

export interface CoastScenarioRow {
  key: 'bear' | 'base' | 'bull';
  label: string;
  realReturnRate: number;
  /** The two parameters the real rate is the difference of — the Calcolatore prints them, so does this row. */
  growthRate: number;
  inflationRate: number;
  coastNumberToday: number;
  progressPct: number;
  gap: number;
  surplus: number;
  reached: boolean;
}

/** Orso · Base · Toro as rows, in that order — the Scenari tile's list. */
export function summarizeCoastScenarios(
  scenarios: CoastFIREProjectionResult['scenarios'],
  params: FIREProjectionScenarios,
  currentNetWorth: number
): CoastScenarioRow[] {
  return (['bear', 'base', 'bull'] as const).map((key) => {
    const scenario = scenarios[key];
    return {
      key,
      label: scenario.label,
      realReturnRate: scenario.realReturnRate,
      growthRate: params[key].growthRate,
      inflationRate: params[key].inflationRate,
      coastNumberToday: scenario.coastFireNumberToday,
      progressPct: scenario.progressToCoastFI,
      gap: scenario.gapToCoastFI,
      surplus: Math.max(currentNetWorth - scenario.coastFireNumberToday, 0),
      reached: scenario.isCoastReached,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// The savings pace — «quando», on the projection's own series
// ─────────────────────────────────────────────────────────────────────────────

export interface CoastPaceReached {
  yearOffset: number;
  calendarYear: number;
  age: number;
}

export interface CoastPace {
  /** The Calcolatore's savings (`getAnnualCashflowData().annualSavings`), kept constant in today's euro. */
  annualSavings: number;
  /** The first year the savings-fed capital clears the Coast number of THAT year; null when it does not before the target age. */
  reached: CoastPaceReached | null;
  /** The base series with the savings added until `reached` (else until the target), then coasting — one value per projection point. */
  series: number[];
}

/** The savings' compounded value after `years` at a real rate (an annuity due of one payment a year). */
function compoundedSavings(annualSavings: number, realReturnRate: number, years: number): number {
  const rate = realReturnRate / 100;
  if (years <= 0) return 0;
  if (Math.abs(rate) < 1e-9) return annualSavings * years;
  return (annualSavings * (Math.pow(1 + rate, years) - 1)) / rate;
}

/**
 * The year the current savings pace crosses the Coast curve, and the series that shows it.
 *
 * The Coast number is a MOVING target: the number of year t is the requirement of that year on
 * the plot (`fireNumberTarget`, which already steps with the fund) discounted over the years that
 * remain to the target age. The capital of year t is the projection's own base series (free
 * capital compounding, the fund re-entering at its unlock) plus the savings compounded at the
 * same real rate — nothing here re-runs the walk. The first year the second clears the first is
 * the «quando» the verdict names; from that year the series coasts, and by construction it lands
 * on the requirement at the target age — which is what the reader sees on the chart.
 *
 * Null with no savings recorded, no series or a target already reached today: a missing input
 * drops its clause (The Narrative Honesty Rule), and a reached target has nothing to pace.
 */
export function resolveCoastPace(
  projectionData: CoastFIREProjectionPoint[],
  annualSavings: number | undefined,
  realReturnRate: number,
  reachedToday: boolean
): CoastPace | null {
  if (annualSavings === undefined || annualSavings <= 0 || projectionData.length < 2 || reachedToday) return null;
  const lastOffset = projectionData.length - 1;
  const rate = realReturnRate / 100;

  let reached: CoastPaceReached | null = null;
  for (const point of projectionData) {
    if (point.yearOffset === 0) continue;
    const capital = point.basePortfolioValue + compoundedSavings(annualSavings, realReturnRate, point.yearOffset);
    const coastNumberThatYear = point.fireNumberTarget / Math.pow(1 + rate, lastOffset - point.yearOffset);
    if (capital >= coastNumberThatYear) {
      reached = { yearOffset: point.yearOffset, calendarYear: point.calendarYear, age: point.age };
      break;
    }
  }

  const savingsUntil = reached?.yearOffset ?? lastOffset;
  const series = projectionData.map((point) => {
    if (point.yearOffset <= savingsUntil) {
      return point.basePortfolioValue + compoundedSavings(annualSavings, realReturnRate, point.yearOffset);
    }
    const savedAtStop = compoundedSavings(annualSavings, realReturnRate, savingsUntil);
    return point.basePortfolioValue + savedAtStop * Math.pow(1 + rate, point.yearOffset - savingsUntil);
  });

  return { annualSavings, reached, series };
}

export interface CoastPensionEntry {
  label: string;
  /** Calendar year the pension starts — its decorrenza, or today + years until it. */
  startYear: number;
  startAge: number;
  netAnnualReal: number;
  isActiveAtRetirement: boolean;
}

export interface CoastPensionCoverage {
  count: number;
  /** Ordered by start. */
  entries: CoastPensionEntry[];
  /** Every pension active — the steady state — net, real, per year and per month. */
  annualNetReal: number;
  monthlyNetReal: number;
  /** The net real pension already active at the target age (0 without one). */
  annualNetRealAtRetirement: number;
}

/** The calendar year a pension starts: its decorrenza, else today plus the years until it. */
function pensionStartYear(pension: CoastFIREPensionBreakdown, currentYear: number): number {
  return pension.startDate ? toDate(pension.startDate).getFullYear() : currentYear + Math.ceil(pension.yearsUntilStart);
}

export function sortPensionBreakdown(pensionBreakdown: CoastFIREPensionBreakdown[]): CoastFIREPensionBreakdown[] {
  return [...pensionBreakdown].sort((left, right) => left.startAge - right.startAge);
}

/** The state pensions as the verdict and the readings name them — from the scenario's own breakdown. */
export function summarizeCoastPensions(base: CoastScenarioMetrics, currentYear: number): CoastPensionCoverage {
  const entries = sortPensionBreakdown(base.pensionBreakdown).map((pension) => ({
    label: pension.label,
    startYear: pensionStartYear(pension, currentYear),
    startAge: pension.startAge,
    netAnnualReal: pension.netAnnualRealAtStart,
    isActiveAtRetirement: pension.isActiveAtRetirement,
  }));
  return {
    count: entries.length,
    entries,
    annualNetReal: base.totalNetAnnualPensionAtSteadyState,
    monthlyNetReal: base.totalNetAnnualPensionAtSteadyState / 12,
    annualNetRealAtRetirement: base.totalNetAnnualPensionAtRetirement,
  };
}

/** Whole years between the target age and the last pension's start — the bridge the portfolio funds alone. */
export function resolveCoastBridgeYears(base: CoastScenarioMetrics, retirementAge: number): number {
  return Math.max(Math.ceil(base.latestPensionStartAge - retirementAge), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdict — the page's single answer, before any number
// ─────────────────────────────────────────────────────────────────────────────

export interface CoastVerdictInput {
  /** Null when the projection cannot run; `incompleteReason` then says why. */
  target: CoastTarget | null;
  incompleteReason: string | null;
  /** `resolveCoastPace(...)` — null without savings, and the clause is then absent. */
  pace: CoastPace | null;
  lock: FireLock;
}

/**
 * « Al ritmo attuale, 12.000 € l'anno di risparmio, lo raggiungi nel 2031, a 40 anni.» — or, when
 * the pace does not get there in time, « … non lo raggiungi prima dei 60 anni.» The state
 * pensions are no longer listed here (2026-09-23): the Afflussi tile names every one with its
 * year and its annual figure, and the verdict said the same money per month 100 px above it.
 */
function paceClause(target: CoastTarget, pace: CoastPace | null): Narrative {
  if (!pace) return [];
  const head: Narrative = [prose(' Al ritmo attuale, '), amount(pace.annualSavings), prose(" l'anno di risparmio, ")];
  if (!pace.reached) {
    return [...head, prose('non lo raggiungi prima dei '), age(target.retirementAge), prose('.')];
  }
  return [...head, prose('lo raggiungi nel '), year(pace.reached.calendarYear), prose(', a '), age(pace.reached.age), prose('.')];
}

/**
 * « I 31.400 € nel fondo pensione sono esclusi da queste cifre perché restano bloccati fino al
 * 2045; il calcolo li conta da quell'anno in poi.» — only with the bridge model on and something
 * locked. The clause is what keeps the two capital figures honest: both are net of the fund. The
 * money comes first, then why, then what the walk does with it (reworded on request, 2026-08-25:
 * «non conta in queste cifre, il calcolo lo fa rientrare da lì» read as a formula).
 */
function lockSentence(lock: FireLock): Narrative {
  if (!lock.active || lock.lockedValue <= 0 || lock.unlockCalendarYear === null) return [];
  const plural = lock.lockedFundCount > 1;
  return [
    prose(' I '),
    amount(lock.lockedValue),
    prose(plural ? ' nei fondi pensione sono esclusi da queste cifre perché restano bloccati fino al ' : ' nel fondo pensione sono esclusi da queste cifre perché restano bloccati fino al '),
    year(lock.unlockCalendarYear),
    prose("; il calcolo li conta da quell'anno in poi."),
  ];
}

/**
 * «: smettendo di versare a 38 anni arriveresti a 60 anni con 253.900 € di oggi, contro i 333.700 €
 * richiesti» — or, at the target age already, no walk to describe.
 */
function capitalClause(target: CoastTarget, comparison: 'contro' | 'oltre'): Narrative {
  if (target.yearsToRetirement <= 0) {
    return [prose(", e sei già all'età target di "), age(target.retirementAge)];
  }
  return [
    prose(': smettendo di versare a '),
    age(target.currentAge),
    prose(' arriveresti a '),
    age(target.retirementAge),
    prose(' con '),
    amount(target.futureValueAtRetirement),
    prose(` di oggi, ${comparison} i `),
    amount(target.retirementCapitalRequired),
    prose(' richiesti'),
  ];
}

export function buildCoastVerdict(input: CoastVerdictInput): PageVerdictModel {
  const { target } = input;
  if (!target) {
    return {
      headline: 'Coast FIRE non calcolabile.',
      tone: 'neutral',
      sentence: [prose(input.incompleteReason ?? 'Completa le ipotesi per ottenere una risposta.')],
    };
  }

  if (target.reached) {
    const opening: Narrative =
      target.surplus < 0.5
        ? [prose('Il patrimonio FIRE di '), amount(target.netWorth), prose(' raggiunge il numero Coast FIRE di oggi ('), amount(target.coastNumberToday), prose(')')]
        : [
            prose('Il patrimonio FIRE di '),
            amount(target.netWorth),
            prose(' supera il numero Coast FIRE di oggi ('),
            amount(target.coastNumberToday),
            prose(') di '),
            amount(target.surplus),
          ];
    return {
      headline: 'Sì, puoi smettere di versare.',
      tone: 'positive',
      sentence: [...opening, ...capitalClause(target, 'oltre'), prose('.'), ...lockSentence(input.lock)],
    };
  }

  return {
    headline: 'Non ancora: continua a versare.',
    tone: 'neutral',
    sentence: [
      prose('Ti mancano '),
      amount(target.gap),
      prose(' al numero Coast FIRE di oggi ('),
      amount(target.coastNumberToday),
      prose(')'),
      ...capitalClause(target, 'contro'),
      prose('.'),
      ...paceClause(target, input.pace),
      ...lockSentence(input.lock),
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Traguardo
// ─────────────────────────────────────────────────────────────────────────────

/** «Sei al 76,1% del numero Coast FIRE: 96.400 € su 126.700 €, ne mancano 30.300 €.» */
export function describeCoastTarget(target: CoastTarget): Narrative {
  if (target.reached) {
    return [
      prose('Hai superato il numero Coast FIRE: '),
      amount(target.netWorth),
      prose(' su '),
      amount(target.coastNumberToday),
      prose(`, ${articleForPercent(target.progressPct)}`),
      percent(target.progressPct),
      prose('.'),
    ];
  }
  return [
    prose('Sei al '),
    percent(target.progressPct),
    prose(' del numero Coast FIRE: '),
    amount(target.netWorth),
    prose(' su '),
    amount(target.coastNumberToday),
    prose(', ne mancano '),
    amount(target.gap),
    prose('.'),
  ];
}

/** The caption beside the chip: the liquid read, then what the number is the discount of. */
export function describeCoastTargetCaption(target: CoastTarget): Narrative {
  const liquid: Narrative = target.liquidNetWorth > 0 ? [percent(target.liquidProgressPct), prose(' con i soli liquidi · ')] : [];
  if (target.yearsToRetirement <= 0) {
    return [...liquid, amount(target.retirementCapitalRequired), prose(' richiesti oggi, a '), age(target.retirementAge)];
  }
  return [
    ...liquid,
    amount(target.retirementCapitalRequired),
    prose(' richiesti a '),
    age(target.retirementAge),
    prose(', scontati al '),
    rate(target.realReturnRate),
    prose(' reale'),
  ];
}

export interface CoastTargetFooterInput {
  retirementAge: number;
  requiredNet: number;
  /** The target line's LAST value — the gross requirement once the fund is on the plot. */
  lastTargetOnPlot: number;
  lock: FireLock;
  /** The last calendar year the chart draws. */
  lastProjectedYear: number;
  /** The savings pace, when the chart draws its dotted series. */
  pace: CoastPace | null;
}

/**
 * The Traguardo footer: the dashed line in words, the step when the fund re-enters on the plot,
 * and the dotted series when the savings pace is drawn.
 */
export function describeCoastTargetFooter(input: CoastTargetFooterInput): Narrative {
  const head: Narrative = [prose('Linea tratteggiata: i '), amount(input.requiredNet), prose(' richiesti a '), age(input.retirementAge), prose(' nello scenario base, in euro di oggi')];
  const locked = input.lock.active && input.lock.lockedValue > 0 && input.lock.unlockCalendarYear !== null;
  const unlockYear = input.lock.unlockCalendarYear as number;
  const lockPart: Narrative = !locked
    ? [prose('.')]
    : unlockYear > input.lastProjectedYear
      ? [prose('. Il fondo pensione rientra nel '), year(unlockYear), prose(", oltre l'età target: la linea è già al netto.")]
      : [
          prose(' — '),
          amount(input.lastTargetOnPlot),
          prose(' con il fondo pensione dentro. Il gradino nel '),
          year(unlockYear),
          prose(' è il fondo che rientra, nelle serie e nella linea.'),
        ];
  const pacePart: Narrative = !input.pace
    ? []
    : input.pace.reached
      ? [prose(' Linea punteggiata: il base con il risparmio attuale fino al '), year(input.pace.reached.calendarYear), prose(', poi da solo.')]
      : [prose(' Linea punteggiata: il base con il risparmio attuale fino al target.')];
  return [...head, ...lockPart, ...pacePart];
}

// ─────────────────────────────────────────────────────────────────────────────
// Afflussi — why the Coast number is lower than a full FIRE number
// ─────────────────────────────────────────────────────────────────────────────

export interface CoastInflowEvent {
  id: string;
  kind: 'statePension' | 'pensionFund';
  /** Calendar year the money starts arriving; drives the ordering. */
  year: number;
  title: string;
  /** Already formatted — the components only place it. */
  amount: string;
  amountValue: number;
  amountCaption: string;
  /** Extra context (decorrenza, età), or null when there is nothing more to say. */
  note: string | null;
}

/**
 * Every event the backward walk ALREADY discounts, in one ordered list: each state pension from
 * its decorrenza, plus the pension fund re-entering at its unlock.
 *
 * Nothing is computed here — the state pensions come from the scenario's own `pensionBreakdown`
 * and the fund from `resolvePensionLockState`'s inflows, at TODAY's value (growing it here would
 * double-count what the walk already does). The list exists because the drop in the required
 * capital is otherwise unexplained on screen.
 */
export function buildCoastInflowEvents(
  pensionBreakdown: CoastFIREPensionBreakdown[],
  pensionFundInflows: { yearsFromNow: number; amountToday: number }[],
  currentYear: number,
  currentAge: number | null = null
): CoastInflowEvent[] {
  const statePensionEvents: CoastInflowEvent[] = pensionBreakdown.map((pension) => ({
    id: pension.id,
    kind: 'statePension',
    year: pensionStartYear(pension, currentYear),
    title: pension.label,
    amount: formatAmount(pension.netAnnualRealAtStart),
    amountValue: pension.netAnnualRealAtStart,
    amountCaption: "netti reali l'anno",
    note: pension.startDate
      ? `Decorrenza ${formatDate(toDate(pension.startDate))} · ${formatAgeYears(pension.startAge)}`
      : `Parte a ${formatAgeYears(pension.startAge)}`,
  }));

  const fundEvents: CoastInflowEvent[] = pensionFundInflows.map((inflow, index) => {
    const yearsFromNow = Math.max(0, Math.round(inflow.yearsFromNow));
    return {
      id: `pension-fund-${index}`,
      kind: 'pensionFund',
      year: currentYear + yearsFromNow,
      title: 'Sblocco fondo pensione',
      amount: formatAmount(inflow.amountToday),
      amountValue: inflow.amountToday,
      amountCaption: 'al valore di oggi',
      note: currentAge !== null ? `A ${formatAgeYears(currentAge + yearsFromNow)} · rientra nel capitale e da lì compone` : 'Rientra nel capitale e da lì compone insieme al resto',
    };
  });

  return [...statePensionEvents, ...fundEvents].sort((left, right) => left.year - right.year);
}

/**
 * «3 afflussi già scontati: il fondo pensione rientra nel 2045 (31.400 €), poi dal 2052 la Pensione
 * estera e dal 2055 la Pensione INPS coprono insieme 13.400 € netti l'anno.» Without any event
 * the sentence says what that means for the number, never «nessun dato».
 */
export function describeCoastInflows(events: CoastInflowEvent[], pensions: CoastPensionCoverage, retirementAge: number): Narrative {
  if (events.length === 0) {
    return [prose('Nessun afflusso dopo il target: il portafoglio deve sostenere per intero le spese anche dopo i '), age(retirementAge), prose('.')];
  }
  const funds = events.filter((event) => event.kind === 'pensionFund');
  const out: Narrative = [figure(String(events.length)), prose(events.length === 1 ? ' afflusso già scontato: ' : ' afflussi già scontati: ')];

  if (funds.length > 0) {
    out.push(prose(funds.length === 1 ? 'il fondo pensione rientra nel ' : 'i fondi pensione rientrano nel '));
    funds.forEach((fund, index) => {
      if (index > 0) out.push(prose(' e nel '));
      out.push(year(fund.year), prose(' ('), amount(fund.amountValue), prose(')'));
    });
  }

  if (pensions.count > 0) {
    if (funds.length > 0) out.push(prose(', poi '));
    out.push(...pensionList(pensions.entries), prose(pensions.count === 1 ? ' copre ' : ' coprono insieme '), amount(pensions.annualNetReal), prose(" netti l'anno"));
  }

  out.push(prose('.'));
  return out;
}

/** The ONE line that stays on the Afflussi tile; the method goes behind «Come si calcola». */
export const COAST_INFLOWS_FOOTER: Narrative = [prose('Già scontati: per questo il numero Coast FIRE è più basso di un numero FIRE pieno.')];

/** The method behind «Come si calcola» on the Afflussi tile, one paragraph each. */
export const COAST_INFLOWS_METHOD: readonly string[] = [
  'Ogni pensione statale entra dalla sua decorrenza, al netto IRPEF e deflazionata con lo scenario base: è la cifra netta reale che riduce il fabbisogno del portafoglio da quell\'anno.',
  'Il fondo pensione rientra al valore di oggi: il calcolo lo fa crescere da solo, quindi qui non è già cresciuto.',
  'L\'ordine è cronologico; i segmenti sono uguali per scelta, non una scala del tempo.',
];

// ─────────────────────────────────────────────────────────────────────────────
// Scenari
// ─────────────────────────────────────────────────────────────────────────────

/** «Nel base ti mancano 30.300 €; l'orso alza il numero Coast a 375.000 €, il toro lo abbassa a 61.700 € e lo hai già superato.» */
export function describeCoastScenarios(rows: CoastScenarioRow[]): Narrative {
  const bear = rows.find((row) => row.key === 'bear');
  const base = rows.find((row) => row.key === 'base');
  const bull = rows.find((row) => row.key === 'bull');
  if (!bear || !base || !bull) return [];

  const opening: Narrative = base.reached
    ? [prose('Nel base hai superato il numero Coast FIRE ('), amount(base.coastNumberToday), prose(')')]
    : [prose('Nel base ti mancano '), amount(base.gap)];

  // The verb follows the COMPARISON with the base number, never the scenario's name: the
  // parameters are the user's, and a «toro» with a high inflation can land above the base.
  const relative = (row: CoastScenarioRow, subject: string, object: string): Narrative => {
    const verb = row.coastNumberToday > base.coastNumberToday ? 'alza' : row.coastNumberToday < base.coastNumberToday ? 'abbassa' : 'lascia';
    // A pronoun object goes before the verb («il toro lo abbassa a»), a noun after it.
    const clause = object === 'lo' ? `${subject} lo ${verb} a ` : `${subject} ${verb} ${object} a `;
    const out: Narrative = [prose(clause), amount(row.coastNumberToday)];
    if (row.reached && !base.reached) out.push(prose(' e lo hai già superato'));
    if (!row.reached && base.reached) out.push(prose(' e non ci sei ancora'));
    return out;
  };

  return [...opening, prose('; '), ...relative(bear, "l'orso", 'il numero Coast FIRE'), prose(', '), ...relative(bull, 'il toro', 'lo'), prose('.')];
}

/** The ONE line that stays on the Scenari tile; the method goes behind «Come si calcola». */
export const COAST_SCENARIOS_FOOTER: Narrative = [prose('I tre scenari sono quelli del Calcolatore FIRE.')];

/** The method behind «Come si calcola» on the Scenari tile. */
export const COAST_SCENARIOS_METHOD: readonly string[] = [
  'Il rendimento reale di uno scenario è la sua crescita meno la sua inflazione: il numero Coast FIRE scende quando sale, perché al capitale serve meno spinta iniziale.',
  'Ogni riga sconta lo stesso capitale richiesto al target al proprio rendimento reale; il verdetto e il Traguardo leggono la riga base.',
];

// ─────────────────────────────────────────────────────────────────────────────
// Ipotesi — the assumptions, declared on the disclosure instead of implicit
// ─────────────────────────────────────────────────────────────────────────────

export interface CoastBasisInput {
  currentAge: number | null;
  retirementAge: number | null;
  annualExpenses: number | undefined;
  usesCustomExpenses: boolean;
  withdrawalRate: number;
  baseRealReturn: number | null;
  respectPensionLockIn: boolean;
  /** Calendar year the locked pension capital re-enters, or null when nothing is locked. */
  pensionUnlockCalendarYear: number | null;
  pensionCount: number;
  /** The capital-gains rate the withdrawals pay (percent), null when no cost basis estimates it. */
  withdrawalTaxRate?: number | null;
}

export function buildCoastBasisParts(input: CoastBasisInput): string[] {
  const parts: string[] = [];

  parts.push(
    input.currentAge !== null && input.retirementAge !== null
      ? `${input.currentAge} anni → target ${input.retirementAge}`
      : 'età da impostare'
  );

  parts.push(
    input.annualExpenses !== undefined && input.annualExpenses > 0
      ? `spese ${formatAmount(input.annualExpenses)} ${input.usesCustomExpenses ? '(personalizzate)' : '(ultimo anno completo)'}`
      : 'spese non disponibili'
  );

  parts.push(`SWR ${formatRate(input.withdrawalRate)}`);

  if (input.baseRealReturn !== null) {
    parts.push(`rendimento reale base ${formatRate(input.baseRealReturn)}`);
  }

  parts.push(
    input.respectPensionLockIn
      ? input.pensionUnlockCalendarYear !== null
        ? `fondo pensione bloccato fino al ${input.pensionUnlockCalendarYear}`
        : 'vincolo fondo pensione attivo, nessun fondo bloccato'
      : 'fondo pensione non vincolato'
  );

  parts.push(input.pensionCount === 0 ? 'nessuna pensione statale' : input.pensionCount === 1 ? '1 pensione statale' : `${input.pensionCount} pensioni statali`);

  // The tax on withdrawals (2026-09-24): in the number, or declared out with its reason.
  if (input.withdrawalTaxRate !== undefined) {
    parts.push(input.withdrawalTaxRate === null ? 'tasse sui prelievi non stimate (nessun PMC in euro)' : `tasse sui prelievi comprese (${formatRate(input.withdrawalTaxRate)} sulla plusvalenza)`);
  }

  return parts;
}

/** The Ipotesi disclosure's description: every assumption in one line. */
export function describeIpotesi(input: CoastBasisInput): string {
  return buildCoastBasisParts(input).join(' · ');
}

/** The Profilo tile's reading — a preview until saved. */
export function describeProfilo(hasUnsavedChanges: boolean): Narrative {
  return hasUnsavedChanges
    ? [prose('Anteprima non salvata: il verdetto e le tessere leggono i valori inseriti qui.')]
    : [prose("Salvate nel profilo: ogni modifica qui è un'anteprima finché non la salvi.")];
}

/** «2 pensioni: ognuna riduce il fabbisogno del portafoglio solo dalla sua decorrenza, al netto IRPEF e deflazionata.» */
export function describePensioniStatali(pensionCount: number, incompleteCount: number): Narrative {
  if (pensionCount === 0) {
    return [prose('Nessuna pensione: il portafoglio sostiene per intero le spese anche dopo il target. Aggiungine una per ogni cassa.')];
  }
  const head: Narrative = [figure(String(pensionCount)), prose(pensionCount === 1 ? ' pensione: riduce' : ' pensioni: ognuna riduce'), prose(' il fabbisogno del portafoglio solo dalla sua decorrenza, al netto IRPEF e deflazionata')];
  if (incompleteCount > 0) {
    head.push(prose(incompleteCount === 1 ? '; una riga è incompleta e non entra nel calcolo.' : `; ${incompleteCount} righe sono incomplete e non entrano nel calcolo.`));
    return head;
  }
  head.push(prose('.'));
  return head;
}

/** «4 scaglioni, l'ultimo senza tetto: modificali se la normativa cambia.» */
export function describeScaglioni(bracketCount: number): Narrative {
  return [figure(String(bracketCount)), prose(bracketCount === 1 ? " scaglione, senza tetto: modificalo se la normativa cambia." : " scaglioni, l'ultimo senza tetto: modificali se la normativa cambia.")];
}

export const PENSION_MODEL_READING: Narrative = [prose('Dal lordo nominale che indichi al netto reale che abbatte il fabbisogno, in quattro passi.')];

// ─────────────────────────────────────────────────────────────────────────────
// Dettaglio
// ─────────────────────────────────────────────────────────────────────────────

export interface CoastDettaglioInput {
  bridgeYears: number;
  pensionCount: number;
}

/** The Dettaglio disclosure's description: what it holds, with the bridge when there is one. */
export function describeCoastDettaglio(input: CoastDettaglioInput): string {
  const parts = [input.bridgeYears > 0 ? `Fasi di copertura (ponte di ${formatYearCount(input.bridgeYears)})` : 'Fasi di copertura', 'Al target e a regime'];
  if (input.pensionCount > 0) parts.push('Impatto delle pensioni');
  parts.push('Come leggere il Coast FIRE');
  return parts.join(' · ');
}

/** «A 60 anni il portafoglio sostiene 27.600 € l'anno; dal 2055 scende a 14.200 € a regime.» */
export function describeCoverage(base: CoastScenarioMetrics, pensions: CoastPensionCoverage, retirementAge: number, bridgeYears: number): Narrative {
  const out: Narrative = [prose('A '), age(retirementAge), prose(' il portafoglio sostiene '), amount(base.annualPortfolioNeedAtRetirement), prose(" l'anno")];
  if (pensions.annualNetRealAtRetirement > 0) {
    out.push(prose(', con '), amount(pensions.annualNetRealAtRetirement), prose(' già coperti dalle pensioni'));
  }
  if (pensions.count > 0 && bridgeYears > 0) {
    const last = pensions.entries[pensions.entries.length - 1];
    out.push(prose('; dal '), year(last.startYear), prose(' scende a '), amount(base.annualPortfolioNeedAtSteadyState), prose(' a regime'));
  }
  if (pensions.count === 0) {
    out.push(prose(', anche a regime: nessuna pensione lo alleggerisce'));
  }
  out.push(prose('.'));
  return out;
}

/** «Ponte di 7 anni: a 60 anni servono 333.700 € (fondo pensione escluso); a regime il fabbisogno è 14.200 € l'anno, cioè 355.000 € al 4%.» */
export function describeTargetAndSteadyState(base: CoastScenarioMetrics, retirementAge: number, bridgeYears: number, withdrawalRate: number, isBridge: boolean): Narrative {
  const head: Narrative = bridgeYears > 0 ? [prose('Ponte di '), figure(formatYearCount(bridgeYears)), prose(': a ')] : [prose('Nessun ponte: a ')];
  return [
    ...head,
    age(retirementAge),
    prose(' servono '),
    amount(base.retirementCapitalRequired),
    prose(isBridge ? ' (fondo pensione escluso); a regime il fabbisogno è ' : '; a regime il fabbisogno è '),
    amount(base.annualPortfolioNeedAtSteadyState),
    prose(" l'anno, cioè "),
    amount(base.steadyStatePortfolioNeed),
    prose(' al '),
    rate(withdrawalRate),
    prose('.'),
  ];
}

/** «Dal lordo nominale al netto reale: le 2 pensioni valgono insieme 13.400 € netti l'anno di oggi.» */
export function describePensionImpact(pensions: CoastPensionCoverage): Narrative {
  if (pensions.count === 1) {
    return [prose('Dal lordo nominale al netto reale: '), prose(`${pensionName(pensions.entries[0].label)} vale `), amount(pensions.annualNetReal), prose(" netti l'anno di oggi.")];
  }
  return [prose('Dal lordo nominale al netto reale: le '), figure(String(pensions.count)), prose(' pensioni valgono insieme '), amount(pensions.annualNetReal), prose(" netti l'anno di oggi.")];
}

export const HOW_TO_READ_READING: Narrative = [prose('Le regole del calcolo e la lettura automatica del tuo caso.')];

// ─────────────────────────────────────────────────────────────────────────────
// Coverage phases and interpretation — the "Dettaglio" prose, unchanged in substance
// ─────────────────────────────────────────────────────────────────────────────

export interface CoastCoverageStep {
  id: string;
  label: string;
  detail: string;
  badge: string;
}

export function buildCoastCoverageSteps(
  baseScenario: CoastScenarioMetrics | null,
  sortedPensionBreakdown: CoastFIREPensionBreakdown[],
  resolvedRetirementAge: number,
  bridgeYears: number
): CoastCoverageStep[] {
  if (!baseScenario) return [];

  return [
    {
      id: 'target',
      label: `A ${resolvedRetirementAge} anni`,
      detail: `Il portafoglio deve sostenere ${formatCurrencyPerYear(baseScenario.annualPortfolioNeedAtRetirement)}.`,
      badge: `${formatAmount(baseScenario.retirementCapitalRequired)} richiesti`,
    },
    ...sortedPensionBreakdown.map((pension, index) => ({
      id: pension.id,
      label: `${pension.label} ${pension.startDate ? `· ${formatDate(toDate(pension.startDate))}` : ''}`.trim(),
      detail:
        pension.isActiveAtRetirement && index === 0
          ? `È già attiva all'età target e copre ${formatAmount(pension.netAnnualRealAtStart)} netti reali l'anno.`
          : `Da qui aggiunge ${formatAmount(pension.netAnnualRealAtStart)} netti reali l'anno alla copertura.`,
      badge: pension.isActiveAtRetirement ? 'Già attiva' : `Parte a ${formatAgeYears(pension.startAge)}`,
    })),
    // Show the "a regime" step only when there's a bridge: without it, steady-state
    // and retirement values are essentially the same row, creating redundant reading.
    ...(bridgeYears > 0
      ? [
          {
            id: 'steady-state',
            label: 'A regime',
            detail: `Dopo l'ultima decorrenza il portafoglio deve coprire ${formatCurrencyPerYear(baseScenario.annualPortfolioNeedAtSteadyState)}.`,
            badge: `${formatAmount(baseScenario.steadyStatePortfolioNeed)} a regime`,
          },
        ]
      : []),
  ];
}

export function buildBaseScenarioInterpretation(
  baseScenario: CoastScenarioMetrics | null,
  effectiveAnnualExpenses: number | undefined,
  bridgeYears: number,
  resolvedRetirementAge: number
): string[] {
  if (!baseScenario) return [];

  if (baseScenario.pensionBreakdown.length === 0) {
    return [
      'Nessuna pensione configurata: il portafoglio deve sostenere per intero il fabbisogno annuo anche dopo il target Coast FIRE.',
    ];
  }

  const pensionStartsAtTargetCount = baseScenario.pensionBreakdown.filter(
    (pension) => pension.isActiveAtRetirement
  ).length;

  if (baseScenario.pensionBreakdown.length > 1) {
    return [
      `Hai configurato ${baseScenario.pensionBreakdown.length} pensioni con decorrenze diverse. Il calcolo non le somma tutte subito: in ogni fase considera solo quelle già attive.`,
      pensionStartsAtTargetCount > 0
        ? `All'età target risultano attive ${pensionStartsAtTargetCount} pension${pensionStartsAtTargetCount === 1 ? 'e' : 'i'}, mentre le altre entrano più avanti e riducono il fabbisogno del portafoglio in step successivi.`
        : `All'età target non è ancora attiva nessuna pensione, quindi il portafoglio deve coprire l'intero fabbisogno iniziale. Le pensioni ridurranno il fabbisogno solo nelle fasi successive.`,
      bridgeYears > 0
        ? `Per questo vedi un ponte di ${formatYearCount(bridgeYears)} prima del regime stabile finale, cioè prima che l'ultima pensione sia partita.`
        : "Non c'è un ponte significativo prima del regime finale: le pensioni risultano già attive in prossimità dell'età target.",
    ];
  }

  if (baseScenario.totalNetAnnualPensionAtRetirement <= 0 && bridgeYears > 0) {
    return [
      `Nel tuo caso la pensione statale parte dopo il target Coast FIRE, quindi a ${resolvedRetirementAge} anni il portafoglio deve ancora coprire da solo ${formatCurrencyPerYear(baseScenario.annualPortfolioNeedAtRetirement)}.`,
      `La pensione entra davvero in gioco solo dal ${baseScenario.latestPensionStartDate ? formatDate(toDate(baseScenario.latestPensionStartDate)) : 'momento di decorrenza'}, per questo vedi un ponte di ${formatYearCount(bridgeYears)} prima del regime stabile.`,
    ];
  }

  if (baseScenario.totalNetAnnualPensionAtRetirement > 0 && bridgeYears > 0) {
    return [
      `Al target Coast FIRE una parte delle tue spese è già coperta dalla pensione statale: il portafoglio deve sostenere ${formatCurrencyPerYear(baseScenario.annualPortfolioNeedAtRetirement)} invece di ${formatCurrencyPerYear(effectiveAnnualExpenses ?? 0)}.`,
      `Hai comunque un ponte di ${formatYearCount(bridgeYears)} prima che tutte le pensioni siano attive, quindi il capitale richiesto a pensione resta più alto del capitale steady-state.`,
    ];
  }

  return [
    `Alla decorrenza pensionistica il tuo fabbisogno annuo scende da ${formatAmount(effectiveAnnualExpenses ?? 0)} a ${formatAmount(baseScenario.annualPortfolioNeedAtSteadyState)} grazie alla pensione netta reale stimata di ${formatAmount(baseScenario.totalNetAnnualPensionAtSteadyState)}.`,
    "In questo caso il capitale richiesto a pensione e il capitale a regime sono molto vicini perché non c'è un lungo periodo ponte da finanziare prima della pensione statale.",
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Nothing recorded — the ONE missing input, and what each tile says about it
// ─────────────────────────────────────────────────────────────────────────────

/** The one input the projection is missing, in the order the calculation needs them. */
export type CoastEmptyKind = 'no-net-worth' | 'no-expenses' | 'no-age' | 'no-retirement-age';

/**
 * Which input is missing — the first one, in the order the calculation needs them. An empty
 * state that says "manca qualcosa" is a dead end, one that names the field is an instruction.
 */
export function resolveCoastEmptyKind(
  currentNetWorth: number,
  effectiveAnnualExpenses: number | undefined,
  currentAge: number | null,
  retirementAge: number | null
): CoastEmptyKind | null {
  if (currentNetWorth <= 0) return 'no-net-worth';
  if (effectiveAnnualExpenses === undefined || effectiveAnnualExpenses <= 0) return 'no-expenses';
  if (currentAge === null) return 'no-age';
  if (retirementAge === null) return 'no-retirement-age';
  return null;
}

const INCOMPLETE_REASON: Record<CoastEmptyKind, string> = {
  'no-net-worth': 'Serve un patrimonio FIRE positivo per calcolare il Coast FIRE.',
  'no-expenses': 'Servono le spese annue per stimare il target Coast FIRE.',
  'no-age': 'Inserisci la tua età attuale: serve a calcolare quanti anni ha il capitale per crescere fino al target.',
  'no-retirement-age': "Inserisci l'età target Coast FIRE: è il momento in cui il capitale deve essere sufficiente.",
};

/** The verdict's sentence when the projection cannot run: the missing input, named. */
export function resolveCoastIncompleteReason(
  currentNetWorth: number,
  effectiveAnnualExpenses: number | undefined,
  currentAge: number | null,
  retirementAge: number | null
): string | null {
  const kind = resolveCoastEmptyKind(currentNetWorth, effectiveAnnualExpenses, currentAge, retirementAge);
  return kind ? INCOMPLETE_REASON[kind] : null;
}

/** The ONE action of the empty state: a page that records the missing thing, or a field of the Ipotesi. */
export type CoastEmptyAction = { label: string; href: string } | { label: string; fieldId: string };

export interface CoastEmptyTiles {
  traguardo: string;
  afflussi: string;
  scenari: string;
  /** On the Traguardo only: the tile that owns the missing thing (DESIGN.md → The Absence-Has-Three-Names Rule). */
  action: CoastEmptyAction;
}

/**
 * What each tile says when the projection cannot run: every tile keeps its eyebrow and says
 * why it cannot answer, and ONLY the Traguardo offers the action — a page for the patrimonio,
 * the Ipotesi field for everything the form owns (the ids are the form's own).
 */
export function describeCoastEmptyTiles(kind: CoastEmptyKind): CoastEmptyTiles {
  switch (kind) {
    case 'no-net-worth':
      return {
        traguardo: 'Il numero Coast FIRE si misura contro il patrimonio: senza asset con un valore positivo non c\'è un traguardo.',
        afflussi: 'Gli afflussi scontano un fabbisogno del portafoglio: senza patrimonio non c\'è un numero da cui scontarli.',
        scenari: 'Ogni scenario ha il suo numero Coast FIRE: senza patrimonio non c\'è nulla da confrontare.',
        action: { label: 'Aggiungi il primo asset', href: '/dashboard/assets' },
      };
    case 'no-expenses':
      return {
        traguardo: 'Il numero Coast FIRE parte dalle spese annue: nell\'ultimo anno completo non ce ne sono, e nessuna cifra personalizzata le sostituisce.',
        afflussi: 'Gli afflussi riducono le spese che il portafoglio deve coprire: senza spese non c\'è un fabbisogno da ridurre.',
        scenari: 'Ogni scenario sconta le spese al suo rendimento reale: senza spese non c\'è un numero Coast FIRE.',
        action: { label: 'Indica le spese nelle Ipotesi', fieldId: 'coastUseCustomExpenses' },
      };
    case 'no-age':
      return {
        traguardo: 'Serve la tua età attuale: dice quanti anni ha il capitale per crescere da solo fino al target.',
        afflussi: 'Gli afflussi si collocano negli anni tra oggi e il target: senza la tua età non hanno un calendario.',
        scenari: 'Ogni scenario sconta il capitale richiesto sugli anni che restano: senza la tua età non ci sono anni da contare.',
        action: { label: 'Inserisci l\'età nelle Ipotesi', fieldId: 'coastCurrentAge' },
      };
    case 'no-retirement-age':
      return {
        traguardo: 'Serve l\'età target Coast FIRE: è il momento in cui il capitale deve bastare.',
        afflussi: 'Gli afflussi si leggono rispetto al target: senza un\'età target non si sa cosa viene dopo.',
        scenari: 'Ogni scenario sconta il capitale richiesto fino al target: senza un\'età target non c\'è un orizzonte.',
        action: { label: 'Inserisci l\'età target nelle Ipotesi', fieldId: 'coastRetirementAge' },
      };
  }
}
