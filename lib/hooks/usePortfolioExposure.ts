'use client';

import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { computeExposure } from '@/lib/utils/exposureEngine';
import { profileRequestsSignature, selectProfileRequests } from '@/lib/utils/exposureRequests';
import type { Asset } from '@/types/assets';
import type { InstrumentProfile, InstrumentProfilesResponse } from '@/types/exposure';

async function fetchInstrumentProfiles(ownerId: string, force: boolean): Promise<InstrumentProfilesResponse> {
  const url = `/api/portfolio/instrument-profiles?userId=${encodeURIComponent(ownerId)}${force ? '&force=true' : ''}`;
  const response = await authenticatedFetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch instrument profiles');
  }
  return response.json() as Promise<InstrumentProfilesResponse>;
}

/** Stable, so a portfolio with nothing to ask computes once and not on every render. */
const NO_PROFILES: Record<string, InstrumentProfile> = {};

/**
 * The Esposizione of the OWNER's Allocazione portfolio: the route answers only the Yahoo profiles
 * of the tickers in view (`/api/portfolio/instrument-profiles`, one shared cache per ticker), and
 * the weighing runs here, in the browser, on the assets the page already holds
 * (`computeExposure`) — so the euros are Per classe's by construction and
 * an edited asset recomputes the tile without a third invalidation.
 *
 * The query key carries the SIGNATURE of the tickers in view («AAPL:stock|VWCE.DE:fund»): a new
 * ticker changes the key and the read restarts by itself. Nothing to ask (no quoted instrument
 * with a module) means no request at all — the engine still runs, so a portfolio of bonds and
 * crypto reads «non letto» with the names rather than a spinner. `staleTime` is an hour: the
 * server's TTL is 30 days per module, and `refresh()` («Aggiorna») passes `force=true` to it.
 *
 * The tile waits on the ENGINE's silence, not on a query flag: it shows its skeleton while
 * `exposure` is null and nothing failed, because with an empty signature the query is disabled —
 * never `isLoading` — and the engine has already answered. `isLoading` (never `isPending`, which
 * stays true forever on a disabled query, AGENTS.md § React Query) is still returned for a caller
 * with a request in flight; the tile does not read it.
 */
export function usePortfolioExposure(ownerId: string | undefined, assets: Asset[]) {
  const signature = useMemo(() => profileRequestsSignature(selectProfileRequests(assets)), [assets]);

  // Set to true by `refresh()` and consumed on the next queryFn call — a ref, not state, so
  // flipping it does not re-render.
  const forceRef = useRef(false);

  const query = useQuery({
    queryKey: queryKeys.portfolio.instrumentProfiles(ownerId ?? '', signature),
    queryFn: async () => {
      const force = forceRef.current;
      forceRef.current = false;
      return fetchInstrumentProfiles(ownerId!, force);
    },
    enabled: !!ownerId && signature !== '',
    staleTime: 60 * 60 * 1000,
  });

  // React Query keeps the last payload through a failed refresh, so a stale list beats an empty
  // tile; with nothing to ask the profiles are simply empty and the engine runs at once.
  const profiles = signature === '' ? NO_PROFILES : query.data?.profiles;
  const exposure = useMemo(() => (profiles ? computeExposure(assets, profiles) : null), [assets, profiles]);

  const refresh = () => {
    forceRef.current = true;
    return query.refetch();
  };

  return {
    exposure,
    profiles,
    oldestFetchedAt: query.data?.oldestFetchedAt ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
    refresh,
  };
}
