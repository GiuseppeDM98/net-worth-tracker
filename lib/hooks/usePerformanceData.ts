'use client';

/**
 * Everything Rendimenti reads, each collection ONCE (2026-10-04).
 *
 * Depth two: the six collections through the app's shared hooks (one round trip, cached across
 * pages, restored from the persisted cache on a reload), then — together, as soon as the inputs
 * are in — the pre-computed metrics (`getAllPerformanceData` on those same inputs: one `getDoc` of
 * `performance-cache/{uid}`, the expenses only on a miss) and the dividend yields of the five
 * periods (one call to `POST /api/performance/yields`). The page used to read five of the
 * collections twice and call two yield routes per period AFTER the metrics.
 *
 * The metrics are named by the service's own cache key, so they are read again exactly when an
 * input that decides them changes; the yields stay in React Query for the global `staleTime` and
 * never enter `performance-cache`, whose key covers neither the dividends nor today's prices.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { snapshotsQueryOptions, useSnapshots } from '@/lib/hooks/useSnapshots';
import { assetsQueryOptions, useAssets } from '@/lib/hooks/useAssets';
import { settingsQueryOptions, useSettings } from '@/lib/hooks/useSettings';
import { pensionContributionsQueryOptions, usePensionContributions } from '@/lib/hooks/usePensionContributions';
import { assetTransactionsQueryOptions, useAssetTransactions } from '@/lib/hooks/useAssetTransactions';
// The Admin-SDK dividendService is server-only: a client page reads the registry through this hook's reader.
import { dividendReceiptsQueryOptions, useDividendReceipts } from '@/lib/hooks/useDividendReceipts';
import { resolvePerformanceSetup, resolveYieldPeriods, type PerformanceInputs } from '@/lib/services/performanceService';
import {
  buildPerformanceQueries,
  mergePerformanceYields,
  performanceDataQueryOptions,
  performanceYieldsQueryOptions,
} from '@/lib/query/performanceQueries';
import { queryKeys } from '@/lib/query/queryKeys';
import { composeReadState } from '@/lib/utils/readState';
import type { PerformanceYieldPeriod } from '@/lib/utils/dividendYield';

const NO_PERIODS: PerformanceYieldPeriod[] = [];

/**
 * @param ownerId - Whose portfolio (`useActiveAccount().ownerId`, never the viewer's uid)
 */
export function usePerformanceData(ownerId: string | undefined) {
  const queryClient = useQueryClient();
  const snapshotsQuery = useSnapshots(ownerId);
  const assetsQuery = useAssets(ownerId);
  const settingsQuery = useSettings(ownerId);
  const contributionsQuery = usePensionContributions(ownerId);
  const dividendsQuery = useDividendReceipts(ownerId);
  // Not gated on the ledger's migration: the base resolution reads the ledger whatever its state.
  const tradesQuery = useAssetTransactions(ownerId);

  // «Today» for the dividend windows, fixed for the life of the page and moved by a refresh: read
  // on every render it would rename the yields query each time, and ask the route again.
  const [clock, setClock] = useState(() => new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const snapshots = snapshotsQuery.data;
  const assets = assetsQuery.data;
  const settings = settingsQuery.data;
  const contributions = contributionsQuery.data;
  const trades = tradesQuery.data;

  // The settings document may not exist (`null`): only `undefined` means «not read yet».
  const inputs = useMemo<PerformanceInputs | null>(
    () => (snapshots && assets && settings !== undefined && contributions && trades ? { snapshots, assets, settings, contributions, trades } : null),
    [snapshots, assets, settings, contributions, trades],
  );
  // The SAME resolution the service runs: the base the page's charts read and the key its payload is named by.
  const setup = useMemo(() => (inputs ? resolvePerformanceSetup(inputs) : null), [inputs]);
  const periods = useMemo(() => (setup ? resolveYieldPeriods(setup.base.snapshots, clock) : NO_PERIODS), [setup, clock]);

  const queries = buildPerformanceQueries({ ownerId, inputs, setup, periods, paused: isRefreshing });
  const dataQuery = useQuery(queries.data);
  const yieldsQuery = useQuery(queries.yields);

  const performanceData = useMemo(
    () => (dataQuery.data ? mergePerformanceYields(dataQuery.data, yieldsQuery.data) : null),
    [dataQuery.data, yieldsQuery.data],
  );

  // Every query the figures depend on gates the page (doc/guide/stati.md). The yields gate the
  // wait but not the failure: without them the page shows its metrics, as it always did.
  const inputQueries = [snapshotsQuery, assetsQuery, settingsQuery, contributionsQuery, dividendsQuery, tradesQuery] as const;
  const readState = composeReadState([...inputQueries, dataQuery]);
  const loadFailed = readState.loadFailed;
  const loading = readState.loading || yieldsQuery.isLoading || (!loadFailed && !performanceData);

  /**
   * «Aggiorna»: read the six collections anew, recompute the metrics past the Firestore cache
   * (and rewrite it) and ask the yields again — the two together, as on a first load.
   *
   * @returns false when a read failed (the caller says so; the queries hold the failure)
   */
  const refresh = useCallback(async (): Promise<boolean> => {
    if (!ownerId) return false;
    setIsRefreshing(true);
    try {
      const now = new Date();
      // A metrics read still in flight would be handed back by `fetchQuery` in place of the forced one.
      await queryClient.cancelQueries({ queryKey: queryKeys.performance.data(ownerId, '').slice(0, 3) });
      const stageOne = [
        snapshotsQueryOptions(ownerId),
        assetsQueryOptions(ownerId),
        settingsQueryOptions(ownerId),
        pensionContributionsQueryOptions(ownerId),
        assetTransactionsQueryOptions(ownerId),
        dividendReceiptsQueryOptions(ownerId),
      ] as const;
      // Invalidated FIRST, so `fetchQuery` reads anew instead of answering from the cache; the
      // hooks above are the same entries and receive the same fresh lists.
      await Promise.all(stageOne.map((options) => queryClient.invalidateQueries({ queryKey: options.queryKey })));
      const [freshSnapshots, freshAssets, freshSettings, freshContributions, freshTrades] = await Promise.all([
        queryClient.fetchQuery(stageOne[0]),
        queryClient.fetchQuery(stageOne[1]),
        queryClient.fetchQuery(stageOne[2]),
        queryClient.fetchQuery(stageOne[3]),
        queryClient.fetchQuery(stageOne[4]),
        queryClient.fetchQuery(stageOne[5]),
      ]);
      const freshInputs: PerformanceInputs = {
        snapshots: freshSnapshots,
        assets: freshAssets,
        settings: freshSettings,
        contributions: freshContributions,
        trades: freshTrades,
      };
      const freshSetup = resolvePerformanceSetup(freshInputs);
      const freshPeriods = resolveYieldPeriods(freshSetup.base.snapshots, now);
      await Promise.all([
        queryClient.fetchQuery({ ...performanceDataQueryOptions(ownerId, freshInputs, freshSetup.cacheKey, true), staleTime: 0 }),
        freshPeriods.length > 0
          ? queryClient.fetchQuery({ ...performanceYieldsQueryOptions(ownerId, freshPeriods), staleTime: 0 }).catch((error) => {
              console.warn('Dividend yields not refreshed:', error);
            })
          : undefined,
      ]);
      // The windows just asked become the page's: its queries find both answers under their keys.
      setClock(now);
      return true;
    } catch (error) {
      console.error('Error refreshing performance data:', error);
      return false;
    } finally {
      setIsRefreshing(false);
    }
  }, [ownerId, queryClient]);

  return {
    /** The pre-computed metrics with the yields merged in; `null` until both are read. */
    performanceData,
    /** The resolved base (projected snapshots, exclusions, pension entry, both flow channels). */
    base: setup?.base ?? null,
    assets,
    contributions,
    dividends: dividendsQuery.data,
    trades,
    loading,
    loadFailed,
    isRefreshing,
    /** A new set of inputs is being measured: the figures on screen are the previous set's. */
    isRecomputing: dataQuery.isPlaceholderData,
    refresh,
    /** For `useFreshness`: every query whose figure is on the page. */
    freshnessQueries: [...inputQueries, dataQuery, yieldsQuery] as const,
  };
}
