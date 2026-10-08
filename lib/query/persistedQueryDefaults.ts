/**
 * The `gcTime` of the persisted keys, set ONCE on the client by prefix.
 *
 * `dehydrate` writes what is in the cache, and the global `gcTime` (ten minutes) removes an
 * inactive query from the cache — so, without this, a page not visited for ten minutes would be
 * dropped from the persisted client at the next save and «riaprire dopo un'ora» would restore
 * nothing. `setQueryDefaults` matches a prefix partially, exactly as `isPersistableQuery` does, so
 * the allowlist and the retention are one list (lib/constants/persistCache.ts): a key added there
 * is kept for the max age by construction, without a `gcTime` to remember in its hook.
 * A hook that sets its own `gcTime` still wins — none of the persisted ones does.
 */

import type { QueryClient } from '@tanstack/react-query';
import { PERSISTED_GC_TIME_MS, PERSISTED_QUERY_PREFIXES } from '@/lib/constants/persistCache';

/** Give every persisted prefix the persisted `gcTime`. Idempotent; called once at client creation. */
export function applyPersistedQueryDefaults(queryClient: QueryClient): void {
  for (const prefix of PERSISTED_QUERY_PREFIXES) {
    queryClient.setQueryDefaults([...prefix], { gcTime: PERSISTED_GC_TIME_MS });
  }
}
