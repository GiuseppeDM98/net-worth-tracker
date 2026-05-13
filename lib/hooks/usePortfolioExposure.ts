'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { PortfolioExposureResponse } from '@/types/exposure';

async function fetchPortfolioExposure(): Promise<PortfolioExposureResponse> {
  const response = await authenticatedFetch('/api/portfolio/exposure');
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
 */
export function usePortfolioExposure(
  userId: string | undefined,
  enabled: boolean
) {
  return useQuery({
    queryKey: queryKeys.portfolio.exposure(userId ?? ''),
    queryFn: fetchPortfolioExposure,
    enabled: !!userId && enabled,
    // Server cache is 24h; keep client stale for 20 min so navigating away and
    // back within a session doesn't trigger a redundant refetch.
    staleTime: 20 * 60 * 1000,
  });
}
