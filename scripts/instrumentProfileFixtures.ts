/**
 * The Esposizione's belt for the Playwright suite: a FRESH `instrument-profile-cache` document for
 * every quoted ticker of the base fixture (`scripts/seedEmulator.ts`), so the route never has a
 * ticker to ask Yahoo for. Yahoo is called by the SERVER (`yahoo-finance2` inside the route), so
 * `page.route` cannot intercept it — the seed is the only thing standing between a spec and the
 * network (doc/perf/PERF-00 § 7).
 *
 * Shared by the base seed (once) and by `scripts/seedInstrumentProfilesE2E.mts`, which the
 * Playwright global setup runs on EVERY invocation: an empty answer lives 24 hours in the cache,
 * so a document seeded yesterday would send FONDOPENSIONE back to Yahoo today.
 *
 * The figures are invented and already in the cache's shape: holding weights are shares of the
 * EQUITY SLEEVE (`holdingsBasis: 'sleeve'`), the sector weights add up to one. Nothing here is a
 * real fund's composition, and nothing of a user's ever belongs in one of these documents.
 *
 * To falsify the belt: seed VWCE.DE EMPTY (holdings and sectors absent, family null) and the tile
 * must name «Vanguard FTSE All-World» as unread, without touching the network.
 */

export const INSTRUMENT_PROFILE_CACHE_COLLECTION = 'instrument-profile-cache';

export interface InstrumentProfileFixture {
  /** The document id is the URI-encoded ticker, as the service writes it. */
  ticker: string;
  data: Record<string, unknown>;
}

/** The documents to write, stamped `now` so every module is fresh. */
export function instrumentProfileFixtureDocuments(now: Date): InstrumentProfileFixture[] {
  const fetchedAt = now.toISOString();
  return [
    {
      ticker: 'VWCE.DE',
      data: {
        ticker: 'VWCE.DE',
        fund: {
          fetchedAt,
          holdingsBasis: 'sleeve',
          holdings: [
            { key: 'NVDA', label: 'NVIDIA Corp', weight: 0.046 },
            { key: 'AAPL', label: 'Apple Inc', weight: 0.041 },
            { key: 'MSFT', label: 'Microsoft Corp', weight: 0.037 },
            { key: 'AMZN', label: 'Amazon.com Inc', weight: 0.024 },
            { key: 'META', label: 'Meta Platforms Inc', weight: 0.016 },
            { key: 'AVGO', label: 'Broadcom Inc', weight: 0.014 },
            { key: 'GOOGL', label: 'Alphabet Inc', weight: 0.013 },
            { key: 'TSLA', label: 'Tesla Inc', weight: 0.011 },
            { key: 'JPM', label: 'JPMorgan Chase & Co', weight: 0.009 },
            { key: 'LLY', label: 'Eli Lilly and Co', weight: 0.008 },
          ],
          sectors: [
            { key: 'technology', label: 'Tecnologia', weight: 0.27 },
            { key: 'financial_services', label: 'Finanza', weight: 0.16 },
            { key: 'consumer_cyclical', label: 'Beni Voluttuari', weight: 0.11 },
            { key: 'industrials', label: 'Industriali', weight: 0.11 },
            { key: 'healthcare', label: 'Salute', weight: 0.09 },
            { key: 'communication_services', label: 'Comunicazione', weight: 0.08 },
            { key: 'consumer_defensive', label: 'Beni di Prima Necessità', weight: 0.05 },
            { key: 'energy', label: 'Energia', weight: 0.04 },
            { key: 'basic_materials', label: 'Materiali di Base', weight: 0.03 },
            { key: 'utilities', label: 'Utilities', weight: 0.03 },
            { key: 'realestate', label: 'Immobiliare', weight: 0.03 },
          ],
          family: 'Vanguard',
        },
      },
    },
    {
      ticker: 'AAPL',
      data: {
        ticker: 'AAPL',
        stock: { fetchedAt, sectorKey: 'technology', longName: 'Apple Inc.' },
      },
    },
    {
      // An `etf` with a ticker is a quoted instrument, so the route asks Yahoo for it; Yahoo has
      // nothing for a pension fund tracked the old way, and an EMPTY fresh answer is the honest
      // cache entry: the tile reads it as «non letto», with its name.
      ticker: 'FONDOPENSIONE',
      data: {
        ticker: 'FONDOPENSIONE',
        fund: { fetchedAt, holdingsBasis: 'fund', family: null },
      },
    },
  ];
}
