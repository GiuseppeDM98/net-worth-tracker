/**
 * The ONE month-end spending projection of the app (Panoramica, Tracciamento, Budget and the
 * budget emails all read it): a plain linear extrapolation of what is booked up to today, plus
 * the rows already dated after today as they are. SDK-free on purpose — the server's email
 * builders import it, and the narrative modules that used to own it pull the Firebase chain.
 */

/**
 * Where the month's spending lands if the current daily pace holds — a plain linear
 * extrapolation, stated as such in the UI ("al ritmo attuale"). Income is deliberately NOT
 * projected the same way: a salary lands once, so extrapolating it would be nonsense.
 * Null before the month has started or on a malformed calendar.
 */
export function projectMonthEndSpending(
  spentSoFar: number,
  dayOfMonth: number,
  daysInMonth: number,
): number | null {
  if (dayOfMonth < 1 || daysInMonth < 1) return null;
  return (spentSoFar / dayOfMonth) * daysInMonth;
}

/**
 * The projection with the scheduled rows folded in: the pace is measured only on what is
 * booked up to today, and a row dated after today (an instalment, a recurring charge) is added
 * as it is — neither "spent" already nor to be scaled by the days left. Same rule as
 * Tracciamento's «Spese a fine mese» and the Panoramica's Cashflow tile.
 */
export function projectMonthEndWithScheduled(
  spentToDate: number,
  scheduled: number,
  dayOfMonth: number,
  daysInMonth: number,
): number | null {
  return projectWindowEndWithScheduled(spentToDate, scheduled, dayOfMonth, daysInMonth);
}

/**
 * The same rule on ANY calendar window — a month (`dayOfMonth` / `daysInMonth`) or a year
 * (`dayOfYear` / `daysInYear`): the pace on what is booked up to today, times the window,
 * plus the rows already dated after today as they are. Centri di Costo projects a center's
 * year-end cost with it; before it, the center used a blended model (this year's pace weighted
 * with last year's), which printed a figure «al ritmo attuale» that was not the current pace.
 * Null on a window that has not started or on a malformed calendar.
 */
export function projectWindowEndWithScheduled(
  spentToDate: number,
  scheduled: number,
  elapsedDays: number,
  totalDays: number,
): number | null {
  if (elapsedDays < 1 || totalDays < 1) return null;
  return (spentToDate / elapsedDays) * totalDays + scheduled;
}
