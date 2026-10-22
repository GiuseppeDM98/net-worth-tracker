/**
 * yahooSource — the ONE file that talks to Yahoo Finance for the Esposizione. It fetches and
 * normalises, nothing else; what to do with an answer (cache, TTL, fallback) is
 * `instrumentProfileService.ts`'s. It never throws: Yahoo unreachable is `null` (the service then
 * keeps the last good answer), an unexpected shape is an EMPTY profile («non letto», 24 h TTL).
 *
 * Yahoo module asymmetry (doc/guide/allocazione.md § Esposizione — the per-ticker cache and
 * Yahoo's two modules): a fund's `topHoldings` → holdings, `sectorWeightings` (snake_case keys),
 * the published asset allocation (the six `*Position` fractions) and `fundProfile.family`; a
 * stock's `assetProfile.sector` (Title Case, mapped) plus `price.longName`. Which one is asked
 * depends on the asset's TYPE, so each module carries its own `fetchedAt` in the cache document.
 *
 * Normalisation: a fund's holding weights are shares of the whole FUND,
 * so they are divided by `stockPosition` to become shares of the EQUITY SLEEVE (a 4,5% name in a
 * fund that is 90% equity is 5% of its equity sleeve); the sector weights are already shares of
 * the sleeve and are not touched. Without a usable `stockPosition` the weights stay as they came
 * and the profile says so (`holdingsBasis: 'fund'`), so the method note can tell the reader.
 */
import YahooFinance from 'yahoo-finance2';
import type { ExposureLegSlice, InstrumentFundProfile, InstrumentStockProfile } from '@/types/exposure';
import { sectorLabel, YAHOO_ASSET_PROFILE_SECTOR_TO_KEY } from '@/lib/constants/exposureSectors';
import { resolveQuotableSymbol } from '@/lib/server/yahooSymbol';

/** What the service asks of Yahoo; injectable so the service is tested without the network. */
export interface YahooProfileSource {
  /** `null` when Yahoo could not be asked; a profile with nothing in it when it answered nothing. */
  fetchFund(ticker: string, now: Date): Promise<InstrumentFundProfile | null>;
  fetchStock(ticker: string, now: Date): Promise<InstrumentStockProfile | null>;
}

// ─── The shapes we read from the answers (subsets of yahoo-finance2's) ───────

interface RawTopHoldings {
  stockPosition?: number | null;
  bondPosition?: number | null;
  cashPosition?: number | null;
  otherPosition?: number | null;
  preferredPosition?: number | null;
  convertiblePosition?: number | null;
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

  // The published mix, all six buckets at once. Yahoo reports fractions of the whole fund
  // (0,1925 = 19,25%); a value outside [0,1] is clamped rather than trusted, and a missing one is
  // 0. Only a fund with at least one bucket gets an `allocation` — an all-zero answer is «non
  // letto», not a fund that is 0% of everything.
  const fraction = (value: number | null | undefined): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const allocation = {
    stock: fraction(topHoldings?.stockPosition),
    bond: fraction(topHoldings?.bondPosition),
    cash: fraction(topHoldings?.cashPosition),
    other: fraction(topHoldings?.otherPosition),
    preferred: fraction(topHoldings?.preferredPosition),
    convertible: fraction(topHoldings?.convertiblePosition),
  };
  const hasAllocation = Object.values(allocation).some((weight) => weight > 0);

  return {
    fetchedAt: now.toISOString(),
    ...(holdings.length > 0 ? { holdings } : {}),
    ...(sectors.length > 0 ? { sectors } : {}),
    holdingsBasis: stockPosition ? 'sleeve' : 'fund',
    family: typeof family === 'string' && family.trim() !== '' ? family : null,
    ...(hasAllocation ? { allocation } : {}),
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

/** The module list `quoteSummary` accepts, as its own typings spell it. */
type QuoteSummaryModules = NonNullable<Parameters<typeof yahooFinance.quoteSummary>[1]>['modules'];

/**
 * `quoteSummary` validates Yahoo's answer against the library's schema and throws when the answer
 * does not fit — the WHOLE answer, even for the modules we asked for that fit fine.
 * `fundProfile.brokerages` is the recurring offender (measured 2026-10-22: Yahoo answers an array
 * of bank NAMES where the schema wants objects, and a fund with a perfectly good `topHoldings` mix
 * was lost with it — `0P00017T6E.F`, «R-co Valor C EUR»). The retry asks for Yahoo's raw answer,
 * which the normalisers below already treat defensively; a network failure is rethrown and stays
 * the `null` fund it was.
 */
async function quoteSummaryLoose<Summary>(symbol: string, modules: QuoteSummaryModules): Promise<Summary> {
  try {
    return (await yahooFinance.quoteSummary(symbol, { modules })) as Summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!/schema validation/i.test(message)) throw error;
    return (await yahooFinance.quoteSummary(symbol, { modules }, { validateResult: false })) as Summary;
  }
}

/**
 * An ISIN-shaped ticker Yahoo cannot quote directly: the symbol is FOUND and MEASURED by
 * `lib/server/yahooSymbol.ts` — the written catalogue first, then yahoo-finance2's own search,
 * and the symbol it names is used only when the search's name and the symbol's own price name the
 * same fund. A manual, Scalable or Trade Republic position born with the ISIN as its ticker heals
 * this way without a curated table entry. Anything else is returned as stored.
 *
 * THE MEASUREMENT MATTERS HERE MORE THAN IN THE PRICE. The first hit of a search can be another
 * fund: the holdings this path reads would then be ANOTHER fund's, on a real position.
 */
export const yahooProfileSource: YahooProfileSource = {
  async fetchFund(ticker, now) {
    try {
      const symbol = await resolveQuotableSymbol(ticker);
      const summary = await quoteSummaryLoose<RawFundSummary>(symbol, ['topHoldings', 'fundProfile']);
      return normalizeFundAnswer(summary, now);
    } catch {
      return null;
    }
  },
  async fetchStock(ticker, now) {
    try {
      const symbol = await resolveQuotableSymbol(ticker);
      const summary = await quoteSummaryLoose<RawStockSummary>(symbol, ['assetProfile', 'price']);
      return normalizeStockAnswer(summary, now);
    } catch {
      return null;
    }
  },
};
