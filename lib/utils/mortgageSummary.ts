/**
 * «Quanto mi costa il mutuo?» — the figures of Patrimonio's «Mutuo» tile, one property at a time,
 * read from the instalments linked to it (lib/utils/mortgageRepayment.ts).
 *
 * The interest is a MEASURE only from the rows the app has settled: each stores the principal it
 * repaid and the interest it paid on the debt of its day. Instalments paid before the link carry
 * neither, and are not reconstructed (owner, 2026-09-25): the tile says from when it counts
 * (`trackedSince`) instead of printing a figure it would have to guess — a reconstruction from
 * today's debt holds only at a fixed rate never changed and with every instalment recorded.
 *
 * The end of the mortgage is a projection of the French amortisation on today's debt, TAN and
 * the latest linked instalment (`projectPayoff`): the months n that solve
 *
 *   debt = instalment × (1 − (1 + r)^−n) / r,   r = TAN / 12
 *
 * i.e. n = −ln(1 − debt × r / instalment) / ln(1 + r), rounded up — the last instalment is a
 * partial one. An instalment that does not cover the month's interest never ends it (`never`).
 *
 * SDK-free and "today" is a parameter, like every summary module.
 */

import type { Expense } from '@/types/expenses';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { splitInstalment } from '@/lib/utils/mortgageRepayment';

/** The fields of a linked instalment the summary reads. */
export type MortgageRow = Pick<Expense, 'id' | 'amount' | 'debtPrincipalRepaid' | 'debtInterestPaid' | 'balancePending'> & { date: Date };

/** The property as the summary reads it. */
export interface MortgageProperty {
  id: string;
  name: string;
  outstandingDebt?: number;
  debtInterestRate?: number;
}

/** One calendar year of settled instalments, for the tile's «Per anno» list. */
export interface MortgageYear {
  year: number;
  interest: number;
  principal: number;
  instalments: number;
  /** The first settled instalment of the FIRST measured year: that year is partial from here. */
  partialFrom: Date | null;
}

/** When the debt is projected to be repaid in full. */
export type MortgagePayoff = { kind: 'date'; months: number; date: Date } | { kind: 'never' } | { kind: 'repaid' };

export interface MortgageSummary {
  propertyId: string;
  propertyName: string;
  debt: number;
  /** TAN in percent; absent = none typed on the property (a 0% loan for the split). */
  annualRatePct?: number;
  /** The Italian calendar year the «anno» figures belong to. */
  year: number;
  /** Principal and interest of the instalments SETTLED in `year`, and how many they are. */
  yearPrincipal: number;
  yearInterest: number;
  yearInstalments: number;
  /** Interest of every settled instalment, since the first one (`trackedSince`). */
  totalInterest: number;
  /** Date of the first settled instalment; null when none has settled yet. */
  trackedSince: Date | null;
  /** Every year with a settled instalment, newest first (Italian calendar year of each row). */
  byYear: MortgageYear[];
  /** The next instalment still to settle, split on today's debt; null when none is linked ahead. */
  next: { date: Date; amount: number; principal: number; interest: number } | null;
  /** Projection of the end, on the latest linked instalment; null without an instalment to project on. */
  payoff: MortgagePayoff | null;
}

const toCents = (value: number) => Math.round(value * 100) / 100;

/** Whether the app has settled the row: it moved the debt and stored what it repaid. */
export function isSettled(row: Pick<MortgageRow, 'balancePending' | 'debtPrincipalRepaid'>): boolean {
  return !row.balancePending && row.debtPrincipalRepaid !== undefined;
}

/**
 * The interest a settled row paid. A row settled before `debtInterestPaid` existed reads it as
 * instalment − principal: exact when the instalment is only principal and interest, which is what
 * a linked instalment is meant to be (fees and insurance belong on their own row).
 */
export function interestPaidOf(row: Pick<MortgageRow, 'amount' | 'debtPrincipalRepaid' | 'debtInterestPaid'>): number {
  if (row.debtInterestPaid !== undefined) return row.debtInterestPaid;
  return toCents(Math.max(0, Math.abs(row.amount) - (row.debtPrincipalRepaid ?? 0)));
}

/** Add `months` calendar months to a date, clamping the day to the target month's length. */
function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1, date.getHours(), date.getMinutes());
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

/**
 * The end of the mortgage under the French amortisation, counting `from` as the date of the first
 * instalment still to pay. Monthly instalments are assumed — the only cadence a series of the
 * form produces for a loan.
 */
export function projectPayoff(debt: number, instalment: number, annualRatePct: number | undefined, from: Date): MortgagePayoff {
  if (debt <= 0) return { kind: 'repaid' };
  const payment = Math.abs(instalment);
  if (payment <= 0) return { kind: 'never' };
  const rate = annualRatePct && annualRatePct > 0 ? annualRatePct / 100 / 12 : 0;
  let months: number;
  if (rate === 0) {
    months = Math.ceil(debt / payment);
  } else {
    const coverage = (debt * rate) / payment;
    if (coverage >= 1) return { kind: 'never' };
    // A hair under an integer (1e-9) is that integer: the logs of an exact plan land at n − ε.
    months = Math.ceil(-Math.log(1 - coverage) / Math.log(1 + rate) - 1e-9);
  }
  return { kind: 'date', months, date: addMonths(from, months - 1) };
}

/**
 * The tile's figures for one property from the rows linked to it. `now` decides the year and what
 * is still ahead; rows are read whatever their order.
 */
export function summarizeMortgage(property: MortgageProperty, rows: MortgageRow[], now: Date): MortgageSummary {
  const year = getItalyYear(now);
  const debt = property.outstandingDebt ?? 0;
  const ordered = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const settled = ordered.filter(isSettled);
  const ofYear = settled.filter((row) => getItalyYear(row.date) === year);

  const nextRow = ordered.find((row) => !isSettled(row) && row.balancePending) ?? null;
  const next = nextRow
    ? { date: nextRow.date, amount: Math.abs(nextRow.amount), ...splitInstalment(nextRow.amount, debt, property.debtInterestRate) }
    : null;

  // The plan runs on the latest instalment the owner has linked: the next one if any, else the last paid.
  const lastSettled = settled[settled.length - 1] ?? null;
  const projectionRow = nextRow ?? lastSettled;
  const payoff = projectionRow
    ? projectPayoff(debt, projectionRow.amount, property.debtInterestRate, nextRow ? nextRow.date : addMonths(lastSettled!.date, 1))
    : null;

  const years = new Map<number, MortgageYear>();
  for (const row of settled) {
    const rowYear = getItalyYear(row.date);
    const entry = years.get(rowYear) ?? { year: rowYear, interest: 0, principal: 0, instalments: 0, partialFrom: null };
    entry.interest = toCents(entry.interest + interestPaidOf(row));
    entry.principal = toCents(entry.principal + (row.debtPrincipalRepaid ?? 0));
    entry.instalments += 1;
    years.set(rowYear, entry);
  }
  // The first measured year starts at the link, not in January: said, never filled in.
  const firstYear = settled[0] ? years.get(getItalyYear(settled[0].date)) : undefined;
  if (firstYear && settled[0].date.getMonth() > 0) firstYear.partialFrom = settled[0].date;

  return {
    propertyId: property.id,
    propertyName: property.name,
    debt,
    annualRatePct: property.debtInterestRate,
    year,
    yearPrincipal: toCents(ofYear.reduce((sum, row) => sum + (row.debtPrincipalRepaid ?? 0), 0)),
    yearInterest: toCents(ofYear.reduce((sum, row) => sum + interestPaidOf(row), 0)),
    yearInstalments: ofYear.length,
    totalInterest: toCents(settled.reduce((sum, row) => sum + interestPaidOf(row), 0)),
    trackedSince: settled[0]?.date ?? null,
    byYear: [...years.values()].sort((a, b) => b.year - a.year),
    next,
    payoff,
  };
}
