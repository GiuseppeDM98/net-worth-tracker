/**
 * The daily archive's hook (lib/hooks/useDailySnapshots.ts): the last `days` Italian days, one read per
 * month touched, ascending, nothing read without an owner. The service is mocked per month; invented figures.
 *
 * Mutation that turns it red: `isoDaysBefore(toIso, days - 1)` → `days` (the window gains 2026-02-27).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { DailySnapshotDay, DailySnapshotMonth } from '@/lib/utils/dailySnapshot';

function day(netWorth: number): DailySnapshotDay {
  return { netWorth, liquid: 0, byClass: {}, assets: {}, at: '2026-03-02T12:00:00.000Z' };
}

const MONTHS: Record<string, DailySnapshotMonth> = {
  '2026-02': { userId: 'owner-1', month: '2026-02', days: { '27': day(2700), '28': day(2800) } },
  '2026-03': { userId: 'owner-1', month: '2026-03', days: { '01': day(100), '02': day(200) } },
};

const getDailySnapshotMonth = vi.fn(async (_userId: string, monthKey: string) => MONTHS[monthKey] ?? null);
vi.mock('@/lib/services/dailySnapshotService', () => ({
  getDailySnapshotMonth: (userId: string, monthKey: string) => getDailySnapshotMonth(userId, monthKey),
}));

import { useDailySnapshots } from '@/lib/hooks/useDailySnapshots';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useDailySnapshots', () => {
  beforeEach(() => {
    getDailySnapshotMonth.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-02T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should answer the last three Italian days across a month end, one read per month', async () => {
    const { result } = renderHook(() => useDailySnapshots('owner-1', 3), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((point) => point.iso)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02']);
    expect(result.current.data?.map((point) => point.netWorth)).toEqual([2800, 100, 200]);
    expect(result.current.isPending).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(getDailySnapshotMonth.mock.calls.map(([, key]) => key).sort()).toEqual(['2026-02', '2026-03']);
  });

  it('should read nothing without an owner', async () => {
    const { result } = renderHook(() => useDailySnapshots(undefined, 3), { wrapper });

    expect(result.current.data).toBeUndefined();
    expect(getDailySnapshotMonth).not.toHaveBeenCalled();
  });
});
