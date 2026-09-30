/**
 * React Query Client Provider Configuration
 *
 * Wraps the app with React Query (TanStack Query) for API call caching and state management.
 *
 * Configuration Strategy:
 * - staleTime: 5 minutes - Data considered fresh (no automatic refetch)
 * - gcTime: 10 minutes - Cache cleanup time for unused data — 24 hours on the persisted keys
 *   (`applyPersistedQueryDefaults`), or a reload after ten minutes would restore nothing
 * - retry: 1 - Single retry on failure (default is 3, reduced for faster feedback)
 * - refetchOnWindowFocus: false - Don't refetch when user returns to tab (manual refresh preferred)
 *
 * Persistence (PERF-03, 2026-09-29): the cache is written to IndexedDB and restored before the
 * first fetch, so a reload paints the last known figures at once (lib/constants/persistCache.ts
 * — the allowlist, the version, the retention; lib/query/queryPersister.ts — the store). Only the
 * keys of the allowlist, only successful reads, never the demo account's. The restore is
 * asynchronous: `PersistQueryClientProvider` holds every query idle (`isRestoring`) until it is
 * done, a few milliseconds after the shell (`ProtectedRoute` holds the pages until then). At
 * sign-out the cache is forgotten, in memory and on disk (`SignOutCacheGuard`).
 * `NEXT_PUBLIC_PERSIST_QUERIES=false` mounts the plain provider instead — the rollback of a deploy.
 *
 * Why useState instead of useMemo?
 * React Query documentation recommends useState to ensure queryClient is created
 * only once and never recreated on re-renders. useMemo can theoretically recreate
 * the instance (React doesn't guarantee memoization), which would clear the cache
 * and cause unnecessary API calls.
 *
 * Devtools:
 * Not mounted. `@tanstack/react-query-devtools` stays installed for ad-hoc debugging of
 * cache state, but rendering it here would ship the panel to every environment.
 */
'use client';

import { QueryClient, QueryClientProvider as TanStackQueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider, type Persister } from '@tanstack/react-query-persist-client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  isPersistableQuery,
  isQueryPersistenceEnabled,
  PERSIST_CACHE_MAX_AGE_MS,
  PERSIST_CACHE_VERSION,
} from '@/lib/constants/persistCache';
import { applyPersistedQueryDefaults } from '@/lib/query/persistedQueryDefaults';
import { clearPersistedQueries, createQueryPersister } from '@/lib/query/queryPersister';
import { QUERY_GC_TIME_MS, QUERY_STALE_TIME_MS } from '@/lib/query/queryDefaults';

/** A build-time constant: the server and the client agree on which provider is mounted. */
const PERSISTENCE_ENABLED = isQueryPersistenceEnabled();

/**
 * Forget the cache — in memory and on disk — when the signed-in user goes away.
 *
 * On the TRANSITION from a user to none, in an effect of the provider, and not in the sign-out
 * handler: when `signOut()` resolves the pages are still mounted for one more render, and a cache
 * cleared under mounted hooks is rebuilt and refetched by them at once — with the outgoing
 * session — and written to disk again a second later (measured: five keys of the signed-out owner
 * back in IndexedDB, 2026-09-29). Here the user is already `null` in the commit that unmounted
 * the pages behind `ProtectedRoute` (children's cleanups run before a parent's effect), so no
 * observer is left to refetch. It also covers a session that ends without the «Esci» button.
 */
function SignOutCacheGuard({ queryClient, persister }: { queryClient: QueryClient; persister: Persister | null }) {
  const { user } = useAuth();
  const previousUid = useRef<string | null>(null);

  useEffect(() => {
    const uid = user?.uid ?? null;
    if (previousUid.current !== null && uid === null) {
      void clearPersistedQueries(queryClient, persister);
    }
    previousUid.current = uid;
  }, [user, queryClient, persister]);

  return null;
}

function createClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME_MS, // balance between freshness and performance
        gcTime: QUERY_GC_TIME_MS, // keep inactive data cached briefly
        retry: 1, // Single retry on failure for faster user feedback
        refetchOnWindowFocus: false, // Manual refresh preferred over automatic
      },
    },
  });
  applyPersistedQueryDefaults(queryClient);
  return queryClient;
}

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  // Use useState (not useMemo) to guarantee single queryClient instance
  // React Query recommends this to prevent cache clearing on re-renders
  const [queryClient] = useState(createClient);
  // Created on the server too — it opens nothing until it is used, and only an effect uses it.
  const [persister] = useState<Persister | null>(() => (PERSISTENCE_ENABLED ? createQueryPersister() : null));

  if (!persister) {
    return (
      <TanStackQueryClientProvider client={queryClient}>
        <SignOutCacheGuard queryClient={queryClient} persister={null} />
        {children}
      </TanStackQueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_CACHE_MAX_AGE_MS,
        buster: PERSIST_CACHE_VERSION,
        dehydrateOptions: {
          // Only the allowlist, only what was read — an error or a pending read is nothing to restore.
          shouldDehydrateQuery: (query) => query.state.status === 'success' && isPersistableQuery(query.queryKey),
          shouldDehydrateMutation: () => false,
        },
      }}
      // Stale-while-revalidate, not stale-instead-of-fresh: what the restore brought back is marked
      // invalidated (no refetch yet — nothing has mounted), so every hook that mounts on it, and every
      // `fetchQuery` on it, rereads whatever its age. Without this a reload within `staleTime` painted
      // the restored figures and read nothing — a co-owner's save, or an F5 asked to refresh, went
      // unseen for five minutes (the full suite found it: an Admin write between two `goto`, 2026-09-29).
      onSuccess={() => queryClient.invalidateQueries({ refetchType: 'none' })}
    >
      <SignOutCacheGuard queryClient={queryClient} persister={persister} />
      {children}
    </PersistQueryClientProvider>
  );
}
