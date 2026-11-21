/**
 * «Rivedi il piano» writes on the assets read AGAIN at the click (2026-11-20, the guided path's retirement): the
 * hook reads `getAllAssets(ownerId)` and hands THAT list to `revisePlan`, whose gate then refuses an account deleted
 * in another tab — never the page's list, which may be stale. The services are mocked.
 *
 * Mutation that turns it red: `useRevisePlan` passing the caller's assets through.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const spies = vi.hoisted(() => ({ revisePlan: vi.fn(), getAllAssets: vi.fn() }));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/services/assetService', () => ({ getAllAssets: spies.getAllAssets }));
vi.mock('@/lib/services/accumulationPlanService', () => ({ revisePlan: spies.revisePlan }));

import { useRevisePlan } from '@/lib/hooks/useAccumulationPlan';

describe('useRevisePlan', () => {
  it('reads the assets again and revises on that list', async () => {
    const fresh = [{ id: 'conto-fenicottero' }];
    spies.getAllAssets.mockResolvedValue(fresh);
    spies.revisePlan.mockResolvedValue(undefined);
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useRevisePlan('owner-1'), { wrapper });
    const today = new Date('2027-02-12T12:00:00');
    const deps = {} as never;
    await act(() => result.current.mutateAsync({ planId: 'plan-1', revision: {} as never, input: { deps, today } }));
    expect(spies.getAllAssets).toHaveBeenCalledWith('owner-1');
    expect(spies.revisePlan).toHaveBeenCalledWith('plan-1', {}, { allAssets: fresh, deps, today });
  });
});
