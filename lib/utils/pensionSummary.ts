/**
 * Previdenza's numbers: what each tile of the redesigned page shows, computed once from the
 * raw inputs the page already loads (funds, family members, contributions, snapshots).
 *
 * The page answers «il fondo sta lavorando?» and its verdict is PER CONTRIBUTOR (the IRPEF
 * ceiling is per taxpayer, and a household can track a spouse's fund), so the return is computed
 * per member too — the same pure functions of `pensionReturn.ts`, on the member's funds and the
 * member's contributions — and the verdict prints the same TWR the Rendimento tile does.
 *
 * Words live in `pensionNarrative.ts`; this module never formats a string. Zero Firebase imports:
 * the fund's live value (`calculateAssetValue`) and the tax function (`calculateProgressiveTax`)
 * are injected, so the module stays a pure function of its inputs (invariant #4).
 */

import type { Asset, FamilyMember, MonthlySnapshot } from '@/types/assets';
import type { PensionContribution, PensionContributionNature } from '@/types/pension';
import {
  buildPensionValueSeries,
  computePensionReturn,
  isPensionReturnMeasurable,
  overlayLivePensionValue,
  resolvePensionReturnStart,
  valueEffectMonth,
  type PensionReturnResult,
  type PensionValuePoint,
} from '@/lib/utils/pensionReturn';
import { computePensionTaxRecap } from '@/lib/utils/pensionDeduction';
import {
  derivePensionContributionsByYearAndNature,
  derivePensionDeductibleByYear,
} from '@/lib/utils/pensionContributions';
import { groupFundsByFamilyMember } from '@/lib/utils/pensionFamilyMembers';
import { getItalyMonth, getItalyYear } from '@/lib/utils/dateHelpers';

// ─── Input ────────────────────────────────────────────────────────────────────

export interface PensionSummaryInput {
  /** The account's `pensionFund` assets. */
  funds: Asset[];
  /** Every asset of the account — the ledger names a voluntary contribution's source account. */
  assets: Asset[];
  familyMembers: FamilyMember[];
  contributions: PensionContribution[];
  snapshots: MonthlySnapshot[];
  /** ONE `now` per mount: the live overlay's month and the digest's window depend on it. */
  now: Date;
  /** `settings.pensionReturnStartMonth` — the user's override of where the data is trustworthy. */
  configuredStartMonth?: string;
  /** The page's axis: the fiscal year the tax recap, the natures and the ledger are read on. */
  taxYear: number;
  /** Progressive IRPEF on a gross income — `(income) => calculateProgressiveTax(income, brackets)`. */
  taxOf: (income: number) => number;
  /** The fund's live value in EUR — `calculateAssetValue`. */
  valueOf: (asset: Asset) => number;
}

// ─── Il fondo oggi ────────────────────────────────────────────────────────────

export interface FundTodaySummary {
  /** Live value of every fund, a net-worth figure. */
  value: number;
  fundCount: number;
  fundNames: string[];
  /** Every contribution ever recorded, all natures. */
  contributionsAllTime: number;
  /** 'YYYY-MM' of the earliest recorded contribution (by accounting date); null without any. */
  firstContributionMonth: string | null;
  /**
   * The Panoramica's «Previdenza» digest, on this page: live value − the previous month's
   * snapshot − the contributions recorded since (attributed by `valueEffectMonth`). Null when
   * the previous month has no snapshot with the funds or the tracked window starts later.
   */
  monthEffect: number | null;
  /** `monthEffect` over the previous month's value, in %. */
  monthEffectPct: number | null;
  /** Contributions recorded since the previous snapshot — what the effect is net of. */
  monthPaidIn: number;
  /** The value series the sparkline draws: snapshots with the funds, closed on the live value. */
  series: PensionValuePoint[];
  /** The latest manual update of any fund; null without funds. */
  lastUpdated: Date | null;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function accountingMonthKey(contribution: PensionContribution): string {
  return monthKey(contribution.date.getFullYear(), contribution.date.getMonth() + 1);
}

/** The month of `now` and the calendar month before it, as keys. */
function resolveMonths(now: Date): { current: { year: number; month: number }; currentKey: string; previousKey: string } {
  const year = getItalyYear(now);
  const month = getItalyMonth(now);
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return { current: { year, month }, currentKey: monthKey(year, month), previousKey: monthKey(previous.year, previous.month) };
}

function sumAmounts(contributions: PensionContribution[]): number {
  return contributions.reduce((sum, c) => sum + Math.abs(c.amount), 0);
}

/**
 * This month's market effect on the funds, the way `computeTopMovers` measures the Panoramica's
 * «Previdenza» line: per fund, `live − previous snapshot − paid in since`, only for a fund the
 * previous snapshot holds and only once the tracked window covers that snapshot. Null when no
 * fund can be attributed — a digest that cannot be measured is absent, never zero.
 */
function computeMonthEffect(
  funds: Asset[],
  snapshots: MonthlySnapshot[],
  contributions: PensionContribution[],
  startMonth: string | null,
  previousKey: string,
  valueOf: (asset: Asset) => number
): { effect: number | null; base: number; paidIn: number } {
  if (startMonth === null || startMonth > previousKey) return { effect: null, base: 0, paidIn: 0 };

  let effect = 0;
  let base = 0;
  let paidIn = 0;
  let attributed = false;
  for (const fund of funds) {
    const previousSeries = buildPensionValueSeries(snapshots, [fund.id]).filter(
      (point) => monthKey(point.year, point.month) === previousKey
    );
    if (previousSeries.length === 0 || !(fund.quantity > 0)) continue;
    const previousValue = previousSeries[0].value;
    const fundPaidIn = sumAmounts(
      contributions.filter((c) => c.assetId === fund.id && valueEffectMonth(c) > previousKey)
    );
    effect += valueOf(fund) - previousValue - fundPaidIn;
    base += previousValue;
    paidIn += fundPaidIn;
    attributed = true;
  }

  return attributed ? { effect, base, paidIn } : { effect: null, base: 0, paidIn: 0 };
}

/** The whole account's funds today: value, series, digest, what was ever paid in. */
export function summarizeFundToday(input: PensionSummaryInput): FundTodaySummary {
  const { funds, contributions, snapshots, now, configuredStartMonth, valueOf } = input;
  const { current, previousKey } = resolveMonths(now);

  const value = funds.reduce((sum, fund) => sum + valueOf(fund), 0);
  const fundIds = funds.map((fund) => fund.id);
  const fundContributions = contributions.filter((c) => fundIds.includes(c.assetId));
  const startMonth = resolvePensionReturnStart(fundContributions, configuredStartMonth);

  const series = overlayLivePensionValue(buildPensionValueSeries(snapshots, fundIds), {
    year: current.year,
    month: current.month,
    value,
  });

  const { effect, base, paidIn } = computeMonthEffect(funds, snapshots, fundContributions, startMonth, previousKey, valueOf);

  const firstContributionMonth =
    fundContributions.length > 0 ? fundContributions.map(accountingMonthKey).sort()[0] : null;

  const lastUpdated = funds.reduce<Date | null>((latest, fund) => {
    const candidate = fund.lastPriceUpdate ?? fund.updatedAt;
    if (!candidate) return latest;
    return latest === null || candidate > latest ? candidate : latest;
  }, null);

  return {
    value,
    fundCount: funds.length,
    fundNames: funds.map((fund) => fund.name),
    contributionsAllTime: sumAmounts(fundContributions),
    firstContributionMonth,
    monthEffect: effect,
    monthEffectPct: effect !== null && base > 0 ? (effect / base) * 100 : null,
    monthPaidIn: paidIn,
    series,
    lastUpdated,
  };
}

// ─── Per contributor: return and tax recap ────────────────────────────────────

/**
 * Whether the return of a block is a MEASURE, and if not why — one of the two flags of
 * `computePensionReturn`, or one of the two reasons it returned null.
 */
export type PensionReturnState =
  | 'measured'
  /** `isCoverageSuspicious`: the growth is too high for the contributions recorded. */
  | 'suspicious'
  /**
   * `isCoverageContradictory`: the mirror image — MORE contributions recorded than the growth
   * they should explain, so the arithmetic left the real. A contribution counted twice, or one
   * already inside a hand-entered value, never a bad market.
   */
  | 'contradictory'
  /** `hasNoMovement`: the window is open but nothing happened inside it. */
  | 'idle'
  /** No contribution recorded and no configured start: the window cannot open. */
  | 'no-contributions'
  /** The window holds one value: a second month is needed. */
  | 'one-point';

export interface PensionMemberTax {
  taxYear: number;
  /** The member's RAL; null when not set (the saving cannot be estimated). */
  ral: number | null;
  /** The year's contributions of the member's funds, by nature. */
  voluntary: number;
  employer: number;
  tfr: number;
  /** voluntary + employer — what could be deducted. */
  deductible: number;
  /** What is actually deducted: `min(deductible, effectiveCeiling)`. */
  deducted: number;
  ordinaryCeiling: number;
  extraAvailable: number;
  /** ordinaryCeiling + extraAvailable. */
  effectiveCeiling: number;
  /** Headroom left this year: `max(0, effectiveCeiling − deductible)`. */
  remaining: number;
  /** Estimated IRPEF saving; null without a RAL. */
  taxSaving: number | null;
  /** The employer's contributions of the year — the verdict's second cause. */
  employerInYear: number;
  /** Eligible worker inside the accrual or usage window: the plafond figures are meaningful. */
  showPlafond: boolean;
  plafondCreatedThisYear: number;
  plafondResidual: number;
  isAccrualYear: boolean;
  isUsageYear: boolean;
}

export interface PensionMemberBlock {
  /** `member.id`, or `unassigned:{fundId}` for a fund linked to no member. */
  key: string;
  kind: 'member' | 'unassigned';
  /** The member's name; null for an unassigned fund (the narrative names the fund instead). */
  name: string | null;
  fundIds: string[];
  fundNames: string[];
  /** Live value of the block's funds. */
  value: number;
  return: PensionReturnResult | null;
  returnState: PensionReturnState;
  /** Where the block's window starts ('YYYY-MM'); null when it cannot open. */
  windowStart: string | null;
  /** The user configured `pensionReturnStartMonth` — the suspicious reading offers it otherwise. */
  hasConfiguredStart: boolean;
  /** The tax recap; null for an unassigned fund (no taxpayer to compute against). */
  tax: PensionMemberTax | null;
}

function resolveReturnState(result: PensionReturnResult | null, startMonth: string | null): PensionReturnState {
  if (result) {
    if (isPensionReturnMeasurable(result)) return 'measured';
    // Order matters: a contradictory window can also read as idle-ish once the flags overlap, and
    // the contradiction is the more specific — and the more actionable — of the two.
    if (result.isCoverageSuspicious) return 'suspicious';
    if (result.isCoverageContradictory) return 'contradictory';
    return 'idle';
  }
  return startMonth === null ? 'no-contributions' : 'one-point';
}

function summarizeMemberTax(
  member: FamilyMember,
  memberContributions: PensionContribution[],
  taxYear: number,
  taxOf: (income: number) => number
): PensionMemberTax {
  const deductibleByYear = derivePensionDeductibleByYear(memberContributions);
  const byYearNature = derivePensionContributionsByYearAndNature(memberContributions);
  const natures = byYearNature[taxYear] ?? { tfr: 0, voluntary: 0, employer: 0 };

  // The enrollment fallback reads the MEMBER's own history: the account-wide map would leak one
  // person's years into another's plafond fold (AGENTS.md → Fondo Pensione).
  const enrollmentYear = (() => {
    if (member.firstEmploymentYear) return member.firstEmploymentYear;
    const years = Object.keys(deductibleByYear).map(Number);
    return years.length > 0 ? Math.min(...years) : taxYear;
  })();

  const ral = member.grossAnnualIncome && member.grossAnnualIncome > 0 ? member.grossAnnualIncome : null;
  const isEligible = member.isFirstEmploymentPost2007 ?? false;
  const { state, taxSaving } = computePensionTaxRecap(
    { targetYear: taxYear, enrollmentYear, isFirstJobPost2007: isEligible, deductibleContribByYear: deductibleByYear },
    ral ?? 0,
    taxOf
  );

  return {
    taxYear,
    ral,
    voluntary: natures.voluntary,
    employer: natures.employer,
    tfr: natures.tfr,
    deductible: state.deductibleContributions,
    deducted: state.deductedThisYear,
    ordinaryCeiling: state.ordinaryCeiling,
    extraAvailable: state.extraAvailableThisYear,
    effectiveCeiling: state.effectiveCeiling,
    remaining: Math.max(0, state.effectiveCeiling - state.deductibleContributions),
    taxSaving: ral === null ? null : taxSaving,
    employerInYear: natures.employer,
    showPlafond: isEligible && (state.isAccrualYear || state.isUsageYear),
    plafondCreatedThisYear: state.plafondCreatedThisYear,
    plafondResidual: state.accruedPlafondResidual,
    isAccrualYear: state.isAccrualYear,
    isUsageYear: state.isUsageYear,
  };
}

function summarizeBlock(
  key: string,
  kind: PensionMemberBlock['kind'],
  name: string | null,
  blockFunds: Asset[],
  tax: PensionMemberTax | null,
  input: PensionSummaryInput
): PensionMemberBlock {
  const { contributions, snapshots, now, configuredStartMonth, valueOf } = input;
  const { current } = resolveMonths(now);
  const fundIds = blockFunds.map((fund) => fund.id);
  const blockContributions = contributions.filter((c) => fundIds.includes(c.assetId));
  const value = blockFunds.reduce((sum, fund) => sum + valueOf(fund), 0);

  // The window starts where THIS block's data is trustworthy; the configured month still wins.
  const startMonth = resolvePensionReturnStart(blockContributions, configuredStartMonth);
  const series = overlayLivePensionValue(buildPensionValueSeries(snapshots, fundIds), {
    year: current.year,
    month: current.month,
    value,
  });
  const result = computePensionReturn(series, blockContributions, startMonth);

  return {
    key,
    kind,
    name,
    fundIds,
    fundNames: blockFunds.map((fund) => fund.name),
    value,
    return: result,
    returnState: resolveReturnState(result, startMonth),
    windowStart: result?.windowStart ?? startMonth,
    hasConfiguredStart: !!configuredStartMonth,
    tax,
  };
}

/**
 * One block per family member with a linked fund (in the members' order), then one per fund
 * linked to no member — never folded into someone else's numbers. The return is measured on the
 * block's funds and contributions; the tax recap only exists for a member.
 */
export function summarizePensionMembers(input: PensionSummaryInput): PensionMemberBlock[] {
  const { funds, familyMembers, contributions, taxYear, taxOf } = input;
  const { matched, unassigned } = groupFundsByFamilyMember(funds, familyMembers);

  const blocks: PensionMemberBlock[] = matched.map(({ member, funds: memberFunds }) => {
    const memberIds = new Set(memberFunds.map((fund) => fund.id));
    const memberContributions = contributions.filter((c) => memberIds.has(c.assetId));
    const tax = summarizeMemberTax(member, memberContributions, taxYear, taxOf);
    return summarizeBlock(member.id, 'member', member.name, memberFunds, tax, input);
  });

  for (const fund of unassigned) {
    blocks.push(summarizeBlock(`unassigned:${fund.id}`, 'unassigned', null, [fund], null, input));
  }

  return blocks;
}

// ─── Versato per natura (the axis year) ───────────────────────────────────────

export const NATURE_LABELS: Record<PensionContributionNature, string> = {
  voluntary: 'Volontario',
  employer: 'Datoriale',
  tfr: 'TFR',
};

export interface VersatoRow {
  nature: PensionContributionNature;
  label: string;
  amount: number;
  /** Share of the year's total, 0-100. */
  percentage: number;
  deductible: boolean;
}

export interface VersatoSummary {
  year: number;
  total: number;
  /** Natures with something paid, largest first. */
  rows: VersatoRow[];
  /** The closest earlier year with a contribution; null without one. */
  previousYear: number | null;
  previousYearTotal: number | null;
  /** The previous year's only nature, when it had one («tutti volontari»); null when mixed. */
  previousYearSingleNature: PensionContributionNature | null;
}

/** The axis year's contributions by nature, and the previous recorded year for the footer. */
export function summarizeVersato(contributions: PensionContribution[], year: number): VersatoSummary {
  const byYear = derivePensionContributionsByYearAndNature(contributions);
  const natures = byYear[year] ?? { tfr: 0, voluntary: 0, employer: 0 };
  const total = natures.tfr + natures.voluntary + natures.employer;

  const rows: VersatoRow[] = (Object.keys(NATURE_LABELS) as PensionContributionNature[])
    .filter((nature) => natures[nature] > 0)
    .map((nature) => ({
      nature,
      label: NATURE_LABELS[nature],
      amount: natures[nature],
      percentage: total > 0 ? (natures[nature] / total) * 100 : 0,
      deductible: nature !== 'tfr',
    }))
    .sort((a, b) => b.amount - a.amount);

  const earlierYears = Object.keys(byYear)
    .map(Number)
    .filter((y) => y < year)
    .sort((a, b) => b - a);
  const previousYear = earlierYears[0] ?? null;
  const previous = previousYear !== null ? byYear[previousYear] : null;
  const previousNatures = previous
    ? (Object.keys(previous) as PensionContributionNature[]).filter((nature) => previous[nature] > 0)
    : [];

  return {
    year,
    total,
    rows,
    previousYear,
    previousYearTotal: previous ? previous.tfr + previous.voluntary + previous.employer : null,
    previousYearSingleNature: previousNatures.length === 1 ? previousNatures[0] : null,
  };
}

// ─── Versamenti (the ledger of the axis year) ─────────────────────────────────

export interface LedgerRow {
  id: string;
  /** The accounting date. */
  date: Date;
  taxYear: number;
  nature: PensionContributionNature;
  amount: number;
  fundId: string;
  fundName: string;
  /** The cash account a voluntary contribution left; null for TFR/employer or an untracked account. */
  sourceAccountName: string | null;
  /** When the value moved (`createdAt`). */
  recordedOn: Date;
  /** The value moved in a later month than the accounting date (`valueEffectMonth` rule). */
  recordedInLaterMonth: boolean;
  /** Filed under a tax year other than the date's calendar year (a January payment for the year before). */
  isStraddling: boolean;
  notes: string | undefined;
}

export interface LedgerSummary {
  year: number;
  count: number;
  /** Newest first (by date, then by recording time). */
  rows: LedgerRow[];
  latest: LedgerRow | null;
}

/** The axis year's contributions as rows, newest first, with the names the ledger prints. */
export function summarizeLedger(
  contributions: PensionContribution[],
  funds: Asset[],
  assets: Asset[],
  year: number
): LedgerSummary {
  const fundNameById = new Map(funds.map((fund) => [fund.id, fund.name]));
  const assetNameById = new Map(assets.map((asset) => [asset.id, asset.name]));

  const rows: LedgerRow[] = contributions
    .filter((c) => c.taxYear === year)
    .map((c) => ({
      id: c.id,
      date: c.date,
      taxYear: c.taxYear,
      nature: c.source,
      amount: Math.abs(c.amount),
      fundId: c.assetId,
      fundName: fundNameById.get(c.assetId) ?? '—',
      sourceAccountName: c.sourceCashAssetId ? (assetNameById.get(c.sourceCashAssetId) ?? null) : null,
      recordedOn: c.createdAt ?? c.date,
      recordedInLaterMonth: valueEffectMonth(c) > accountingMonthKey(c),
      isStraddling: c.date.getFullYear() !== c.taxYear,
      notes: c.notes,
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime() || b.recordedOn.getTime() - a.recordedOn.getTime());

  return { year, count: rows.length, rows, latest: rows[0] ?? null };
}
