/**
 * The two queries behind Rendimenti's figures, as options: the pre-computed metrics and the
 * dividend yields.
 *
 * They are built TOGETHER, from the same inputs, because that is the property: the yields are
 * asked for as soon as the windows are known — from the snapshots, `resolveYieldPeriods` — in the
 * same render that starts the metrics, never after them. Until 2026-10-04 the yields waited for
 * the metrics' payload to read their dates off it: one more round trip in series before the hero.
 * `__tests__/performanceQueries.test.ts` holds it (a metrics read that never resolves, the yields
 * route called anyway).
 *
 * No React here, so the composition is testable in Node; `lib/hooks/usePerformanceData.ts` hands
 * these options to `useQuery` as they are.
 */

import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllPerformanceData, type PerformanceInputs, type PerformanceSetup } from '@/lib/services/performanceService';
import { fetchPerformanceYields } from '@/lib/services/performanceYieldsService';
import { EMPTY_PERFORMANCE_YIELDS, type PerformanceYieldPeriod, type PerformanceYields } from '@/lib/utils/dividendYield';
import type { PerformanceData, PerformanceMetrics } from '@/types/performance';

/** A date's calendar day in the browser's zone, «2026-10-04». */
function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * The windows as a string, the name of their answer in the cache.
 *
 * The dividend cap enters by its DAY, not by its instant: for an open period the cap is «now», and
 * a name carrying the millisecond would be new at every page load — the answer persisted a minute
 * ago would never be found again, and the reload would wait on a skeleton. The request still
 * carries the exact instant; the name says «these windows, asked today».
 */
export function describeYieldPeriods(periods: PerformanceYieldPeriod[]): string {
  return periods
    .map((period) => `${period.key}:${period.startDate.toISOString()}:${localDay(period.dividendEndDate)}:${period.numberOfMonths}`)
    .join('|');
}

/** The yields query for a set of windows — also the imperative read of a custom range or a refresh. */
export function performanceYieldsQueryOptions(ownerId: string, periods: PerformanceYieldPeriod[]) {
  return queryOptions<Record<string, PerformanceYields>>({
    queryKey: queryKeys.performance.yields(ownerId, describeYieldPeriods(periods)),
    queryFn: () => fetchPerformanceYields(ownerId, periods),
    // A yield that cannot be read leaves the metrics without it (as the two old routes did): three
    // retries with backoff would hold the hero for seconds over a secondary figure.
    retry: false,
  });
}

/** The metrics query for a set of inputs, named by the cache key they resolve to. */
export function performanceDataQueryOptions(ownerId: string, inputs: PerformanceInputs, cacheKey: string, forceRefresh = false) {
  return queryOptions<PerformanceData>({
    queryKey: queryKeys.performance.data(ownerId, cacheKey),
    queryFn: () => getAllPerformanceData(ownerId, forceRefresh, inputs),
  });
}

/**
 * One period's metrics with its yields: the route's answer, or the empty reading — for a period
 * with nothing to measure, and for a yield that was not read.
 */
export function withYields(metrics: PerformanceMetrics, yields: PerformanceYields | undefined): PerformanceMetrics {
  return { ...metrics, ...EMPTY_PERFORMANCE_YIELDS, ...(metrics.hasInsufficientData ? undefined : yields) };
}

/**
 * The payload the page reads: the pre-computed metrics with each period's yields merged in.
 * A new object — the cached payloads are never mutated.
 */
export function mergePerformanceYields(data: PerformanceData, yieldsByKey: Record<string, PerformanceYields> | undefined): PerformanceData {
  return {
    ...data,
    ytd: withYields(data.ytd, yieldsByKey?.ytd),
    oneYear: withYields(data.oneYear, yieldsByKey?.oneYear),
    threeYear: withYields(data.threeYear, yieldsByKey?.threeYear),
    fiveYear: withYields(data.fiveYear, yieldsByKey?.fiveYear),
    allTime: withYields(data.allTime, yieldsByKey?.allTime),
  };
}

interface PerformanceQueriesInput {
  ownerId: string | undefined;
  /** The five collections, once every one of them has been read; `null` until then. */
  inputs: PerformanceInputs | null;
  /** `resolvePerformanceSetup(inputs)`; `null` with `inputs`. */
  setup: PerformanceSetup | null;
  /** `resolveYieldPeriods` over the setup's base; empty when no period can be measured. */
  periods: PerformanceYieldPeriod[];
  /** A refresh is reading both itself: the observers stand still, or each would read a second time. */
  paused: boolean;
}

/** The previous payload stays on screen while a new key reads — never across two accounts. */
function keepSameOwner<T>(ownerId: string | undefined) {
  return (previous: T | undefined, previousQuery: { queryKey: readonly unknown[] } | undefined): T | undefined =>
    previousQuery?.queryKey[2] === ownerId ? previous : undefined;
}

/**
 * Both queries, enabled by the SAME condition — the inputs are in — plus, for the yields, at least
 * one measurable period.
 */
export function buildPerformanceQueries({ ownerId, inputs, setup, periods, paused }: PerformanceQueriesInput) {
  const ready = !!ownerId && !!inputs && !!setup && !paused;
  // A disabled query still needs a key and a function of the right shape.
  const owner = ownerId ?? '';
  const emptyInputs: PerformanceInputs = { snapshots: [], settings: null, assets: [], contributions: [], trades: [] };
  return {
    data: {
      ...performanceDataQueryOptions(owner, inputs ?? emptyInputs, setup?.cacheKey ?? ''),
      enabled: ready,
      placeholderData: keepSameOwner<PerformanceData>(ownerId),
    },
    yields: {
      ...performanceYieldsQueryOptions(owner, periods),
      enabled: ready && periods.length > 0,
      placeholderData: keepSameOwner<Record<string, PerformanceYields>>(ownerId),
    },
  };
}
