import { describe, it, expect } from 'vitest';

import {
  buildRecurrenceDates,
  canTypeRecur,
  describeRecurrence,
  DEFAULT_RECURRENCE_FREQUENCY,
  MAX_RECURRENCE_OCCURRENCES,
  resolveRecurrenceFrequency,
} from '@/lib/utils/recurrenceDates';
import { ExpenseType } from '@/types/expenses';

/**
 * Dates are compared as local calendar fields, never as ISO strings: an ISO comparison passes
 * or fails depending on the runner's timezone, which is precisely the class of bug the suite
 * is asked to catch (AGENTS.md → Testing and Workflow).
 */
function toCalendar(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function calendarList(dates: Date[]): string[] {
  return dates.map(toCalendar);
}

/**
 * Builds a start date the way the dialog does — `new Date(value + 'T00:00:00')` on an
 * `<input type="date">` value, i.e. LOCAL midnight, not the noon every other fixture uses.
 * Under TZ=Europe/Rome a naive implementation reading UTC fields would slide these back a day.
 */
function localMidnight(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

describe('recurrenceDates', () => {
  describe('canTypeRecur', () => {
    it.each<ExpenseType>(['fixed', 'variable', 'debt'])('should allow %s to recur', (type) => {
      expect(canTypeRecur(type)).toBe(true);
    });

    it('should refuse income, which the product excludes by decision', () => {
      expect(canTypeRecur('income')).toBe(false);
    });

    it('should refuse transfer, whose occurrences would each move two cash accounts', () => {
      expect(canTypeRecur('transfer')).toBe(false);
    });
  });

  describe('resolveRecurrenceFrequency', () => {
    it('should read a row written before the yearly cadence existed as monthly', () => {
      expect(resolveRecurrenceFrequency(undefined)).toBe('monthly');
      expect(DEFAULT_RECURRENCE_FREQUENCY).toBe('monthly');
    });

    it('should preserve an explicit cadence', () => {
      expect(resolveRecurrenceFrequency('yearly')).toBe('yearly');
      expect(resolveRecurrenceFrequency('monthly')).toBe('monthly');
    });
  });

  describe('buildRecurrenceDates — monthly', () => {
    it('should produce one date per month, on the requested day', () => {
      const dates = buildRecurrenceDates({
        start: localMidnight('2026-01-10'),
        frequency: 'monthly',
        count: 4,
        dayOfMonth: 10,
      });

      expect(calendarList(dates)).toEqual([
        '2026-01-10',
        '2026-02-10',
        '2026-03-10',
        '2026-04-10',
      ]);
    });

    it('should roll into the following years without extra arithmetic', () => {
      const dates = buildRecurrenceDates({
        start: localMidnight('2026-11-05'),
        frequency: 'monthly',
        count: 15,
        dayOfMonth: 5,
      });

      expect(dates).toHaveLength(15);
      expect(toCalendar(dates[0])).toBe('2026-11-05');
      expect(toCalendar(dates[2])).toBe('2027-01-05');
      expect(toCalendar(dates[14])).toBe('2028-01-05');
    });

    it('should clamp a day the month does not have to that month, not to the next one', () => {
      // The regression this file exists for: the previous implementation let
      // `new Date(2026, 1, 31)` overflow into March and then pushed it a further month, so
      // February got no payment and March got two.
      const dates = buildRecurrenceDates({
        start: localMidnight('2026-01-31'),
        frequency: 'monthly',
        count: 4,
        dayOfMonth: 31,
      });

      expect(calendarList(dates)).toEqual([
        '2026-01-31',
        '2026-02-28',
        '2026-03-31',
        '2026-04-30',
      ]);
    });

    it('should clamp to 29 February on a leap year', () => {
      const dates = buildRecurrenceDates({
        start: localMidnight('2028-01-30'),
        frequency: 'monthly',
        count: 2,
        dayOfMonth: 30,
      });

      expect(calendarList(dates)).toEqual(['2028-01-30', '2028-02-29']);
    });

    it('should not let a clamped occurrence shift the ones after it', () => {
      const dates = buildRecurrenceDates({
        start: localMidnight('2026-01-31'),
        frequency: 'monthly',
        count: 13,
        dayOfMonth: 31,
      });

      // Every month gets exactly one payment, and the anchor day survives February.
      expect(toCalendar(dates[1])).toBe('2026-02-28');
      expect(toCalendar(dates[12])).toBe('2027-01-31');
      expect(new Set(dates.map((d) => `${d.getFullYear()}-${d.getMonth()}`)).size).toBe(13);
    });

    it('should fall back to the day of the start date when none is given', () => {
      const dates = buildRecurrenceDates({
        start: localMidnight('2026-06-17'),
        frequency: 'monthly',
        count: 2,
      });

      expect(calendarList(dates)).toEqual(['2026-06-17', '2026-07-17']);
    });

    it('should produce every occurrence at local midnight', () => {
      const dates = buildRecurrenceDates({
        start: localMidnight('2026-03-15'),
        frequency: 'monthly',
        count: 3,
        dayOfMonth: 15,
      });

      for (const date of dates) {
        expect([date.getHours(), date.getMinutes(), date.getSeconds()]).toEqual([0, 0, 0]);
      }
    });
  });

  describe('buildRecurrenceDates — yearly', () => {
    it('should keep the month and advance the year', () => {
      const dates = buildRecurrenceDates({
        start: localMidnight('2026-09-01'),
        frequency: 'yearly',
        count: 3,
        dayOfMonth: 1,
      });

      expect(calendarList(dates)).toEqual(['2026-09-01', '2027-09-01', '2028-09-01']);
    });

    it('should clamp 29 February onto 28 February in non-leap years', () => {
      const dates = buildRecurrenceDates({
        start: localMidnight('2028-02-29'),
        frequency: 'yearly',
        count: 5,
        dayOfMonth: 29,
      });

      expect(calendarList(dates)).toEqual([
        '2028-02-29',
        '2029-02-28',
        '2030-02-28',
        '2031-02-28',
        '2032-02-29',
      ]);
    });
  });

  describe('buildRecurrenceDates — bounds', () => {
    it('should return an empty list for a count below one', () => {
      const start = localMidnight('2026-01-10');
      expect(buildRecurrenceDates({ start, frequency: 'monthly', count: 0 })).toEqual([]);
      expect(buildRecurrenceDates({ start, frequency: 'monthly', count: -3 })).toEqual([]);
      expect(buildRecurrenceDates({ start, frequency: 'yearly', count: Number.NaN })).toEqual([]);
    });

    it('should return exactly one date for a count of one', () => {
      const dates = buildRecurrenceDates({
        start: localMidnight('2026-01-10'),
        frequency: 'monthly',
        count: 1,
      });

      expect(calendarList(dates)).toEqual(['2026-01-10']);
    });

    it('should span the full ceiling without gaps or duplicates', () => {
      // The 17-year insurance policy this feature was built for, at the monthly ceiling.
      const dates = buildRecurrenceDates({
        start: localMidnight('2026-01-10'),
        frequency: 'monthly',
        count: MAX_RECURRENCE_OCCURRENCES.monthly,
        dayOfMonth: 10,
      });

      expect(dates).toHaveLength(360);
      expect(toCalendar(dates[203])).toBe('2042-12-10'); // month 204 = 17 years
      expect(toCalendar(dates[359])).toBe('2055-12-10');
      expect(new Set(calendarList(dates)).size).toBe(360);
    });

    it('should keep both ceilings under the 500-operation writeBatch limit', () => {
      // createRecurringExpenses commits the whole series in one batch, and
      // deleteRecurringExpenses deletes it in one batch. Raising either ceiling past 500
      // means chunking both — this is the guard that says so out loud.
      expect(MAX_RECURRENCE_OCCURRENCES.monthly).toBeLessThanOrEqual(500);
      expect(MAX_RECURRENCE_OCCURRENCES.yearly).toBeLessThanOrEqual(500);
    });
  });

  describe('describeRecurrence', () => {
    it('should describe a monthly series by its day alone', () => {
      expect(describeRecurrence('monthly', 10, localMidnight('2026-03-10'))).toBe(
        'Ogni mese, il giorno 10'
      );
    });

    it('should name the month for a yearly series, which the day alone cannot identify', () => {
      expect(describeRecurrence('yearly', 15, localMidnight('2026-09-15'))).toBe(
        'Ogni anno, il 15 settembre'
      );
    });

    it('should read a legacy row with no cadence as monthly', () => {
      expect(describeRecurrence(undefined, 3, localMidnight('2025-05-03'))).toBe(
        'Ogni mese, il giorno 3'
      );
    });

    it('should return null when the day is unknown, so the caller can omit the row', () => {
      expect(describeRecurrence('monthly', undefined, localMidnight('2026-03-10'))).toBeNull();
    });
  });
});
