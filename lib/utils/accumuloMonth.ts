/**
 * accumuloMonth — what a reader OUTSIDE the Accumulo tab may know of the open plan: the month it
 * buys in (the Piano's note on Bilanciamento), whether it ends after the Consulente's review date,
 * whether this is the month the plan asked to be looked at again, and the active plan as an advice reads it.
 *
 * The Allocazione page's first load reads this module (2026-11-12), so it imports only
 * `planMonths.ts`, `accumulationPlanDoc.ts`, `cents.ts` and types — never `accumulationNarrative.ts`,
 * `accumuloSummary.ts` or `accumulationPlanUtils.ts`, which belong to the tab loaded on demand.
 */
import type { AccumulationPlan, Installment, InstallmentLine, MonthKey, PlanDisposal } from '@/types/accumulationPlan';
import type { PacVerdictInput } from '@/types/accumulationPlan';
import { addMonths, monthIndexOf, monthLabelLong, toMonthKey } from './planMonths';
import { roundToCents } from './cents';

/** The instalments are the months that buy: a month with no line (the reserve refilling) is not one (2026-11-17). */
export function countPlanInstalments(plan: Pick<AccumulationPlan, 'installments'>): { closed: number; total: number } {
  const buying = plan.installments.filter((installment) => installment.lines.length > 0);
  return { closed: buying.filter(isInstalmentClosed).length, total: buying.length };
}

/** The first installment from `fromIndex` with something to buy (the months before it refill the reserve). */
export function findFirstBuyingInstallment(plan: Pick<AccumulationPlan, 'installments'>, fromIndex = 1): Installment | undefined {
  return plan.installments.find((installment) => installment.index >= fromIndex && installment.lines.some((line) => line.plannedQuantity > 0));
}

/** Every installment fully closed, `late` lines included — the plan has nothing left to do. */
export function isPlanDone(plan: AccumulationPlan, currentIndex: number): boolean {
  if (currentIndex <= plan.months) return false;
  const linesClosed = plan.installments.every((installment) => installment.lines.every((line) => line.status !== 'planned'));
  const disposalsClosed = plan.disposals.every((disposal) => disposal.status !== 'planned');
  return linesClosed && disposalsClosed;
}

/**
 * The installment the tab is about: the one of `currentIndex`, clamped into the plan's range — the
 * tab previews instalment 1 of a plan not started yet, and the last one after the end.
 */
export function findOpenInstallment(plan: AccumulationPlan, currentIndex: number): Installment | undefined {
  const clamped = Math.min(Math.max(currentIndex, 1), plan.months);
  return plan.installments.find((installment) => installment.index === clamped);
}

/**
 * The month the active plan buys in, as the Piano's note says it: Σ of the lines not skipped (an
 * executed line at what it cost), the positions they buy, and whether none is left to do. `null`
 * unless the plan is active (a draft proposes nothing) and inside its months: before the first
 * month nothing is bought «questo mese», after the last the tab owns the late lines.
 */
export function summarizePacMonth(plan: AccumulationPlan | undefined, currentIndex: number): PacVerdictInput | null {
  if (!plan || plan.status !== 'active') return null;
  if (currentIndex < 1 || currentIndex > plan.months) return null;
  const installment = findOpenInstallment(plan, currentIndex);
  // A month that buys nothing (the reserve refilling, 2026-11-17) gives the Piano no note.
  if (!installment || installment.lines.length === 0) return null;
  const lines = installment.lines.filter((line) => line.status !== 'skipped' && (line.plannedQuantity > 0 || line.status !== 'planned'));
  return {
    monthTotalEur: roundToCents(lines.reduce((sum, line) => sum + amountOf(line), 0)),
    instrumentCount: new Set(lines.map((line) => line.positionId)).size,
    monthLabel: monthLabelLong(installment.month, false),
    allClosed: installment.lines.every((line) => line.status !== 'planned'),
  };
}

/** `summarizePacMonth` on the Italian day `todayIso` (YYYY-MM-DD): the index is the plan's month of that day. */
export function summarizePacMonthOn(plan: AccumulationPlan | undefined, todayIso: string): PacVerdictInput | null {
  if (!plan) return null;
  return summarizePacMonth(plan, monthIndexOf(plan, todayIso.slice(0, 7) as MonthKey));
}

/** A line's euros: what it cost once executed, what it plans otherwise. */
function amountOf(line: InstallmentLine): number {
  return line.status === 'executed' ? (line.executedAmountEur ?? line.plannedAmountEur) : line.plannedAmountEur;
}

/** The plan's last month is after the Consulente's review date (2026-11-12). */
export function planEndsAfterReview(
  plan: Pick<AccumulationPlan, 'startMonth' | 'months'>,
  reviewByIso: string | null,
): boolean {
  if (!reviewByIso) return false;
  return addMonths(plan.startMonth, plan.months - 1) > reviewByIso.slice(0, 7);
}

/** The plan asks to be looked at again this month: its review month is the open one and no revision was saved in it. */
export function isPlanReviewDue(
  plan: Pick<AccumulationPlan, 'reviewMonthIndex' | 'months' | 'revisions' | 'status'>,
  currentIndex: number,
  currentMonth: MonthKey,
): boolean {
  const review = plan.reviewMonthIndex;
  if (plan.status !== 'active' || !review || review > plan.months || review !== currentIndex) return false;
  return !(plan.revisions ?? []).some((revision) => toMonthKey(revision.at) === currentMonth);
}

export interface OpenPlanForAdvice {
  monthIndex: number;      // k: 1..months; 0 before the first month
  months: number;          // N
  instalmentEur: number;   // the month's lines not skipped (the first instalment before the start), in cents
  startMonth: MonthKey;
  endMonth: MonthKey;
  buys: Array<{ assetId: string; name: string; targetPercentage: number }>;
  sells: Array<{ assetId: string; name: string; quantity: number | null; monthIndex: number | null;
    status: PlanDisposal['status'] }>;
}

/** What a reader outside the tab may know of the active plan; null unless one is active. */
export function describeOpenPlanForAdvice(
  plan: AccumulationPlan | undefined,
  monthKey: MonthKey,
  nameOf: (assetId: string) => string,
): OpenPlanForAdvice | null {
  if (!plan || plan.status !== 'active') return null;
  const k = Math.min(monthIndexOf(plan, monthKey), plan.months);
  const lines = (findOpenInstallment(plan, Math.max(k, 1))?.lines ?? []).filter((l) => l.status !== 'skipped');
  return {
    monthIndex: k,
    months: plan.months,
    instalmentEur: roundToCents(lines.reduce((sum, l) => sum + amountOf(l), 0)),
    startMonth: plan.startMonth,
    endMonth: addMonths(plan.startMonth, plan.months - 1),
    buys: plan.positions.map((p) => ({ assetId: p.buyAssetId, name: nameOf(p.buyAssetId),
      targetPercentage: p.targetPercentage })),
    sells: plan.disposals.map((d) => ({ assetId: d.assetId, name: nameOf(d.assetId), quantity: d.quantity ?? null,
      monthIndex: d.monthIndex ?? null, status: d.status })),
  };
}


/** A month that buys is closed when no line is left planned; a month with no line only refills the reserve and is never closed (owner, 2026-11-19). */
export function isInstalmentClosed(installment: Pick<Installment, 'lines'>): boolean {
  return installment.lines.length > 0 && installment.lines.every((line) => line.status !== 'planned');
}

/** Where the open month sits: its place among the months that buy, or a month that only refills the reserve. */
export type OpenMonthPlace = { kind: 'instalment'; ordinal: number; total: number } | { kind: 'refill'; firstBuyingMonth: MonthKey | undefined };

/**
 * «rata k di n» counts the months that buy, like «n di m rate chiuse» (owner, 2026-11-19, the 2026-11-17 rule kept); a
 * refill month points at the first instalment after it. `currentIndex` is clamped into the plan, as the tab reads it.
 */
export function locateOpenMonth(plan: Pick<AccumulationPlan, 'installments' | 'months'>, currentIndex: number): OpenMonthPlace {
  const clamped = Math.min(Math.max(currentIndex, 1), plan.months);
  const buying = plan.installments.filter((installment) => installment.lines.length > 0);
  const ordinal = buying.findIndex((installment) => installment.index === clamped) + 1;
  if (ordinal > 0) return { kind: 'instalment', ordinal, total: buying.length };
  return { kind: 'refill', firstBuyingMonth: findFirstBuyingInstallment(plan, clamped)?.month };
}
