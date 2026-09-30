/**
 * `applyPersistedQueryDefaults` — every persisted prefix keeps its queries in memory for the
 * persisted retention, and only those: the allowlist and the `gcTime` are ONE list.
 */
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { PERSISTED_GC_TIME_MS, PERSISTED_QUERY_PREFIXES } from '@/lib/constants/persistCache';
import { applyPersistedQueryDefaults } from '@/lib/query/persistedQueryDefaults';
import { queryKeys } from '@/lib/query/queryKeys';

describe('applyPersistedQueryDefaults', () => {
  it('should give every persisted prefix the persisted gcTime, the owner segment included', () => {
    const queryClient = new QueryClient();

    applyPersistedQueryDefaults(queryClient);

    for (const prefix of PERSISTED_QUERY_PREFIXES) {
      expect(queryClient.getQueryDefaults([...prefix, 'owner-uid']).gcTime, prefix.join('/')).toBe(PERSISTED_GC_TIME_MS);
    }
  });

  it('should reach a longer key under a prefix (a per-fund contribution list)', () => {
    const queryClient = new QueryClient();

    applyPersistedQueryDefaults(queryClient);

    expect(queryClient.getQueryDefaults(queryKeys.pensionContributions.byAsset('owner-uid', 'fund-1')).gcTime).toBe(PERSISTED_GC_TIME_MS);
  });

  it('should leave a key off the allowlist on the global default', () => {
    const queryClient = new QueryClient();

    applyPersistedQueryDefaults(queryClient);

    expect(queryClient.getQueryDefaults(queryKeys.assistant.threads('owner-uid')).gcTime).toBeUndefined();
  });
});
