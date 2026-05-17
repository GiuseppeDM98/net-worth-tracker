/**
 * Portfolio Exposure Service
 *
 * Computes cross-ETF and direct-stock exposure breakdown for a user's portfolio.
 * Uses Yahoo Finance quoteSummary with topHoldings (company + sector data)
 * and fundProfile (ETF issuer/family) modules.
 *
 * Limitation: Yahoo Finance provides only the top ~10 holdings per ETF,
 * so results are approximate for highly diversified funds.
 */

import YahooFinance from 'yahoo-finance2';
import { Asset } from '@/types/assets';
import {
  ExposureHolding,
  ExposureSector,
  ExposureIssuer,
  PortfolioExposureData,
} from '@/types/exposure';

const yahooFinance = new YahooFinance();

// Italian labels for Yahoo Finance sector keys.
const SECTOR_LABELS: Record<string, string> = {
  technology: 'Tecnologia',
  healthcare: 'Salute',
  financial_services: 'Finanza',
  consumer_cyclical: 'Beni Voluttuari',
  consumer_defensive: 'Beni di Prima Necessità',
  industrials: 'Industriali',
  communication_services: 'Comunicazione',
  energy: 'Energia',
  basic_materials: 'Materiali di Base',
  utilities: 'Utilities',
  realestate: 'Immobiliare',
};

// Maps assetProfile.sector strings (title-case, from Yahoo Finance) to our internal keys.
// topHoldings uses camelCase keys directly; assetProfile uses a different format.
const YAHOO_ASSET_PROFILE_SECTOR_TO_KEY: Record<string, string> = {
  'Technology': 'technology',
  'Healthcare': 'healthcare',
  'Financial Services': 'financial_services',
  'Consumer Cyclical': 'consumer_cyclical',
  'Consumer Defensive': 'consumer_defensive',
  'Industrials': 'industrials',
  'Communication Services': 'communication_services',
  'Energy': 'energy',
  'Basic Materials': 'basic_materials',
  'Utilities': 'utilities',
  'Real Estate': 'realestate',
};

// Mirror of calculateAssetValue() from assetService.ts for server-side use.
// assetService.ts imports the client Firebase SDK and cannot be used in API routes.
function resolveAssetValueEur(asset: Asset): number {
  const isGBp = asset.currency === 'GBp';
  const normalised = isGBp ? asset.currentPrice / 100 : asset.currentPrice;
  const priceEur =
    asset.currency?.toUpperCase() !== 'EUR' && asset.currentPriceEur != null
      ? asset.currentPriceEur
      : normalised;
  const base = asset.quantity * priceEur;
  if (asset.type === 'realestate' && asset.outstandingDebt) {
    return base - asset.outstandingDebt;
  }
  return base;
}

/**
 * Compute portfolio exposure breakdown from Yahoo Finance topHoldings data.
 *
 * @param assets - All user assets fetched via Admin SDK
 * @returns Aggregated exposure by company, sector, and ETF issuer
 */
export async function computePortfolioExposure(
  assets: Asset[]
): Promise<PortfolioExposureData> {
  const activeAssets = assets.filter((a) => a.quantity > 0);

  // Compute EUR value for every active asset
  const assetValues = new Map<string, number>(
    activeAssets.map((a) => [a.id, resolveAssetValueEur(a)])
  );

  const totalPortfolioValue = Array.from(assetValues.values()).reduce(
    (sum, v) => sum + v,
    0
  );

  // Only ETFs and direct stocks are meaningful for company/sector/issuer analysis
  const etfAssets = activeAssets.filter((a) => a.type === 'etf');
  const stockAssets = activeAssets.filter(
    (a) => a.type === 'stock' && a.assetClass === 'equity'
  );
  const analyzedAssets = etfAssets.length + stockAssets.length;

  // --- Fetch Yahoo Finance data for ETFs and stocks in parallel ---
  type YFResult = {
    asset: Asset;
    topHoldings: {
      holdings: Array<{ symbol: string; holdingName: string; holdingPercent: number }>;
      sectorWeightings: Array<Record<string, number>>;
    } | null;
    fundFamily: string | null;
  };

  type StockResult = {
    asset: Asset;
    // Internal sector key (e.g. "technology"), null when Yahoo has no data for the ticker
    sectorKey: string | null;
  };

  const [etfFetchResults, stockFetchResults] = await Promise.all([
    Promise.allSettled(
      etfAssets.map(async (asset): Promise<YFResult> => {
        try {
          const summary = await yahooFinance.quoteSummary(asset.ticker, {
            modules: ['topHoldings', 'fundProfile'],
          });
          const holdings = summary.topHoldings ?? null;
          const family = (summary.fundProfile as { family?: string | null } | null)?.family ?? null;
          return {
            asset,
            topHoldings: holdings
              ? {
                  holdings: (holdings.holdings ?? []) as Array<{
                    symbol: string;
                    holdingName: string;
                    holdingPercent: number;
                  }>,
                  sectorWeightings: (holdings.sectorWeightings ?? []) as Array<Record<string, number>>,
                }
              : null,
            fundFamily: family,
          };
        } catch {
          return { asset, topHoldings: null, fundFamily: null };
        }
      })
    ),
    // Fetch sector via assetProfile for individual stocks.
    // topHoldings.sectorWeightings is only available for ETFs/funds, not for equities.
    Promise.allSettled(
      stockAssets.map(async (asset): Promise<StockResult> => {
        try {
          const summary = await yahooFinance.quoteSummary(asset.ticker, {
            modules: ['assetProfile'],
          });
          const sector = (summary.assetProfile as { sector?: string } | null)?.sector ?? null;
          const sectorKey = sector ? (YAHOO_ASSET_PROFILE_SECTOR_TO_KEY[sector] ?? null) : null;
          return { asset, sectorKey };
        } catch {
          return { asset, sectorKey: null };
        }
      })
    ),
  ]);

  // Flatten settled results, drop failures
  const etfData: YFResult[] = etfFetchResults
    .filter((r): r is PromiseFulfilledResult<YFResult> => r.status === 'fulfilled')
    .map((r) => r.value);

  const stockData: StockResult[] = stockFetchResults
    .filter((r): r is PromiseFulfilledResult<StockResult> => r.status === 'fulfilled')
    .map((r) => r.value);

  // --- Aggregate company exposure ---
  // key: symbol (uppercase), value: accumulator
  const holdingMap = new Map<
    string,
    { name: string; exposureEur: number; sources: ExposureHolding['sources'] }
  >();

  const addHolding = (
    symbol: string,
    name: string,
    contributionEur: number,
    holdingPct: number,
    assetName: string,
    ticker: string,
    assetValueEur: number
  ) => {
    const key = symbol.toUpperCase();
    const existing = holdingMap.get(key);
    const source = { assetName, ticker, contributionEur, holdingPct, assetValueEur };
    if (existing) {
      existing.exposureEur += contributionEur;
      existing.sources.push(source);
    } else {
      holdingMap.set(key, { name, exposureEur: contributionEur, sources: [source] });
    }
  };

  // ETF top holdings
  for (const { asset, topHoldings } of etfData) {
    if (!topHoldings) continue;
    const assetValue = assetValues.get(asset.id) ?? 0;
    for (const h of topHoldings.holdings) {
      if (!h.symbol || h.holdingPercent == null) continue;
      addHolding(
        h.symbol,
        h.holdingName || h.symbol,
        h.holdingPercent * assetValue,
        h.holdingPercent,
        asset.name,
        asset.ticker,
        assetValue
      );
    }
  }

  // Direct equity stocks count as 100% company exposure
  for (const asset of stockAssets) {
    const assetValue = assetValues.get(asset.id) ?? 0;
    addHolding(
      asset.ticker.toUpperCase(),
      asset.name,
      assetValue,
      1,
      asset.name,
      asset.ticker,
      assetValue
    );
  }

  const topHoldings: ExposureHolding[] = Array.from(holdingMap.entries())
    .map(([symbol, { name, exposureEur, sources }]) => ({
      symbol,
      name,
      exposureEur,
      exposurePct: totalPortfolioValue > 0 ? exposureEur / totalPortfolioValue : 0,
      sources,
    }))
    .sort((a, b) => b.exposureEur - a.exposureEur)
    .slice(0, 15);

  // --- Aggregate sector exposure ---
  const sectorMap = new Map<
    string,
    { exposureEur: number; sources: ExposureSector['sources'] }
  >();

  for (const { asset, topHoldings: th } of etfData) {
    if (!th) continue;
    const assetValue = assetValues.get(asset.id) ?? 0;
    for (const sectorObj of th.sectorWeightings) {
      for (const [key, weight] of Object.entries(sectorObj)) {
        if (typeof weight !== 'number' || weight <= 0) continue;
        const contribution = weight * assetValue;
        const source = {
          assetName: asset.name,
          ticker: asset.ticker,
          contributionEur: contribution,
          sectorWeight: weight,
          assetValueEur: assetValue,
        };
        const existing = sectorMap.get(key);
        if (existing) {
          existing.exposureEur += contribution;
          existing.sources.push(source);
        } else {
          sectorMap.set(key, { exposureEur: contribution, sources: [source] });
        }
      }
    }
  }

  // Direct stocks are 100% exposed to their single sector (sectorWeight: 1).
  // Stocks without a resolvable sector key are silently skipped.
  for (const { asset, sectorKey } of stockData) {
    if (!sectorKey) continue;
    const assetValue = assetValues.get(asset.id) ?? 0;
    const source = {
      assetName: asset.name,
      ticker: asset.ticker,
      contributionEur: assetValue,
      sectorWeight: 1,
      assetValueEur: assetValue,
    };
    const existing = sectorMap.get(sectorKey);
    if (existing) {
      existing.exposureEur += assetValue;
      existing.sources.push(source);
    } else {
      sectorMap.set(sectorKey, { exposureEur: assetValue, sources: [source] });
    }
  }

  const sectors: ExposureSector[] = Array.from(sectorMap.entries())
    .map(([key, { exposureEur, sources }]) => ({
      key,
      label: SECTOR_LABELS[key] ?? key,
      exposureEur,
      exposurePct: totalPortfolioValue > 0 ? exposureEur / totalPortfolioValue : 0,
      sources,
    }))
    .sort((a, b) => b.exposureEur - a.exposureEur);

  // --- Aggregate ETF issuers ---
  const issuerMap = new Map<
    string,
    { exposureEur: number; assets: ExposureIssuer['assets'] }
  >();

  for (const { asset, fundFamily } of etfData) {
    const assetValue = assetValues.get(asset.id) ?? 0;
    const family = fundFamily ?? 'Altro';
    const existing = issuerMap.get(family);
    const entry = { name: asset.name, ticker: asset.ticker, valueEur: assetValue };
    if (existing) {
      existing.exposureEur += assetValue;
      existing.assets.push(entry);
    } else {
      issuerMap.set(family, { exposureEur: assetValue, assets: [entry] });
    }
  }

  const issuers: ExposureIssuer[] = Array.from(issuerMap.entries())
    .map(([family, { exposureEur, assets }]) => ({
      family,
      exposureEur,
      exposurePct: totalPortfolioValue > 0 ? exposureEur / totalPortfolioValue : 0,
      assets,
    }))
    .sort((a, b) => b.exposureEur - a.exposureEur);

  const totalAnalyzedValue =
    etfAssets.reduce((s, a) => s + (assetValues.get(a.id) ?? 0), 0) +
    stockAssets.reduce((s, a) => s + (assetValues.get(a.id) ?? 0), 0);

  const cacheKey = `${etfAssets.length}-${etfAssets.map((a) => a.ticker).sort().join(',')}-${stockAssets.map((a) => a.ticker).sort().join(',')}-${Math.round(totalPortfolioValue)}`;

  return {
    topHoldings,
    sectors,
    issuers,
    totalAnalyzedValue,
    totalPortfolioValue,
    analyzedAssets,
    totalAssets: activeAssets.length,
    computedAt: new Date().toISOString(),
    cacheKey,
  };
}
