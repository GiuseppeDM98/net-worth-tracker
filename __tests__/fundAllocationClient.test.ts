/**
 * `lib/utils/fundAllocationClient.ts` — the one client door to `GET /api/portfolio/fund-allocation`.
 *
 * The contract that matters is the FAIL-SOFT one: an import preview must still list the positions
 * it could not split. A malformed row is dropped BEFORE the request (the route refuses the whole
 * query on one bad ISIN, so a single bad row must not cost the other 39 funds their mix), and a
 * failed chunk never discards another chunk's answer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: fetchMock }));

import { fetchFundAllocations } from '@/lib/utils/fundAllocationClient';

const A = 'IT0005650905';
const B = 'LU2629378014';

function allocation(stock = 0.6) {
  return { stock, bond: 0.4, cash: 0, other: 0, preferred: 0, convertible: 0 };
}

function answer(allocations: Record<string, ReturnType<typeof allocation>>, oldestFetchedAt: string | null) {
  return new Response(JSON.stringify({ allocations, oldestFetchedAt }), { status: 200 });
}

/** 41 valid ISINs, so the client splits them into its 40 + 1 chunks. */
const FORTY_ONE = Array.from({ length: 41 }, (_, index) => `IT${String(index).padStart(10, '0')}`);

function isinsOf(call: number): string[] {
  const url = fetchMock.mock.calls[call][0] as string;
  return (new URL(url, 'http://localhost').searchParams.get('isins') ?? '').split(',');
}

function tickersOf(call: number): string[] {
  const url = fetchMock.mock.calls[call][0] as string;
  return (new URL(url, 'http://localhost').searchParams.get('tickers') ?? '').split(',');
}

describe('fetchFundAllocations', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('drops a malformed value, upper-cases and de-duplicates before asking', async () => {
    fetchMock.mockResolvedValue(answer({ [A]: allocation() }, '2026-10-20T08:00:00.000Z'));

    const result = await fetchFundAllocations([A.toLowerCase(), A, 'VWCE.DE', '']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(isinsOf(0)).toEqual([A]);
    expect(result.allocations[A]).toEqual(allocation());
    expect(result.oldestFetchedAt).toBe('2026-10-20T08:00:00.000Z');
  });

  it('chunks at the route’s 40-ISIN bound', async () => {
    fetchMock.mockResolvedValue(answer({}, null));

    await fetchFundAllocations(FORTY_ONE);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(isinsOf(0)).toHaveLength(40);
    expect(isinsOf(1)).toEqual([FORTY_ONE[40]]);
  });

  it('keeps a succeeding chunk when the other fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const isins = (new URL(url, 'http://localhost').searchParams.get('isins') ?? '').split(',');
      if (isins.includes(FORTY_ONE[40])) return new Response('nope', { status: 500 });
      return answer({ [B]: allocation(0.2) }, '2026-10-19T08:00:00.000Z');
    });

    const result = await fetchFundAllocations([B, ...FORTY_ONE]);

    expect(result.allocations[B]).toEqual(allocation(0.2));
    expect(result.oldestFetchedAt).toBe('2026-10-19T08:00:00.000Z');
  });

  it('dates the footer with the OLDEST answer across chunks', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const isins = (new URL(url, 'http://localhost').searchParams.get('isins') ?? '').split(',');
      if (isins.includes(FORTY_ONE[40])) {
        return answer({ [FORTY_ONE[40]]: allocation(0.1) }, '2026-10-18T08:00:00.000Z');
      }
      return answer({ [B]: allocation(0.2) }, '2026-10-19T08:00:00.000Z');
    });

    const result = await fetchFundAllocations([B, ...FORTY_ONE]);

    expect(result.oldestFetchedAt).toBe('2026-10-18T08:00:00.000Z');
  });

  it('answers no allocation without a request when nothing is ISIN-shaped', async () => {
    const result = await fetchFundAllocations(['VWCE.DE', '']);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ allocations: {}, oldestFetchedAt: null });
  });

  it('asks tickers in their own list, never as ISINs', async () => {
    fetchMock.mockResolvedValue(answer({ 'GRID.MI': allocation(0.99) }, '2026-10-20T08:00:00.000Z'));

    const result = await fetchFundAllocations([], ['GRID.MI', ' EUJP.MI ', 'not a ticker']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tickersOf(0)).toEqual(['GRID.MI', 'EUJP.MI']);
    expect(new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost').searchParams.has('isins')).toBe(false);
    expect(result.allocations['GRID.MI']).toEqual(allocation(0.99));
  });

  it('sends the two lists as two requests, each under its own bound', async () => {
    fetchMock.mockResolvedValue(answer({}, null));

    await fetchFundAllocations([A], ['GRID.MI']);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(isinsOf(0)).toEqual([A]);
    expect(tickersOf(1)).toEqual(['GRID.MI']);
  });
});
