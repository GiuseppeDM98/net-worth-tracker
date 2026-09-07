import { describe, it, expect } from 'vitest';
import {
  SNAPSHOT_USER_AUTHORED_FIELDS,
  preserveUserAuthoredSnapshotFields,
} from '@/lib/utils/snapshotUserFields';

/**
 * The regression these tests pin: the daily cron rewrites the CURRENT month's snapshot
 * with a full `.set()`, so before 2026-09-07 a note typed on Storico was erased the same
 * evening. The recomputed half must still be replaced wholesale.
 */

const recomputedSnapshot = {
  userId: 'user-1',
  year: 2026,
  month: 9,
  totalNetWorth: 294369.4,
  byAssetClass: { equity: 200000, cash: 94369.4 },
};

describe('preserveUserAuthoredSnapshotFields', () => {
  it('should carry the note of the existing snapshot into the recomputed one', () => {
    const existing = { ...recomputedSnapshot, totalNetWorth: 1, note: 'ornitorinco' };

    const result = preserveUserAuthoredSnapshotFields(recomputedSnapshot, existing);

    expect(result.note).toBe('ornitorinco');
  });

  it('should keep every recomputed figure of the new document, never the old one', () => {
    const existing = {
      userId: 'user-1',
      year: 2026,
      month: 9,
      totalNetWorth: 100,
      byAssetClass: { equity: 100, crypto: 999 },
      note: 'fenicottero',
    };

    const result = preserveUserAuthoredSnapshotFields(recomputedSnapshot, existing);

    expect(result.totalNetWorth).toBe(294369.4);
    // A class that left the portfolio must NOT survive — this is why the write is a
    // full replace and not a Firestore merge.
    expect(result.byAssetClass).toEqual({ equity: 200000, cash: 94369.4 });
  });

  it('should return the recomputed document unchanged when no snapshot exists yet', () => {
    const result = preserveUserAuthoredSnapshotFields(recomputedSnapshot, undefined);

    expect(result).toEqual(recomputedSnapshot);
    expect('note' in result).toBe(false);
  });

  it('should not introduce a note key when the existing snapshot has none', () => {
    const existing = { ...recomputedSnapshot };

    const result = preserveUserAuthoredSnapshotFields(recomputedSnapshot, existing);

    // Firestore rejects `undefined`, so an absent note must stay absent, not become one.
    expect('note' in result).toBe(false);
  });

  it('should treat a null note as nothing to preserve', () => {
    const existing = { ...recomputedSnapshot, note: null };

    const result = preserveUserAuthoredSnapshotFields(recomputedSnapshot, existing);

    expect('note' in result).toBe(false);
  });

  it('should not mutate the recomputed document it is given', () => {
    const existing = { ...recomputedSnapshot, note: 'ornitorinco' };

    preserveUserAuthoredSnapshotFields(recomputedSnapshot, existing);

    expect('note' in recomputedSnapshot).toBe(false);
  });

  it('should list the note as the only field no pipeline recomputes', () => {
    // A new hand-written field on MonthlySnapshot has to be added here, or the cron
    // erases it the evening it is written.
    expect(SNAPSHOT_USER_AUTHORED_FIELDS).toEqual(['note']);
  });
});
