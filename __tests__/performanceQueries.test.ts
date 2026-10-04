import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

/**
 * The two queries behind Rendimenti (`lib/query/performanceQueries.ts`): the pre-computed metrics
 * and the dividend yields, built together and started together.
 *
 * THE PROPERTY (2026-10-04): the yields are asked for while the metrics are still being read —
 * the page went from «metrics, then two yield routes per period» to one round trip for both.
 * Held here with a metrics read that NEVER resolves: the yields route has been called anyway.
 * Seen red on 2026-10-04 by making the yields' `queryFn` await the metrics first (the old order).
 *
 * No DOM: the options are handed to `QueryObserver`, which is what `useQuery` mounts.
 */

const { getAllPerformanceDataMock, fetchPerformanceYieldsMock } = vi.hoisted(() => ({
  getAllPerformanceDataMock: vi.fn(),
  fetchPerformanceYieldsMock: vi.fn(),
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/services/performanceService', () => ({ getAllPerformanceData: getAllPerformanceDataMock }));
vi.mock('@/lib/services/performanceYieldsService', () => ({ fetchPerformanceYields: fetchPerformanceYieldsMock }));

import { buildPerformanceQueries, describeYieldPeriods, mergePerformanceYields, withYields } from '@/lib/query/performanceQueries';
import { EMPTY_PERFORMANCE_YIELDS, type PerformanceYieldPeriod, type PerformanceYields } from '@/lib/utils/dividendYield';
import type { PerformanceInputs, PerformanceSetup } from '@/lib/services/performanceService';
import type { PerformanceData, PerformanceMetrics } from '@/types/performance';

const OWNER = 'u1';
const INPUTS: PerformanceInputs = { snapshots: [], settings: null, assets: [], contributions: [], trades: [] };
const SETUP = { cacheKey: 'v8-key' } as PerformanceSetup;
const PERIODS: PerformanceYieldPeriod[] = [
  { key: 'ytd', startDate: new Date('2026-01-01T00:00:00.000Z'), dividendEndDate: new Date('2026-10-04T10:00:00.000Z'), numberOfMonths: 9 },
  { key: 'allTime', startDate: new Date('2023-02-01T00:00:00.000Z'), dividendEndDate: new Date('2026-10-04T10:00:00.000Z'), numberOfMonths: 44 },
];
const YIELDS: PerformanceYields = { ...EMPTY_PERFORMANCE_YIELDS, yocGross: 3.2, yocNet: 2.4, currentYield: 2.1, currentYieldNet: 1.6, yocAssetCount: 2 };

function metrics(overrides: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
  return { ...EMPTY_PERFORMANCE_YIELDS, timeWeightedReturn: 7, hasInsufficientData: false, ...overrides } as PerformanceMetrics;
}

let client: QueryClient;
let unsubscribes: Array<() => void>;

/** Mount both queries the way the hook does: one observer each. */
function mount(queries: ReturnType<typeof buildPerformanceQueries>) {
  const data = new QueryObserver(client, queries.data);
  const yields = new QueryObserver(client, queries.yields);
  unsubscribes.push(data.subscribe(() => {}), yields.subscribe(() => {}));
  return { data, yields };
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  unsubscribes = [];
  vi.clearAllMocks();
  fetchPerformanceYieldsMock.mockResolvedValue({ ytd: YIELDS, allTime: YIELDS });
});

afterEach(() => {
  for (const unsubscribe of unsubscribes) unsubscribe();
  client.clear();
});

describe('buildPerformanceQueries', () => {
  it('should ask the yields while the metrics are still being read', async () => {
    // The metrics never come back.
    getAllPerformanceDataMock.mockReturnValue(new Promise(() => {}));

    const { data, yields } = mount(buildPerformanceQueries({ ownerId: OWNER, inputs: INPUTS, setup: SETUP, periods: PERIODS, paused: false }));

    await vi.waitFor(() => expect(yields.getCurrentResult().data).toEqual({ ytd: YIELDS, allTime: YIELDS }));
    expect(fetchPerformanceYieldsMock).toHaveBeenCalledTimes(1);
    expect(fetchPerformanceYieldsMock).toHaveBeenCalledWith(OWNER, PERIODS);
    // Positive anchor: the metrics read did start, with the caller's inputs, and is still out.
    expect(getAllPerformanceDataMock).toHaveBeenCalledTimes(1);
    expect(getAllPerformanceDataMock).toHaveBeenCalledWith(OWNER, false, INPUTS);
    expect(data.getCurrentResult().isLoading).toBe(true);
  });

  it('should read nothing until every input is in', async () => {
    const { data, yields } = mount(buildPerformanceQueries({ ownerId: OWNER, inputs: null, setup: null, periods: [], paused: false }));

    await Promise.resolve();
    expect(getAllPerformanceDataMock).not.toHaveBeenCalled();
    expect(fetchPerformanceYieldsMock).not.toHaveBeenCalled();
    // A disabled query is not «loading»: the page's skeleton comes from the inputs' own wait.
    expect(data.getCurrentResult().isLoading).toBe(false);
    expect(yields.getCurrentResult().isLoading).toBe(false);
  });

  it('should stand still while a refresh reads both itself', async () => {
    mount(buildPerformanceQueries({ ownerId: OWNER, inputs: INPUTS, setup: SETUP, periods: PERIODS, paused: true }));

    await Promise.resolve();
    expect(getAllPerformanceDataMock).not.toHaveBeenCalled();
    expect(fetchPerformanceYieldsMock).not.toHaveBeenCalled();
  });

  it('should ask no yields when no period can be measured, and still read the metrics', async () => {
    getAllPerformanceDataMock.mockResolvedValue({ snapshotCount: 1 });

    const { data } = mount(buildPerformanceQueries({ ownerId: OWNER, inputs: INPUTS, setup: SETUP, periods: [], paused: false }));

    await vi.waitFor(() => expect(data.getCurrentResult().data).toEqual({ snapshotCount: 1 }));
    expect(fetchPerformanceYieldsMock).not.toHaveBeenCalled();
  });

  it('should name the metrics by owner and cache key, the yields by owner and windows', () => {
    const queries = buildPerformanceQueries({ ownerId: OWNER, inputs: INPUTS, setup: SETUP, periods: PERIODS, paused: false });

    expect(queries.data.queryKey).toEqual(['performance', 'data', OWNER, 'v8-key']);
    expect(queries.yields.queryKey).toEqual(['performance', 'yields', OWNER, describeYieldPeriods(PERIODS)]);
  });

  it('should keep the previous payload on screen for the same account, never for another', () => {
    const previous = { snapshotCount: 3 } as PerformanceData;
    const sameOwner = buildPerformanceQueries({ ownerId: OWNER, inputs: INPUTS, setup: SETUP, periods: PERIODS, paused: false });
    const otherOwner = buildPerformanceQueries({ ownerId: 'u2', inputs: INPUTS, setup: SETUP, periods: PERIODS, paused: false });
    const previousQuery = { queryKey: ['performance', 'data', OWNER, 'older-key'] };

    expect(sameOwner.data.placeholderData(previous, previousQuery)).toBe(previous);
    expect(otherOwner.data.placeholderData(previous, previousQuery)).toBeUndefined();
  });
});

describe('describeYieldPeriods', () => {
  it('should change with the start, the months, the set of windows and the DAY of the cap', () => {
    const signature = describeYieldPeriods(PERIODS);

    expect(describeYieldPeriods([{ ...PERIODS[0], numberOfMonths: 10 }, PERIODS[1]])).not.toBe(signature);
    expect(describeYieldPeriods([{ ...PERIODS[0], startDate: new Date('2026-02-01T00:00:00.000Z') }, PERIODS[1]])).not.toBe(signature);
    expect(describeYieldPeriods([{ ...PERIODS[0], dividendEndDate: new Date('2026-10-05T10:00:00.000Z') }, PERIODS[1]])).not.toBe(signature);
    expect(describeYieldPeriods([PERIODS[0]])).not.toBe(signature);
  });

  it('should keep its name through the day: a reload a minute later finds the persisted answer', () => {
    const aMinuteLater = PERIODS.map((period) => ({ ...period, dividendEndDate: new Date(period.dividendEndDate.getTime() + 60_000) }));

    expect(describeYieldPeriods(aMinuteLater)).toBe(describeYieldPeriods(PERIODS));
  });
});

describe('mergePerformanceYields', () => {
  const data = {
    ytd: metrics(),
    oneYear: metrics(),
    threeYear: metrics({ hasInsufficientData: true }),
    fiveYear: metrics(),
    allTime: metrics(),
    custom: null,
    rolling12M: [],
    lastUpdated: new Date(2026, 9, 4),
    snapshotCount: 12,
  } as PerformanceData;

  it('should give each period its own yields and leave the payload it was handed untouched', () => {
    const merged = mergePerformanceYields(data, { ytd: YIELDS, allTime: { ...YIELDS, yocGross: 4 } });

    expect(merged.ytd.yocGross).toBe(3.2);
    expect(merged.allTime.yocGross).toBe(4);
    expect(merged.ytd.timeWeightedReturn).toBe(7);
    expect(data.ytd.yocGross).toBeNull();
    expect(merged).not.toBe(data);
  });

  it('should leave a period without an answer on the empty reading', () => {
    const merged = mergePerformanceYields(data, { ytd: YIELDS });

    expect(merged.oneYear.yocGross).toBeNull();
    expect(merged.oneYear.currentYieldDividends).toBe(0);
    expect(mergePerformanceYields(data, undefined).ytd.yocGross).toBeNull();
  });

  it('should never put a yield on a period that measured nothing', () => {
    expect(mergePerformanceYields(data, { threeYear: YIELDS }).threeYear.yocGross).toBeNull();
    expect(withYields(metrics({ hasInsufficientData: true }), YIELDS).currentYield).toBeNull();
  });
});
