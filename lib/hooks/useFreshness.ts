'use client';

/**
 * The page's freshness reading for the header: «Aggiornato alle 18:42, sto rileggendo…» while the
 * figures on screen were restored from the persisted cache and the fresh read is in flight;
 * nothing once it has landed. The decision is `resolveFreshness` (lib/utils/freshness.ts),
 * the words are `describeFreshness` (lib/utils/statesNarrative.ts); this hook only hands them the
 * page's queries and the clock, and `PageHeader` prints the sentence in its one stable
 * `role="status"` node.
 */

import type { UseQueryResult } from '@tanstack/react-query';
import { resolveFreshness, type FreshnessSource } from '@/lib/utils/freshness';
import { describeFreshness } from '@/lib/utils/statesNarrative';

/** What a page passes: its `useQuery` results as they are. */
export type FreshnessQuery = Pick<UseQueryResult, 'isFetching' | 'isLoading' | 'dataUpdatedAt'>;

/** A query with a threshold of its own, or a payload that dates its own content (the overview). */
export interface FreshnessEntry {
  query: FreshnessQuery;
  /** How old this query's figure must be to be called old; the client's global `staleTime` by default. */
  staleAfterMs?: number;
  /**
   * When the payload dates its content (the overview's `freshness.updatedAt`, a materialised
   * summary that can be older than the read that fetched it), as ms since epoch.
   */
  contentUpdatedAt?: number | null;
}

export type FreshnessInput = FreshnessQuery | FreshnessEntry;

/** What `PageHeader` renders: the sentence, or `null` when nothing on screen is old. */
export interface PageFreshness {
  sentence: string | null;
}

function toSource(input: FreshnessInput): FreshnessSource {
  const entry: FreshnessEntry = 'query' in input ? input : { query: input };
  return {
    isFetching: entry.query.isFetching,
    isLoading: entry.query.isLoading,
    dataUpdatedAt: entry.query.dataUpdatedAt,
    contentUpdatedAt: entry.contentUpdatedAt,
    staleAfterMs: entry.staleAfterMs,
  };
}

/**
 * When this document started: a figure read before it came out of the persisted cache. `0` on the
 * server (no `performance`), where nothing is fetching anyway.
 */
function pageOpenedAt(): number {
  return typeof performance !== 'undefined' ? performance.timeOrigin : 0;
}

/**
 * The freshness reading over the queries a page paints.
 *
 * The clock is read on every render on purpose: the sentence can change only when a query's fetch
 * state changes, and that is a render — the same sentence again costs nothing.
 */
export function useFreshness(inputs: readonly FreshnessInput[]): PageFreshness {
  const now = new Date();
  const reading = resolveFreshness(inputs.map(toSource), now.getTime(), { openedAt: pageOpenedAt() });
  return { sentence: describeFreshness({ updatedAt: reading.updatedAt, now }) };
}
