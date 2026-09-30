/**
 * The allowlist of the persisted queries (PERF-03): which keys reach IndexedDB, whose they are,
 * and that the demo account's never do. Pinned against `lib/query/queryKeys.ts` itself, so a key
 * that changes shape turns this red before a page reads a stale one.
 */
import { describe, expect, it } from 'vitest';
import {
  isPersistableQuery,
  isQueryPersistenceEnabled,
  PERSIST_CACHE_DB_NAME,
  PERSIST_CACHE_KEY,
  PERSIST_CACHE_MAX_AGE_MS,
  PERSIST_CACHE_STORE_NAME,
  PERSISTED_GC_TIME_MS,
  PERSISTED_QUERY_PREFIXES,
  resolvePersistedOwner,
} from '@/lib/constants/persistCache';
import { queryKeys } from '@/lib/query/queryKeys';
import {
  PERSISTED_CACHE_DB_NAME,
  PERSISTED_CACHE_RECORD_KEY,
  PERSISTED_CACHE_STORE_NAME,
} from '../e2e/persistedCache';

const OWNER = 'owner-uid';
const DEMO = 'demo-uid';

describe('isPersistableQuery', () => {
  it('should persist every collection key of the allowlist, read through its hook', () => {
    const persisted = [
      queryKeys.assets.all(OWNER),
      queryKeys.snapshots.all(OWNER),
      queryKeys.expenses.all(OWNER),
      queryKeys.expenses.categories(OWNER),
      queryKeys.dashboard.overview(OWNER),
      queryKeys.settings.all(OWNER),
      queryKeys.pensionContributions.all(OWNER),
      queryKeys.assetTransactions.all(OWNER),
      queryKeys.assetTransactions.meta(OWNER),
      queryKeys.costCenters.all(OWNER),
      queryKeys.hallOfFame.all(OWNER),
      queryKeys.goals.all(OWNER),
      queryKeys.dividendReceipts.all(OWNER),
    ];
    for (const key of persisted) expect(isPersistableQuery(key, DEMO), key.join('/')).toBe(true);
    expect(persisted).toHaveLength(PERSISTED_QUERY_PREFIXES.length);
  });

  it('should persist a longer key under a persisted prefix (a per-fund list, the mortgage instalments)', () => {
    expect(isPersistableQuery(queryKeys.pensionContributions.byAsset(OWNER, 'fund-1'), DEMO)).toBe(true);
    expect(isPersistableQuery([...queryKeys.assets.all(OWNER), 'mortgage-instalments', ['house']], DEMO)).toBe(true);
    expect(isPersistableQuery(queryKeys.snapshots.range(OWNER, 2024, 1, 2024, 12), DEMO)).toBe(true);
  });

  it('should keep the assistant, the benchmarks, the FX rates and the Esposizione out', () => {
    expect(isPersistableQuery(queryKeys.assistant.threads(OWNER), DEMO)).toBe(false);
    expect(isPersistableQuery(queryKeys.assistant.context(OWNER, 2026, 9), DEMO)).toBe(false);
    expect(isPersistableQuery(queryKeys.benchmarks.returns('sp500'), DEMO)).toBe(false);
    expect(isPersistableQuery(queryKeys.benchmarks.fxRates(), DEMO)).toBe(false);
    expect(isPersistableQuery(queryKeys.portfolio.instrumentProfiles(OWNER, 'AAPL:stock'), DEMO)).toBe(false);
    expect(isPersistableQuery(queryKeys.budgetHistory.months(OWNER, ['2026-09']), DEMO)).toBe(false);
  });

  it('should NEVER persist the demo account, on any key of the allowlist', () => {
    expect(isPersistableQuery(queryKeys.expenses.all(DEMO), DEMO)).toBe(false);
    expect(isPersistableQuery(queryKeys.dashboard.overview(DEMO), DEMO)).toBe(false);
    expect(isPersistableQuery(queryKeys.settings.all(DEMO), DEMO)).toBe(false);
  });

  it('should not persist a key with no owner (a hook mounted before the sign-in resolves)', () => {
    expect(isPersistableQuery(queryKeys.assets.all(''), DEMO)).toBe(false);
    expect(isPersistableQuery(['assets'], DEMO)).toBe(false);
    expect(isPersistableQuery(['dashboard', 'overview'], DEMO)).toBe(false);
  });

  it('should treat a key whose second segment is not a string as ownerless', () => {
    expect(isPersistableQuery(['assets', 42], DEMO)).toBe(false);
  });
});

describe('resolvePersistedOwner', () => {
  it('should read the owner right after the prefix, one or two segments long', () => {
    expect(resolvePersistedOwner(queryKeys.assets.all(OWNER))).toBe(OWNER);
    expect(resolvePersistedOwner(queryKeys.dashboard.overview(OWNER))).toBe(OWNER);
  });

  it('should answer null off the allowlist', () => {
    expect(resolvePersistedOwner(queryKeys.assistant.memory(OWNER))).toBeNull();
    expect(resolvePersistedOwner(['dashboard', OWNER])).toBeNull();
  });
});

describe('the retention', () => {
  it('should keep a persisted query in memory at least as long as the persisted cache is valid', () => {
    // A shorter gcTime would drop an inactive query from the next save: «riaprire dopo un'ora» found nothing.
    expect(PERSISTED_GC_TIME_MS).toBeGreaterThanOrEqual(PERSIST_CACHE_MAX_AGE_MS);
  });
});

describe('the store the Playwright setups strip', () => {
  it('should be named the same on both sides — a spec cannot import lib/', () => {
    expect(PERSISTED_CACHE_DB_NAME).toBe(PERSIST_CACHE_DB_NAME);
    expect(PERSISTED_CACHE_STORE_NAME).toBe(PERSIST_CACHE_STORE_NAME);
    expect(PERSISTED_CACHE_RECORD_KEY).toBe(PERSIST_CACHE_KEY);
  });
});

describe('isQueryPersistenceEnabled', () => {
  it('should be on by default and off only on the literal "false"', () => {
    expect(isQueryPersistenceEnabled(undefined)).toBe(true);
    expect(isQueryPersistenceEnabled('true')).toBe(true);
    expect(isQueryPersistenceEnabled('false')).toBe(false);
  });
});
