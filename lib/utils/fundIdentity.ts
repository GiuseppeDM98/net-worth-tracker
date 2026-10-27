/**
 * Fund identity — from a broker's product name to the fund's ISIN, through EODHD's Search API.
 *
 * WHY THIS EXISTS. A broker export names a fund and gives no code at all: the Azimut «Gestito»
 * sheet carries `FIDELITY GLOBAL DIVIDEND "A" (EURHDG) ACC` and nothing else. Without an ISIN the
 * app cannot ask for the fund's published mix (so its class stays a guess) and cannot recognise the
 * position on a later import except by that name. EODHD's `GET /api/search/{query}?type=fund`
 * answers a fund's listings with `{ Name, ISIN, Currency }`, so the identity can be found instead
 * of guessed.
 *
 * THE MATCH IS STRICT ON PURPOSE, and this module is the ONE judgement on it. A wrong ISIN is
 * worse than no ISIN: it gives a position someone else's price and someone else's class. So a name
 * is decomposed — strategy words, share class, currency, hedge, accumulation vs distribution — and
 * a candidate must agree on EVERY part; «Tactical Defensive» is not «Defensive», class Y is not
 * class A, `(hedged)` is not the unhedged class. Zero candidates and two candidates both answer
 * `none`/`ambiguous`, never a pick: the preview says so and the human decides.
 *
 * PURE and SDK-free: the server runs it, the import preview reads its answer, the tests feed it
 * recordings of EODHD's real answers (`__tests__/fundIdentity.test.ts`).
 */

/** One hit of EODHD's Search API, as far as identity is concerned. */
export interface EodhdFundHit {
  Name?: string | null;
  ISIN?: string | null;
  Currency?: string | null;
  Type?: string | null;
  Exchange?: string | null;
}

/** The identity of a fund: what to store, and what to look the fund up by from now on. */
export interface FundIdentity {
  isin: string;
  /** EODHD's own name for the share class — the one the ISIN actually belongs to. */
  name: string;
  currency: string;
}

/**
 * `matched` — exactly one candidate agreed on every part of the name.
 * `ambiguous` — more than one did; the caller must not pick.
 * `none` — nothing agreed. `candidateCount` says whether EODHD knew nothing or knew other classes.
 */
export type FundIdentityStatus = 'matched' | 'ambiguous' | 'none';

export interface FundIdentityMatch {
  status: FundIdentityStatus;
  identity?: FundIdentity;
  /** How many hits EODHD answered, matched or not — the difference between «sconosciuto» and «altre classi». */
  candidateCount: number;
}

// ─── Decomposing a fund's name ───────────────────────────────────────────────

const CURRENCIES = new Set([
  'EUR', 'USD', 'GBP', 'GBX', 'CHF', 'JPY', 'AUD', 'CAD', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK',
  'PLN', 'BRL', 'INR', 'CNH', 'CNY', 'NZD', 'ZAR',
]);

/** Accumulating share classes. */
const ACCUMULATION_MARKERS = new Set(['ACC', 'ACCUMULATION', 'ACCUMULATING']);
/**
 * Distributing share classes, including the `M-INCOME`/`Q-INCOME` family Fidelity uses: a
 * distribution is NOT an accumulation, and the Azimut name always says which one it holds.
 */
const DISTRIBUTION_MARKERS = new Set([
  'DIST', 'DISTRIBUTION', 'DISTRIBUTING', 'INCOME', 'MINCOME', 'QINCOME', 'INC',
]);

const HEDGE_WORDS = new Set(['HEDGED', 'HEDGE']);
/** `EURHDG`, `USDHDG` — the broker's own way of writing «hedged into EUR». */
const HEDGE_SUFFIX = /^(?:EUR|USD|GBP|CHF|JPY)HDG$/;

/** Words that name the wrapper, not the strategy: «… Fund A (USD)» and «… Funds …» are one fund. */
const NOISE_WORDS = new Set(['FUND', 'FUNDS', 'CLASS', 'SICAV', 'THE', 'SUB']);

interface FundNameParts {
  /** Family + strategy, noise words dropped, as a set — what two names must agree on. */
  strategy: Set<string>;
  /**
   * The same words in order, noise INCLUDED — what to send EODHD. The search is a token AND:
   * asking `R-CO VALOR "C" (EUR) ACC` answers ZERO hits while `R CO VALOR` answers every class of
   * the fund (measured 2026-10-22), so the share-class block must be stripped and the wrapper words
   * may stay.
   */
  strategyTokens: string[];
  shareClass?: string;
  currency?: string;
  hedged: boolean;
  accDist?: 'acc' | 'dist';
}

function tokenize(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Splits a fund name into the parts a candidate must agree on. The descriptor is the TRAILING
 * block — currency, acc/dist, hedge — and the share class is the token right before it; everything
 * before that is the strategy. A name without such a block (`… Global Brands Fund AX`) carries no
 * currency to agree on, so it can never match: rejecting is the safe direction.
 */
export function parseFundName(name: string): FundNameParts {
  const tokens = tokenize(name);
  let hedged = false;
  let currency: string | undefined;
  let accDist: 'acc' | 'dist' | undefined;
  let index = tokens.length - 1;

  for (; index >= 0; index -= 1) {
    const token = tokens[index];
    if (HEDGE_WORDS.has(token) || HEDGE_SUFFIX.test(token)) {
      hedged = true;
      // «EURHDG» names both the hedge AND the currency it hedges into.
      if (HEDGE_SUFFIX.test(token)) currency = currency ?? token.slice(0, 3);
      continue;
    }
    if (CURRENCIES.has(token)) {
      currency = currency ?? token;
      continue;
    }
    if (ACCUMULATION_MARKERS.has(token)) {
      accDist = accDist ?? 'acc';
      continue;
    }
    if (DISTRIBUTION_MARKERS.has(token)) {
      accDist = accDist ?? 'dist';
      continue;
    }
    break;
  }

  const hasDescriptor = currency !== undefined || accDist !== undefined || hedged;
  let shareClass: string | undefined;
  if (hasDescriptor && index >= 0) {
    shareClass = tokens[index];
    index -= 1;
  }

  const strategyTokens = tokens.slice(0, index + 1);
  const strategy = new Set(strategyTokens.filter((token) => !NOISE_WORDS.has(token)));
  return { strategy, strategyTokens, shareClass, currency, hedged, accDist };
}

function sameStrategy(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const token of left) if (!right.has(token)) return false;
  return true;
}

/** The ONE rule on whether a candidate is the same share class as the name asked about. */
export function sameFundName(left: string, right: string): boolean {
  const a = parseFundName(left);
  const b = parseFundName(right);
  if (!sameStrategy(a.strategy, b.strategy)) return false;
  if (a.currency !== b.currency) return false;
  if (a.hedged !== b.hedged) return false;
  if (a.shareClass === undefined || b.shareClass === undefined) return false;
  if (a.shareClass !== b.shareClass) return false;
  // An accumulator and a distributor are different share classes, but a name that does not say
  // which one it is (many fund houses omit it) is not contradicting anything.
  if (a.accDist !== undefined && b.accDist !== undefined && a.accDist !== b.accDist) return false;
  return true;
}

/** The key a resolved identity is filed under: the product name, case- and spacing-insensitive. */
export function normalizeFundName(name: string): string {
  return tokenize(name).join(' ');
}

/**
 * What to SEND EODHD: the product name without its share-class block. The Search API is a token
 * AND — the full `R-CO VALOR "C" (EUR) ACC` answers NOTHING while `R CO VALOR` answers every class
 * of the fund, hedged and unhedged included (measured 2026-10-22) — so the class, the currency and
 * the acc/dist marker are what the LOCAL match decides, not what the search is narrowed by.
 */
export function buildFundIdentityQuery(name: string): string {
  const { strategyTokens } = parseFundName(name);
  const tokens = strategyTokens.length > 0 ? strategyTokens : tokenize(name);
  return tokens.join(' ');
}

/**
 * The identity EODHD's hits give for the product name, or the reason there is none. Hits without
 * an ISIN are skipped (EODHD lists a few share classes with `ISIN: null`), and duplicates are
 * collapsed by ISIN — the API answers the same instrument twice for two exchanges.
 */
export function matchFundIdentity(productName: string, hits: readonly EodhdFundHit[]): FundIdentityMatch {
  const byIsin = new Map<string, FundIdentity>();
  for (const hit of hits) {
    const isin = typeof hit.ISIN === 'string' ? hit.ISIN.trim().toUpperCase() : '';
    const name = typeof hit.Name === 'string' ? hit.Name.trim() : '';
    if (isin === '' || name === '') continue;
    if (hit.Type !== undefined && hit.Type !== null && hit.Type.toUpperCase() !== 'FUND') continue;
    if (!sameFundName(productName, name)) continue;
    if (!byIsin.has(isin)) {
      byIsin.set(isin, { isin, name, currency: (hit.Currency ?? '').trim().toUpperCase() });
    }
  }

  if (byIsin.size === 1) {
    return { status: 'matched', identity: [...byIsin.values()][0], candidateCount: hits.length };
  }
  return { status: byIsin.size > 1 ? 'ambiguous' : 'none', candidateCount: hits.length };
}
