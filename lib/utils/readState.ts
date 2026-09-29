/**
 * The read state of a surface that reads SEVERAL React Query keys (Storico reads six).
 *
 * «An async view must gate on EVERY query it reads» (AGENTS.md § React Query and Derived State,
 * doc/guide/stati.md): every query defaults to `[]`, so a page that waits for one and reads the
 * others would print a verdict about sets that were never read. This composes the queries into
 * the two inputs `resolveSurfaceState` takes — `loading` while ANY is still reading, `failed`
 * when ANY read did not happen — so a page holds one decision, not six.
 */

/** The two flags a page reads off each `useQuery` result. */
export interface QueryReadFlags {
  isLoading: boolean;
  isError: boolean;
}

export interface ComposedReadState {
  /** Some query is still reading: the skeleton stays (it wins over `loadFailed`, a retry is an attempt). */
  loading: boolean;
  /** Some query did not read: the surface is an alert, never an empty state. */
  loadFailed: boolean;
}

/** Compose the read state of a page over every query it reads. */
export function composeReadState(queries: readonly QueryReadFlags[]): ComposedReadState {
  return {
    loading: queries.some((query) => query.isLoading),
    loadFailed: queries.some((query) => query.isError),
  };
}
