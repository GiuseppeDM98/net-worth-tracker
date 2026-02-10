import { describe, it, expect } from 'vitest'
import {
  toDate,
  getItalyDate,
  getItalyMonth,
  getItalyYear,
  getItalyMonthYear,
  formatItalianDate,
  isDateOnOrAfter,
} from '@/lib/utils/dateHelpers'

describe('toDate', () => {
  it('should return same Date when given a Date', () => {
    const input = new Date(2025, 5, 15)
    const result = toDate(input)
    expect(result).toBe(input)
  })

  it('should handle Timestamp-like object with toDate()', () => {
    const mockDate = new Date(2025, 0, 1)
    const timestamp = { toDate: () => mockDate }
    // The function checks for 'toDate' method via duck typing
    const result = toDate(timestamp as any)
    expect(result).toEqual(mockDate)
  })

  it('should parse ISO string', () => {
    const result = toDate('2025-03-15T10:00:00Z')
    expect(result).toBeInstanceOf(Date)
    expect(result.getFullYear()).toBe(2025)
  })

  it('should return current date for null', () => {
    const before = Date.now()
    const result = toDate(null)
    const after = Date.now()
    expect(result.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.getTime()).toBeLessThanOrEqual(after)
  })

  it('should return current date for undefined', () => {
    const before = Date.now()
    const result = toDate(undefined)
    const after = Date.now()
    expect(result.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.getTime()).toBeLessThanOrEqual(after)
  })
})

describe('getItalyDate', () => {
  it('should return a Date object', () => {
    const result = getItalyDate(new Date())
    expect(result).toBeInstanceOf(Date)
  })

  it('should convert UTC date to Italy timezone', () => {
    // A well-known UTC date
    const utcDate = new Date('2025-06-15T12:00:00Z')
    const italyDate = getItalyDate(utcDate)
    // Italy is UTC+2 in summer (CEST), so 12:00 UTC = 14:00 Italy
    expect(italyDate.getHours()).toBe(14)
  })
})

describe('getItalyMonth', () => {
  it('should return 1-12 (not 0-11)', () => {
    // January
    const jan = new Date('2025-01-15T12:00:00Z')
    expect(getItalyMonth(jan)).toBe(1)

    // December
    const dec = new Date('2025-12-15T12:00:00Z')
    expect(getItalyMonth(dec)).toBe(12)
  })

  it('should return correct month for mid-year dates', () => {
    const june = new Date('2025-06-15T12:00:00Z')
    expect(getItalyMonth(june)).toBe(6)
  })
})

describe('getItalyYear', () => {
  it('should return correct year', () => {
    const date = new Date('2025-06-15T12:00:00Z')
    expect(getItalyYear(date)).toBe(2025)
  })
})

describe('getItalyMonthYear', () => {
  it('should return both month and year', () => {
    const date = new Date('2025-03-15T12:00:00Z')
    const result = getItalyMonthYear(date)
    expect(result).toEqual({ month: 3, year: 2025 })
  })

  it('should be consistent with individual functions', () => {
    const date = new Date('2025-08-20T12:00:00Z')
    const result = getItalyMonthYear(date)
    expect(result.month).toBe(getItalyMonth(date))
    expect(result.year).toBe(getItalyYear(date))
  })
})

describe('formatItalianDate', () => {
  it('should format as Italian locale (DD/MM/YYYY)', () => {
    const date = new Date(2025, 2, 15) // March 15, 2025
    const result = formatItalianDate(date)
    // Italian format: 15/3/2025 or 15/03/2025
    expect(result).toMatch(/15\/0?3\/2025/)
  })

  it('should handle Timestamp-like objects', () => {
    const mockDate = new Date(2025, 0, 1)
    const timestamp = { toDate: () => mockDate }
    const result = formatItalianDate(timestamp as any)
    expect(result).toMatch(/1\/0?1\/2025/)
  })
})

describe('isDateOnOrAfter', () => {
  it('should return true when date1 > date2', () => {
    const later = new Date(2025, 5, 15)
    const earlier = new Date(2025, 3, 10)
    expect(isDateOnOrAfter(later, earlier)).toBe(true)
  })

  it('should return true when dates are same day (ignoring time)', () => {
    const morning = new Date(2025, 5, 15, 8, 0)
    const evening = new Date(2025, 5, 15, 20, 0)
    expect(isDateOnOrAfter(morning, evening)).toBe(true)
  })

  it('should return false when date1 < date2', () => {
    const earlier = new Date(2025, 3, 10)
    const later = new Date(2025, 5, 15)
    expect(isDateOnOrAfter(earlier, later)).toBe(false)
  })

  it('should handle Timestamp-like objects', () => {
    const d1 = { toDate: () => new Date(2025, 6, 1) }
    const d2 = { toDate: () => new Date(2025, 5, 1) }
    expect(isDateOnOrAfter(d1 as any, d2 as any)).toBe(true)
  })
})
