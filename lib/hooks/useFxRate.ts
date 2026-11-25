'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import type { EcbRate } from '@/lib/utils/tradeFx';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

async function fetchFxRate(currency: string, isoDay: string): Promise<EcbRate> {
  const params = new URLSearchParams({ currency, date: isoDay });
  const response = await authenticatedFetch(`/api/fx/rate?${params.toString()}`);
  if (!response.ok) throw new Error('Cambio non disponibile.');
  return (await response.json()) as EcbRate;
}

/**
 * The ECB rate the server will use for a trade in `currency` on `isoDay` (2026-11-23), so the trade
 * form previews the figure the save stores. Disabled for EUR, for a missing currency and for a day
 * that is not a full ISO date (a date input being typed).
 */
export function useFxRate(currency: string | undefined, isoDay: string | undefined) {
  const code = currency === 'GBp' ? 'GBP' : currency?.toUpperCase();
  const enabled = !!code && code !== 'EUR' && !!isoDay && ISO_DAY.test(isoDay);
  return useQuery({
    queryKey: queryKeys.fx.rate(code ?? '', isoDay ?? ''),
    queryFn: () => fetchFxRate(code as string, isoDay as string),
    enabled,
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
}
