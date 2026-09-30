/**
 * `isDemoUid` — the ONE rule that names the demo account, shared by `useDemoMode`, the display-name
 * backfill and the query persister (which must never persist the demo's data).
 */
import { describe, expect, it } from 'vitest';
import { isDemoUid } from '@/lib/utils/demoAccount';

describe('isDemoUid', () => {
  it('should recognise the configured demo uid', () => {
    expect(isDemoUid('demo-uid', 'demo-uid')).toBe(true);
  });

  it('should refuse any other uid', () => {
    expect(isDemoUid('owner-uid', 'demo-uid')).toBe(false);
  });

  it('should be a no-op when no demo uid is configured (a self-hosted deployment)', () => {
    expect(isDemoUid('demo-uid', undefined)).toBe(false);
    expect(isDemoUid('demo-uid', '')).toBe(false);
  });

  it('should answer false while nobody is signed in', () => {
    expect(isDemoUid(null, 'demo-uid')).toBe(false);
    expect(isDemoUid(undefined, 'demo-uid')).toBe(false);
  });
});
