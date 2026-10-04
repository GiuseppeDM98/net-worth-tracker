/**
 * What a LOAD showed, and what the app persisted — the two probes of the «last known figures
 * first» specs (`freshness.spec.ts` on Cashflow, `performance.degraded.spec.ts` on Rendimenti).
 *
 * On the emulators the window in which the header says «Aggiornato alle…» is a few milliseconds,
 * so a `getByText` would arrive late: a MutationObserver installed by `addInitScript` records every
 * text the `[data-freshness]` node has had, and whether the page's own skeleton was ever in the
 * DOM; the assertions read the recording.
 *
 * A helper, not a spec: the FILENAME chooses the project and this one is collected by none.
 */

import type { Page } from '@playwright/test';
import { PERSISTED_CACHE_DB_NAME, PERSISTED_CACHE_RECORD_KEY, PERSISTED_CACHE_STORE_NAME } from './persistedCache';

export interface LoadRecording {
  /** Every text the header's freshness node has had, in order, deduplicated when unchanged. */
  freshnessTexts: string[];
  /** The page's own skeleton («Caricamento», never the auth wait) was in the DOM at some point. */
  pageSkeletonSeen: boolean;
}

declare global {
  interface Window {
    __load: LoadRecording;
  }
}

/** Record the page skeleton and the freshness texts from the first script on, on every navigation. */
export async function recordLoad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__load = { freshnessTexts: [], pageSkeletonSeen: false };
    const check = () => {
      // The page's own wait, not the shell's («Verifica dell'accesso» is the auth wait, on every load).
      if (document.querySelector('main [role="status"][aria-label="Caricamento"]')) window.__load.pageSkeletonSeen = true;
      const node = document.querySelector('[data-freshness]');
      if (!node) return;
      const text = node.textContent ?? '';
      const texts = window.__load.freshnessTexts;
      if (texts[texts.length - 1] !== text) texts.push(text);
    };
    // `document`, NOT `document.documentElement`: it does not exist yet when this runs.
    new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

export const readRecording = (page: Page): Promise<LoadRecording> => page.evaluate(() => window.__load);

/** The persisted record as the app wrote it, `null` when there is none. Read through IndexedDB itself. */
export async function readPersistedRecord(page: Page): Promise<string | null> {
  return page.evaluate(
    ([dbName, storeName, key]) =>
      new Promise<string | null>((resolve) => {
        const request = indexedDB.open(dbName);
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve(null);
            return;
          }
          const get = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
          get.onerror = () => resolve(null);
          get.onsuccess = () => {
            db.close();
            resolve(typeof get.result === 'string' ? get.result : null);
          };
        };
      }),
    [PERSISTED_CACHE_DB_NAME, PERSISTED_CACHE_STORE_NAME, PERSISTED_CACHE_RECORD_KEY] as const,
  );
}

/** The query keys of a persisted record, as the app wrote them. */
export function persistedQueryKeys(record: string | null): unknown[][] {
  if (!record) return [];
  const parsed = JSON.parse(record) as { clientState: { queries: Array<{ queryKey: unknown[] }> } };
  return parsed.clientState.queries.map((query) => query.queryKey);
}
