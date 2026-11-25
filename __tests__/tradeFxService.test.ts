/**
 * Tests for lib/server/tradeFxService.ts → resolveEcbRateToEur: which Frankfurter path answers a
 * trade's day, and whether the rate is that day's own fixing (`isLatest`). `fetch` is mocked by URL;
 * the rate cache of currencyConversionService lives for the whole module, so every test resets the
 * modules and imports the service again.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const TODAY = new Date('2026-11-16T12:00:00Z');

type Route = { match: (url: string) => boolean; rate: number | null };

function stubFetch(routes: Route[]): string[] {
  const seen: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = String(input);
    seen.push(url);
    const route = routes.find((r) => r.match(url));
    if (!route || route.rate === null) return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ rates: { EUR: route.rate } }) };
  }));
  return seen;
}

async function loadService() {
  vi.resetModules();
  return import('@/lib/server/tradeFxService');
}

const isDayPath = (day: string) => (url: string) => url.includes(`/v1/${day}?`);
const isLatestPath = (url: string) => url.includes('/v1/latest?');
const isCachedLatest = (url: string) => url.includes('frankfurter.app/latest');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveEcbRateToEur', () => {
  it('should read a past day from its own path, as the day fixing', async () => {
    const seen = stubFetch([{ match: isDayPath('2026-11-10'), rate: 0.91 }]);
    const { resolveEcbRateToEur } = await loadService();

    await expect(resolveEcbRateToEur('USD', new Date('2026-11-10T12:00:00Z'))).resolves.toEqual({ rate: 0.91, isLatest: false });
    expect(seen[0]).toContain('/v1/2026-11-10?base=USD');
  });

  it('should read today from the latest path and still call it the day fixing', async () => {
    const seen = stubFetch([{ match: isLatestPath, rate: 0.92 }]);
    const { resolveEcbRateToEur } = await loadService();

    await expect(resolveEcbRateToEur('USD', TODAY)).resolves.toEqual({ rate: 0.92, isLatest: false });
    expect(seen[0]).toContain('/v1/latest?base=USD');
  });

  it('should read a future day from the latest path and say it is not the day rate', async () => {
    const seen = stubFetch([{ match: isLatestPath, rate: 0.93 }]);
    const { resolveEcbRateToEur } = await loadService();

    await expect(resolveEcbRateToEur('USD', new Date('2026-12-01T12:00:00Z'))).resolves.toEqual({ rate: 0.93, isLatest: true });
    expect(seen[0]).toContain('/v1/latest?base=USD');
  });

  it('should fall back to the cached latest rate when the day is missing, saying so', async () => {
    stubFetch([
      { match: isDayPath('2026-11-10'), rate: null },
      { match: isCachedLatest, rate: 0.94 },
    ]);
    const { resolveEcbRateToEur } = await loadService();

    await expect(resolveEcbRateToEur('USD', new Date('2026-11-10T12:00:00Z'))).resolves.toEqual({ rate: 0.94, isLatest: true });
  });

  it('should answer null when neither the day nor the latest rate can be read', async () => {
    stubFetch([]);
    const { resolveEcbRateToEur } = await loadService();

    await expect(resolveEcbRateToEur('USD', new Date('2026-11-10T12:00:00Z'))).resolves.toBeNull();
  });

  it('should ask for GBP when the instrument is quoted in pence', async () => {
    const seen = stubFetch([{ match: isDayPath('2026-11-10'), rate: 1.15 }]);
    const { resolveEcbRateToEur } = await loadService();

    await resolveEcbRateToEur('GBp', new Date('2026-11-10T12:00:00Z'));
    expect(seen[0]).toContain('base=GBP');
  });
});
