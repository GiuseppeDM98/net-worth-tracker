'use client';

/**
 * The last `days` Italian days of the daily archive, ascending (2026-11-23).
 *
 * One query per month touched, never one for the window: a month read after it closed is final
 * (`isDailyMonthFinal`) and never goes stale, so a long window — Rendimenti follows the chosen
 * period, whatever its length — reads its closed months once and keeps them on the device (the
 * prefix is persisted, lib/constants/persistCache.ts). The month in course, and a past month whose
 * copy was taken while it was still open, take the global five minutes. A restored copy keeps its
 * `dataUpdatedAt`, which is what the finality reads.
 *
 * Not a query: the result is ONE object composed by `combine`, and `ownerId` is the only gate —
 * without it nothing is read. Pass the account (`ownerId`), never `user.uid`.
 */

import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { QUERY_STALE_TIME_MS } from '@/lib/query/queryDefaults';
import { getDailySnapshotMonth } from '@/lib/services/dailySnapshotService';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import {
  flattenDailyMonths,
  isDailyMonthFinal,
  isoDaysBefore,
  monthKeysBetween,
  type DailyPoint,
  type DailySnapshotMonth,
} from '@/lib/utils/dailySnapshot';

export interface DailySnapshotsResult {
  /** Ascending; undefined until every month of the window has answered once. */
  data: DailyPoint[] | undefined;
  isPending: boolean;
  /** A month failed and no copy of it is held. */
  isError: boolean;
}

export function useDailySnapshots(ownerId: string | undefined, days: number): DailySnapshotsResult {
  const toIso = getItalyDateIso();
  const fromIso = isoDaysBefore(toIso, Math.max(1, days) - 1);
  const monthKeys = monthKeysBetween(fromIso, toIso);

  return useQueries({
    queries: monthKeys.map((key) => ({
      queryKey: queryKeys.dailySnapshots.month(ownerId ?? '', key),
      queryFn: () => getDailySnapshotMonth(ownerId ?? '', key),
      enabled: Boolean(ownerId),
      // `dataUpdatedAt` 0 (never fetched) reads as 1970: never final.
      staleTime: (query: { state: { dataUpdatedAt: number } }) =>
        isDailyMonthFinal(key, getItalyDateIso(new Date(query.state.dataUpdatedAt))) ? Infinity : QUERY_STALE_TIME_MS,
    })),
    combine: (results): DailySnapshotsResult => {
      const isPending = results.some((result) => result.isPending);
      const isError = results.some((result) => result.isError && result.data === undefined);
      const months = results
        .map((result) => result.data)
        .filter((month): month is DailySnapshotMonth => month !== null && month !== undefined);
      return {
        data: isPending ? undefined : flattenDailyMonths(months, fromIso, toIso),
        isPending,
        isError,
      };
    },
  });
}
