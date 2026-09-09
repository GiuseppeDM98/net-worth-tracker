/**
 * Recurrence date arithmetic — pure layer.
 *
 * A recurring expense is not a rule evaluated at read time: the app materialises the whole
 * series as real, future-dated `Expense` documents (lib/services/expenseService.ts →
 * createRecurringExpenses). Everything downstream — Cashflow, Analisi, Budget, the assistant —
 * therefore reads ordinary rows and needs to know nothing about recurrence.
 *
 * That design puts the entire correctness of the feature in one place: the list of dates. It
 * lives here rather than in the service because it is the only part with edge cases worth
 * testing (short months, leap years, the 29/30/31 clamp) and the service is Firestore-coupled.
 *
 * Dates are built from calendar fields in LOCAL time, matching how `<input type="date">` values
 * are parsed elsewhere in the dialog (`new Date(value + 'T00:00:00')`). Never derive them by
 * adding milliseconds: a month is not a fixed number of days, and DST would shift the wall clock.
 */

import { ExpenseType, RecurrenceFrequency } from '@/types/expenses';

/**
 * The cadence assumed when a row carries none. See `resolveRecurrenceFrequency`.
 */
export const DEFAULT_RECURRENCE_FREQUENCY: RecurrenceFrequency = 'monthly';

export const RECURRENCE_FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  monthly: 'Mensile',
  yearly: 'Annuale',
};

/**
 * Expense types that can carry a recurrence.
 *
 * `income` is excluded by product decision. `transfer` is excluded for a structural reason:
 * every occurrence moves money between TWO cash accounts, while the series reconciles balances
 * only on its first entry (see createRecurringExpenses) — a recurring transfer would need a
 * two-legged reconciliation per occurrence, which does not exist.
 */
export const RECURRING_EXPENSE_TYPES: readonly ExpenseType[] = ['fixed', 'variable', 'debt'];

export function canTypeRecur(type: ExpenseType): boolean {
  return RECURRING_EXPENSE_TYPES.includes(type);
}

/**
 * Upper bound on how many occurrences one series may create, per cadence.
 *
 * 360 monthly occurrences is 30 years, which covers a mortgage and the 17-year insurance
 * policy this feature was built for. Both ceilings sit below the 500-operation limit of the
 * `writeBatch` used to create the series AND of the one used to delete it
 * (`deleteRecurringExpenses`) — raising either past 500 means chunking both.
 */
export const MAX_RECURRENCE_OCCURRENCES: Record<RecurrenceFrequency, number> = {
  monthly: 360,
  yearly: 40,
};

/** Default occurrence count proposed by the form, per cadence: one year of payments either way. */
export const DEFAULT_RECURRENCE_COUNT: Record<RecurrenceFrequency, number> = {
  monthly: 12,
  yearly: 5,
};

/**
 * The cadence of a stored series.
 *
 * Documents written before the annual cadence existed have no `recurringFrequency` at all, and
 * they are all monthly — so an absent field means monthly, never "unknown". Keeping that
 * translation in one function is what lets the readers stay free of `?? 'monthly'` fallbacks
 * that would each have to be found again the day a third cadence appears.
 */
export function resolveRecurrenceFrequency(
  frequency: RecurrenceFrequency | undefined
): RecurrenceFrequency {
  return frequency ?? DEFAULT_RECURRENCE_FREQUENCY;
}

interface BuildRecurrenceDatesInput {
  /** First occurrence. Its month (and, for a yearly series, its month-of-year) anchors the series. */
  start: Date;
  frequency: RecurrenceFrequency;
  /** Number of occurrences to produce, the first one included. Values below 1 yield an empty list. */
  count: number;
  /**
   * Day of month every occurrence lands on (1-31). Clamped to the last day of a month that is
   * too short — a 31 in February becomes the 28th (29th on a leap year), not the 3rd of March.
   * Defaults to the day of `start`.
   */
  dayOfMonth?: number;
}

/**
 * Build the dates of a recurring series.
 *
 * The clamp is what the naive `new Date(year, month, 31)` cannot express: JavaScript rolls the
 * overflow forward into the next month, so February would silently produce a second March
 * payment and no February one. Here the day is capped against the real length of the target
 * month before the Date is constructed, so a "31st of every month" series reads
 * 31/01, 28/02, 31/03 — which is also how a bank actually charges it.
 *
 * @returns One Date per occurrence, at local midnight, in chronological order.
 */
export function buildRecurrenceDates({
  start,
  frequency,
  count,
  dayOfMonth,
}: BuildRecurrenceDatesInput): Date[] {
  if (!Number.isFinite(count) || count < 1) return [];

  const anchorDay = dayOfMonth ?? start.getDate();
  const startYear = start.getFullYear();
  const startMonth = start.getMonth();

  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const year = frequency === 'yearly' ? startYear + i : startYear;
    const monthIndex = frequency === 'yearly' ? startMonth : startMonth + i;
    // `new Date(year, monthIndex, …)` normalises a month index past 11 into the following
    // year, so a monthly series does not need its own year arithmetic — but the clamp does,
    // since it has to know which month it is really landing in.
    const normalised = new Date(year, monthIndex, 1);
    dates.push(
      new Date(
        normalised.getFullYear(),
        normalised.getMonth(),
        Math.min(anchorDay, daysInMonth(normalised.getFullYear(), normalised.getMonth()))
      )
    );
  }
  return dates;
}

/**
 * Number of days in a month, leap years included.
 *
 * Day 0 of the following month IS the last day of this one — the standard trick, and the reason
 * this needs no leap-year table.
 */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

const MONTH_NAMES_IT = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
] as const;

/**
 * The one-line Italian description of a series, for the transaction detail sheet.
 *
 * A yearly series needs the month spelled out — "il 15" alone says nothing about which of the
 * twelve — and the month is not stored anywhere: it is the month of the row's own date, which
 * every occurrence of a yearly series shares by construction.
 *
 * @param date - The date of the occurrence being described.
 * @returns A sentence such as "Ogni mese, il giorno 10", or null when the day is unknown.
 */
export function describeRecurrence(
  frequency: RecurrenceFrequency | undefined,
  recurringDay: number | undefined,
  date: Date
): string | null {
  if (!recurringDay) return null;
  if (resolveRecurrenceFrequency(frequency) === 'yearly') {
    return `Ogni anno, il ${recurringDay} ${MONTH_NAMES_IT[date.getMonth()]}`;
  }
  return `Ogni mese, il giorno ${recurringDay}`;
}
