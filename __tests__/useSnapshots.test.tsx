/**
 * «Crea snapshot» (lib/hooks/useSnapshots.ts, `useCreateSnapshot`): the same POST files today's row of
 * the daily archive, so its success invalidates the daily keys beside the snapshots, the assets and the
 * overview (2026-11-23).
 *
 * Mutation that turns it red: the invalidation of `queryKeys.dailySnapshots.all` removed.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const authenticatedFetch = vi.fn(async () => ({
  ok: true,
  json: async () => ({ success: true, message: 'ok', snapshotId: 'owner-1-2026-4', data: { dailyWritten: true } }),
}) as unknown as Response);
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: () => authenticatedFetch() }));
vi.mock('@/lib/services/snapshotService', () => ({ getUserSnapshots: vi.fn(async () => []) }));

import { useCreateSnapshot } from '@/lib/hooks/useSnapshots';

describe('useCreateSnapshot', () => {
  it('should invalidate the daily archive of the account on success', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateSnapshot('owner-1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({});
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['daily-snapshots', 'owner-1'] });
  });
});
