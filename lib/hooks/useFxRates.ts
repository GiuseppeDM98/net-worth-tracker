'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { FxMonthlyRate, FxRatesResponse } from '@/types/benchmarks';

async function fetchFxRates(): Promise<FxMonthlyRate[]> {
  const response = await authenticatedFetch('/api/benchmarks/fx-rates');

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? 'Impossibile caricare i tassi di cambio EUR/USD');
  }

  const data: FxRatesResponse = await response.json();
  return data.monthlyRates;
}

/**
 * React Query hook for historical monthly EUR/USD exchange rates.
 * Only fetches when `enabled` is true (i.e. when the user turns on EUR conversion).
 * staleTime 6h matches benchmark returns — same Firestore 7-day cache TTL server-side.
 */
export function useFxRates(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.benchmarks.fxRates(),
    queryFn: fetchFxRates,
    enabled,
    staleTime: 1000 * 60 * 60 * 6, // 6 hours
    retry: 1,
  });
}
