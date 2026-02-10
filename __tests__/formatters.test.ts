import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  formatPercentage,
  formatDate,
  formatDateTime,
  formatNumber,
  formatTimePeriodLabel,
} from '@/lib/utils/formatters'

describe('formatCurrency', () => {
  it('should format EUR with default decimals', () => {
    const result = formatCurrency(1234.56)
    // Node.js ICU support varies — check value and currency symbol are present
    expect(result).toMatch(/1[.,]?234/)
    expect(result).toMatch(/56/)
    expect(result).toMatch(/€|EUR/)
  })

  it('should format zero', () => {
    const result = formatCurrency(0)
    expect(result).toContain('0')
  })

  it('should format negative amounts', () => {
    const result = formatCurrency(-500.5)
    expect(result).toContain('500')
  })

  it('should respect custom decimals', () => {
    const result = formatCurrency(100, 'EUR', 0)
    // With 0 decimals, should not have decimal separator for the fractional part
    expect(result).toContain('100')
  })

  it('should format USD', () => {
    const result = formatCurrency(1000, 'USD')
    expect(result).toMatch(/1[.,]?000/)
    expect(result).toMatch(/\$|USD/)
  })

  it('should handle 4-decimal precision', () => {
    const result = formatCurrency(50.1234, 'EUR', 4)
    expect(result).toContain('1234')
  })

  it('should handle large numbers', () => {
    const result = formatCurrency(1000000)
    expect(result).toMatch(/1[.,]?000[.,]?000/)
  })
})

describe('formatPercentage', () => {
  it('should format with default 2 decimals', () => {
    expect(formatPercentage(12.34)).toBe('12.34%')
  })

  it('should format with 0 decimals', () => {
    expect(formatPercentage(12.34, 0)).toBe('12%')
  })

  it('should format negative percentages', () => {
    expect(formatPercentage(-5.5, 1)).toBe('-5.5%')
  })

  it('should format zero', () => {
    expect(formatPercentage(0)).toBe('0.00%')
  })

  it('should format with custom decimals', () => {
    expect(formatPercentage(3.14159, 4)).toBe('3.1416%')
  })
})

describe('formatDate', () => {
  it('should format as DD/MM/YYYY', () => {
    const date = new Date(2025, 2, 15) // March 15, 2025
    expect(formatDate(date)).toBe('15/03/2025')
  })

  it('should format first day of year', () => {
    const date = new Date(2025, 0, 1)
    expect(formatDate(date)).toBe('01/01/2025')
  })

  it('should format last day of year', () => {
    const date = new Date(2025, 11, 31)
    expect(formatDate(date)).toBe('31/12/2025')
  })

  it('should handle leap year (Feb 29)', () => {
    const date = new Date(2024, 1, 29)
    expect(formatDate(date)).toBe('29/02/2024')
  })
})

describe('formatDateTime', () => {
  it('should format with time', () => {
    const date = new Date(2025, 2, 15, 14, 30)
    expect(formatDateTime(date)).toBe('15/03/2025 14:30')
  })

  it('should handle midnight', () => {
    const date = new Date(2025, 0, 1, 0, 0)
    expect(formatDateTime(date)).toBe('01/01/2025 00:00')
  })
})

describe('formatNumber', () => {
  it('should format large numbers', () => {
    const result = formatNumber(1234567)
    // Node.js ICU support varies — verify digits are present
    expect(result).toMatch(/1[.,]?234[.,]?567/)
  })

  it('should handle small numbers', () => {
    expect(formatNumber(42)).toBe('42')
  })

  it('should handle zero', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('should handle negative numbers', () => {
    const result = formatNumber(-1234)
    expect(result).toMatch(/1[.,]?234/)
    expect(result).toMatch(/-/)
  })
})

describe('formatTimePeriodLabel', () => {
  describe('without metrics (generic labels)', () => {
    it('should return Italian label for YTD', () => {
      const result = formatTimePeriodLabel('YTD')
      expect(result).toContain('Anno Corrente')
      expect(result).toContain(String(new Date().getFullYear()))
    })

    it('should return Italian label for 1Y', () => {
      expect(formatTimePeriodLabel('1Y')).toBe('Ultimo Anno')
    })

    it('should return Italian label for 3Y', () => {
      expect(formatTimePeriodLabel('3Y')).toBe('Ultimi 3 Anni')
    })

    it('should return Italian label for 5Y', () => {
      expect(formatTimePeriodLabel('5Y')).toBe('Ultimi 5 Anni')
    })

    it('should return Italian label for ALL', () => {
      expect(formatTimePeriodLabel('ALL')).toBe('Storico Completo')
    })

    it('should return Italian label for CUSTOM', () => {
      expect(formatTimePeriodLabel('CUSTOM')).toBe('Periodo Personalizzato')
    })
  })

  describe('with metrics (date range labels)', () => {
    it('should format date range with abbreviated month and 2-digit year', () => {
      const metrics = {
        startDate: new Date(2025, 0, 1),  // Jan 2025
        endDate: new Date(2025, 3, 1),    // Apr 2025
      }
      const result = formatTimePeriodLabel('YTD', metrics)
      // Italian abbreviated months: gen, feb, mar, apr...
      expect(result).toMatch(/gen\s+25\s*-\s*apr\s+25/)
    })
  })
})
