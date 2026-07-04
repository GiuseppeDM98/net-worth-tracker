'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { DashboardOverviewPayload } from '@/types/dashboardOverview';

async function fetchDashboardOverview(
  userId: string
): Promise<DashboardOverviewPayload> {
  // Forward the active-account owner id: the endpoint is delegation-aware, so a
  // shared-account viewer must ask for the OWNER's overview, not the caller's own.
  const response = await authenticatedFetch(
    `/api/dashboard/overview?userId=${encodeURIComponent(userId)}`
  );

  if (!response.ok) {
    throw new Error('Failed to fetch dashboard overview');
  }

  return response.json() as Promise<DashboardOverviewPayload>;
}

export function useDashboardOverview(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dashboard.overview(userId || ''),
    // `enabled` guarantees userId is defined before the query runs.
    queryFn: () => fetchDashboardOverview(userId as string),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}
