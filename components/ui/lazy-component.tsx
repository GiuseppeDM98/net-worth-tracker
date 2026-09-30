'use client';

/**
 * A component whose code is a chunk of its own, loaded on demand — WITHOUT Suspense (2026-09-30).
 *
 * Why not `next/dynamic`: it is `React.lazy` under a Suspense boundary, and a lazy component always
 * suspends on its first render — the loader returns a promise even when the module is already in
 * memory — so the fallback is committed, and React 19 then holds a committed fallback for ~300 ms
 * before revealing what replaced it. Measured on the mirror: every chart opened for the first time
 * showed its placeholder ~300 ms with the chunk already cached, and Analisi's Sankey landed ~275 ms
 * after the page's figures. Here the loaded component lives in the factory's closure and a
 * `useSyncExternalStore` says whether it is there: loaded → drawn in the same render, no placeholder;
 * not yet → the caller's `fallback`, replaced the moment the module arrives.
 *
 * Contract:
 * - Call `lazyComponent` at MODULE level, never in a render (AGENTS.md § Dynamic Imports and Module
 *   Hygiene): the component it returns is one stable type.
 * - `preload()` starts the download (idempotent; one promise until it settles, forgotten on failure
 *   so the next call retries). A first render starts it too.
 * - The server and the hydration render the `fallback` (the store's server snapshot is `false`), so
 *   the HTML never disagrees with the first client frame.
 * - A failed load leaves the fallback on screen and logs; the next mount retries.
 */
import { useEffect, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';

export type LazyComponentProps<P> = P & {
  /** What stands in for the component until its chunk has arrived — the same size, so nothing moves. */
  fallback: ReactNode;
};

export interface LazyComponent<P> {
  (props: LazyComponentProps<P>): ReactNode;
  /** Start downloading the chunk now (idempotent). */
  preload: () => Promise<void>;
}

const serverSnapshot = () => false;

export function lazyComponent<P extends object>(load: () => Promise<ComponentType<P>>): LazyComponent<P> {
  let Loaded: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const isLoaded = () => Loaded !== null;

  const preload = (): Promise<void> => {
    pending ??= load().then(
      (component) => {
        Loaded = component;
        listeners.forEach((listener) => listener());
      },
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  };

  function Lazy({ fallback, ...props }: LazyComponentProps<P>) {
    const loaded = useSyncExternalStore(subscribe, isLoaded, serverSnapshot);
    useEffect(() => {
      if (!loaded) preload().catch((error: unknown) => console.error('[lazyComponent] chunk failed to load', error));
    }, [loaded]);
    const Component = Loaded;
    if (!loaded || Component === null) return <>{fallback}</>;
    return <Component {...(props as P)} />;
  }

  return Object.assign(Lazy, { preload });
}

/**
 * Preload lazy components once the browser is idle — off the page's critical path, before the
 * reader opens what they draw. `requestIdleCallback` where it exists (not in Safari: a short
 * timeout there). Pass a MODULE-level array, so the effect runs once.
 *
 * `enabled`: pass the page's «data ready» when the caller mounts before its data — the browser is
 * «idle» while it waits for Firestore, and a preload started then competes with the first figures
 * (Analisi's first number ~130 ms later on the mirror, 2026-09-30, until it waited for the data).
 */
export function usePreloadWhenIdle(lazies: ReadonlyArray<{ preload: () => Promise<void> }>, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const run = () => lazies.forEach((lazy) => lazy.preload().catch(() => {}));
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 1500);
    return () => window.clearTimeout(id);
  }, [lazies, enabled]);
}
