/**
 * Tests for lib/utils/overlapUtils.ts — the pure overlap math behind the Sovrapposizioni tile.
 *
 * Pinned behaviours: the Σ min(wA, wB) overlap, the shared-titles ordering, the overlapped
 * euros, the same-ticker merge (a fund never pairs with itself), case-insensitive symbols,
 * unusable weights skipped, direct-stock duplication, and the tile shaping (limits,
 * percentages, remainders, highlights).
 */
import { describe, it, expect } from 'vitest';
import {
  computeOverlapPairs,
  computeDuplicatedStocks,
  summarizeOverlap,
  summarizeOverlapHighlights,
  type OverlapEtfVector,
  type OverlapInput,
} from '@/lib/utils/overlapUtils';

function vector(ticker: string, valueEur: number, holdings: Array<[string, string, number]>): OverlapEtfVector {
  return {
    ticker,
    assetName: `${ticker} Fund`,
    assetValueEur: valueEur,
    holdings: holdings.map(([symbol, name, weight]) => ({ symbol, name, weight })),
  };
}

const VWCE = () =>
  vector('VWCE', 10_000, [
    ['AAPL', 'Apple', 0.04],
    ['MSFT', 'Microsoft', 0.035],
    ['NVDA', 'Nvidia', 0.03],
    ['TSLA', 'Tesla', 0.015],
  ]);

const SWDA = () =>
  vector('SWDA', 20_000, [
    ['AAPL', 'Apple', 0.05],
    ['MSFT', 'Microsoft', 0.04],
    ['AMZN', 'Amazon', 0.025],
  ]);

const EMIM = () =>
  vector('EMIM', 5_000, [
    ['TSM', 'TSMC', 0.06],
    ['TCEHY', 'Tencent', 0.04],
  ]);

describe('computeOverlapPairs', () => {
  it('overlap is Σ min of the shared weights, heaviest shared title first', () => {
    const [pair] = computeOverlapPairs([VWCE(), SWDA()]);
    // min(0.04, 0.05) + min(0.035, 0.04) = 0.075
    expect(pair.overlap).toBeCloseTo(0.075, 10);
    expect(pair.sharedCount).toBe(2);
    expect(pair.shared.map((h) => h.symbol)).toEqual(['AAPL', 'MSFT']);
    expect(pair.shared[0]).toMatchObject({ weightA: 0.04, weightB: 0.05 });
    // Overlapped euros: min(0.04·10000, 0.05·20000) + min(0.035·10000, 0.04·20000)
    expect(pair.overlapEur).toBeCloseTo(400 + 350, 10);
  });

  it('ranks three ETFs by overlap, disjoint pairs absent', () => {
    const pairs = computeOverlapPairs([VWCE(), SWDA(), EMIM()]);
    expect(pairs.map((p) => `${p.tickerA}×${p.tickerB}`)).toEqual(['VWCE×SWDA']);
  });

  it('no shared titles means no pair', () => {
    expect(computeOverlapPairs([VWCE(), EMIM()])).toEqual([]);
    expect(computeOverlapPairs([VWCE()])).toEqual([]);
    expect(computeOverlapPairs([])).toEqual([]);
  });

  it('the same ticker twice merges instead of self-pairing', () => {
    const clone = vector('vwce', 4_000, [['AAPL', 'Apple', 0.04]]);
    const pairs = computeOverlapPairs([VWCE(), clone, SWDA()]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].tickerA).toBe('VWCE');
    // Values merged: 10000 + 4000
    expect(pairs[0].valueA).toBe(14_000);
  });

  it('symbols match case-insensitively, unusable weights are skipped', () => {
    const messy = vector('X', 10_000, [
      [' aapl ', 'Apple', 0.05],
      ['MSFT', 'Microsoft', NaN],
      ['NVDA', 'Nvidia', -0.01],
      ['', 'Nameless', 0.02],
    ]);
    const [pair] = computeOverlapPairs([VWCE(), messy]);
    expect(pair.sharedCount).toBe(1);
    expect(pair.shared[0].symbol).toBe('AAPL');
  });
});

describe('computeDuplicatedStocks', () => {
  it('finds a direct stock held through ETFs, heaviest leg first', () => {
    const dups = computeDuplicatedStocks(
      [VWCE(), SWDA()],
      [{ ticker: 'aapl', name: 'Apple', valueEur: 6_000 }],
    );
    expect(dups).toHaveLength(1);
    const [dup] = dups;
    expect(dup.etfSources.map((s) => s.ticker)).toEqual(['SWDA', 'VWCE']);
    // 0.05·20000 + 0.04·10000
    expect(dup.viaEtfValueEur).toBeCloseTo(1000 + 400, 10);
    expect(dup.directValueEur).toBe(6_000);
  });

  it('a stock held through no ETF is absent', () => {
    expect(
      computeDuplicatedStocks([VWCE()], [{ ticker: 'ENEL', name: 'Enel', valueEur: 1_000 }]),
    ).toEqual([]);
  });
});

describe('summarizeOverlap', () => {
  const input: OverlapInput = {
    etfs: [VWCE(), SWDA(), EMIM()],
    stocks: [{ ticker: 'AAPL', name: 'Apple', valueEur: 6_000 }],
    totalPortfolioValue: 41_000,
  };

  it('pairs view: one row per pair, overlap share, no remainder', () => {
    const view = summarizeOverlap(input, 'pairs', 6);
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({
      label: 'VWCE × SWDA',
      caption: '2 titoli in comune',
      percentage: 7.5,
    });
    expect(view.rows[0].sources[0].detail).toContain('di VWCE ·');
    expect(view.rows[0].sources[0].detail).toContain('di SWDA');
    expect(view.remainder).toBeNull();
  });

  it('duplicates view: portfolio share, remainder closes to the total', () => {
    const view = summarizeOverlap(input, 'duplicates', 6);
    expect(view.rows).toHaveLength(1);
    // (6000 + 1400) / 41000 = 18.048… → 18
    expect(view.rows[0].percentage).toBe(18);
    expect(view.rows[0].caption).toBe('3 strumenti');
    // Direct leg has no formula; ETF legs carry weight + base value.
    expect(view.rows[0].sources[0].weight).toBeUndefined();
    expect(view.rows[0].sources[1]).toMatchObject({ weight: 0.05, baseValue: 20_000 });
    expect(view.remainder).toMatchObject({ label: 'Resto del portafoglio' });
    expect(view.remainder!.amount).toBeCloseTo(41_000 - 7_400, 10);
  });

  it('limit slices, empty input gives empty views', () => {
    expect(summarizeOverlap(input, 'pairs', 0).rows).toEqual([]);
    const empty: OverlapInput = { etfs: [], stocks: [], totalPortfolioValue: 0 };
    expect(summarizeOverlap(empty, 'pairs', 6).rows).toEqual([]);
    expect(summarizeOverlap(empty, 'duplicates', 6).rows).toEqual([]);
  });
});

describe('summarizeOverlapHighlights', () => {
  it('names the top pair and the top duplicated stock', () => {
    const highlights = summarizeOverlapHighlights({
      etfs: [VWCE(), SWDA()],
      stocks: [{ ticker: 'AAPL', name: 'Apple', valueEur: 6_000 }],
      totalPortfolioValue: 36_000,
    });
    expect(highlights.topPair).toMatchObject({ tickerA: 'VWCE', tickerB: 'SWDA', overlapPct: 7.5, sharedCount: 2 });
    expect(highlights.topDuplicated).toMatchObject({ name: 'Apple', instrumentCount: 3 });
    expect(highlights.etfCount).toBe(2);
    expect(highlights.pairCount).toBe(1);
  });

  it('empty input gives nulls and zero counts', () => {
    expect(
      summarizeOverlapHighlights({ etfs: [], stocks: [], totalPortfolioValue: 0 }),
    ).toEqual({ topPair: null, topDuplicated: null, etfCount: 0, pairCount: 0 });
  });
});
