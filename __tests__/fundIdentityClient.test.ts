/**
 * `lib/utils/fundIdentityClient.ts` — the one client door to `GET /api/portfolio/fund-identity`.
 *
 * The contract that matters is FAIL-SOFT plus the KEY: a chunk that fails must not silence the
 * names it carried, and the answer must be reachable the way `buildAzimutImportPlan` joins it —
 * by `normalizeFundName`, not by the spelling the file happened to use.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: fetchMock }));

import { fetchFundIdentities } from '@/lib/utils/fundIdentityClient';

function answer(results: unknown[]): Response {
  return new Response(JSON.stringify({ results }), { status: 200 });
}

function namesOf(call: number): string[] {
  const url = fetchMock.mock.calls[call][0] as string;
  return (new URL(url, 'http://localhost').searchParams.get('names')?.split('|') ?? []);
}

const MATCHED = {
  query: 'R-CO VALOR "C" (EUR) ACC',
  status: 'matched',
  identity: { isin: 'FR0011253624', name: 'R-co Valor C EUR', currency: 'EUR' },
  candidateCount: 3,
};

describe('fetchFundIdentities', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('asks each distinct name once, keyed by its normalised form', async () => {
    fetchMock.mockResolvedValue(answer([MATCHED]));

    const result = await fetchFundIdentities([
      'R-CO VALOR "C" (EUR) ACC',
      ' r-co  valor "c" (eur) acc ',
      '',
      'ab',
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(namesOf(0)).toEqual(['R-CO VALOR "C" (EUR) ACC']);
    expect(result.askedCount).toBe(1);
    expect(result.byName['R CO VALOR C EUR ACC'].identity?.isin).toBe('FR0011253624');
  });

  it('splits eleven names into the route\u2019s two chunks and merges the answers', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const asked = (new URL(url, 'http://localhost').searchParams.get('names') ?? '').split('|');
      return answer(
        asked.map((query) => ({
          query,
          status: 'none',
          candidateCount: 0,
        }))
      );
    });
    const names = Array.from({ length: 11 }, (_, index) => `Fondo Numero ${index}`);

    const result = await fetchFundIdentities(names);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(namesOf(0)).toHaveLength(10);
    expect(namesOf(1)).toHaveLength(1);
    expect(Object.keys(result.byName)).toHaveLength(11);
  });

  it('turns a failed chunk into «unavailable» for the names it carried, never into a silence', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await fetchFundIdentities(['R-CO VALOR "C" (EUR) ACC']);

    expect(result.failedChunks).toBe(1);
    expect(result.byName['R CO VALOR C EUR ACC']).toEqual({
      query: 'R-CO VALOR "C" (EUR) ACC',
      status: 'unavailable',
      candidateCount: 0,
    });
  });

  it('does not ask at all when every name is unusable', async () => {
    const result = await fetchFundIdentities(['', 'ab', 'x'.repeat(200)]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ byName: {}, askedCount: 0, failedChunks: 0 });
  });
});
