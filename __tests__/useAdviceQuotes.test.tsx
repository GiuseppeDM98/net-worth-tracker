/**
 * The quotes of the instruments «Applica» would create (lib/hooks/useAdviceQuotes.ts): a symbol through
 * `/api/prices/quote`, a government bond by its ISIN through `/api/prices/bond-quote` (owner, 2026-11-20: the
 * swap buys a new BTP at the click, so it needs Borsa Italiana's quote then). Invented ISIN and prices.
 *
 * Mutation that turns it red: the ISINs not fetched, or fetched through the Yahoo route.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const authenticatedFetch = vi.fn(async (url: string) => {
  const body = url.includes('bond-quote') ? { isin: 'IT0000000EI1', price: 98.5 } : { symbol: 'NEW1.MI', price: 50, currency: 'EUR', quotedAt: '2026-11-20T10:00:00.000Z' };
  return { ok: true, json: async () => body } as Response;
});
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: (url: string) => authenticatedFetch(url) }));

import { useAdviceQuotes } from '@/lib/hooks/useAdviceQuotes';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useAdviceQuotes', () => {
  it('a symbol through the quote route, a bond by ISIN through Borsa Italiana, each under its own key', async () => {
    const { result } = renderHook(() => useAdviceQuotes(['NEW1.MI'], { enabled: true, isins: ['IT0000000EI1'] }), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      'NEW1.MI': { symbol: 'NEW1.MI', price: 50, currency: 'EUR', quotedAt: '2026-11-20T10:00:00.000Z' },
      IT0000000EI1: { symbol: 'IT0000000EI1', price: 98.5 },
    });
    expect(authenticatedFetch.mock.calls.map(([url]) => url)).toEqual(['/api/prices/quote?ticker=NEW1.MI', '/api/prices/bond-quote?isin=IT0000000EI1']);
  });

  it('bonds alone are enough to ask', async () => {
    authenticatedFetch.mockClear();
    const { result } = renderHook(() => useAdviceQuotes([], { enabled: true, isins: ['IT0000000EI1'] }), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.IT0000000EI1?.price).toBe(98.5);
  });
});
