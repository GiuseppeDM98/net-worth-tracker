/**
 * Tests for lib/utils/exposureEngine.ts — the three views of the Esposizione, weighed in the
 * browser on invented assets and profiles (doc/perf/PERF-00 § 7). No network, no user data.
 *
 * Seen RED by falsification on 2026-09-28 (each undone right after): Titoli read on `marketValue`
 * instead of `notionalValue` (the 2× fund weighed 1000 instead of 2000); the `outOfView` branch
 * skipped (the identity lost the 60/40 fund's bond sleeve); the non-quoted guard skipped (the
 * pension fund's sleeves became «unread», and the identity still held — so that case pins the
 * DESTINY, not only the sum).
 *
 * `expandAssetExposure` reaches `calculateAssetValue` from assetService, which pulls the client
 * SDK at module load — mocked away as in __tests__/assetExposure.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/types/assets';
import type { InstrumentProfile } from '@/types/exposure';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { computeExposure, NON_LOOKTHROUGH_ASSET_CLASSES } from '@/lib/utils/exposureEngine';
import { expandAssetExposure } from '@/lib/utils/assetExposureUtils';
import { isExposureBaseAsset } from '@/lib/utils/exposureRequests';

function asset(overrides: Partial<Asset> & { id: string; name: string }): Asset {
  return {
    userId: 'u',
    ticker: overrides.id.toUpperCase(),
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 10,
    currentPrice: 100,
    lastPriceUpdate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Asset;
}

const FETCHED = '2026-09-03T08:00:00.000Z';

/** Ten invented positions: one per destiny, plus the two that must appear nowhere. */
const assets: Asset[] = [
  // 2×: 1000 € of market value, 2000 € of notional.
  asset({ id: 'lev2x', name: 'Nasdaq 2× Daily', leverageRatio: 2 }),
  // 60/40: 600 € of equity sleeve in view, 400 € of bonds out of it.
  asset({ id: 'mix6040', name: 'Bilanciato 60/40', composition: [{ assetClass: 'equity', percentage: 60 }, { assetClass: 'bonds', percentage: 40 }] }),
  // Gold: quoted (a fund module), no holdings by nature.
  asset({ id: 'gold', name: 'Oro fisico', type: 'commodity', assetClass: 'commodity', quantity: 5 }),
  // A synthetic ETF Yahoo knows nothing about.
  asset({ id: 'swap', name: 'S&P 500 Swap', quantity: 7 }),
  // A direct stock, foreign currency: 300 € of EUR value.
  asset({ id: 'aapl', name: 'Apple', type: 'stock', currency: 'USD', quantity: 3, currentPrice: 110, currentPriceEur: 100 }),
  // A bond: quoted, no module.
  asset({ id: 'btp', name: 'BTP Valore', type: 'bond', assetClass: 'bonds', quantity: 4 }),
  // Cash: in the allocation, not quoted.
  asset({ id: 'cash', name: 'Conto', type: 'cash', assetClass: 'cash', quantity: 800, currentPrice: 1 }),
  // A frozen pension fund with the user's OWN 70/30 split: nobody publishes it.
  asset({ id: 'pension', name: 'Fondo Pensione', type: 'pensionFund', allocationRole: 'frozen', quantity: 5000, currentPrice: 1, composition: [{ assetClass: 'equity', percentage: 70 }, { assetClass: 'bonds', percentage: 30 }] }),
  // Out of the page entirely.
  asset({ id: 'home', name: 'Casa', type: 'realestate', assetClass: 'realestate', allocationRole: 'excluded', quantity: 1, currentPrice: 250000 }),
  // Sold.
  asset({ id: 'sold', name: 'Venduto', quantity: 0 }),
];

const profiles: Record<string, InstrumentProfile> = {
  LEV2X: {
    ticker: 'LEV2X',
    fund: {
      fetchedAt: FETCHED,
      holdingsBasis: 'sleeve',
      holdings: [
        { key: 'NVDA', label: 'Nvidia', weight: 0.1 },
        { key: 'AAPL', label: 'Apple Inc.', weight: 0.08 },
      ],
      sectors: [
        { key: 'technology', label: 'Tecnologia', weight: 0.6 },
        { key: 'healthcare', label: 'Salute', weight: 0.4 },
      ],
      family: 'Amundi',
    },
  },
  MIX6040: {
    ticker: 'MIX6040',
    fund: {
      fetchedAt: FETCHED,
      holdingsBasis: 'sleeve',
      holdings: [{ key: 'MSFT', label: 'Microsoft', weight: 0.05 }],
      sectors: [{ key: 'technology', label: 'Tecnologia', weight: 1 }],
      family: 'Vanguard',
    },
  },
  GOLD: { ticker: 'GOLD', fund: { fetchedAt: FETCHED, holdingsBasis: 'fund', family: 'Invesco' } },
  AAPL: { ticker: 'AAPL', stock: { fetchedAt: FETCHED, sectorKey: 'technology', longName: 'Apple Inc.' } },
};

const exposure = computeExposure(assets, profiles);

describe('computeExposure — the two measures', () => {
  it('weighs a 2× fund twice in Titoli and once in Emittenti', () => {
    const nvidia = exposure.holdings.entries.find((entry) => entry.key === 'NVDA');
    expect(nvidia?.amount).toBeCloseTo(0.1 * 2000, 6);
    expect(nvidia?.sources[0]).toMatchObject({ ticker: 'LEV2X', name: 'Nasdaq 2× Daily', weight: 0.1, baseValue: 2000 });

    const amundi = exposure.issuers.entries.find((entry) => entry.key === 'Amundi');
    expect(amundi?.amount).toBe(1000);
    expect(amundi?.sources[0]).toEqual({ ticker: 'LEV2X', name: 'Nasdaq 2× Daily', amount: 1000 });
  });

  it('merges a direct stock with the same company inside a fund, at weight 1 without a formula', () => {
    const apple = exposure.holdings.entries.find((entry) => entry.key === 'AAPL');
    expect(apple?.label).toBe('Apple Inc.');
    expect(apple?.caption).toBe('AAPL');
    expect(apple?.amount).toBeCloseTo(0.08 * 2000 + 300, 6);
    const direct = apple?.sources.find((source) => source.name === 'Apple');
    expect(direct).toEqual({ ticker: 'AAPL', name: 'Apple', amount: 300 });
  });
});

describe('computeExposure — the four destinies', () => {
  it('puts a 60/40 fund’s equity sleeve in view and NAMES its bond sleeve out of it', () => {
    const { coverage } = exposure.holdings;
    expect(coverage.read.instruments).toContain('Bilanciato 60/40');
    // 400 € of the fund's bond sleeve plus the 400 € BTP: out of this view, both named.
    expect(coverage.outOfView).toEqual({ amount: 800, instruments: ['Bilanciato 60/40', 'BTP Valore'] });
  });

  it('declares gold not applicable in Titoli and Settori, and reads its family in Emittenti', () => {
    expect(exposure.holdings.coverage.notApplicable.instruments).toContain('Oro fisico');
    expect(exposure.sectors.coverage.notApplicable.instruments).toContain('Oro fisico');
    expect(exposure.issuers.entries.find((entry) => entry.key === 'Invesco')?.amount).toBe(500);
    expect(NON_LOOKTHROUGH_ASSET_CLASSES.has('commodity')).toBe(true);
    expect(NON_LOOKTHROUGH_ASSET_CLASSES.has('equity')).toBe(false);
  });

  it('leaves a fund without a profile «unread», with its name, in every view that needs one', () => {
    expect(exposure.holdings.coverage.unread).toEqual({ amount: 700, instruments: ['S&P 500 Swap'] });
    expect(exposure.sectors.coverage.unread).toEqual({ amount: 700, instruments: ['S&P 500 Swap'] });
    expect(exposure.issuers.coverage.unread.instruments).toContain('S&P 500 Swap');
  });

  it('reads a direct stock in every view: itself, its sector, its own name as issuer', () => {
    expect(exposure.holdings.coverage.read.instruments).toContain('Apple');
    expect(exposure.sectors.entries.find((entry) => entry.key === 'technology')?.sources.map((source) => source.name)).toContain('Apple');
    expect(exposure.issuers.entries.find((entry) => entry.key === 'Apple Inc.')?.amount).toBe(300);
  });

  it('keeps a bond out of Titoli and Settori, named, and «unread» in Emittenti with its name', () => {
    expect(exposure.holdings.coverage.outOfView.instruments).toContain('BTP Valore');
    expect(exposure.issuers.coverage.unread.instruments).toContain('BTP Valore');
    expect(exposure.issuers.coverage.unread.amount).toBe(700 + 400);
  });

  it('declares every leg of a non-quoted instrument not applicable, the user’s own split included', () => {
    // The pension fund's 70% equity is a user-typed split, not a published composition: it must
    // NOT land in «unread» (which would promise a reading that can never come).
    expect(exposure.holdings.coverage.unread.instruments).not.toContain('Fondo Pensione');
    expect(exposure.holdings.coverage.notApplicable.instruments).toEqual(expect.arrayContaining(['Fondo Pensione', 'Conto']));
    expect(exposure.holdings.coverage.notApplicable.amount).toBe(500 + 800 + 5000);
    // …and the bucket keeps WHY: the class of a quoted leg (gold), or «nobody quotes it» (the
    // pension fund's own 70/30 and the cash account, whatever their classes).
    expect(exposure.holdings.coverage.notApplicable.byClass).toEqual({ commodity: 500 });
    expect(exposure.holdings.coverage.notApplicable.unquoted).toBe(800 + 5000);
    expect(exposure.issuers.coverage.notApplicable).toEqual({ amount: 5800, instruments: ['Fondo Pensione', 'Conto'], byClass: {}, unquoted: 5800 });
  });

  it('shows an excluded asset and a sold one in no bucket of any view', () => {
    for (const view of [exposure.holdings, exposure.sectors, exposure.issuers]) {
      const names = [view.coverage.read, view.coverage.unread, view.coverage.notApplicable, view.coverage.outOfView].flatMap((bucket) => bucket.instruments);
      expect(names).not.toContain('Casa');
      expect(names).not.toContain('Venduto');
    }
  });

  it('counts the quoted instruments of the base', () => {
    expect(exposure.quotedCount).toBe(6);
    expect(computeExposure([assets[6], assets[7], assets[8]], {}).quotedCount).toBe(0);
  });
});

describe('computeExposure — the identities', () => {
  const base = assets.filter(isExposureBaseAsset);
  const sum = (view: typeof exposure.holdings) =>
    view.coverage.read.amount + view.coverage.unread.amount + view.coverage.notApplicable.amount + view.coverage.outOfView.amount;

  it('Titoli and Settori add up to the notional of every leg of the base', () => {
    const notional = base.flatMap(expandAssetExposure).reduce((total, leg) => total + leg.notionalValue, 0);
    expect(sum(exposure.holdings)).toBeCloseTo(notional, 6);
    expect(sum(exposure.sectors)).toBeCloseTo(notional, 6);
    expect(exposure.holdings.coverage.base).toBeCloseTo(exposure.holdings.coverage.read.amount + exposure.holdings.coverage.unread.amount, 6);
  });

  it('Emittenti adds up to the market value of the base, and its named euros are its read euros', () => {
    const market = base.flatMap(expandAssetExposure).reduce((total, leg) => total + leg.marketValue, 0);
    expect(sum(exposure.issuers)).toBeCloseTo(market, 6);
    expect(exposure.issuers.coverage.outOfView.amount).toBe(0);
    expect(exposure.issuers.coverage.named).toBeCloseTo(exposure.issuers.coverage.read.amount, 6);
  });

  it('names in Titoli only what Yahoo listed, well under what it read; in Settori the weights cover the sleeve', () => {
    const { coverage: holdings } = exposure.holdings;
    expect(holdings.named).toBeCloseTo(0.18 * 2000 + 0.05 * 600 + 300, 6);
    expect(holdings.named).toBeLessThan(holdings.read.amount);
    const { coverage: sectors } = exposure.sectors;
    expect(sectors.named).toBeCloseTo(sectors.read.amount, 6);
  });
});

describe('computeExposure — nothing of the user’s in a label', () => {
  // The merged Apple row above takes its label from the FIRST contributor (the 2× fund's own
  // holding name), so it cannot see where a direct stock's label comes from: this fixture holds
  // the stock alone. Seen RED on 2026-09-28 with `asset.name` as the label («Apple»).
  const stock = asset({ id: 'aapl', name: 'Apple', type: 'stock', currency: 'USD', quantity: 3, currentPrice: 110, currentPriceEur: 100 });

  it('labels a direct stock, and its issuer, with Yahoo’s long name — never the asset’s own name', () => {
    const read = computeExposure([stock], profiles);
    expect(read.holdings.entries[0]).toMatchObject({ key: 'AAPL', label: 'Apple Inc.', caption: 'AAPL' });
    expect(read.issuers.entries[0]).toMatchObject({ key: 'Apple Inc.', label: 'Apple Inc.' });
  });

  it('falls back to the ticker, not to the asset’s name, when Yahoo has no long name', () => {
    const unread = computeExposure([stock], {});
    expect(unread.holdings.entries[0]).toMatchObject({ key: 'AAPL', label: 'AAPL' });
    expect(unread.issuers.entries[0]).toMatchObject({ key: 'AAPL', label: 'AAPL' });
    // The asset's name is still the coverage line's business: it never leaves the browser.
    expect(unread.holdings.coverage.read.instruments).toEqual(['Apple']);
  });
});

describe('computeExposure — keys', () => {
  it('finds a profile by the trimmed ticker and keys a holding by its upper-cased symbol', () => {
    const padded = asset({ id: 'pad', name: 'Padded', ticker: ' vwce.de ' });
    const result = computeExposure([padded], { 'vwce.de': { ticker: 'vwce.de', fund: { fetchedAt: FETCHED, holdingsBasis: 'sleeve', holdings: [{ key: 'nvda', label: 'Nvidia', weight: 0.5 }], family: 'Vanguard' } } });
    expect(result.holdings.entries[0]).toMatchObject({ key: 'NVDA', caption: 'NVDA', amount: 500 });
    expect(result.holdings.coverage.unread.amount).toBe(0);
  });

  it('sorts entries and their sources largest first', () => {
    const amounts = exposure.holdings.entries.map((entry) => entry.amount);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    const tech = exposure.sectors.entries.find((entry) => entry.key === 'technology')!;
    expect(tech.sources.map((source) => source.amount)).toEqual([1200, 600, 300]);
  });
});
