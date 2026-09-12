'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { runViewTransition } from '@/lib/utils/viewTransition';

/**
 * How long the scene waits for the next page to land before it plays anyway: a route the dev
 * server is still compiling would otherwise hold the frozen snapshot on screen. In production
 * the routes are prefetched and the pathname changes within a frame or two.
 */
const NEXT_PAGE_TIMEOUT_MS = 700;

/**
 * A navigation between two dashboard pages as ONE scene (DESIGN.md → The Page Scene):
 * `router.push` wrapped in a view transition whose DOM update resolves when the pathname has
 * actually changed — the App Router swaps the tree asynchronously, so the promise is what tells
 * the browser "now take the new snapshot". Without the API, or with reduced motion, this is a
 * plain `router.push`. The same page is never re-entered through a scene.
 */
export function useSceneNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const landed = useRef<(() => void) | null>(null);

  // The pathname changing IS the new page landing: settle the pending update, if any.
  useEffect(() => {
    landed.current?.();
    landed.current = null;
  }, [pathname]);

  return useCallback(
    (href: string) => {
      if (href === pathname) return;
      void runViewTransition('page', () => {
        return new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, NEXT_PAGE_TIMEOUT_MS);
          landed.current = () => {
            clearTimeout(timer);
            resolve();
          };
          router.push(href);
        });
      });
    },
    [router, pathname],
  );
}
