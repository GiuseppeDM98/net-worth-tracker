/**
 * Tests for lib/server/exposure/yahooSource.ts — Yahoo's answers normalised into a profile.
 *
 * The fixtures carry Yahoo's RAW weights (a holding as a share of the whole fund), never weights
 * already normalised: a test that hands the function the answer it should produce cannot fail.
 * Seen RED on 2026-09-28 by removing `/ stockPosition` (the 4,5% name stayed 4,5% instead of 5%).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { quoteSummaryMock } = vi.hoisted(() => ({ quoteSummaryMock: vi.fn() }));
vi.mock('yahoo-finance2', () => ({
  default: class {
    quoteSummary = quoteSummaryMock;
  },
}));

import { normalizeFundAnswer, normalizeStockAnswer, yahooProfileSource } from '@/lib/server/exposure/yahooSource';

const NOW = new Date('2026-09-28T10:00:00.000Z');

describe('normalizeFundAnswer', () => {
  it('divides the holding weights by stockPosition and leaves the sector weights alone', () => {
    const profile = normalizeFundAnswer(
      {
        topHoldings: {
          stockPosition: 0.9,
          holdings: [
            { symbol: 'nvda', holdingName: 'NVIDIA Corp', holdingPercent: 0.045 },
            { symbol: 'AAPL', holdingName: '', holdingPercent: 0.036 },
            { symbol: null, holdingName: 'Senza simbolo', holdingPercent: 0.02 },
            { symbol: 'ZERO', holdingName: 'Zero', holdingPercent: 0 },
          ],
          sectorWeightings: [{ technology: 0.3 }, { healthcare: 0.1, energy: 0 }, { utilities: null }],
        },
        fundProfile: { family: 'Vanguard' },
      },
      NOW,
    );
    expect(profile.holdings?.map((holding) => [holding.key, holding.label])).toEqual([
      ['NVDA', 'NVIDIA Corp'],
      ['AAPL', 'AAPL'],
    ]);
    expect(profile.holdings?.[0].weight).toBeCloseTo(0.05, 10);
    expect(profile.holdings?.[1].weight).toBeCloseTo(0.04, 10);
    expect(profile.sectors).toEqual([
      { key: 'technology', label: 'Tecnologia', weight: 0.3 },
      { key: 'healthcare', label: 'Salute', weight: 0.1 },
    ]);
    expect(profile.holdingsBasis).toBe('sleeve');
    expect(profile.family).toBe('Vanguard');
    expect(profile.fetchedAt).toBe('2026-09-28T10:00:00.000Z');
  });

  it('lifts a name of a bond-heavy fund to its share of the small equity sleeve', () => {
    const profile = normalizeFundAnswer({ topHoldings: { stockPosition: 0.3, holdings: [{ symbol: 'MSFT', holdingName: 'Microsoft', holdingPercent: 0.03 }] } }, NOW);
    expect(profile.holdings?.[0].weight).toBeCloseTo(0.1, 10);
  });

  it('keeps the raw weights and says so when stockPosition is absent or zero', () => {
    for (const stockPosition of [undefined, 0, null]) {
      const profile = normalizeFundAnswer({ topHoldings: { stockPosition, holdings: [{ symbol: 'NVDA', holdingName: 'Nvidia', holdingPercent: 0.045 }] } }, NOW);
      expect(profile.holdings?.[0].weight).toBe(0.045);
      expect(profile.holdingsBasis).toBe('fund');
    }
  });

  it('answers an empty profile, never undefined fields, when Yahoo has nothing', () => {
    const profile = normalizeFundAnswer({ topHoldings: null, fundProfile: { family: '  ' } }, NOW);
    expect(profile).toEqual({ fetchedAt: '2026-09-28T10:00:00.000Z', holdingsBasis: 'fund', family: null });
    expect(normalizeFundAnswer(undefined, NOW).family).toBeNull();
  });
});

describe('normalizeStockAnswer', () => {
  it('maps the Title Case sector to the app key and takes the long name', () => {
    expect(normalizeStockAnswer({ assetProfile: { sector: 'Financial Services' }, price: { longName: 'Intesa Sanpaolo S.p.A.' } }, NOW)).toEqual({
      fetchedAt: '2026-09-28T10:00:00.000Z',
      sectorKey: 'financial_services',
      longName: 'Intesa Sanpaolo S.p.A.',
    });
  });

  it('has no sector for an unmapped one and falls back to the short name', () => {
    const profile = normalizeStockAnswer({ assetProfile: { sector: 'Conglomerates' }, price: { longName: null, shortName: 'ACME' } }, NOW);
    expect(profile).toEqual({ fetchedAt: '2026-09-28T10:00:00.000Z', sectorKey: null, longName: 'ACME' });
    expect(normalizeStockAnswer(null, NOW)).toEqual({ fetchedAt: '2026-09-28T10:00:00.000Z', sectorKey: null, longName: null });
  });
});

describe('yahooProfileSource', () => {
  beforeEach(() => {
    quoteSummaryMock.mockReset();
  });

  it('asks the fund modules for a fund and the stock modules for a stock', async () => {
    quoteSummaryMock.mockResolvedValueOnce({ topHoldings: { stockPosition: 1, holdings: [{ symbol: 'A', holdingName: 'A', holdingPercent: 0.5 }] }, fundProfile: { family: 'X' } });
    const fund = await yahooProfileSource.fetchFund('VWCE.DE', NOW);
    expect(quoteSummaryMock).toHaveBeenCalledWith('VWCE.DE', { modules: ['topHoldings', 'fundProfile'] });
    expect(fund?.holdings?.[0]).toEqual({ key: 'A', label: 'A', weight: 0.5 });

    quoteSummaryMock.mockResolvedValueOnce({ assetProfile: { sector: 'Technology' }, price: { longName: 'Apple Inc.' } });
    const stock = await yahooProfileSource.fetchStock('AAPL', NOW);
    expect(quoteSummaryMock).toHaveBeenCalledWith('AAPL', { modules: ['assetProfile', 'price'] });
    expect(stock).toMatchObject({ sectorKey: 'technology', longName: 'Apple Inc.' });
  });

  it('never throws: a failed call is null, so the service can keep the last good answer', async () => {
    quoteSummaryMock.mockRejectedValue(new Error('Not Found'));
    await expect(yahooProfileSource.fetchFund('NOPE', NOW)).resolves.toBeNull();
    await expect(yahooProfileSource.fetchStock('NOPE', NOW)).resolves.toBeNull();
  });
});
