/**
 * The persisted query cache and the parked sessions.
 *
 * `storageState({ indexedDB: true })` captures EVERY IndexedDB database of the origin — the
 * Firebase session it is there for, and the React Query cache the app now persists beside it. Left
 * in the parked session files, that cache would be restored into every spec's first frame: a spec would
 * open on figures the setup's login happened to read, and a spec that reads a stale figure would be
 * reporting the persister, not the page. So each setup strips the database from the state file it
 * just wrote — after `storageState`, not before: the app holds the database open, so an
 * `indexedDB.deleteDatabase` from the page would wait on that connection and never resolve.
 *
 * A helper, not a spec: the FILENAME chooses the project and this one is collected by none. A spec
 * cannot import `lib/` (no `@/` alias), so the database name is repeated here —
 * `__tests__/persistCache.test.ts` pins `PERSIST_CACHE_DB_NAME` on the other side.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/** `PERSIST_CACHE_DB_NAME` in lib/constants/persistCache.ts. */
export const PERSISTED_CACHE_DB_NAME = 'nwt-query-cache';
/** `PERSIST_CACHE_STORE_NAME` and `PERSIST_CACHE_KEY` there: the one record the app writes. */
export const PERSISTED_CACHE_STORE_NAME = 'queries';
export const PERSISTED_CACHE_RECORD_KEY = 'react-query';

interface StoredDatabase {
  name: string;
  [key: string]: unknown;
}

interface StorageStateFile {
  cookies: unknown[];
  origins: Array<{ origin: string; indexedDB?: StoredDatabase[]; [key: string]: unknown }>;
}

/**
 * Remove the app's persisted query cache from a written `storageState` file, in place.
 *
 * @returns how many databases were dropped (1 when the login had already persisted, 0 when it had not yet)
 */
export function stripPersistedQueryCache(statePath: string): number {
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as StorageStateFile;
  let dropped = 0;
  for (const origin of state.origins) {
    if (!origin.indexedDB) continue;
    const kept = origin.indexedDB.filter((database) => database.name !== PERSISTED_CACHE_DB_NAME);
    dropped += origin.indexedDB.length - kept.length;
    origin.indexedDB = kept;
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  return dropped;
}

/**
 * The data of one persisted query, read from the page's own IndexedDB record — `null` until the
 * persister has written a query whose key starts with `prefix`.
 *
 * It is the positive anchor of «the page has read this again»: a refetch leaves no request a spec
 * can wait for (Firestore's reads travel on one long-lived channel), but the persister writes what
 * the refetch brought, within its throttle. Read-only: the record is the app's.
 */
export async function readPersistedQuery(page: Page, prefix: readonly string[]): Promise<unknown> {
  return page.evaluate(
    ({ dbName, storeName, recordKey, keyPrefix }) =>
      new Promise<unknown>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          if (!database.objectStoreNames.contains(storeName)) {
            database.close();
            resolve(null);
            return;
          }
          const read = database.transaction(storeName, 'readonly').objectStore(storeName).get(recordKey);
          read.onerror = () => {
            database.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            database.close();
            // A JSON string: the persister's own serializer tags the dates and leaves the rest alone.
            const record = read.result ? (JSON.parse(read.result as string) as { clientState?: { queries?: Array<{ queryKey: unknown[]; state?: { data?: unknown } }> } }) : null;
            const query = record?.clientState?.queries?.find((entry) => keyPrefix.every((segment, index) => entry.queryKey[index] === segment));
            resolve(query?.state?.data ?? null);
          };
        };
      }),
    { dbName: PERSISTED_CACHE_DB_NAME, storeName: PERSISTED_CACHE_STORE_NAME, recordKey: PERSISTED_CACHE_RECORD_KEY, keyPrefix: [...prefix] },
  );
}
