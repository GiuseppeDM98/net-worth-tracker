'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the hero total ("Patrimonio totale lordo") is shown in clear text.
 *
 * Privacy peek: the total stays MASKED by default and is revealed only through the
 * eye toggle on the hero. The choice persists per browser in `localStorage`, so a
 * reload finds the last decision — while a browser that never chose stays hidden.
 *
 * Read as an external store (`useSyncExternalStore`, the same shape as `useMediaQuery`):
 * the server has no `localStorage`, so it answers `false` there and during hydration —
 * which is also the default the owner asked for — and React re-reads the real snapshot
 * right after hydration on its own. No effect, no `setState`.
 */

export const PATRIMONIO_VISIBILITY_STORAGE_KEY = 'nwt-patrimonio-visibile';

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** The persisted decision: `'1'` means shown, anything else (absent included) means hidden. */
export function readStoredPatrimonioVisibility(): boolean {
  return storage()?.getItem(PATRIMONIO_VISIBILITY_STORAGE_KEY) === '1';
}

function writeStoredPatrimonioVisibility(visible: boolean): void {
  const store = storage();
  if (!store) return;
  try {
    if (visible) store.setItem(PATRIMONIO_VISIBILITY_STORAGE_KEY, '1');
    else store.removeItem(PATRIMONIO_VISIBILITY_STORAGE_KEY);
  } catch {
    // A storage failure is not a reason to fail the page — the toggle still
    // applies to this load through the in-memory snapshot below.
  }
}

let snapshot: boolean | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function getPatrimonioVisibleSnapshot(): boolean {
  if (snapshot === null) {
    snapshot = typeof window === 'undefined' ? false : readStoredPatrimonioVisibility();
  }
  return snapshot;
}

function getServerSnapshot(): boolean {
  return false;
}

export function subscribePatrimonioVisibility(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === PATRIMONIO_VISIBILITY_STORAGE_KEY) {
      snapshot = readStoredPatrimonioVisibility();
      notify();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function setPatrimonioVisible(visible: boolean): void {
  snapshot = visible;
  writeStoredPatrimonioVisibility(visible);
  notify();
}

/** The hero's peek state: `false` until the eye is pressed, persisted per browser. */
export function usePatrimonioVisible(): boolean {
  return useSyncExternalStore(
    subscribePatrimonioVisibility,
    getPatrimonioVisibleSnapshot,
    getServerSnapshot,
  );
}
