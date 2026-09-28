/**
 * Yahoo Finance's sector vocabulary, in one dependency-free module: the server maps Yahoo's
 * answers onto these keys (`lib/server/exposure/yahooSource.ts`) and the browser engine labels
 * a direct stock's sector from the key alone (`lib/utils/exposureEngine.ts`) — the cache stores
 * the key, never the Italian word, so a relabel here reaches every cached profile at once.
 *
 * Yahoo module asymmetry (AGENTS.md § Shared Constants): a fund's `topHoldings.sectorWeightings`
 * already uses these snake_case keys; a stock's `assetProfile.sector` is Title Case and needs
 * `YAHOO_ASSET_PROFILE_SECTOR_TO_KEY` first.
 */

export const SECTOR_LABELS: Record<string, string> = {
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

export const YAHOO_ASSET_PROFILE_SECTOR_TO_KEY: Record<string, string> = {
  Technology: 'technology',
  Healthcare: 'healthcare',
  'Financial Services': 'financial_services',
  'Consumer Cyclical': 'consumer_cyclical',
  'Consumer Defensive': 'consumer_defensive',
  Industrials: 'industrials',
  'Communication Services': 'communication_services',
  Energy: 'energy',
  'Basic Materials': 'basic_materials',
  Utilities: 'utilities',
  'Real Estate': 'realestate',
};

/** The Italian label of a sector key; an unknown key prints as itself rather than vanishing. */
export function sectorLabel(key: string): string {
  return SECTOR_LABELS[key] ?? key;
}
