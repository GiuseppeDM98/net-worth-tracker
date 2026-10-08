/**
 * `resolveDisplayName` — the decision AuthContext takes AFTER the gate has opened (since 2026-09-28): which
 * name to show, and whether the Auth profile should learn it so the next sign-in needs no read.
 */
import { describe, it, expect } from 'vitest';
import { resolveDisplayName } from '@/lib/utils/authProfile';

describe('resolveDisplayName', () => {
  it('should take the Auth profile name and ask for no backfill when Auth has one', () => {
    const result = resolveDisplayName({ displayName: 'Giuseppe Rossi' }, { displayName: 'Altro Nome' });

    expect(result).toEqual({ displayName: 'Giuseppe Rossi', shouldBackfillAuthProfile: false });
  });

  it('should fall back to the Firestore document and ask for the backfill when Auth has none', () => {
    const result = resolveDisplayName({ displayName: null }, { displayName: 'Giuseppe Rossi' });

    expect(result).toEqual({ displayName: 'Giuseppe Rossi', shouldBackfillAuthProfile: true });
  });

  it('should answer null, without a backfill, when the document is missing', () => {
    expect(resolveDisplayName({ displayName: null }, null)).toEqual({
      displayName: null,
      shouldBackfillAuthProfile: false,
    });
  });

  it('should treat an empty, blank or non-string document name as absent', () => {
    expect(resolveDisplayName({ displayName: '' }, { displayName: '' }).displayName).toBeNull();
    expect(resolveDisplayName({ displayName: null }, { displayName: '   ' }).displayName).toBeNull();
    expect(resolveDisplayName({ displayName: null }, { displayName: 42 }).displayName).toBeNull();
    expect(resolveDisplayName({ displayName: null }, {}).shouldBackfillAuthProfile).toBe(false);
  });

  it('should trim the name it returns from either source', () => {
    expect(resolveDisplayName({ displayName: '  Anna  ' }, null).displayName).toBe('Anna');
    expect(resolveDisplayName({ displayName: null }, { displayName: ' Anna ' }).displayName).toBe('Anna');
  });
});
