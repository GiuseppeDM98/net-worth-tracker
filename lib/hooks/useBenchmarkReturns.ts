'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { BenchmarkMonthlyReturn, BenchmarkReturnsResponse } from '@/types/benchmarks';

async function fetchBenchmarkReturns(benchmarkId: string): Promise<BenchmarkMonthlyReturn[]> {
  const response = await authenticatedFetch(
    `/api/benchmarks/returns?benchmarkId=${encodeURIComponent(benchmarkId)}`
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Impossibile caricare il benchmark ${benchmarkId}`);
  }

  const data: BenchmarkReturnsResponse = await response.json();
  return data.monthlyReturns;
}

/**
 * React Query hook for a single benchmark's full historical monthly return series.
 *
 * staleTime 6h: benchmark data is refreshed server-side every 7 days, so there is
 * no value in re-fetching on the client more often than once per browser session.
 */
export function useBenchmarkReturns(benchmarkId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.benchmarks.returns(benchmarkId),
    queryFn: () => fetchBenchmarkReturns(benchmarkId),
    enabled,
    staleTime: 1000 * 60 * 60 * 6, // 6 hours
    retry: 1,
  });
}
