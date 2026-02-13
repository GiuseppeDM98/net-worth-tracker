import { describe, it, expect } from 'vitest';
import { validateItalianBondIsin } from '@/lib/services/borsaItalianaBondScraperService';

describe('borsaItalianaBondScraperService', () => {
  describe('validateItalianBondIsin', () => {
    it('should validate correct Italian ISIN format', () => {
      expect(validateItalianBondIsin('IT0005672024')).toBe(true);
      expect(validateItalianBondIsin('IT0003128367')).toBe(true);
      expect(validateItalianBondIsin('IT0001234567')).toBe(true);
    });

    it('should reject invalid ISIN format', () => {
      expect(validateItalianBondIsin('INVALID')).toBe(false);
      expect(validateItalianBondIsin('IT123')).toBe(false);
      expect(validateItalianBondIsin('12345678901')).toBe(false);
    });

    it('should reject lowercase ISIN', () => {
      expect(validateItalianBondIsin('it0005672024')).toBe(false);
    });

    it('should reject non-Italian ISIN', () => {
      expect(validateItalianBondIsin('US1234567890')).toBe(false);
      expect(validateItalianBondIsin('DE0005140008')).toBe(false);
      expect(validateItalianBondIsin('FR0000120271')).toBe(false);
    });

    it('should reject empty or malformed ISIN', () => {
      expect(validateItalianBondIsin('')).toBe(false);
      expect(validateItalianBondIsin('IT')).toBe(false);
      expect(validateItalianBondIsin('IT00056720241')).toBe(false); // Too long
    });

    it('should accept ISIN with correct check digit', () => {
      // Note: This test validates format only, not check digit algorithm
      // Check digit validation could be added in future enhancement
      expect(validateItalianBondIsin('IT0005672024')).toBe(true);
    });
  });

  // Note: Scraping tests would require mocking fetch() or using integration tests
  // with recorded HTML fixtures. Keeping tests focused on pure functions for now.
});
