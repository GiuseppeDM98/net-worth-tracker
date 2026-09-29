'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** The server has no viewport: every query answers `false` there, and during hydration. */
const getServerSnapshot = () => false;

/**
 * Whether a CSS media query matches, read as an external store (`useSyncExternalStore`).
 *
 * The dashboard shell is in the prerendered HTML (PERF-02), so this hook now runs on the server
 * and during hydration — where `window` does not exist and the only value that does not make React
 * report a mismatch is the server's, `false`. Right after hydration React reads the real snapshot
 * and re-renders the subscribers on its own: no error, no effect, no `setState`. A component
 * mounted LATER (every page, every dialog) is not hydrating, so it reads the real value on its first
 * render — the flash-free behaviour the old `useState(() => matchMedia(…).matches)` initializer gave,
 * kept for the surfaces that branch on the phone width.
 *
 * The one consequence: the shell's FIRST frame must be decided by CSS, never by this value. The
 * fixed sidebar is `hidden desktop:flex` and the bottom nav `desktop:hidden`, so a phone paints the
 * right chrome before JS corrects `false` to `true` (`e2e/shell.boot.mobile.spec.ts` proves the
 * console stays clean).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
