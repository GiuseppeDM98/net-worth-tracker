/**
 * The two global timings of the React Query client (`lib/providers/QueryClientProvider.tsx`),
 * exported because a second module has to agree with them: the freshness reading treats a
 * figure as «old» exactly when the client would treat it as stale (`lib/utils/freshness.ts`), so
 * the label and the refetch are two readings of ONE threshold, never two numbers that drift.
 */

/** A read is fresh for five minutes: no automatic refetch before that. */
export const QUERY_STALE_TIME_MS = 5 * 60 * 1000;

/** An inactive query is dropped from memory after ten minutes — the persisted keys override this (lib/constants/persistCache.ts). */
export const QUERY_GC_TIME_MS = 10 * 60 * 1000;
