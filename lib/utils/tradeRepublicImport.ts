/**
 * Trade Republic read-only bridge — the pure layer behind Impostazioni → Collegamenti.
 *
 * Mirrors `scalableImport.ts` (parse → map → plan, no I/O, no server-only import) but the wire is
 * a different animal in three ways that shaped every decision below.
 *
 * 1. **THE PORTFOLIO CARRIES NO PRICE.** `compactPortfolioByType` returns
 *    `{ isin, averageBuyIn, netSize, virtualSize, status, instrumentType, name }` and nothing
 *    quotable — Trade Republic quotes a security as `ticker` on `ISIN.EXCHANGE`, and the exchange
 *    suffix is not in the portfolio payload. And the obvious fallback does not exist either:
 *    Yahoo answers NO price for a bare ISIN (measured on a stock and an ETF ISIN), so quoting
 *    `holding.isin` priced nothing and every synced position entered at 0 with a G/P of −100%.
 *    New assets are therefore born with `autoUpdatePrice: TRUE` and the best ticker the sync
 *    could resolve — the route's `yahooTicker` first (broker quote, table), the pure
 *    `resolveTrYahooTicker` otherwise — with the preview's per-row field as the last word,
 *    because guessing an exchange suffix would put a wrong price on a real asset, which is
 *    worse than a price the user points at. Consequently the plan has NO price branch at all.
 *    The one deterministic exception is crypto: its pseudo-ISIN (`XF000BTC0017`) carries the
 *    coin code, and Yahoo lists every such coin as `<CODE>-EUR` — so `resolveTrYahooTicker`
 *    writes that symbol directly, and a re-sync repairs a tracked asset whose ticker is still
 *    the raw broker id (never a hand-fixed one).
 * 2. **CASH IS A REAL BALANCE, NOT A RESIDUAL.** Scalable's cash is `valuation − securities −
 *    crypto` because that is all its overview exposes; Trade Republic publishes the cash account
 *    itself (`cash` topic, amounts in MAJOR units — the SDK's `projectCash` maps `amount`
 *    verbatim, no minor-unit division). Nothing is subtracted and nothing can go negative by
 *    arithmetic accident, so there is no residual to declare.
 * 3. **THE SAVINGS PLANS ARE A RULE, NOT A FACT.** A Sparplan ("buy €200 of VWCE on the 1st")
 *    is standing-order state at the broker: it is not a position, not a transaction, and no
 *    `Asset` field holds it. They are DECLARED in the preview and never written — the same
 *    posture the Scalable deposit's interest rate takes (`doc/guide/collegamenti.md`).
 *
 * The `savingsPlans` amount unit is the one figure here that could not be verified against a
 * live account: the SDK passes the topic value through untouched (no `projectMoney` equivalent,
 * unlike `cash`), and Trade Republic's web client sends it in minor units. It is therefore read
 * through ONE named constant, and the preview prints the computed figure so a wrong assumption
 * is visible rather than plausible. Do not inline a `100` anywhere else.
 *
 * Quantity rule (unchanged from Scalable, and the ledger owns it): for ledger types
 * (stock/etf/bond/crypto/commodity) `quantity`/`averageCost` are replay-derived and are NEVER
 * written by the sync. A mismatch is a drift warning to reconcile with a Registro adjustment.
 */

import type { Asset, AssetClass, AssetFormData, AssetType } from '@/types/assets';
import type { InstrumentFundAllocation } from '@/types/exposure';
import { isLedgerAssetType } from '@/types/assetTransactions';
import { resolveYahooSymbolForIsin } from '@/lib/utils/yahooSymbolForIsin';
import { readFundComposition, usesPublishedFundMix } from '@/lib/utils/fundComposition';

// ─── Input shapes (what the three topics hold) ───────────────────────────────

export interface TrHoldingInput {
  isin: string;
  name: string;
  /** Raw `instrumentType` from the broker, as sent (e.g. "etf"). */
  rawType: string;
  /** Raw `categoryType` of the enclosing bucket — the fallback when `instrumentType` is unknown. */
  rawCategory: string;
  /** Units actually held (`netSize`). `virtualSize` also counts pending orders and is NOT this. */
  quantity: number;
  /** Broker average buy-in, per unit, native currency (`averageBuyIn`). */
  averageCost?: number;
  /**
   * Current quote per unit, filled in by the READ ROUTE — first from the broker's own ticker
   * topic (EUR, authoritative), then from the ordinary Yahoo price service. NOT by the
   * positions payload, which publishes no quote. Absent when every lookup failed, and the plan
   * then WARNS rather than creating the asset silently worthless. Attached only when the quote
   * is in EUR: a foreign-currency price under the EUR holding currency would read as euros.
   */
  price?: number;
  /**
   * The Yahoo symbol this holding was priced under, when one is known — the curated table, the
   * crypto derivation, in that order. The plan writes it as the
   * asset's ticker so every later refresh keeps working; the `isin` stays the match key.
   * Filled by the READ ROUTE alongside `price` (and for the paste-JSON path, absent — the
   * pure layer still resolves what it can).
   */
  yahooTicker?: string;
  /** Broker status string (`status`), e.g. "active". */
  status: string;
  currency: string;
}

export interface TrCashInput {
  /** MAJOR units (euros, not cents) — see the header. */
  balance: number;
  currency: string;
  accountNumber: string;
}

export interface TrSavingsPlanInput {
  id: string;
  /** `ISIN.EXCHANGE` as the broker sends it; the ISIN is the part before the dot. */
  instrumentId: string;
  isin?: string;
  /** The plan's instalment, in euros, derived from `rawAmount` through the divisor below. */
  amount: number;
  /** The value as the broker sent it, kept so a wrong divisor is visible and not merely wrong. */
  rawAmount: number;
  /** `monthly` | `weekly` | … as sent. */
  interval: string;
  nextExecutionDate?: string;
  paused: boolean;
  createdAt?: string;
}

/**
 * `savingsPlans[].amount` arrives in MINOR units (cents) while `cash[].amount` arrives in major
 * ones — the same API, two conventions, and the SDK only normalizes the second. Unverified
 * against a live account; the preview prints the computed figure so the assumption is checkable
 * at a glance. One constant, never an inline literal.
 */
export const SAVINGS_PLAN_MINOR_UNIT_DIVISOR = 100;

// ─── Tolerant readers ─────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * German-decimal tolerant number read. Trade Republic sends `netSize`/`averageBuyIn` as STRINGS
 * and the decimal separator is not guaranteed to be a dot, so `parseFloat` alone silently reads
 * `1.234,56` as `1.234`.
 */
function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
    if (normalized === '') return undefined;
    // A thousands separator would leave a second dot; keep only the last as the decimal point.
    const lastDot = normalized.lastIndexOf('.');
    const cleaned =
      lastDot === -1
        ? normalized
        : `${normalized.slice(0, lastDot).replace(/\./g, '')}${normalized.slice(lastDot)}`;
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return undefined;
}

function toIsoDate(value: unknown): string | undefined {
  const text = toText(value);
  if (!text) return undefined;
  // A bare `YYYY-MM-DD` is a calendar day, not an instant: `new Date` would read it as UTC
  // midnight and print the previous day in Rome. Keep the day as written.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** User-facing parse failure: the message is shown verbatim in the tile's reading line. */
export class TrParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrParseError';
  }
}

// ─── Holdings ────────────────────────────────────────────────────────────────

/**
 * Parse a `compactPortfolioByType` payload into held positions.
 *
 * A row is kept when it has an ISIN, a POSITIVE `netSize` and an active status — the same
 * `isHeld` gate the rest of the app uses (`quantity > 0`). `virtualSize` is deliberately not
 * read: it counts orders that have not settled, so a pending sell would otherwise read as a
 * position the user no longer holds.
 */
export function parseTrHoldings(payload: unknown): { holdings: TrHoldingInput[]; skipped: number } {
  const categories = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload['categories'])
      ? (payload['categories'] as unknown[])
      : null;
  if (!categories) {
    throw new TrParseError('Nessuna posizione trovata nella risposta del broker.');
  }

  const holdings: TrHoldingInput[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const category of categories) {
    if (!isRecord(category)) {
      skipped += 1;
      continue;
    }
    const rawCategory = toText(category['categoryType']) ?? '';
    const positions = Array.isArray(category['positions']) ? (category['positions'] as unknown[]) : [];
    for (const position of positions) {
      if (!isRecord(position)) {
        skipped += 1;
        continue;
      }
      const isin = toText(position['isin'])?.toUpperCase();
      if (!isin) {
        skipped += 1;
        continue;
      }
      // A duplicated ISIN keeps its first row: two rows for one instrument would otherwise
      // produce two «new» assets in the same preview.
      if (seen.has(isin)) {
        skipped += 1;
        continue;
      }
      const quantity = toNumber(position['netSize']) ?? 0;
      const status = (toText(position['status']) ?? '').toLowerCase();
      if (quantity <= 0 || (status !== '' && !isHeldStatus(status))) {
        skipped += 1;
        continue;
      }
      seen.add(isin);
      holdings.push({
        isin,
        name: toText(position['name']) ?? isin,
        rawType: toText(position['instrumentType']) ?? '',
        rawCategory,
        quantity,
        averageCost: toNumber(position['averageBuyIn']),
        status,
        currency: 'EUR',
      });
    }
  }

  return { holdings, skipped };
}

/**
 * A position is held when the broker says so. Anything that is not an explicit inactive marker
 * counts as held: an UNRECOGNIZED status must not silently delete a position from the preview,
 * because the worst outcome here is a real holding quietly missing from the user's net worth.
 */
function isHeldStatus(status: string): boolean {
  return !/(inactive|sold|closed|deleted|archived|draft)/.test(status);
}

// ─── Cash ────────────────────────────────────────────────────────────────────

/**
 * Parse the `cash` topic. Trade Republic returns one entry per (account, currency) pair.
 *
 * A LIST, not a single balance, and deliberately not a sum: an account holding a cash deposit
 * reports it beside the settleable cash, and `doc/guide/col Connections` learned the hard way on
 * Scalable that two balances at one broker are two accounts, never one figure. The plan tracks the
 * first and WARNS about the rest by amount — a sum would quietly merge them.
 *
 * A foreign-currency balance is skipped and counted rather than converted: the payload carries no
 * rate, and inventing one is how a euro figure becomes a wrong euro figure.
 */
export function parseTrCash(payload: unknown): { balances: TrCashInput[]; skipped: number } {
  const rows = Array.isArray(payload) ? payload : null;
  if (!rows) {
    throw new TrParseError('Nessun saldo di liquidità nella risposta del broker.');
  }
  const balances: TrCashInput[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (!isRecord(row)) {
      skipped += 1;
      continue;
    }
    const currency = (toText(row['currencyId']) ?? 'EUR').toUpperCase();
    const amount = toNumber(row['amount']);
    if (amount === undefined || currency !== 'EUR') {
      skipped += 1;
      continue;
    }
    balances.push({ balance: amount, currency, accountNumber: toText(row['accountNumber']) ?? '' });
  }
  return { balances, skipped };
}

// ─── Savings plans (Sparpläne) ───────────────────────────────────────────────

/** Parse the `savingsPlans` topic. Never throws on an empty list: no plan is a real reading. */
export function parseTrSavingsPlans(payload: unknown): TrSavingsPlanInput[] {
  const rows =
    Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload['savingsPlans'])
      ? (payload['savingsPlans'] as unknown[])
      : [];
  const plans: TrSavingsPlanInput[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = toText(row['id']);
    const instrumentId = toText(row['instrumentId']);
    if (!id || !instrumentId) continue;
    const rawAmount = toNumber(row['amount']);
    if (rawAmount === undefined) continue;
    // `ISIN.EXCHANGE`: the ISIN is what the app matches on, the exchange suffix is broker-local.
    const [isin] = instrumentId.split('.');
    plans.push({
      id,
      instrumentId,
      ...(isin ? { isin: isin.toUpperCase() } : {}),
      amount: rawAmount / SAVINGS_PLAN_MINOR_UNIT_DIVISOR,
      rawAmount,
      interval: toText(row['interval']) ?? 'monthly',
      nextExecutionDate: toIsoDate(row['nextExecutionDate']),
      paused: row['paused'] === true,
      createdAt: toIsoDate(row['createdAt']),
    });
  }
  return plans;
}

/** The securities account number, needed to ask for savings plans at all. */
export function parseTrSecuritiesAccountNumber(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const accounts = Array.isArray(payload['accounts']) ? (payload['accounts'] as unknown[]) : [];
  for (const account of accounts) {
    if (!isRecord(account)) continue;
    const number = toText(account['securitiesAccountNumber']);
    if (number) return number;
  }
  return null;
}

// ─── Broker type → AssetType/AssetClass ──────────────────────────────────────

/**
 * Best-effort mapping of Trade Republic's `instrumentType`, falling back to the enclosing
 * `categoryType`. The broker vocabulary is not contractual, so an unknown value falls back to
 * ETF/equity AND is flagged `typeUncertain` — the preview names it and the user corrects it on
 * Patrimonio. Same rule as `mapScalableType`, deliberately not a shared map: the two brokers
 * publish different vocabularies and merging them would make one broker's string fix the other's.
 */
const TR_TYPE_MAP: Record<string, { type: AssetType; assetClass: AssetClass }> = {
  STOCK: { type: 'stock', assetClass: 'equity' },
  EQUITY: { type: 'stock', assetClass: 'equity' },
  SHARE: { type: 'stock', assetClass: 'equity' },
  ETF: { type: 'etf', assetClass: 'equity' },
  FUND: { type: 'etf', assetClass: 'equity' },
  MUTUALFUND: { type: 'etf', assetClass: 'equity' },
  BOND: { type: 'bond', assetClass: 'bonds' },
  FIXEDINCOME: { type: 'bond', assetClass: 'bonds' },
  CRYPTO: { type: 'crypto', assetClass: 'crypto' },
  COIN: { type: 'crypto', assetClass: 'crypto' },
  CERTIFICATE: { type: 'commodity', assetClass: 'commodity' },
  COMMODITY: { type: 'commodity', assetClass: 'commodity' },
  DERIVATIVE: { type: 'commodity', assetClass: 'commodity' },
};

export interface MappedTrType {
  type: AssetType;
  assetClass: AssetClass;
  typeUncertain: boolean;
}

export function mapTrType(rawType: string, rawCategory = ''): MappedTrType {
  for (const candidate of [rawType, rawCategory]) {
    const key = candidate.toUpperCase().replace(/[^A-Z]/g, '');
    if (!key) continue;
    const mapped = TR_TYPE_MAP[key];
    if (mapped) return { ...mapped, typeUncertain: false };
  }
  return { type: 'etf', assetClass: 'equity', typeUncertain: true };
}

/** Italian 26% on gains, 12.5% on bonds — the same defaults the dialogs suggest. */
export function defaultTrTaxRateFor(type: AssetType): number {
  return type === 'bond' ? 12.5 : 26;
}

/**
 * The Yahoo symbol for a Trade Republic position's ISIN, or null when none is known.
 *
 * Yahoo quotes NEITHER real ISINs (measured: `quote('US0378331005')` → no price) NOR the
 * pseudo-ISNs Trade Republic assigns to crypto (`XF000BTC0017` — `XF` is the user-assigned
 * ISO block for exchange-issued identifiers, then the coin code, then digits). So the symbol
 * has to come from somewhere, and there are exactly two honest sources:
 *
 *   1. **CRYPTO, derived.** The pseudo-ISIN carries the coin code and Yahoo lists every such
 *      coin as `<CODE>-EUR` (measured: `BTC-EUR` → 73.340,13 €). Deterministic, no table.
 *   2. **A curated table for the instruments a real account actually holds.** The alternative
 *      is guessing the exchange suffix, which puts a WRONG price on a real asset — and the
 *      suffix is not in the payload, so there is no way to derive it. Each entry below was
 *      resolved against Yahoo and its quote verified to exist.
 *
 * Everything unmapped returns null: the asset is then created with the ISIN as ticker and the
 * preview asks for the symbol (see `applyTrTickerOverride`). Never invent one.
 */
export const TR_YAHOO_TICKER_BY_ISIN: Readonly<Record<string, string>> = {
  // Stocks — single listing, so the symbol is unambiguous.
  US0231351067: 'AMZN', // Amazon.com
  US4592001014: 'IBM', // IBM
  US5951121038: 'MU', // Micron Technology
  US88160R1014: 'TSLA', // Tesla
  CH1134540470: 'ONON', // On Holding
  // SpaceX and Bending Spoons are LISTED (measured `SPCX` 149,24 $ and `BSP` 32,76 $ on
  // Nasdaq) — not private, as a stale assumption once said. `BSP` and not `BST`: that symbol
  // belongs to an unrelated BlackRock fund.
  US84615Q1031: 'SPCX', // SpaceX (Space Exploration Technologies)
  IT0005717696: 'BSP', // Bending Spoons
  // Stocks with a EUR listing.
  NL00150001Q9: 'STLAM.MI', // Stellantis (Euronext Milan)
  DE0007664039: 'VOW3.DE', // Volkswagen Vorzugsaktie
};
// The ETF rows that used to live here moved to `lib/utils/yahooSymbolForIsin.ts`, and three of them
// were wrong — `IE00B3VTMJ91` was paired with `SWDA.MI`, which OpenFIGI measures as the London/Milan
// listing of a DIFFERENT fund (IE00B4L5Y983), and two more echoed their own ISIN back with a `.SG`
// suffix, which is not a ticker at all. One table, in a module both brokers read, is what stops the
// next broker from growing its own mismatched copy. See CORRECTED_ISIN_PAIRS for the audit.

export function resolveTrYahooTicker(holding: TrHoldingInput): string | null {
  const { type } = mapTrType(holding.rawType, holding.rawCategory);
  if (type === 'crypto') {
    const coin = /^XF000([A-Z]{2,12})\d+$/.exec(holding.isin)?.[1];
    return coin ? `${coin}-EUR` : null;
  }
  // The shared fund catalogue first, this account's own stock table second. A fund's identity is a
  // public fact both brokers need, so it is written down once; a single stock's listing is
  // whichever exchange this account holds it on, so it stays here.
  return resolveYahooSymbolForIsin(holding.isin) ?? TR_YAHOO_TICKER_BY_ISIN[holding.isin.toUpperCase()] ?? null;
}

/**
 * A fresh `AssetFormData` for a Trade Republic position not yet tracked.
 *
 * `autoUpdatePrice: TRUE` — the opposite of the Scalable bridge, and the reason is in the header:
 * this broker publishes no quote with the position, so the price comes from the ordinary Yahoo
 * path, both now (filled in by the read route) and on every later refresh.
 *
 * The `ticker` is the Yahoo symbol when one is known (`holding.yahooTicker` from the route,
 * else the pure `resolveTrYahooTicker`), otherwise the ISIN — which Yahoo CANNOT quote, so the
 * asset enters at 0 until the user sets a real symbol (in the preview, or later on
 * Patrimonio). The `isin` field always keeps the broker identifier: that is what the next
 * sync matches on.
 *
 * `currentPrice` falls back to 0 when the quote lookup failed, and the plan pairs that with a
 * warning naming the position. A created asset at 0 is visible and fixable; a position missing
 * from the portfolio is neither.
 *
 * `allocation` is the fund's published mix, fetched by the caller before the preview. When Yahoo
 * answered one, the position is born split across its real classes (`composition`) and its own
 * class is the largest leg — the same rule Intesa and Azimut read, through
 * `readFundComposition`.
 */
function mapTrHoldingWithComposition(
  holding: TrHoldingInput,
  allocation?: InstrumentFundAllocation | null,
): { formData: AssetFormData; measured: boolean } {
  const { type, assetClass } = mapTrType(holding.rawType, holding.rawCategory);
  const reading = usesPublishedFundMix(type)
    ? readFundComposition(allocation, assetClass)
    : {
        composition: [],
        assetClass,
        measured: false,
      };
  return {
    formData: {
      ticker: holding.yahooTicker ?? resolveTrYahooTicker(holding) ?? holding.isin,
      displayTicker: holding.name,
      name: holding.name,
      type,
      assetClass: reading.assetClass,
      currency: holding.currency,
      quantity: holding.quantity,
      ...(reading.composition.length > 0 ? { composition: reading.composition } : {}),
      ...(holding.averageCost !== undefined && holding.averageCost > 0
        ? { averageCost: holding.averageCost }
        : {}),
      taxRate: defaultTrTaxRateFor(type),
      currentPrice: holding.price ?? 0,
      isLiquid: true,
      autoUpdatePrice: true,
      isin: holding.isin,
      exchange: 'Trade Republic',
    },
    measured: reading.measured,
  };
}

export function mapTrHoldingToAssetFormData(
  holding: TrHoldingInput,
  allocation?: InstrumentFundAllocation | null,
): AssetFormData {
  return mapTrHoldingWithComposition(holding, allocation).formData;
}

// ─── Import plan (the preview) ───────────────────────────────────────────────

/**
 * No `price-update` kind, unlike Scalable: this bridge has no price to compare (§1 of the
 * header). The plan is therefore `new` / `drift-only` / `composition-update` / `unchanged`.
 */
export type TrHoldingDiffKind = 'new' | 'drift-only' | 'composition-update' | 'unchanged';

export interface TrHoldingDiff {
  kind: TrHoldingDiffKind;
  holding: TrHoldingInput;
  /** Creation payload for `kind === 'new'`; composition patch preview otherwise. */
  formData: AssetFormData;
  existingAssetId?: string;
  existingName?: string;
  /** Carried through the metadata write so a composition update cannot wipe a rate. */
  existingTaxRate?: number;
  /** Carried through the metadata write so a composition update cannot wipe the alias. */
  existingDisplayTicker?: string | null;
  /** Broker quantity minus tracked quantity — a number to reconcile, never an auto-write. */
  quantityDrift: number;
  typeUncertain: boolean;
  /**
   * The tracked asset had NO composition and this import read the fund's published mix: fill it.
   * A composition the user already typed is NEVER overwritten — not even with a fresher one.
   */
  compositionUpdate: boolean;
}

export interface TrCashPlan {
  balance: number;
  currency: string;
  accountNumber: string;
}

export interface TrSavingsPlanRow {
  plan: TrSavingsPlanInput;
  /** The tracked asset the plan buys, when one matches the ISIN — the number a reader wants. */
  trackedAssetId?: string;
  trackedAssetName?: string;
}

export interface TrImportPlan {
  holdings: TrHoldingDiff[];
  /** Null when the cash read produced nothing usable: positions sync without a balance. */
  cash: TrCashPlan | null;
  /** Always an array: no savings plan is a real reading, and a declared one, never a write. */
  savingsPlans: TrSavingsPlanRow[];
  warnings: string[];
  stats: {
    holdingCount: number;
    newCount: number;
    driftCount: number;
    /** Existing funds whose empty composition this import fills from the published mix. */
    compositionUpdateCount: number;
    unchangedCount: number;
    skippedCount: number;
    savingsPlanCount: number;
  };
}

const QTY_EPS = 1e-6;

export type TrExistingAsset = Pick<
  Asset,
  'id' | 'name' | 'isin' | 'type' | 'quantity' | 'ticker' | 'composition' | 'taxRate' | 'displayTicker'
>;

/**
 * Apply the preview's per-row ticker override to a creation payload. A blank override keeps
 * the planned ticker: the field is an opt-in correction, and an accidental wipe must not
 * silently re-point the asset at the unquotable ISIN.
 */
export function applyTrTickerOverride(formData: AssetFormData, ticker: string | undefined): AssetFormData {
  const trimmed = ticker?.trim();
  if (!trimmed || trimmed === formData.ticker) return formData;
  return { ...formData, ticker: trimmed };
}

/**
 * Diff broker positions against the tracked assets (matched by ISIN). Only two things can come
 * out of it: a position to create, and a quantity mismatch to reconcile. There is no price write
 * and there is no quantity write — the ledger owns both.
 *
 * `allocations` is Yahoo's published mix per identity (ISIN or Yahoo ticker), fetched by the caller
 * before the plan is built. It is used twice: a NEW fund stores it as `composition`, and an
 * EXISTING fund with no composition gets it filled — so hybrid funds imported before this existed
 * become visible in «Composizione» on the next import without touching a split the user typed.
 */
export function buildTrImportPlan(
  holdings: TrHoldingInput[],
  cashBalances: TrCashInput[],
  savingsPlans: TrSavingsPlanInput[],
  existingAssets: TrExistingAsset[],
  allocations: Record<string, InstrumentFundAllocation> = {},
): TrImportPlan {
  const byIsin = new Map<string, TrExistingAsset>();
  for (const asset of existingAssets) {
    const isin = asset.isin?.trim().toUpperCase();
    if (isin && !byIsin.has(isin)) byIsin.set(isin, asset);
  }

  const warnings: string[] = [];
  const diffs: TrHoldingDiff[] = holdings.map((holding) => {
    const existing = byIsin.get(holding.isin);
    const ticker = holding.yahooTicker ?? resolveTrYahooTicker(holding);
    const allocation = allocations[holding.isin] ?? (ticker ? allocations[ticker] : undefined);
    const { formData, measured } = mapTrHoldingWithComposition(holding, allocation);
    const typeUncertain = mapTrType(holding.rawType, holding.rawCategory).typeUncertain;
    const composition = formData.composition ?? [];
    const hasComposition = composition.length > 0;
    if (!existing) {
      // The published mix places the instrument even when the broker's type string is unknown: a
      // warning that calls it «ETF azionario» beside a class the market measured would contradict
      // the asset the import is about to create.
      if (typeUncertain && !measured) {
        warnings.push(
          `«${holding.name}»: tipo broker «${holding.rawType || holding.rawCategory || 'sconosciuto'}» non riconosciuto, proposto come ETF azionario — verifica su Patrimonio.`
        );
      }
      // A position born at 0 would silently shrink the net worth by its whole value, so the
      // missing quote is named instead. The asset is still created: it is a real holding. But
      // the price does NOT arrive on its own — Yahoo cannot quote the ISIN the ticker holds —
      // so the warning says where to put the real Yahoo symbol (the row's ticker field, or
      // later on Patrimonio): that is what every later refresh reads.
      if (holding.price === undefined) {
        warnings.push(
          `«${holding.name}»: prezzo non trovato (Yahoo non quota l'ISIN) — la posizione entra a 0: scrivi il simbolo Yahoo nella riga qui sotto (es. VWCE.MI, AAPL, BTC-EUR) oppure impostalo dopo su Patrimonio.`
        );
      }
      return {
        kind: 'new',
        holding,
        formData,
        quantityDrift: 0,
        typeUncertain,
        compositionUpdate: false,
      } satisfies TrHoldingDiff;
    }
    const drift = holding.quantity - existing.quantity;
    // The drift gate is the ledger's, not the broker's: a cash or realestate asset matched by
    // ISIN is not replay-derived, so a mismatch there is a coincidence, not a reconciliation.
    const hasDrift = isLedgerAssetType(existing.type) && Math.abs(drift) > QTY_EPS;
    if (hasDrift) {
      warnings.push(
        `«${existing.name}»: il broker riporta ${holding.quantity} quote contro ${existing.quantity} nel Registro — la quantità non viene toccata (riconcilia con una rettifica).`
      );
    }
    const hasExistingComposition = (existing.composition?.length ?? 0) > 0;
    // Fill an EMPTY composition only: the user's own split is a statement, not a cache.
    const compositionUpdate = !hasExistingComposition && hasComposition;
    return {
      kind: hasDrift ? 'drift-only' : compositionUpdate ? 'composition-update' : 'unchanged',
      holding,
      formData,
      existingAssetId: existing.id,
      existingName: existing.name,
      existingTaxRate: existing.taxRate,
      existingDisplayTicker: existing.displayTicker,
      quantityDrift: hasDrift ? drift : 0,
      typeUncertain,
      compositionUpdate,
    } satisfies TrHoldingDiff;
  });

  const savingsPlanRows: TrSavingsPlanRow[] = savingsPlans.map((plan) => {
    const tracked = plan.isin ? byIsin.get(plan.isin) : undefined;
    return {
      plan,
      ...(tracked ? { trackedAssetId: tracked.id, trackedAssetName: tracked.name } : {}),
    } satisfies TrSavingsPlanRow;
  });

  // The first EUR balance is the one to track; the others are DECLARED, never merged. A cash
  // deposit reported beside the settleable cash is a different account at the broker, and the
  // Scalable bridge already paid for assuming otherwise.
  const [primary, ...extraBalances] = cashBalances;
  for (const extra of extraBalances) {
    warnings.push(
      `Trade Republic segnala un secondo saldo EUR di ${extra.balance} ${extra.currency} (conto ${extra.accountNumber || 'senza numero'}): non viene sommato a quello tracciato, creane uno conto a parte se ti serve.`
    );
  }

  return {
    holdings: diffs,
    cash: primary
      ? { balance: primary.balance, currency: primary.currency, accountNumber: primary.accountNumber }
      : null,
    savingsPlans: savingsPlanRows,
    warnings,
    stats: {
      holdingCount: holdings.length,
      newCount: diffs.filter((d) => d.kind === 'new').length,
      driftCount: diffs.filter((d) => d.kind === 'drift-only').length,
      compositionUpdateCount: diffs.filter((d) => d.compositionUpdate).length,
      unchangedCount: diffs.filter((d) => d.kind === 'unchanged').length,
      skippedCount: 0,
      savingsPlanCount: savingsPlanRows.length,
    },
  };
}

/** Suggested cash-account name for a Trade Republic account that has none yet. */
export const TR_CASH_ACCOUNT_NAME = 'Trade Republic — Liquidità';

/**
 * The ticker the sync WRITES on the Trade Republic cash account: the stable identity a re-sync
 * matches on. The user may rename the account, so matching by name (or by the shared
 * `exchange: 'Trade Republic'`) would create a duplicate on the next sync — the same rule the
 * Scalable cash and deposit tickers exist for.
 */
export const TR_CASH_TICKER = 'TR-EUR';
