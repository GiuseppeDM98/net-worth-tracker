'use client';

/**
 * The React Query persister on IndexedDB (PERF-03, 2026-09-29).
 *
 * IndexedDB and not `localStorage`: the owner's expenses and snapshots (with `byAsset`) run past
 * `localStorage`'s 5 MB. `idb-keyval` is the 2 KB adapter; the async-storage persister of TanStack
 * gets it as an `AsyncStorage<string>` with our own serializer, which keeps the dates
 * (lib/utils/queryPersistence.ts). The store is opened LAZILY, on the first read or write: the
 * provider creates this object on the server too, where `indexedDB` does not exist, and nothing
 * there ever calls it (a React effect is what restores).
 *
 * A write that fails — a full quota on iOS Safari, a private window that refuses the database —
 * is caught by the persister itself: the app runs exactly as it did without one.
 */

import type { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Persister } from '@tanstack/react-query-persist-client';
import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import {
  PERSIST_CACHE_DB_NAME,
  PERSIST_CACHE_KEY,
  PERSIST_CACHE_STORE_NAME,
  PERSIST_CACHE_THROTTLE_MS,
} from '@/lib/constants/persistCache';
import { deserializeFromPersist, serializeForPersist } from '@/lib/utils/queryPersistence';

let store: UseStore | undefined;

/** The one object store, opened on first use (never at module load: the module is imported on the server). */
function persistedStore(): UseStore {
  store ??= createStore(PERSIST_CACHE_DB_NAME, PERSIST_CACHE_STORE_NAME);
  return store;
}

/** Build the persister the provider mounts. */
export function createQueryPersister(): Persister {
  return createAsyncStoragePersister({
    storage: {
      getItem: (key) => get<string>(key, persistedStore()).then((value) => value ?? null),
      setItem: (key, value) => set(key, value, persistedStore()),
      removeItem: (key) => del(key, persistedStore()),
    },
    key: PERSIST_CACHE_KEY,
    throttleTime: PERSIST_CACHE_THROTTLE_MS,
    serialize: serializeForPersist,
    deserialize: (text) => deserializeFromPersist(text),
  });
}

/**
 * Forget everything at sign-out: the in-memory client AND the persisted record, so the next
 * account signed in on this browser restores nothing of the previous one. The throttled save the
 * `clear()` triggers writes an EMPTY client a second later — harmless, and the order (clear first,
 * remove after) is what keeps a pending save of the old data from landing after the removal.
 */
export async function clearPersistedQueries(queryClient: QueryClient, persister: Persister | null): Promise<void> {
  queryClient.clear();
  if (!persister) return;
  try {
    await persister.removeClient();
  } catch (error) {
    // The record could not be removed (the database refused): the next restore still discards
    // it by owner — every key carries the uid — but say so, it is the one trace.
    console.warn('[queryPersister] Could not remove the persisted query cache at sign-out:', error);
  }
}
