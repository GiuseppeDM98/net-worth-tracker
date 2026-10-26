'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the hero total ("Patrimonio totale lordo") is shown in clear text.
 *
 * Privacy peek: the total stays MASKED by default on app opening and is revealed
 * only through the eye toggle on the hero. On opening/reloading the app, the balance
 * always starts hidden (`false`).
 *
 * Read as an external store (`useSyncExternalStore`, the same shape as `useMediaQuery`):
 * the server and initial client snapshot both answer `false` — React re-reads the in-memory
 * snapshot when toggled via `setPatrimonioVisible`. No effect, no `setState`.
 */

export const PATRIMONIO_VISIBILITY_STORAGE_KEY = 'nwt-patrimonio-visibile';

/**
 * On opening the app, balance is ALWAYS hidden (`false`).
 * Reading stored visibility returns `false` on initial load.
 */
export function readStoredPatrimonioVisibility(): boolean {
  return false;
}

let snapshot: boolean | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function getPatrimonioVisibleSnapshot(): boolean {
  if (snapshot === null) {
    snapshot = false;
  }
  return snapshot;
}

export function subscribePatrimonioVisibility(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === PATRIMONIO_VISIBILITY_STORAGE_KEY) {
      snapshot = readStoredPatrimonioVisibility();
      notify();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(onChange);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

export function setPatrimonioVisible(visible: boolean): void {
  snapshot = visible;
  notify();
}

/** The hero's peek state: `false` until the eye is pressed, persisted per browser. */
export function usePatrimonioVisible(): boolean {
  return useSyncExternalStore(
    subscribePatrimonioVisibility,
    getPatrimonioVisibleSnapshot,
    getPatrimonioVisibleSnapshot,
  );
}
