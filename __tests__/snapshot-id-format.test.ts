import { describe, it, expect } from 'vitest'

/**
 * Generate snapshot document ID.
 * Canonical format: "userId-YYYY-M" (month WITHOUT zero-padding).
 *
 * Local copy for isolated testing — mirrors the inline template literal
 * used in snapshotService.ts and manual snapshot route.
 */
function generateSnapshotId(
  userId: string,
  year: number,
  month: number
): string {
  return `${userId}-${year}-${month}`;
}

describe('Snapshot ID Format', () => {
  describe('generateSnapshotId', () => {
    it('should generate ID without month padding for months 1-9', () => {
      const userId = 'test-user';
      const year = 2024;

      for (let month = 1; month <= 9; month++) {
        const snapshotId = generateSnapshotId(userId, year, month);
        expect(snapshotId).toBe(`test-user-2024-${month}`);
        expect(snapshotId).not.toMatch(/-0\d$/);
      }
    });

    it('should generate ID without padding for months 10-12', () => {
      const userId = 'test-user';
      const year = 2024;

      for (let month = 10; month <= 12; month++) {
        const snapshotId = generateSnapshotId(userId, year, month);
        expect(snapshotId).toBe(`test-user-2024-${month}`);
      }
    });

    it('should handle userId with hyphens', () => {
      const snapshotId = generateSnapshotId('user-with-hyphens-123', 2024, 3);
      expect(snapshotId).toBe('user-with-hyphens-123-2024-3');
    });

    it('should match expected regex pattern', () => {
      const snapshotId = generateSnapshotId('test-user', 2024, 5);
      expect(snapshotId).toMatch(/^[a-zA-Z0-9-]+-\d{4}-\d{1,2}$/);
    });

    it('should create different IDs for different months', () => {
      const jan = generateSnapshotId('test-user', 2024, 1);
      const feb = generateSnapshotId('test-user', 2024, 2);
      const dec = generateSnapshotId('test-user', 2024, 12);

      expect(jan).toBe('test-user-2024-1');
      expect(feb).toBe('test-user-2024-2');
      expect(dec).toBe('test-user-2024-12');
      expect(new Set([jan, feb, dec]).size).toBe(3);
    });
  });

  describe('Regression Prevention', () => {
    it('should NOT use padStart for month formatting', () => {
      const snapshotId = generateSnapshotId('test-user', 2024, 3);

      // Padded format would be wrong
      expect(snapshotId).not.toBe('test-user-2024-03');
      expect(snapshotId).toBe('test-user-2024-3');
    });

    it('should produce different result than padStart implementation', () => {
      // Documents the bug that was fixed: padStart(2, '0') added zero-padding
      const wrong = `test-user-2024-${String(3).padStart(2, '0')}`;
      const correct = `test-user-2024-${3}`;

      expect(wrong).toBe('test-user-2024-03');
      expect(correct).toBe('test-user-2024-3');
      expect(wrong).not.toBe(correct);
    });
  });

  describe('Edge Cases', () => {
    it('should handle January (month 1) without padding', () => {
      const id = generateSnapshotId('user123', 2024, 1);
      expect(id).toBe('user123-2024-1');
      expect(id).not.toBe('user123-2024-01');
    });

    it('should handle September (month 9) without padding', () => {
      const id = generateSnapshotId('user123', 2024, 9);
      expect(id).toBe('user123-2024-9');
      expect(id).not.toBe('user123-2024-09');
    });

    it('should handle October (month 10) as-is', () => {
      expect(generateSnapshotId('user123', 2024, 10)).toBe('user123-2024-10');
    });

    it('should handle December (month 12) as-is', () => {
      expect(generateSnapshotId('user123', 2024, 12)).toBe('user123-2024-12');
    });
  });
});
