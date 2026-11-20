'use client';

/**
 * The quotes of the instruments the Consulente's «Applica» would create (2026-11-20,
 * doc/guide/consulente-piano.md § After «Applica»): one `GET /api/prices/quote?ticker=` per symbol,
 * under ONE key (the sorted symbols), five minutes fresh, never persisted. A symbol whose request
 * fails is a quote without a price — `pickFreshQuote` skips it. A government bond is quoted by its ISIN
 * (`GET /api/prices/bond-quote?isin=`, owner 2026-11-20), under the ISIN, its price the % of par.
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import type { RawQuote } from '@/lib/utils/advicePlan';

const STALE_MS = 5 * 60 * 1000;

async function fetchQuote(symbol: string): Promise<RawQuote> {
  try {
    const response = await authenticatedFetch(`/api/prices/quote?ticker=${encodeURIComponent(symbol)}`);
    if (!response.ok) return { symbol, price: null };
    const body = (await response.json()) as Partial<RawQuote>;
    return {
      symbol,
      price: typeof body.price === 'number' ? body.price : null,
      ...(typeof body.currency === 'string' ? { currency: body.currency } : {}),
      ...(typeof body.currentPriceEur === 'number' ? { currentPriceEur: body.currentPriceEur } : {}),
      ...(typeof body.quotedAt === 'string' ? { quotedAt: body.quotedAt } : {}),
    };
  } catch {
    return { symbol, price: null };
  }
}

async function fetchBondQuote(isin: string): Promise<RawQuote> {
  try {
    const response = await authenticatedFetch(`/api/prices/bond-quote?isin=${encodeURIComponent(isin)}`);
    if (!response.ok) return { symbol: isin, price: null };
    const body = (await response.json()) as { price?: unknown };
    return { symbol: isin, price: typeof body.price === 'number' && body.price > 0 ? body.price : null };
  } catch {
    return { symbol: isin, price: null };
  }
}

/** The quotes by symbol, and the bonds' by ISIN; `data` undefined while loading. */
export function useAdviceQuotes(symbols: readonly string[], options: { enabled: boolean; isins?: readonly string[] }) {
  const sorted = [...new Set(symbols)].sort();
  const isins = [...new Set(options.isins ?? [])].sort();
  const symbolsKey = [...sorted, ...isins.map((isin) => `isin:${isin}`)].join(',');
  return useQuery({
    queryKey: queryKeys.adviceQuotes(symbolsKey),
    queryFn: async () => {
      const quotes = await Promise.all([...sorted.map(fetchQuote), ...isins.map(fetchBondQuote)]);
      return Object.fromEntries(quotes.map((quote) => [quote.symbol, quote])) as Record<string, RawQuote>;
    },
    enabled: options.enabled && (sorted.length > 0 || isins.length > 0),
    staleTime: STALE_MS,
  });
}
