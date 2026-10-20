/**
 * The client side of `GET /api/portfolio/fund-allocation`: the published mix of a set of ISINs,
 * imperatively (the Intesa import preview, the ETF form's automatic read). The server owns the
 * Yahoo call and the shared per-ticker cache; this module only asks and merges the chunks the
 * route accepts (40 ISINs per request).
 *
 * FAIL-SOFT BY CONTRACT: a chunk that fails is logged and skipped, because a preview must still
 * list the positions it could read. The caller sees the ISINs ABSENT from `allocations` and says
 * which rows it could not split — never a 100/0 guess.
 */
import { authenticatedFetch } from '@/lib/utils/authFetch';
import type { FundAllocationsResponse, InstrumentFundAllocation } from '@/types/exposure';

/** The route's own bound (`fundAllocationQuerySchema`); one import rarely needs more than one. */
const ISINS_PER_REQUEST = 40;

/** The route's ISIN shape (`isinSchema`): 2 country letters + 9 alphanumeric + 1 check digit. */
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export interface FundAllocationsResult {
  allocations: Record<string, InstrumentFundAllocation>;
  oldestFetchedAt: string | null;
}

async function fetchChunk(isins: string[]): Promise<FundAllocationsResponse> {
  const query = encodeURIComponent(isins.join(','));
  const response = await authenticatedFetch(`/api/portfolio/fund-allocation?isins=${query}`);
  if (!response.ok) {
    throw new Error(`Fund allocation request failed (${response.status})`);
  }
  return (await response.json()) as FundAllocationsResponse;
}

/**
 * The published allocations for the ISINs given, trimmed, upper-cased and de-duplicated. Every
 * chunk is independent: one failed chunk never discards another's answer. A value that is not
 * ISIN-shaped is dropped BEFORE the request — the route refuses the whole query on one bad ISIN,
 * and a single malformed row must not cost the other 39 funds their allocation.
 */
export async function fetchFundAllocations(isins: string[]): Promise<FundAllocationsResult> {
  const unique = [
    ...new Set(
      isins
        .map((isin) => isin.trim().toUpperCase())
        .filter((isin) => ISIN_PATTERN.test(isin))
    ),
  ];
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += ISINS_PER_REQUEST) {
    chunks.push(unique.slice(index, index + ISINS_PER_REQUEST));
  }

  const answers = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        return await fetchChunk(chunk);
      } catch (error) {
        console.error('[fund-allocation] chunk failed:', error);
        return { allocations: {}, oldestFetchedAt: null } satisfies FundAllocationsResponse;
      }
    }),
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
