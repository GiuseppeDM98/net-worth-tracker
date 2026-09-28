/**
 * yahooSource — the ONE file that talks to Yahoo Finance for the Esposizione. It fetches and
 * normalises, nothing else; what to do with an answer (cache, TTL, fallback) is
 * `instrumentProfileService.ts`'s. It never throws: Yahoo unreachable is `null` (the service then
 * keeps the last good answer), an unexpected shape is an EMPTY profile («non letto», 24 h TTL).
 *
 * Yahoo module asymmetry (AGENTS.md § Shared Constants): a fund's `topHoldings` → holdings and
 * `sectorWeightings` (snake_case keys) plus `fundProfile.family`; a stock's `assetProfile.sector`
 * (Title Case, mapped) plus `price.longName`. Which one is asked depends on the asset's TYPE, so
 * each module carries its own `fetchedAt` in the cache document.
 *
 * Normalisation (doc/perf/PERF-00 § 4.4): a fund's holding weights are shares of the whole FUND,
 * so they are divided by `stockPosition` to become shares of the EQUITY SLEEVE (a 4,5% name in a
 * fund that is 90% equity is 5% of its equity sleeve); the sector weights are already shares of
 * the sleeve and are not touched. Without a usable `stockPosition` the weights stay as they came
 * and the profile says so (`holdingsBasis: 'fund'`), so the method note can tell the reader.
 */
import YahooFinance from 'yahoo-finance2';
import type { ExposureLegSlice, InstrumentFundProfile, InstrumentStockProfile } from '@/types/exposure';
import { sectorLabel, YAHOO_ASSET_PROFILE_SECTOR_TO_KEY } from '@/lib/constants/exposureSectors';

/** What the service asks of Yahoo; injectable so the service is tested without the network. */
export interface YahooProfileSource {
  /** `null` when Yahoo could not be asked; a profile with nothing in it when it answered nothing. */
  fetchFund(ticker: string, now: Date): Promise<InstrumentFundProfile | null>;
  fetchStock(ticker: string, now: Date): Promise<InstrumentStockProfile | null>;
}

// ─── The shapes we read from the answers (subsets of yahoo-finance2's) ───────

interface RawTopHoldings {
  stockPosition?: number | null;
  holdings?: Array<{ symbol?: string | null; holdingName?: string | null; holdingPercent?: number | null }> | null;
  sectorWeightings?: Array<Record<string, number | null | undefined>> | null;
}

interface RawFundSummary {
  topHoldings?: RawTopHoldings | null;
  fundProfile?: { family?: string | null } | null;
}

interface RawStockSummary {
  assetProfile?: { sector?: string | null } | null;
  price?: { longName?: string | null; shortName?: string | null } | null;
}

// ─── Normalisation, pure ─────────────────────────────────────────────────────

/** A fund's answer as the cache stores it: sleeve-normalised holdings, the sectors as they came, the family. */
export function normalizeFundAnswer(summary: RawFundSummary | null | undefined, now: Date): InstrumentFundProfile {
  const topHoldings = summary?.topHoldings ?? null;
  const stockPosition = typeof topHoldings?.stockPosition === 'number' && topHoldings.stockPosition > 0 ? topHoldings.stockPosition : null;

  const holdings: ExposureLegSlice[] = (topHoldings?.holdings ?? [])
    .filter((holding) => !!holding?.symbol && typeof holding.holdingPercent === 'number' && holding.holdingPercent > 0)
    .map((holding) => ({
      key: holding.symbol!.toUpperCase(),
      label: holding.holdingName || holding.symbol!,
      weight: stockPosition ? holding.holdingPercent! / stockPosition : holding.holdingPercent!,
    }));

  const sectors: ExposureLegSlice[] = (topHoldings?.sectorWeightings ?? [])
    .flatMap((sectorObject) => Object.entries(sectorObject ?? {}))
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
    .map(([key, weight]) => ({ key, label: sectorLabel(key), weight }));

  const family = summary?.fundProfile?.family;

  return {
    fetchedAt: now.toISOString(),
    ...(holdings.length > 0 ? { holdings } : {}),
    ...(sectors.length > 0 ? { sectors } : {}),
    holdingsBasis: stockPosition ? 'sleeve' : 'fund',
    family: typeof family === 'string' && family.trim() !== '' ? family : null,
  };
}

/** A stock's answer: its sector as one of the app's keys (an unmapped one is no sector) and its name. */
export function normalizeStockAnswer(summary: RawStockSummary | null | undefined, now: Date): InstrumentStockProfile {
  const sector = summary?.assetProfile?.sector;
  const sectorKey = typeof sector === 'string' ? (YAHOO_ASSET_PROFILE_SECTOR_TO_KEY[sector] ?? null) : null;
  const longName = summary?.price?.longName || summary?.price?.shortName;
  return {
    fetchedAt: now.toISOString(),
    sectorKey,
    longName: typeof longName === 'string' && longName.trim() !== '' ? longName : null,
  };
}

// ─── The live source ─────────────────────────────────────────────────────────

const yahooFinance = new YahooFinance();

export const yahooProfileSource: YahooProfileSource = {
  async fetchFund(ticker, now) {
    try {
      const summary = (await yahooFinance.quoteSummary(ticker, { modules: ['topHoldings', 'fundProfile'] })) as RawFundSummary;
      return normalizeFundAnswer(summary, now);
    } catch {
      return null;
    }
  },
  async fetchStock(ticker, now) {
    try {
      const summary = (await yahooFinance.quoteSummary(ticker, { modules: ['assetProfile', 'price'] })) as RawStockSummary;
      return normalizeStockAnswer(summary, now);
    } catch {
      return null;
    }
  },
};
