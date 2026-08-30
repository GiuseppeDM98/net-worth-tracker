import { Timestamp } from 'firebase/firestore';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

// Target timezone for Italian investors
export const ITALY_TIMEZONE = 'Europe/Rome';

/**
 * Convert Firestore Timestamp or Date to Date object
 * Handles edge cases and provides type safety
 */
export function toDate(date: Date | Timestamp | string | undefined | null): Date {
  if (!date) return new Date();
  if (date instanceof Date) return date;
  if (typeof date === 'string') return new Date(date);
  if (typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function') {
    return date.toDate();
  }
  console.warn('Unable to convert date:', date);
  return new Date();
}

/**
 * Last instant of a calendar month, in local time.
 *
 * Day 0 of the following month IS the last day of this one — the Date constructor rolls it back,
 * December included, without anyone having to know how many days February has this year.
 *
 * Use it for every INCLUSIVE upper bound on a month. A range filter reads `date <= endDate`, so a
 * bound left at midnight silently drops everything recorded later that day — in practice the whole
 * closing month of the window, which is exactly how the rolling performance periods used to lose a
 * month of expenses while the main period metrics (which already used this bound) kept it.
 *
 * @param year - Full year
 * @param month - Month, 1-based (1 = January)
 */
export function endOfMonthBound(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

/**
 * Get date converted to Italy timezone (Europe/Rome)
 * Ensures consistent month/year extraction across client and server
 */
export function getItalyDate(date: Date | Timestamp | string | undefined | null = new Date()): Date {
  const dateObj = toDate(date);
  return toZonedTime(dateObj, ITALY_TIMEZONE);
}

/**
 * Today as 'YYYY-MM-DD' in Italian wall-clock time — the value an `<input type="date">` wants.
 *
 * `new Date().toISOString().split('T')[0]` is the obvious spelling and is wrong for a whole hour
 * every evening: `toISOString` is UTC, so from 22:00 Italian summer time (23:00 in winter) it hands
 * back YESTERDAY, and a form that defaults to "today" proposes the previous day to anyone recording
 * something late at night.
 *
 * Built from the zoned date's own components rather than from `toISOString`: `getItalyDate` returns a
 * Date whose LOCAL fields carry the Italian wall clock, so re-serialising it through UTC would undo
 * exactly the shift it just applied.
 */
export function getItalyDateIso(date: Date | Timestamp | string | undefined | null = new Date()): string {
  const italyDate = getItalyDate(date);
  const month = String(italyDate.getMonth() + 1).padStart(2, '0');
  const day = String(italyDate.getDate()).padStart(2, '0');
  return `${italyDate.getFullYear()}-${month}-${day}`;
}

/**
 * True when `date` falls on an Italian calendar day strictly AFTER `reference`'s.
 *
 * The single rule behind every "in calendario" reading in the app. It exists because the domain
 * says *after today* while the values in hand are instants, and the two are not the same thing:
 * an expense saved without touching the date input carries its creation time (18:42), the page's
 * clock is frozen at mount, so a plain `date > now` calls a row recorded an hour ago "scheduled"
 * until the next reload. A CSV-imported row lands at noon and does the same all morning.
 *
 * Comparing the two ISO days as strings is safe and cheap: 'YYYY-MM-DD' sorts lexicographically,
 * so `>` keeps exactly the meaning it had. In a loop over many rows, hoist the right-hand side
 * with `getItalyDateIso(now)` and compare against that instead of calling this per row.
 */
export function isItalyDayAfter(
  date: Date | Timestamp | string,
  reference: Date | Timestamp | string
): boolean {
  return getItalyDateIso(date) > getItalyDateIso(reference);
}

/**
 * Extract month (1-12) from date in Italy timezone
 * Use this instead of date.getMonth() to ensure consistent behavior
 */
export function getItalyMonth(date: Date | Timestamp | string | undefined | null = new Date()): number {
  const italyDate = getItalyDate(date);
  return italyDate.getMonth() + 1; // Returns 1-12
}

/**
 * Extract year from date in Italy timezone
 * Use this instead of date.getFullYear() to ensure consistent behavior
 */
export function getItalyYear(date: Date | Timestamp | string | undefined | null = new Date()): number {
  const italyDate = getItalyDate(date);
  return italyDate.getFullYear();
}

/**
 * Extract both month and year from date in Italy timezone
 * Efficient helper for cases where both values are needed
 */
export function getItalyMonthYear(date: Date | Timestamp | string | undefined | null = new Date()): { month: number; year: number } {
  const italyDate = getItalyDate(date);
  return {
    month: italyDate.getMonth() + 1,
    year: italyDate.getFullYear()
  };
}

/**
 * Format Date or Timestamp to Italian locale (DD/MM/YYYY)
 */
export function formatItalianDate(date: Date | Timestamp | string): string {
  const dateObj = toDate(date);
  return new Intl.DateTimeFormat('it-IT').format(dateObj);
}

/**
 * Returns the UTC instants for the start and end of a calendar day in Italy time.
 *
 * Why: server-side jobs (e.g. the daily dividend cron) run on UTC infrastructure,
 * where `new Date().setHours(0,0,0,0)` yields UTC midnight, not Italian midnight.
 * Payment dates entered by Italian users are conceptually "Italian days", so a
 * UTC window misclassifies a coupon dated "10/06 in Italy" (stored as
 * 2026-06-09T22:00:00Z in summer) — it falls outside the UTC 10/06 window.
 * Building the window from the Italian wall-clock day fixes that boundary.
 *
 * @param date - Any instant within the target day (defaults to now)
 * @returns { start, end } as UTC Date objects spanning the Italian day inclusively
 */
export function getItalyDayBoundsUtc(date: Date = new Date()): { start: Date; end: Date } {
  // Read the Italian wall-clock calendar day for the given instant
  const italyNow = toZonedTime(date, ITALY_TIMEZONE);
  const year = italyNow.getFullYear();
  const month = String(italyNow.getMonth() + 1).padStart(2, '0');
  const day = String(italyNow.getDate()).padStart(2, '0');

  // Interpret these wall-clock strings as Italian local time, convert back to UTC
  const start = fromZonedTime(`${year}-${month}-${day}T00:00:00.000`, ITALY_TIMEZONE);
  const end = fromZonedTime(`${year}-${month}-${day}T23:59:59.999`, ITALY_TIMEZONE);
  return { start, end };
}

/**
 * Compare two dates (ignoring time)
 * Returns true if date1 >= date2
 */
export function isDateOnOrAfter(date1: Date | Timestamp, date2: Date | Timestamp): boolean {
  const d1 = toDate(date1);
  const d2 = toDate(date2);
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  return d1 >= d2;
}
