'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { DashboardOverviewPayload } from '@/types/dashboardOverview';

async function fetchDashboardOverview(): Promise<DashboardOverviewPayload> {
  const response = await authenticatedFetch('/api/dashboard/overview');

  if (!response.ok) {
    throw new Error('Failed to fetch dashboard overview');
  }

  return response.json() as Promise<DashboardOverviewPayload>;
}

export function useDashboardOverview(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dashboard.overview(userId || ''),
    queryFn: fetchDashboardOverview,
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}
