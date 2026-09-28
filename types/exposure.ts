/**
 * Esposizione — the shapes shared by its three layers (doc/perf/PERF-00, 2026-09-28):
 *
 *  - what the browser ASKS: `ProfileRequest` (a ticker and the Yahoo module its type needs),
 *    selected by `lib/utils/exposureRequests.ts` from the assets the page already holds;
 *  - what the route ANSWERS: `InstrumentProfile`, ONLY what Yahoo said about a ticker, per module,
 *    served from the shared `instrument-profile-cache/{ticker}` (`lib/server/exposure/*`);
 *  - what the engine COMPUTES: `PortfolioExposure`, three views weighed in the browser on the
 *    page's own assets (`lib/utils/exposureEngine.ts`).
 *
 * Two rules the types enforce by shape. A profile carries NOTHING of the user's — no asset name,
 * no class, no composition — because the cache document is shared by every account: the label of
 * a direct stock is Yahoo's `longName`, else the ticker. And every euro of a view's base has a
 * named destiny (read · unread · not applicable · out of this view), so the coverage line can say
 * where each one went and the list can add up to 100 on screen.
 */

// ─── The three views ─────────────────────────────────────────────────────────

export type ExposureViewKey = 'holdings' | 'sectors' | 'issuers';

// ─── What the browser asks ───────────────────────────────────────────────────

/**
 * Which Yahoo modules a ticker is asked for, decided by the asset's TYPE — a fund publishes
 * holdings, sectors and a family (`topHoldings` + `fundProfile`), a stock a sector and a name
 * (`assetProfile` + `price`). Each module has its own `fetchedAt` in the cache document, so one
 * user's classification can never refresh, or drop, what another user's needs.
 */
export type ProfileModule = 'fund' | 'stock';

export interface ProfileRequest {
  ticker: string;
  module: ProfileModule;
}

// ─── What the route answers ──────────────────────────────────────────────────

/** One weighted slice of an instrument's equity sleeve: a holding or a sector. `weight` is 0..1 of THE SLEEVE. */
export interface ExposureLegSlice {
  key: string;
  label: string;
  weight: number;
}

export interface InstrumentFundProfile {
  /** ISO instant of Yahoo's answer for this module. */
  fetchedAt: string;
  /** Absent when Yahoo published no constituents: «non letto», never an empty portfolio. */
  holdings?: ExposureLegSlice[];
  sectors?: ExposureLegSlice[];
  /**
   * `sleeve` when the holding weights were divided by `stockPosition` (so they are shares of the
   * equity sleeve); `fund` when Yahoo gave no `stockPosition` and the weights stay shares of the
   * whole fund — the method note says so.
   */
  holdingsBasis: 'sleeve' | 'fund';
  /** `fundProfile.family` as Yahoo writes it; null when Yahoo has none. */
  family: string | null;
}

export interface InstrumentStockProfile {
  fetchedAt: string;
  /** The app's sector key (`lib/constants/exposureSectors.ts`), null when Yahoo names none or an unmapped one. */
  sectorKey: string | null;
  /** Yahoo's `price.longName`: the stock's label and its issuer. Null → the ticker stands in. */
  longName: string | null;
}

/** ONLY Yahoo's answers, per module. Shared by every account: nothing of the user's belongs here. */
export interface InstrumentProfile {
  ticker: string;
  fund?: InstrumentFundProfile;
  stock?: InstrumentStockProfile;
}

/** `GET /api/portfolio/instrument-profiles?userId=<ownerId>[&force=true]`. */
export interface InstrumentProfilesResponse {
  profiles: Record<string, InstrumentProfile>;
  /** The oldest `fetchedAt` among the modules used, for the tile's footer; null when none was. */
  oldestFetchedAt: string | null;
}

// ─── What the engine computes ────────────────────────────────────────────────

/** One instrument's contribution to one entry: the drill-down under an opened row. */
export interface ExposureSource {
  ticker: string;
  name: string;
  amount: number;
  /** The slice's weight inside the source sleeve (0..1) and the sleeve's value — «5% di 12.000 € = 600 €». Absent when the weight is 1. */
  weight?: number;
  baseValue?: number;
}

/** One ranked entry of a view: a company, a sector, an issuer. */
export interface ExposureEntry {
  key: string;
  label: string;
  /** A short second fact under the label — the ticker symbol of a holding. */
  caption?: string;
  amount: number;
  sources: ExposureSource[];
}

/** The euros that took one destiny, and the instruments (asset names, largest first) behind them. */
export interface ExposureBucket {
  amount: number;
  instruments: string[];
}

/**
 * The «not applicable» euros, split the way the coverage line says them: by CLASS for the legs of
 * quoted instruments that have no look-through by nature (gold, crypto, a money-market ETF), and
 * as one figure for the instruments nobody quotes (a cash account, a property, a pension fund),
 * whatever their legs' classes — a reader wants «liquidità, oro e strumenti non quotati», not
 * thirteen names (owner, 2026-09-28).
 */
export interface ExposureNotApplicable extends ExposureBucket {
  /** Euros per `AssetClass` of the quoted legs with no look-through. */
  byClass: Record<string, number>;
  /** Euros of the non-quoted instruments, all their legs together. */
  unquoted: number;
}

/**
 * Where every euro of a view went. The identity the engine keeps, and the tests pin:
 * `read + unread + notApplicable + outOfView` = the measure summed over every leg of the base.
 *
 * - `read`: a published composition (or, for a direct stock, the stock itself) weighed it.
 * - `unread`: in this view's scope, but no profile answered — never zero, never a guess.
 * - `notApplicable`: a leg with no look-through by nature (gold, crypto, cash…), or ANY leg of an
 *   instrument that is not quoted (a property, a pension fund, a private-equity stake).
 * - `outOfView`: a bond sleeve in Titoli or Settori — real money, outside this view's question.
 * - `named`: of the `read` euros, those the entries actually name (Yahoo lists ~10 holdings per
 *   fund, so in Titoli it is well below `read`; in Settori the weights cover the sleeve).
 */
export interface ExposureCoverage {
  measure: 'notional' | 'market';
  /** `read + unread`: the denominator of every percentage in this view. */
  base: number;
  read: ExposureBucket;
  unread: ExposureBucket;
  notApplicable: ExposureNotApplicable;
  outOfView: ExposureBucket;
  named: number;
}

export interface ExposureViewData {
  /** Every entry, largest first; the tile takes the first N. */
  entries: ExposureEntry[];
  coverage: ExposureCoverage;
}

export interface PortfolioExposure {
  /** Notional, equity sleeves of the quoted instruments. */
  holdings: ExposureViewData;
  /** Notional, equity sleeves of the quoted instruments. */
  sectors: ExposureViewData;
  /** Market value, every quoted instrument once. */
  issuers: ExposureViewData;
  /** How many quoted instruments the base holds: zero is the tile's empty state. */
  quotedCount: number;
}
