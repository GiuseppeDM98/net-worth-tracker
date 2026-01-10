import { Timestamp } from 'firebase/firestore';
import { toZonedTime } from 'date-fns-tz';

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
 * Get date converted to Italy timezone (Europe/Rome)
 * Ensures consistent month/year extraction across client and server
 */
export function getItalyDate(date: Date | Timestamp | string | undefined | null = new Date()): Date {
  const dateObj = toDate(date);
  return toZonedTime(dateObj, ITALY_TIMEZONE);
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
