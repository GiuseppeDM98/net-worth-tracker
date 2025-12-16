import { Timestamp } from 'firebase/firestore';

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
