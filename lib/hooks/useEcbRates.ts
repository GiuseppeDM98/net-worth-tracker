'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { EcbMonthlyRate, EcbRatesResponse } from '@/types/benchmarks';

async function fetchEcbRates(): Promise<EcbMonthlyRate[]> {
  const response = await authenticatedFetch('/api/benchmarks/ecb-rates');

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? 'Impossibile caricare i tassi BCE');
  }

  const data: EcbRatesResponse = await response.json();
  return data.monthlyRates;
}

/**
 * React Query hook for historical monthly ECB deposit facility rates.
 * Only fetches when `enabled` is true (i.e. when the benchmark comparison section is open).
 * staleTime 6h matches the benchmark returns hook; server-side cache TTL is 7 days.
 */
export function useEcbRates(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.benchmarks.ecbRates(),
    queryFn: fetchEcbRates,
    enabled,
    staleTime: 1000 * 60 * 60 * 6, // 6 hours
    retry: 1,
  });
}
