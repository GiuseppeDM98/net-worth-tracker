import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  periodLabel,
  periodToRange,
  currentMonthPeriod,
  isCurrentMonth,
  isPrevMonth,
  isCurrentYear,
  parseDateInput,
  type Period,
} from '@/lib/utils/period';
import { getItalyYear, getItalyMonth } from '@/lib/utils/dateHelpers';

// ─── periodLabel ──────────────────────────────────────────────────────────────

describe('periodLabel', () => {
  it('formats a month period in Italian (full name + year)', () => {
    const p: Period = { kind: 'month', year: 2025, month: 1 };
    expect(periodLabel(p)).toBe('Gennaio 2025');
  });

  it('formats each month name correctly', () => {
    const names = [
      'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
      'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
    ];
    names.forEach((name, i) => {
      expect(periodLabel({ kind: 'month', year: 2024, month: i + 1 })).toBe(`${name} 2024`);
    });
  });

  it('formats a year period as a plain number string', () => {
    expect(periodLabel({ kind: 'year', year: 2023 })).toBe('2023');
  });

  it('formats a custom period with Italian locale (d MMM yyyy – d MMM yyyy)', () => {
    const p: Period = {
      kind: 'custom',
      from: new Date(2024, 2, 1),  // 1 Mar 2024
      to: new Date(2024, 4, 31),   // 31 May 2024
    };
    const label = periodLabel(p);
    expect(label).toMatch(/mar/i);
    expect(label).toMatch(/mag/i);
    expect(label).toContain('2024');
    expect(label).toContain('–');
  });

  it('formats a single-day custom period correctly', () => {
    const day = new Date(2024, 5, 15); // 15 Jun 2024
    const p: Period = { kind: 'custom', from: day, to: day };
    const label = periodLabel(p);
    expect(label).toContain('15');
    expect(label).toMatch(/giu/i);
    expect(label).toContain('2024');
  });
});

// ─── periodToRange ────────────────────────────────────────────────────────────

describe('the ytd kind', () => {
  it('should span January to the end of throughMonth, without reading a clock', () => {
    const { from, to } = periodToRange({ kind: 'ytd', year: 2026, throughMonth: 8 });
    expect(from).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
    // Inclusive upper bound: the last instant of August, not the 1st of September.
    expect(to.getFullYear()).toBe(2026);
    expect(to.getMonth()).toBe(7);
    expect(to.getDate()).toBe(31);
  });

  it('should name itself by its months, never by the bare year', () => {
    // «2026» alone is the WHOLE year — a different period, so the label must differ.
    expect(periodLabel({ kind: 'ytd', year: 2026, throughMonth: 8 })).toBe('2026 · gen–ago');
    expect(periodLabel({ kind: 'ytd', year: 2026, throughMonth: 1 })).toBe('2026 · gen–gen');
    expect(periodLabel({ kind: 'year', year: 2026 })).toBe('2026');
  });

  it('should not be mistaken for the whole current year', () => {
    expect(isCurrentYear({ kind: 'ytd', year: 2026, throughMonth: 8 })).toBe(false);
  });
});

describe('periodToRange', () => {
  it('returns start-of-month to end-of-month for a month period', () => {
    const p: Period = { kind: 'month', year: 2024, month: 3 };
    const { from, to } = periodToRange(p);
    expect(from.getFullYear()).toBe(2024);
    expect(from.getMonth()).toBe(2); // March = index 2
    expect(from.getDate()).toBe(1);
    expect(from.getHours()).toBe(0);

    expect(to.getFullYear()).toBe(2024);
    expect(to.getMonth()).toBe(2);
    expect(to.getDate()).toBe(31); // March has 31 days
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
  });

  it('returns start-of-year to end-of-year for a year period', () => {
    const p: Period = { kind: 'year', year: 2023 };
    const { from, to } = periodToRange(p);
    expect(from.getFullYear()).toBe(2023);
    expect(from.getMonth()).toBe(0);
    expect(from.getDate()).toBe(1);

    expect(to.getFullYear()).toBe(2023);
    expect(to.getMonth()).toBe(11);
    expect(to.getDate()).toBe(31);
  });

  it('returns start-of-day to end-of-day for a custom period', () => {
    const from = new Date(2024, 0, 10);
    const to = new Date(2024, 0, 20);
    const p: Period = { kind: 'custom', from, to };
    const range = periodToRange(p);
    expect(range.from.getDate()).toBe(10);
    expect(range.from.getHours()).toBe(0);
    expect(range.to.getDate()).toBe(20);
    expect(range.to.getHours()).toBe(23);
    expect(range.to.getMinutes()).toBe(59);
    expect(range.to.getSeconds()).toBe(59);
  });

  it('handles February correctly in a leap year', () => {
    const p: Period = { kind: 'month', year: 2024, month: 2 };
    const { from, to } = periodToRange(p);
    expect(to.getDate()).toBe(29); // 2024 is a leap year
  });

  it('handles February correctly in a non-leap year', () => {
    const p: Period = { kind: 'month', year: 2023, month: 2 };
    const { from, to } = periodToRange(p);
    expect(to.getDate()).toBe(28);
  });
});

// ─── currentMonthPeriod ───────────────────────────────────────────────────────

describe('currentMonthPeriod', () => {
  it('returns a month period matching the current Italian date', () => {
    const p = currentMonthPeriod();
    expect(p.kind).toBe('month');
    if (p.kind === 'month') {
      expect(p.year).toBe(getItalyYear());
      expect(p.month).toBe(getItalyMonth());
    }
  });
});

// ─── isCurrentMonth ───────────────────────────────────────────────────────────

describe('isCurrentMonth', () => {
  it('returns true for the current Italian month', () => {
    expect(isCurrentMonth({ kind: 'month', year: getItalyYear(), month: getItalyMonth() })).toBe(true);
  });

  it('returns false for a different month in the same year', () => {
    const otherMonth = getItalyMonth() === 1 ? 2 : 1;
    expect(isCurrentMonth({ kind: 'month', year: getItalyYear(), month: otherMonth })).toBe(false);
  });

  it('returns false for a past year', () => {
    expect(isCurrentMonth({ kind: 'month', year: getItalyYear() - 1, month: getItalyMonth() })).toBe(false);
  });

  it('returns false for a year period', () => {
    expect(isCurrentMonth({ kind: 'year', year: getItalyYear() })).toBe(false);
  });

  it('returns false for a custom period', () => {
    const d = new Date();
    expect(isCurrentMonth({ kind: 'custom', from: d, to: d })).toBe(false);
  });
});

// ─── isPrevMonth ──────────────────────────────────────────────────────────────

describe('isPrevMonth', () => {
  it('returns true for the previous Italian calendar month', () => {
    // Compute prev month in Italy time.
    const prevYear = getItalyMonth() === 1 ? getItalyYear() - 1 : getItalyYear();
    const prevMonth = getItalyMonth() === 1 ? 12 : getItalyMonth() - 1;
    expect(isPrevMonth({ kind: 'month', year: prevYear, month: prevMonth })).toBe(true);
  });

  it('returns false for the current Italian month', () => {
    expect(isPrevMonth({ kind: 'month', year: getItalyYear(), month: getItalyMonth() })).toBe(false);
  });

  it('returns false for year/custom periods', () => {
    const d = new Date();
    expect(isPrevMonth({ kind: 'year', year: getItalyYear() })).toBe(false);
    expect(isPrevMonth({ kind: 'custom', from: d, to: d })).toBe(false);
  });
});

// ─── isCurrentYear ────────────────────────────────────────────────────────────

describe('isCurrentYear', () => {
  it('returns true for the current Italian year', () => {
    expect(isCurrentYear({ kind: 'year', year: getItalyYear() })).toBe(true);
  });

  it('returns false for past years', () => {
    expect(isCurrentYear({ kind: 'year', year: getItalyYear() - 1 })).toBe(false);
  });

  it('returns false for a month period', () => {
    expect(isCurrentYear({ kind: 'month', year: getItalyYear(), month: 1 })).toBe(false);
  });

  it('returns false for a custom period', () => {
    const d = new Date();
    expect(isCurrentYear({ kind: 'custom', from: d, to: d })).toBe(false);
  });
});

// ─── parseDateInput ───────────────────────────────────────────────────────────

describe('parseDateInput', () => {
  it('parses a valid DD/MM/YYYY string', () => {
    const d = parseDateInput('15/06/2024');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(5); // June = index 5
    expect(d!.getDate()).toBe(15);
  });

  it('parses 01/01/2000 correctly', () => {
    const d = parseDateInput('01/01/2000');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2000);
    expect(d!.getMonth()).toBe(0);
    expect(d!.getDate()).toBe(1);
  });

  it('returns null for wrong format (YYYY-MM-DD)', () => {
    expect(parseDateInput('2024-06-15')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDateInput('')).toBeNull();
  });

  it('returns null for partial string', () => {
    expect(parseDateInput('15/06')).toBeNull();
  });

  it('returns null for an impossible date (day 32)', () => {
    expect(parseDateInput('32/01/2024')).toBeNull();
  });

  it('returns null for an impossible date (month 13)', () => {
    expect(parseDateInput('01/13/2024')).toBeNull();
  });

  it('returns null for 29/02 in a non-leap year', () => {
    expect(parseDateInput('29/02/2023')).toBeNull();
  });

  it('parses 29/02 in a leap year', () => {
    const d = parseDateInput('29/02/2024');
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(29);
  });

  it('returns null for non-numeric input', () => {
    expect(parseDateInput('aa/bb/cccc')).toBeNull();
  });
});
