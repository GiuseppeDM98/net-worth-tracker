/**
 * instrumentProfileService — the profiles of the tickers in view, through ONE cache shared by
 * every account: `instrument-profile-cache/{encodeURIComponent(ticker)}`, read and written only
 * by the Admin SDK (`firestore.rules` denies the client). A ticker new to the app costs ONE Yahoo
 * call, for every user (doc/guide/allocazione.md § Esposizione).
 *
 * The document holds only Yahoo's answers, per module — `fund` and `stock`, each with its own
 * `fetchedAt` — and never anything of a user's. A request that needs a module the document lacks
 * asks Yahoo for THAT module and writes THAT module alone (`mergeFields`), never the other one
 * and never a `merge: true` of the whole document, which would keep yesterday's holdings under
 * an answer that is now empty (AGENTS.md § Firestore Writes). One user's classification can
 * therefore never take another user's holdings away.
 *
 * TTL per module: 30 days for a useful answer, 24 hours for an empty one (a «non letto» must be
 * able to heal). Yahoo failing with a stale answer in cache — useful or empty — the stale one is
 * served, and its `fetchedAt` says how old it is (an old empty answer still dates the footer, and
 * reads «non letto» exactly as no answer would). `force` asks Yahoo whatever the age, and keeps
 * the last cached answer if Yahoo fails.
 *
 * Two stages, timed apart for the route's `Server-Timing` (since 2026-10-05): every cached
 * document is read first, in parallel (`db`), then Yahoo is asked for what is missing, expired or
 * forced (`yahoo`), and the answer counts the modules served from the cache (`hits`) and those
 * asked to Yahoo (`fetched`). The counts travel beside the response, never inside it: the body the
 * route answers stays `{ profiles, oldestFetchedAt }`.
 */
import { adminDb } from '@/lib/firebase/admin';
import { removeUndefinedDeep } from '@/lib/utils/firestoreData';
import type {
  InstrumentFundProfile,
  InstrumentProfile,
  InstrumentProfilesResponse,
  InstrumentStockProfile,
  ProfileModule,
  ProfileRequest,
} from '@/types/exposure';
import type { ServerTimingRecorder } from '@/lib/server/serverTiming';
import { yahooProfileSource, type YahooProfileSource } from './yahooSource';

export const INSTRUMENT_PROFILE_CACHE_COLLECTION = 'instrument-profile-cache';
/** A fund's composition changes slowly; a month is the horizon the tile's footer dates. */
export const USEFUL_PROFILE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** An empty answer is retried daily: a ticker Yahoo did not know yesterday may be listed today. */
export const EMPTY_PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

type ModuleData = { fund: InstrumentFundProfile; stock: InstrumentStockProfile };

/** The cache as the service sees it; injectable so the service is tested against memory. */
export interface ProfileCacheStore {
  /** `null` on a miss AND on a failed read: a cache that cannot be read must never block the answer. */
  read(ticker: string): Promise<InstrumentProfile | null>;
  /** Writes ONE module of the document, leaving the other untouched. */
  writeModule<M extends ProfileModule>(ticker: string, module: M, data: ModuleData[M]): Promise<void>;
}

/** The Admin SDK store. The id is the URI-encoded ticker: a slash or a dot must not become a path. */
export function createAdminProfileCacheStore(db: Pick<typeof adminDb, 'collection'> = adminDb): ProfileCacheStore {
  const documentOf = (ticker: string) => db.collection(INSTRUMENT_PROFILE_CACHE_COLLECTION).doc(encodeURIComponent(ticker));
  return {
    async read(ticker) {
      try {
        const snapshot = await documentOf(ticker).get();
        if (!snapshot.exists) return null;
        const data = snapshot.data() as Partial<InstrumentProfile> | undefined;
        return data ? { ticker, fund: data.fund, stock: data.stock } : null;
      } catch (error) {
        console.error('[instrument-profiles] Failed to read the cache for', ticker, error);
        return null;
      }
    },
    async writeModule(ticker, module, data) {
      await documentOf(ticker).set(removeUndefinedDeep({ ticker, [module]: data }), { mergeFields: ['ticker', module] });
    },
  };
}

// ─── Freshness, per module ───────────────────────────────────────────────────

function isUsefulFund(profile: InstrumentFundProfile): boolean {
  return !!(profile.holdings?.length || profile.sectors?.length || profile.family);
}

function isUsefulStock(profile: InstrumentStockProfile): boolean {
  return !!(profile.sectorKey || profile.longName);
}

function isFresh<M extends ProfileModule>(module: M, data: ModuleData[M], now: Date): boolean {
  const fetched = Date.parse(data.fetchedAt);
  if (Number.isNaN(fetched)) return false;
  const useful = module === 'fund' ? isUsefulFund(data as InstrumentFundProfile) : isUsefulStock(data as InstrumentStockProfile);
  return now.getTime() - fetched < (useful ? USEFUL_PROFILE_TTL_MS : EMPTY_PROFILE_TTL_MS);
}

// ─── Resolution ──────────────────────────────────────────────────────────────

export interface ResolveInstrumentProfilesOptions {
  /** «Aggiorna»: ask Yahoo whatever the age; the last good answer stays if Yahoo fails. */
  force?: boolean;
  now?: Date;
  source?: YahooProfileSource;
  store?: ProfileCacheStore;
  /** Marks `db` once the cache is read and `yahoo` once Yahoo has answered (the route's header). */
  timing?: ServerTimingRecorder;
}

type ResolvedOptions = Required<Omit<ResolveInstrumentProfilesOptions, 'timing'>>;

/** Where the modules of one resolution came from — one count per (ticker, module) asked. */
export interface ProfileResolutionCounts {
  /** Served from the cache because fresh (and not forced). */
  hits: number;
  /** Asked to Yahoo — missing, expired or forced — whether Yahoo answered or not. */
  fetched: number;
}

export interface ResolvedInstrumentProfiles {
  /** The body the route answers: Yahoo's answers and nothing of the user's. */
  response: InstrumentProfilesResponse;
  counts: ProfileResolutionCounts;
}

/**
 * One module of one ticker: the cached answer while fresh (and not forced), else Yahoo's, else
 * the stale cached one, else nothing. A fresh answer is written fire-and-forget, inside a try:
 * the cache failing must never fail the reading.
 */
async function resolveModule<M extends ProfileModule>(
  ticker: string,
  module: M,
  cached: ModuleData[M] | undefined,
  { force, now, source, store }: ResolvedOptions,
  counts: ProfileResolutionCounts,
): Promise<ModuleData[M] | undefined> {
  if (cached && !force && isFresh(module, cached, now)) {
    counts.hits += 1;
    return cached;
  }

  counts.fetched += 1;
  const answer = (module === 'fund' ? await source.fetchFund(ticker, now) : await source.fetchStock(ticker, now)) as ModuleData[M] | null;
  if (!answer) return cached;

  try {
    store.writeModule(ticker, module, answer).catch((error: unknown) => {
      console.error('[instrument-profiles] Failed to write the cache for', ticker, module, error);
    });
  } catch (error) {
    console.error('[instrument-profiles] Failed to write the cache for', ticker, module, error);
  }
  return answer;
}

async function resolveTicker(
  ticker: string,
  modules: Set<ProfileModule>,
  cached: InstrumentProfile | null,
  options: ResolvedOptions,
  counts: ProfileResolutionCounts,
): Promise<InstrumentProfile> {
  const profile: InstrumentProfile = { ticker };
  if (modules.has('fund')) {
    const fund = await resolveModule(ticker, 'fund', cached?.fund, options, counts);
    if (fund) profile.fund = fund;
  }
  if (modules.has('stock')) {
    const stock = await resolveModule(ticker, 'stock', cached?.stock, options, counts);
    if (stock) profile.stock = stock;
  }
  return profile;
}

/**
 * The profiles for the requests, keyed by ticker, and the oldest `fetchedAt` among the modules
 * actually used — what the tile's footer prints — beside the counts of where they came from. A
 * request with an empty ticker is dropped before any `.doc()` (the Admin SDK throws synchronously
 * on an empty id).
 */
export async function resolveInstrumentProfiles(
  requests: ProfileRequest[],
  options: ResolveInstrumentProfilesOptions = {},
): Promise<ResolvedInstrumentProfiles> {
  const resolved: ResolvedOptions = {
    force: options.force ?? false,
    now: options.now ?? new Date(),
    source: options.source ?? yahooProfileSource,
    store: options.store ?? createAdminProfileCacheStore(),
  };

  const modulesByTicker = new Map<string, Set<ProfileModule>>();
  for (const request of requests) {
    const ticker = request.ticker.trim();
    if (ticker === '') continue;
    const modules = modulesByTicker.get(ticker) ?? new Set<ProfileModule>();
    modules.add(request.module);
    modulesByTicker.set(ticker, modules);
  }

  const tickers = Array.from(modulesByTicker.keys());
  const cachedProfiles = await Promise.all(tickers.map((ticker) => resolved.store.read(ticker)));
  options.timing?.mark('db');

  const counts: ProfileResolutionCounts = { hits: 0, fetched: 0 };
  const profiles = await Promise.all(
    tickers.map((ticker, index) => resolveTicker(ticker, modulesByTicker.get(ticker)!, cachedProfiles[index], resolved, counts)),
  );
  options.timing?.mark('yahoo');

  const fetchedAts = profiles
    .flatMap((profile) => [profile.fund?.fetchedAt, profile.stock?.fetchedAt])
    .filter((value): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));

  return {
    response: {
      profiles: Object.fromEntries(profiles.map((profile) => [profile.ticker, profile])),
      oldestFetchedAt: fetchedAts[0] ?? null,
    },
    counts,
  };
}
