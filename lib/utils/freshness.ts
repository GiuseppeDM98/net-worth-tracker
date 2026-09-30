/**
 * Is the page showing the last KNOWN figures while the fresh ones are in flight?
 *
 * With the query cache persisted (PERF-03, lib/constants/persistCache.ts) a page paints the
 * figures restored from IndexedDB at once and rereads them behind (the restore invalidates what it
 * restored: every load is a fresh read, stale-while-revalidate). The reader has to be told —
 * «Aggiornato alle 18:42, sto rileggendo…» — when what is on screen is genuinely from before:
 *
 * - a figure READ BEFORE THIS PAGE LOAD (`dataUpdatedAt < openedAt`): it came out of the persisted
 *   cache, and however young it is, it is another load's reading of the world;
 * - a figure older than its query's own `staleTime` (lib/query/queryDefaults.ts; the overview's
 *   minute) — a page left open and rereading a figure the client itself calls stale.
 *
 * A refetch of a figure read two minutes ago IN THIS session (an invalidation after a save) is
 * neither: it is the app doing what it always did, in silence.
 *
 * Pure: the hook (`lib/hooks/useFreshness.ts`) hands it the queries, the clock and the load instant.
 */

import { QUERY_STALE_TIME_MS } from '@/lib/query/queryDefaults';

/** What `resolveFreshness` reads off a `useQuery` result. */
export interface FreshnessSource {
  /** A fetch is in flight — the first one or a refetch. */
  isFetching: boolean;
  /** The first fetch, nothing to show yet: never «old», there is no figure on screen. */
  isLoading: boolean;
  /** When the data on screen was read (ms since epoch; 0 when there is none). */
  dataUpdatedAt: number;
  /**
   * When the payload itself says its content is from, when it dates it — the overview's
   * `freshness.updatedAt` (a materialised summary older than the read that fetched it). The older
   * of the two is what the reader sees.
   */
  contentUpdatedAt?: number | null;
  /** This query's own threshold, when it is not the global one (the overview's `staleTime`). */
  staleAfterMs?: number;
}

export interface FreshnessOptions {
  /** How old a figure must be to count as old, for a source that names no threshold of its own. */
  defaultStaleAfterMs?: number;
  /**
   * When THIS page load started (ms since epoch): a figure read before it was restored from the
   * persisted cache and is old whatever its age. Absent, only the age decides.
   */
  openedAt?: number;
}

export interface FreshnessReading {
  /** At least one query is refetching a figure from before this load, or older than its threshold. */
  stale: boolean;
  /** The oldest such figure on screen, `null` when nothing is stale. */
  updatedAt: Date | null;
}

const NOT_STALE: FreshnessReading = { stale: false, updatedAt: null };

function effectiveUpdatedAt(source: FreshnessSource): number {
  const content = source.contentUpdatedAt;
  return typeof content === 'number' && Number.isFinite(content) && content > 0
    ? Math.min(source.dataUpdatedAt, content)
    : source.dataUpdatedAt;
}

/**
 * The page's reading over every query it paints.
 *
 * @param sources - The page's queries
 * @param now - The clock, in ms since epoch (passed in: a function reading `Date.now()` is untestable)
 * @param options - The default threshold and the instant this page load started
 */
export function resolveFreshness(
  sources: readonly FreshnessSource[],
  now: number,
  { defaultStaleAfterMs = QUERY_STALE_TIME_MS, openedAt }: FreshnessOptions = {},
): FreshnessReading {
  let oldest: number | null = null;
  for (const source of sources) {
    if (!source.isFetching || source.isLoading || source.dataUpdatedAt <= 0) continue;
    const readBeforeThisLoad = openedAt !== undefined && source.dataUpdatedAt < openedAt;
    const at = effectiveUpdatedAt(source);
    if (!readBeforeThisLoad && now - at < (source.staleAfterMs ?? defaultStaleAfterMs)) continue;
    oldest = oldest === null ? at : Math.min(oldest, at);
  }
  return oldest === null ? NOT_STALE : { stale: true, updatedAt: new Date(oldest) };
}
