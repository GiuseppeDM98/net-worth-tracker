// Source of a holding's contribution from a specific portfolio asset (ETF or stock).
// Stored fields support an explicit formula display in the UI:
//   contributionEur = holdingPct * assetValueEur
export interface ExposureSource {
  assetName: string;
  ticker: string;
  contributionEur: number;
  holdingPct: number;     // the holding's % weight inside that ETF (1 for direct stocks)
  assetValueEur?: number; // EUR value of the source ETF/stock; absent on v1 cached docs
}

// A single company holding aggregated across all ETFs + direct stocks.
export interface ExposureHolding {
  symbol: string;
  name: string;
  exposureEur: number;
  exposurePct: number; // % of total portfolio value
  sources: ExposureSource[];
}

// A single sector aggregated across all analyzed assets.
// sectorWeight + assetValueEur let the UI render the formula
//   contributionEur = sectorWeight * assetValueEur
// Both fields are optional on v1 cached docs (added in a later iteration).
export interface ExposureSector {
  key: string;   // Yahoo Finance key, e.g. "technology"
  label: string; // Italian label, e.g. "Tecnologia"
  exposureEur: number;
  exposurePct: number;
  sources: Array<{
    assetName: string;
    ticker: string;
    contributionEur: number;
    sectorWeight?: number;  // 0..1 weight of this sector inside the source ETF
    assetValueEur?: number; // EUR value of the source ETF
  }>;
}

// An ETF issuer/fund family and the user's total exposure to it.
export interface ExposureIssuer {
  family: string; // e.g. "iShares", "Vanguard"
  exposureEur: number;
  exposurePct: number;
  assets: Array<{
    name: string;
    ticker: string;
    valueEur: number;
  }>;
}

// Full computed result returned by /api/portfolio/exposure.
export interface PortfolioExposureData {
  topHoldings: ExposureHolding[];  // top 15 companies by exposureEur
  sectors: ExposureSector[];       // all sectors, sorted by exposureEur desc
  issuers: ExposureIssuer[];       // all ETF issuers, sorted by exposureEur desc
  totalAnalyzedValue: number;      // EUR value of ETFs + stocks analyzed
  totalPortfolioValue: number;     // EUR value of the full portfolio
  analyzedAssets: number;          // count of assets included in the analysis
  totalAssets: number;             // count of all portfolio assets
  computedAt: string;              // ISO timestamp
  cacheKey: string;
}

export interface PortfolioExposureResponse {
  exposure: PortfolioExposureData;
  cached: boolean;
}
