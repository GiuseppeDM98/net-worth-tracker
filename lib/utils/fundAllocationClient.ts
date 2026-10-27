/**
 * The client side of `GET /api/portfolio/fund-allocation`: the published mix of a set of ISINs
 * and/or Yahoo tickers, imperatively (the Intesa and Azimut import previews, the ETF form's
 * automatic read). The server owns the Yahoo call and the shared per-ticker cache; this module
 * only asks and merges the chunks the route accepts (40 instruments per request, per list).
 *
 * FAIL-SOFT BY CONTRACT: a chunk that fails is logged and skipped, because a preview must still
 * list the positions it could read. The caller sees the instruments ABSENT from `allocations` and
 * says which rows it could not split — never a 100/0 guess.
 */
import { authenticatedFetch } from '@/lib/utils/authFetch';
import type { FundAllocationsResponse, InstrumentFundAllocation } from '@/types/exposure';

/** The route's own bound (`fundAllocationQuerySchema`); one import rarely needs more than one. */
const INSTRUMENTS_PER_REQUEST = 40;

/** The route's ISIN shape (`isinSchema`): 2 country letters + 9 alphanumeric + 1 check digit. */
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/** The route's ticker shape (`tickerSchema`): what Yahoo quotes, never a product name. */
const TICKER_PATTERN = /^[A-Za-z0-9.^=\-]{1,20}$/;

export interface FundAllocationsResult {
  allocations: Record<string, InstrumentFundAllocation>;
  oldestFetchedAt: string | null;
}

type FundAllocationChunk = { isins: string[] } | { tickers: string[] };

async function fetchChunk(chunk: FundAllocationChunk): Promise<FundAllocationsResponse> {
  const query =
    'isins' in chunk
      ? `isins=${encodeURIComponent(chunk.isins.join(','))}`
      : `tickers=${encodeURIComponent(chunk.tickers.join(','))}`;
  const response = await authenticatedFetch(`/api/portfolio/fund-allocation?${query}`);
  if (!response.ok) {
    throw new Error(`Fund allocation request failed (${response.status})`);
  }
  return (await response.json()) as FundAllocationsResponse;
}

function chunksOf<T>(values: T[]): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += INSTRUMENTS_PER_REQUEST) {
    chunks.push(values.slice(index, index + INSTRUMENTS_PER_REQUEST));
  }
  return chunks;
}

/**
 * The published allocations for the ISINs and tickers given. Every chunk is independent: one
 * failed chunk never discards another's answer. A value that is not shaped like its list is
 * dropped BEFORE the request — the route refuses the whole query on one bad value, and a single
 * malformed row must not cost the other 39 instruments their allocation.
 *
 * The two lists stay apart on the wire (`isins=` / `tickers=`): an ISIN is not a ticker, and the
 * route validates each as what it claims to be.
 */
export async function fetchFundAllocations(
  isins: string[],
  tickers: string[] = []
): Promise<FundAllocationsResult> {
  const uniqueIsins = [
    ...new Set(
      isins
        .map((isin) => isin.trim().toUpperCase())
        .filter((isin) => ISIN_PATTERN.test(isin))
    ),
  ];
  const uniqueTickers = [
    ...new Set(tickers.map((ticker) => ticker.trim()).filter((ticker) => TICKER_PATTERN.test(ticker))),
  ];

  const chunks: FundAllocationChunk[] = [
    ...chunksOf(uniqueIsins).map((chunk) => ({ isins: chunk })),
    ...chunksOf(uniqueTickers).map((chunk) => ({ tickers: chunk })),
  ];

  const answers = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        return await fetchChunk(chunk);
      } catch (error) {
        console.error('[fund-allocation] chunk failed:', error);
        return { allocations: {}, oldestFetchedAt: null } satisfies FundAllocationsResponse;
      }
    })
  );

  const allocations: Record<string, InstrumentFundAllocation> = {};
  let oldestFetchedAt: string | null = null;
  for (const answer of answers) {
    Object.assign(allocations, answer.allocations);
    if (answer.oldestFetchedAt && (!oldestFetchedAt || answer.oldestFetchedAt < oldestFetchedAt)) {
      oldestFetchedAt = answer.oldestFetchedAt;
    }
  }
  return { allocations, oldestFetchedAt };
}
