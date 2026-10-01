/**
 * The window of expenses each page reads — the ONE source (2026-09-30).
 *
 * Until then Tracciamento, Divisione, Budget and FIRE read the account's whole `expenses`
 * collection to show a month and its surroundings, and the cost was the client SDK deserialising
 * every document on the main thread — a cost that grew with every year recorded. Each of them now
 * reads the rows between two bounds (`useExpensesInRange`, lib/hooks/useExpenses.ts) and keeps
 * deriving its figures in memory with the same pure functions: the functions did not change, what
 * they receive did.
 *
 * WHO HAS NO WINDOW, by declared need, and stays on `useExpenses`: Storico (the Driver spans every
 * year), Centri di Costo (a centre is lifetime), Hall of Fame's recalculation — and Analisi. Its
 * Scheda, Confronto, Dettaglio and search span the history from the floor on, and the Andamento
 * ranks its categories on the rows after this year too: on the owner's account a window would
 * have left out 48 rows of 1547, for one more list in memory and on disk (measured 2026-09-30).
 *
 * A window is the UNION of what its page reads, the readers outside the period included (the
 * savings history behind a month, a chart that draws a range's last month whole, a budget's
 * trailing months).
 * A row a reader asks for and the window leaves out is a figure that changes without an error, so
 * `__tests__/expenseWindows.test.ts` runs every reader on the window's rows and on the whole list
 * and compares the two.
 *
 * THE BOUNDS ARE CALENDAR DAYS, NEVER UTC. The form saves a row at LOCAL midnight
 * (`new Date('2026-09-01T00:00:00')`, no `Z`), the period slice compares in the browser's calendar
 * (`periodToRange`) and every month bucket reads the ITALIAN one (`getItalyMonth`). So a window
 * opens at the EARLIER of the two midnights of its first day and closes at the LATER of the two
 * ends of its last: in Italy the two calendars are the same instants, anywhere else the window is
 * a few hours wider and never narrower. A bound at `Date.UTC(y, m, 1)` would drop every row of
 * the 1st (22:00Z of the day before, in an Italian summer).
 */

import { fromZonedTime } from 'date-fns-tz';
import { ITALY_TIMEZONE, getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { type Period, periodToRange } from '@/lib/utils/period';

/** Both ends included, like the Firestore query that reads it (`>= from`, `<= to`). */
export interface ExpenseWindow {
  from: Date;
  to: Date;
}

/**
 * Months Tracciamento reads behind the start of its period: the previous period of the delta (a
 * month, or a whole year), the six months of the flow chart and the twelve of the savings history.
 */
const TRACKING_LOOKBACK_MONTHS = 12;

/**
 * Months of the Budget hero's bars, the running one included (`trailingMonthKeys`,
 * lib/utils/budgetSummary.ts, counts with this constant — the window and the bars cannot drift).
 */
export const BUDGET_HISTORY_MONTHS = 6;

/**
 * Months the FIRE history reads behind the first snapshot: its first point is a trailing
 * twelve-month spending figure (`buildFIREData`, lib/services/fireService.ts, reads this constant).
 */
export const FIRE_HISTORY_LOOKBACK_MONTHS = 11;

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The first instant of a calendar day, in whichever of the two calendars reaches it first.
 * `month` is 1-based and may overflow (0, −3, 14): the local Date normalises it, and the Italian
 * midnight is built from the normalised day.
 */
function startOfCalendarDay(year: number, month: number, day: number): Date {
  const local = new Date(year, month - 1, day);
  const italian = fromZonedTime(`${isoDay(local)}T00:00:00.000`, ITALY_TIMEZONE);
  return local < italian ? local : italian;
}

/** The last instant of a calendar day, in whichever of the two calendars leaves it last. */
function endOfCalendarDay(year: number, month: number, day: number): Date {
  const local = new Date(year, month - 1, day, 23, 59, 59, 999);
  const italian = fromZonedTime(`${isoDay(local)}T23:59:59.999`, ITALY_TIMEZONE);
  return local > italian ? local : italian;
}

/** The last instant of a month: day 0 of the next one (`endOfMonthBound`, in both calendars). */
function endOfCalendarMonth(year: number, month: number): Date {
  return endOfCalendarDay(year, month + 1, 0);
}

/**
 * Cashflow › Tracciamento (and Divisione, which sits on the same axis): from the first day of the
 * month twelve months before the period starts to the end of the MONTH the period ends in.
 *
 * The period's own rows are all in it, the ones dated after today included — a recurring series is
 * real future-dated rows, and the «in calendario» readings count them. Behind the period the tab
 * reads its predecessor (`previousPeriod`: the previous month, or the previous year whole), the
 * same days of the previous month, the trailing six months of the flow chart and the trailing
 * twelve of the savings history — every one of them inside the twelve months. Both charts draw
 * the period's last month WHOLE (`resolveAnchorMonth`), so a custom range that stops on the 20th
 * still reads its month to the end: the window closes on the month, not on the range's last day.
 */
export function trackingWindow(period: Period): ExpenseWindow {
  const range = periodToRange(period);
  return {
    from: startOfCalendarDay(range.from.getFullYear(), range.from.getMonth() + 1 - TRACKING_LOOKBACK_MONTHS, 1),
    to: endOfCalendarMonth(range.to.getFullYear(), range.to.getMonth() + 1),
  };
}

/**
 * Cashflow › Budget: from the older of January and the first of the trailing months of the
 * hero's bars, to the end of the year.
 *
 * The annual budgets read the whole Italian year — the rows already in the calendar for the
 * months ahead count in «impegnato», so the window closes on December and not on today's month —
 * and the six bars read six months whatever the year: from January to May they reach into the
 * year before.
 */
export function budgetWindow(now: Date): ExpenseWindow {
  const today = getItalyMonthYear(now);
  const historyStart = startOfCalendarDay(today.year, today.month - (BUDGET_HISTORY_MONTHS - 1), 1);
  const yearStart = startOfCalendarDay(today.year, 1, 1);
  return {
    from: historyStart < yearStart ? historyStart : yearStart,
    to: endOfCalendarMonth(today.year, 12),
  };
}

/**
 * The years a NEW budget's suggested amount is drawn from (`getDefaultAmount`: the most recent
 * year before this one with spending on the category, back to the floor) — read by the budget
 * dialog alone, when it opens. A window of its own because the suggestion needs WHOLE years: the
 * months of last year that `budgetWindow` holds from January to May would read as a year's total.
 *
 * Null when the floor leaves no year before this one: there is nothing to suggest from.
 */
export function budgetSuggestionWindow(now: Date, historyStartYear: number): ExpenseWindow | null {
  const lastYear = getItalyMonthYear(now).year - 1;
  if (historyStartYear > lastYear) return null;
  return { from: startOfCalendarDay(historyStartYear, 1, 1), to: endOfCalendarMonth(lastYear, 12) };
}

export interface FireWindows {
  /**
   * January of last year → the end of this year: what the FIRE number, the verdict and the
   * projection read (`computeAnnualCashflowData`, `computeLastYearExpenses`) on all three tabs,
   * and the recent end of the Calcolatore's history.
   */
  recent: ExpenseWindow;
  /**
   * What the Calcolatore's history reads BEFORE `recent` — from eleven months before the first
   * snapshot — or null when the history does not reach that far back (or there is no snapshot).
   * It ends one millisecond before `recent` starts, so the two lists concatenate with no row
   * twice and none missing.
   */
  older: ExpenseWindow | null;
}

/**
 * FIRE e Simulazioni: two windows, because the page has two depths. Every tab needs last year and
 * this one for the expenses the number stands on; only the Calcolatore's «Dettaglio» needs the
 * spending behind every snapshot, and it can wait for the snapshots to say how far back that is.
 *
 * The recent window closes on December and not on today's month, though the number reads up to
 * today: the history reads up to the month of the LAST snapshot, which the server stamps — on a
 * device whose clock is behind, that month is ahead of «this month», and the year's end keeps it
 * inside at the price of the few rows already in the calendar.
 *
 * @param now - The tab's clock
 * @param firstSnapshot - The oldest snapshot's month (1-12), or null before the snapshots are read
 */
export function fireWindows(now: Date, firstSnapshot: { year: number; month: number } | null): FireWindows {
  const today = getItalyMonthYear(now);
  const recent: ExpenseWindow = {
    from: startOfCalendarDay(today.year - 1, 1, 1),
    to: endOfCalendarMonth(today.year, 12),
  };
  if (!firstSnapshot) return { recent, older: null };

  const historyStart = startOfCalendarDay(firstSnapshot.year, firstSnapshot.month - FIRE_HISTORY_LOOKBACK_MONTHS, 1);
  if (historyStart >= recent.from) return { recent, older: null };
  return { recent, older: { from: historyStart, to: new Date(recent.from.getTime() - 1) } };
}

/**
 * The years a period picker offers, newest first: every year from the oldest row's to the
 * newest's, in the browser's calendar (the one the period slice compares in).
 *
 * A page that reads a window cannot list the years its rows fall in — the rows outside the
 * window are not there — so the list comes from the two ends of the collection
 * (`useExpenseBounds`). It is CONTIGUOUS: a year between the two with no row at all is offered
 * too, and opens on an empty period like an empty month does.
 */
export function listExpenseYears(bounds: { oldest: Date; newest: Date } | null | undefined): number[] {
  if (!bounds) return [];
  const years: number[] = [];
  for (let year = bounds.newest.getFullYear(); year >= bounds.oldest.getFullYear(); year--) years.push(year);
  return years;
}
