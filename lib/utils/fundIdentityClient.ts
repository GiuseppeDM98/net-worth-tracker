/**
 * The client side of `GET /api/portfolio/fund-identity`: which fund a broker's product name is,
 * imperatively (the Azimut import preview). The server owns the EODHD call, the strict matching
 * and the shared name cache; this module only asks, in the chunks the route accepts (10 names per
 * request), and keys the answers the way the import plan reads them — by `normalizeFundName`.
 *
 * FAIL-SOFT BY CONTRACT: a chunk that fails turns into `unavailable` for the names it carried,
 * because a preview must still list the positions it could not identify, and «il servizio non ha
 * risposto» is not «il fondo non esiste». A name the caller passes twice is asked once.
 */
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { normalizeFundName } from '@/lib/utils/fundIdentity';
import type { FundIdentitiesResponse, FundIdentityResult } from '@/types/fundIdentity';

/** The route's own bound (`fundIdentityQuerySchema`). */
const NAMES_PER_REQUEST = 10;
/** The route's per-name bound; a longer product name would fail the WHOLE query. */
const MAX_NAME_LENGTH = 140;
const MIN_NAME_LENGTH = 3;

export interface FundIdentitiesResult {
  /** Keyed by `normalizeFundName(query)`: the same key `buildAzimutImportPlan` joins on. */
  byName: Record<string, FundIdentityResult>;
  /** Names actually asked (after dedupe and the shape filter). */
  askedCount: number;
  /** Chunks that failed — the preview says the search was unavailable, not that the funds are unknown. */
  failedChunks: number;
}

function chunksOf<T>(values: T[]): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += NAMES_PER_REQUEST) {
    chunks.push(values.slice(index, index + NAMES_PER_REQUEST));
  }
  return chunks;
}

async function fetchChunk(names: string[]): Promise<FundIdentitiesResponse> {
  const response = await authenticatedFetch(
    `/api/portfolio/fund-identity?names=${encodeURIComponent(names.join('|'))}`
  );
  if (!response.ok) {
    throw new Error(`Fund identity request failed (${response.status})`);
  }
  return (await response.json()) as FundIdentitiesResponse;
}

/**
 * The identities of the product names given. A name EODHD was not asked about, or a chunk that
 * failed, answers `unavailable`; the caller never has to invent a status.
 */
export async function fetchFundIdentities(names: string[]): Promise<FundIdentitiesResult> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) continue;
    const key = normalizeFundName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }

  const byName: Record<string, FundIdentityResult> = {};
  let failedChunks = 0;

  const answers = await Promise.all(
    chunksOf(unique).map(async (chunk) => {
      try {
        return await fetchChunk(chunk);
      } catch (error) {
        console.error('[fund-identity] chunk failed:', error);
        failedChunks += 1;
        return {
          results: chunk.map((query) => ({
            query,
            status: 'unavailable' as const,
            candidateCount: 0,
          })),
        } satisfies FundIdentitiesResponse;
      }
    })
  );

  for (const answer of answers) {
    for (const result of answer.results) {
      byName[normalizeFundName(result.query)] = result;
    }
  }

  return { byName, askedCount: unique.length, failedChunks };
}
