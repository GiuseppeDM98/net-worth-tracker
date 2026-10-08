/**
 * What React Query persists to IndexedDB, and for how long (2026-09-29).
 *
 * The cache used to live in memory only: every reload started from an empty client, so a page
 * that had just shown its figures went back to a skeleton for one to two seconds. The persister
 * (`lib/query/queryPersister.ts`, mounted by `lib/providers/QueryClientProvider.tsx`) writes the
 * queries listed here to IndexedDB and restores them before the first fetch, so the page paints
 * the last known figures at once and refetches behind them — with the «Aggiornato alle…» reading
 * in the header while the fresh read is in flight (`lib/hooks/useFreshness.ts`).
 *
 * The ALLOWLIST is the safety: only the owner's own collections, read through the hooks of
 * AGENTS.md § React Query and Derived State, are persisted. What stays out: the assistant's threads
 * and contexts (they change on every message), the benchmark/FX/ECB series (a server cache already
 * holds them), the Esposizione's Yahoo profiles (same), the budget history — and EVERYTHING of
 * the demo account, whose data is shared by every visitor and must not land in a visitor's browser
 * (`isDemoUid`). Rendimenti's two payloads are IN since 2026-10-04 (the owner's decision): the
 * metrics also live in `performance-cache/{uid}` on Firestore, but that is a round trip — with only
 * the six collections restored, a reload painted a skeleton under «Aggiornato alle…».
 *
 * WARNING: `PERSIST_CACHE_VERSION` must be bumped by any change that RENAMES, REMOVES or changes
 * the TYPE of a field in a persisted payload — everything under `PERSISTED_QUERY_PREFIXES`: an
 * asset (the mortgage instalments under its key too), an expense, a snapshot, a category, the
 * settings document, a contribution, a trade, the ledger's meta document, a cost centre, the Hall
 * of Fame rankings, a goal, a dividend receipt, the overview payload, Rendimenti's
 * `PerformanceData` and its dividend yields. A client that restores an
 * older shape would read it as truth until the refetch lands. A new optional field whose absence means the default does not need it
 * (AGENTS.md § Caching, beside `CACHE_MATH_VERSION`).
 */

import { isDemoUid } from '@/lib/utils/demoAccount';

/** Bump on any breaking change to a persisted payload's shape — see the header. */
export const PERSIST_CACHE_VERSION = '1';

/** A persisted cache older than this is discarded whole on restore. */
export const PERSIST_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * `gcTime` of every persisted query. It must be ≥ the max age: the global ten minutes would drop
 * an inactive query from memory — and, at the next save, from the persisted client too — so a
 * reader who comes back after an hour would find nothing to restore. Applied per key prefix by
 * `applyPersistedQueryDefaults` (lib/query/persistedQueryDefaults.ts), never hook by hook.
 */
export const PERSISTED_GC_TIME_MS = PERSIST_CACHE_MAX_AGE_MS;

/** The IndexedDB database, object store and record the persister writes (`idb-keyval`). */
export const PERSIST_CACHE_DB_NAME = 'nwt-query-cache';
export const PERSIST_CACHE_STORE_NAME = 'queries';
export const PERSIST_CACHE_KEY = 'react-query';

/** How often at most the persister writes; a burst of settling queries becomes one write. */
export const PERSIST_CACHE_THROTTLE_MS = 1000;

/**
 * Whether the persister runs, from the build-time value of `NEXT_PUBLIC_PERSIST_QUERIES`: only the
 * literal `'false'` switches it OFF — the rollback for a deploy, never set by the Playwright server
 * (`dev:e2e`), whose suite runs with the persister on. The default reads the variable by its full
 * name because Next inlines a `NEXT_PUBLIC_*` value only where it is spelled out.
 */
export function isQueryPersistenceEnabled(flagValue: string | undefined = process.env.NEXT_PUBLIC_PERSIST_QUERIES): boolean {
  return flagValue !== 'false';
}

/**
 * The key prefixes that are persisted, each followed IN THE KEY by the owner's uid
 * (`lib/query/queryKeys.ts`): `['assets', uid]`, `['dashboard', 'overview', uid]`, … A longer key
 * under one of them — a per-fund contribution list, the mortgage instalments under the assets key,
 * a snapshot range, a window of the expenses (`lib/utils/expenseWindows.ts`) — is persisted with its prefix.
 */
export const PERSISTED_QUERY_PREFIXES: readonly (readonly string[])[] = [
  ['assets'],
  ['snapshots'],
  ['expenses'],
  ['expense-categories'],
  ['dashboard', 'overview'],
  ['settings'],
  ['pension-contributions'],
  ['asset-transactions'],
  // The ledger's meta document too: Patrimonio gates its trades on it, so without it the page
  // waited for one read and showed its skeleton over figures it already had (measured 2026-09-29).
  ['asset-transactions-meta'],
  ['cost-centers'],
  ['hall-of-fame'],
  ['goal-data'],
  ['dividend-receipts'],
  // Rendimenti: the pre-computed metrics, named by the cache key of the inputs they were computed
  // from (restored inputs resolve to the same key, so the pair is consistent), and the yields.
  ['performance', 'data'],
  ['performance', 'yields'],
];

function matchesPrefix(queryKey: readonly unknown[], prefix: readonly string[]): boolean {
  return prefix.every((segment, index) => queryKey[index] === segment);
}

/**
 * The owner whose data a persisted key holds — the segment right after its prefix — or `null`
 * when the key is not one of the persisted prefixes or carries no uid there (a hook mounted
 * before the sign-in resolves reads `['assets', '']`, disabled: nothing to persist).
 */
export function resolvePersistedOwner(queryKey: readonly unknown[]): string | null {
  const prefix = PERSISTED_QUERY_PREFIXES.find((candidate) => matchesPrefix(queryKey, candidate));
  if (!prefix) return null;
  const owner = queryKey[prefix.length];
  return typeof owner === 'string' && owner.length > 0 ? owner : null;
}

/**
 * Whether a query with this key may be written to IndexedDB: one of the persisted prefixes, with an
 * owner, and never the demo account's.
 *
 * @param queryKey - The React Query key
 * @param demoUid - The demo uid; defaults to the build-time env value (a parameter so a test can set it)
 */
export function isPersistableQuery(
  queryKey: readonly unknown[],
  demoUid: string | undefined = process.env.NEXT_PUBLIC_DEMO_USER_ID,
): boolean {
  const owner = resolvePersistedOwner(queryKey);
  if (owner === null) return false;
  return !isDemoUid(owner, demoUid);
}
