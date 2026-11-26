'use client';

/**
 * A list's write actions wait while the copy on screen is being reread (2026-11-26).
 *
 * A reload paints the lists restored from the persisted cache and rereads them behind
 * (doc/guide/cache-persistita.md § Every load rereads what it restored). For that moment a row can be
 * from before the last save — another device's, a co-owner's, this browser's own last second (the
 * persister writes at most once a second). A dialog opened on it keeps the old values and saves them
 * over the newer ones; FIRE › Obiettivi rewrites its WHOLE document from the list in memory; a
 * pointer on the row can name a document that is gone (the fee of a transfer, 2026-11-26); a write
 * that carries a version is refused (Movimenti, 2026-11-24). So the controls that write from a row
 * are held exactly while the page header says «Aggiornato alle…, sto rileggendo…»: the same
 * reading, `resolveFreshness` (lib/utils/freshness.ts), never `isFetching` alone — a refetch of a
 * list read in THIS load (the invalidation after a save) holds nothing.
 *
 * The area that owns the queries mounts `RowActionsHold`; a control anywhere below it — a row, a
 * dialog (a portal keeps React's tree) — reads `useRowActionsHeld()` and adds it to its `disabled`.
 * Outside a provider nothing is held.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { FreshnessQuery } from '@/lib/hooks/useFreshness';
import { resolveFreshness } from '@/lib/utils/freshness';

const RowActionsHeldContext = createContext(false);

/** When this document started: a figure read before it came out of the persisted cache. */
function pageOpenedAt(): number | undefined {
  return typeof performance !== 'undefined' ? performance.timeOrigin : undefined;
}

/**
 * Whether one of these queries is rereading a copy from before this load, or one older than its
 * `staleTime` — what the header's freshness sentence says, as a boolean.
 *
 * The clock is read on every render on purpose, as `useFreshness` does: the answer can change only
 * when a query's fetch state changes, and that is a render.
 */
export function useRestoredCopyReread(queries: readonly (FreshnessQuery | null | undefined)[]): boolean {
  const sources = queries
    .filter((query): query is FreshnessQuery => !!query)
    .map((query) => ({ isFetching: query.isFetching, isLoading: query.isLoading, dataUpdatedAt: query.dataUpdatedAt }));
  return resolveFreshness(sources, new Date().getTime(), { openedAt: pageOpenedAt() }).stale;
}

const NO_QUERIES: readonly FreshnessQuery[] = [];

interface RowActionsHoldProps {
  /** The queries whose rows the controls below write from. */
  queries?: readonly (FreshnessQuery | null | undefined)[];
  /** A reading the area already took with `useRestoredCopyReread` (it also gates a control of its own). */
  held?: boolean;
  children: ReactNode;
}

/** Holds the row actions below it while one of `queries` rereads an old copy. A hold above it stays. */
export function RowActionsHold({ queries = NO_QUERIES, held: heldAbove = false, children }: RowActionsHoldProps) {
  const above = useContext(RowActionsHeldContext);
  const held = useRestoredCopyReread(queries);
  return <RowActionsHeldContext.Provider value={above || heldAbove || held}>{children}</RowActionsHeldContext.Provider>;
}

/** `true` while the list this control belongs to is rereading an old copy: add it to `disabled`. */
export function useRowActionsHeld(): boolean {
  return useContext(RowActionsHeldContext);
}
