/**
 * fundIdentityService — from a broker's product NAME to a fund's ISIN, through EODHD's Search API,
 * with ONE cache shared by every account: `fund-identity-cache/{encodeURIComponent(name)}`, read
 * and written only by the Admin SDK (`firestore.rules` denies the client).
 *
 * WHY: a fund a broker names but does not code (`FIDELITY GLOBAL DIVIDEND "A" (EURHDG) ACC`) has
 * no identity at all. Without an ISIN the app cannot ask for the fund's published mix (so its
 * class stays a guess) and cannot recognise the position on the next import except by that name.
 * EODHD's `GET /api/search/{name}?type=fund` answers the fund's listings — `{ Name, ISIN,
 * Currency }` — and the choice among them is `matchFundIdentity`'s (`lib/utils/fundIdentity.ts`),
 * strict on purpose: no answer is better than another fund's price and class.
 *
 * ONE CALL PER DISTINCT NAME, cached for a month: EODHD's free plan allows ~20 calls a day, and
 * the answer (a fund's ISIN) does not change. A `none`/`ambiguous` answer is retried weekly — a
 * share class EODHD has not listed yet may appear — while a matched one waits the month.
 *
 * THE TOKEN IS SERVER-SIDE ONLY (`EODHD_API_TOKEN`). Absent, every name answers `unavailable` and
 * no HTTP is attempted: the feature is off, the import still works, and the preview says so
 * instead of pretending the fund is unknown.
 *
 * Fail-soft by contract: EODHD unreachable, refusing or answering garbage is `unavailable` for
 * that name, never an exception — and never cached, so the next import asks again.
 */
import { adminDb } from '@/lib/firebase/admin';
import { removeUndefinedDeep } from '@/lib/utils/firestoreData';
import {
  buildFundIdentityQuery,
  matchFundIdentity,
  normalizeFundName,
  type EodhdFundHit,
  type FundIdentity,
  type FundIdentityStatus,
} from '@/lib/utils/fundIdentity';
import type { ServerTimingRecorder } from '@/lib/server/serverTiming';
import type { FundIdentitiesResponse, FundIdentityResult } from '@/types/fundIdentity';

export const FUND_IDENTITY_CACHE_COLLECTION = 'fund-identity-cache';
/** A fund's ISIN does not change: a matched answer is good for a quarter. */
export const FUND_IDENTITY_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** A `none`/`ambiguous` answer may be incomplete (a class listed later): retried weekly. */
export const FUND_IDENTITY_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The route's bound, repeated here so the service is safe when called directly. */
export const MAX_IDENTITY_QUERIES = 10;

const EODHD_SEARCH_URL = 'https://eodhd.com/api/search';
const EODHD_SEARCH_LIMIT = 50;
const EODHD_TIMEOUT_MS = 10_000;

/** What one cached name holds — EODHD's own answers, nothing of any user's. */
export interface CachedFundIdentity {
  query: string;
  status: FundIdentityStatus;
  identity?: FundIdentity;
  candidateCount: number;
  /** ISO timestamp of the EODHD call, the way `instrument-profile-cache` dates its modules. */
  fetchedAt: string;
}

/**
 * The cache as the service sees it; injectable so the service is tested against memory. `null` on
 * a miss AND on a failed read: a cache that cannot be read must never block the answer.
 */
export interface FundIdentityCacheStore {
  read(normalizedName: string): Promise<CachedFundIdentity | null>;
  write(normalizedName: string, entry: CachedFundIdentity): Promise<void>;
}

/** The Admin SDK store. The id is the URI-encoded NORMALISED name: a slash must not become a path. */
export function createAdminFundIdentityCacheStore(
  db: Pick<typeof adminDb, 'collection'> = adminDb
): FundIdentityCacheStore {
  const documentOf = (normalizedName: string) =>
    db.collection(FUND_IDENTITY_CACHE_COLLECTION).doc(encodeURIComponent(normalizedName));
  return {
    async read(normalizedName) {
      try {
        const snapshot = await documentOf(normalizedName).get();
        if (!snapshot.exists) return null;
        const data = snapshot.data() as Partial<CachedFundIdentity> | undefined;
        if (!data || typeof data.query !== 'string' || typeof data.status !== 'string') return null;
        return {
          query: data.query,
          status: data.status,
          identity: data.identity,
          candidateCount: typeof data.candidateCount === 'number' ? data.candidateCount : 0,
          fetchedAt: typeof data.fetchedAt === 'string' ? data.fetchedAt : new Date(0).toISOString(),
        };
      } catch (error) {
        console.error('[fund-identity] Failed to read the cache for', normalizedName, error);
        return null;
      }
    },
    async write(normalizedName, entry) {
      await documentOf(normalizedName).set(removeUndefinedDeep(entry));
    },
  };
}

/** The search as the service sees it; `null` means «could not ask», never «no such fund». */
export interface FundIdentitySource {
  search(query: string): Promise<EodhdFundHit[] | null>;
}

function asHits(payload: unknown): EodhdFundHit[] | null {
  if (!Array.isArray(payload)) return null;
  return payload
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => ({
      Name: typeof row.Name === 'string' ? row.Name : null,
      ISIN: typeof row.ISIN === 'string' ? row.ISIN : null,
      Currency: typeof row.Currency === 'string' ? row.Currency : null,
      Type: typeof row.Type === 'string' ? row.Type : null,
      Exchange: typeof row.Exchange === 'string' ? row.Exchange : null,
    }));
}

/** EODHD's Search API, read with the server's own token. */
export function createEodhdFundIdentitySource(
  token: string | undefined = process.env.EODHD_API_TOKEN,
  fetchImpl: typeof fetch = fetch
): FundIdentitySource {
  return {
    async search(query) {
      const apiToken = token?.trim();
      if (!apiToken) return null;
      const url =
        `${EODHD_SEARCH_URL}/${encodeURIComponent(query)}` +
        `?api_token=${encodeURIComponent(apiToken)}&type=fund&limit=${EODHD_SEARCH_LIMIT}&fmt=json`;
      try {
        const response = await fetchImpl(url, {
          cache: 'no-store',
          signal: AbortSignal.timeout(EODHD_TIMEOUT_MS),
        });
        if (!response.ok) {
          console.error('[fund-identity] EODHD answered', response.status, 'for', query);
          return null;
        }
        return asHits(await response.json());
      } catch (error) {
        console.error('[fund-identity] EODHD search failed for', query, error);
        return null;
      }
    },
  };
}

export const eodhdFundIdentitySource: FundIdentitySource = createEodhdFundIdentitySource();

// ─── Freshness ───────────────────────────────────────────────────────────────

function isFresh(entry: CachedFundIdentity, now: Date): boolean {
  const fetched = Date.parse(entry.fetchedAt);
  if (Number.isNaN(fetched)) return false;
  const ttl = entry.status === 'matched' ? FUND_IDENTITY_TTL_MS : FUND_IDENTITY_MISS_TTL_MS;
  return now.getTime() - fetched < ttl;
}

// ─── Resolution ──────────────────────────────────────────────────────────────

export interface ResolveFundIdentitiesOptions {
  now?: Date;
  source?: FundIdentitySource;
  store?: FundIdentityCacheStore;
  /** Marks `db` once the cache is read and `eodhd` once EODHD has answered (the route's header). */
  timing?: ServerTimingRecorder;
}

export interface FundIdentityCounts {
  /** Names served from the cache because fresh. */
  hits: number;
  /** Names asked to EODHD — missing, expired — whether it answered or not. */
  fetched: number;
  /** Names nothing at all could be said about (no token, EODHD refusing, no cached answer). */
  unavailable: number;
}

export interface ResolvedFundIdentities {
  response: FundIdentitiesResponse;
  counts: FundIdentityCounts;
}

function toResult(query: string, entry: CachedFundIdentity): FundIdentityResult {
  return {
    query,
    status: entry.status,
    ...(entry.identity ? { identity: entry.identity } : {}),
    candidateCount: entry.candidateCount,
  };
}

/**
 * The identity of each product name given, in the order asked, with the counts of where they came
 * from. Names are deduplicated by their normalised form (the cache key and the key the import's
 * preview joins on) and bounded to `MAX_IDENTITY_QUERIES`.
 */
export async function resolveFundIdentities(
  names: string[],
  options: ResolveFundIdentitiesOptions = {}
): Promise<ResolvedFundIdentities> {
  const now = options.now ?? new Date();
  const source = options.source ?? eodhdFundIdentitySource;
  const store = options.store ?? createAdminFundIdentityCacheStore();

  const seen = new Set<string>();
  const queries: Array<{ query: string; normalized: string }> = [];
  for (const raw of names) {
    const query = raw.trim();
    if (query === '') continue;
    const normalized = normalizeFundName(query);
    if (normalized === '' || seen.has(normalized)) continue;
    seen.add(normalized);
    queries.push({ query, normalized });
  }
  const bounded = queries.slice(0, MAX_IDENTITY_QUERIES);

  const cached = await Promise.all(
    bounded.map(({ normalized }) =>
      store.read(normalized).catch((error: unknown) => {
        console.error('[fund-identity] Failed to read the cache for', normalized, error);
        return null;
      })
    )
  );
  options.timing?.mark('db');

  const counts: FundIdentityCounts = { hits: 0, fetched: 0, unavailable: 0 };
  const results: FundIdentityResult[] = [];

  // Sequential on purpose: EODHD's free plan is a handful of calls a day, and a burst of ten is
  // exactly what gets a token throttled. The cache makes this a rare path.
  for (const [index, { query, normalized }] of bounded.entries()) {
    const entry = cached[index];
    if (entry && isFresh(entry, now)) {
      counts.hits += 1;
      results.push(toResult(query, entry));
      continue;
    }

    counts.fetched += 1;
    // The STRATEGY, not the whole name: EODHD's search is a token AND, and the share-class block
    // («C» (EUR) ACC) narrows it to nothing. Which class is which is the local match's job.
    const hits = await source.search(buildFundIdentityQuery(query));
    if (hits === null) {
      // EODHD could not be asked. A cached answer — even one past its TTL — is still the best
      // reading there is: «non lo so» for a fund identified yesterday would be a regression, not a
      // fact. Only a name nothing was ever known about is `unavailable`.
      if (entry) {
        results.push(toResult(query, entry));
        continue;
      }
      counts.unavailable += 1;
      results.push({ query, status: 'unavailable', candidateCount: 0 });
      continue;
    }

    const match = matchFundIdentity(query, hits);
    const freshEntry: CachedFundIdentity = {
      query,
      status: match.status,
      ...(match.identity ? { identity: match.identity } : {}),
      candidateCount: match.candidateCount,
      fetchedAt: now.toISOString(),
    };
    try {
      store.write(normalized, freshEntry).catch((error: unknown) => {
        console.error('[fund-identity] Failed to write the cache for', query, error);
      });
    } catch (error) {
      console.error('[fund-identity] Failed to write the cache for', query, error);
    }
    results.push(toResult(query, freshEntry));
  }

  options.timing?.mark('eodhd');
  return { response: { results }, counts };
}
