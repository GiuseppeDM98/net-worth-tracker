'use client';

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { PortfolioExposureResponse } from '@/types/exposure';

async function fetchPortfolioExposure(
  force: boolean
): Promise<PortfolioExposureResponse> {
  const url = force
    ? '/api/portfolio/exposure?force=true'
    : '/api/portfolio/exposure';
  const response = await authenticatedFetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch portfolio exposure');
  }
  return response.json() as Promise<PortfolioExposureResponse>;
}

/**
 * Lazily fetches portfolio exposure breakdown (top holdings, sectors, ETF issuers).
 *
 * Pass enabled=false until the user opens the ExposureSection to avoid
 * unnecessary Yahoo Finance calls on every Allocazione page load.
 *
 * The returned `refresh` callback triggers a server-side cache bypass: useful
 * for the "Aggiorna" button when the portfolio composition hasn't changed but
 * the user wants fresh data. Plain `refetch` from React Query alone is not
 * enough because the server returns its Firestore cache when the cacheKey is
 * unchanged.
 */
export function usePortfolioExposure(
  userId: string | undefined,
  enabled: boolean
) {
  // Set to true by `refresh()` and consumed on the next queryFn call.
  // A ref (not state) avoids triggering a re-render when we flip it.
  const forceRef = useRef(false);

  const query = useQuery({
    queryKey: queryKeys.portfolio.exposure(userId ?? ''),
    queryFn: async () => {
      const force = forceRef.current;
      forceRef.current = false;
      return fetchPortfolioExposure(force);
    },
    enabled: !!userId && enabled,
    // Server cache is 24h; keep client stale for 20 min so navigating away and
    // back within a session doesn't trigger a redundant refetch.
    staleTime: 20 * 60 * 1000,
  });

  const refresh = () => {
    forceRef.current = true;
    return query.refetch();
  };

  return { ...query, refresh };
}
