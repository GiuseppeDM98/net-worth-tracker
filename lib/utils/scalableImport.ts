/**
 * Scalable broker read-only bridge — the pure layer behind Impostazioni → Collegamenti.
 *
 * The `sc` CLI cannot run on the hosting (interactive OAuth device flow + OS keyring), so the
 * bridge is local: the user runs the two READ commands on their own machine and pastes the
 * `--json` output into the UI:
 *   - `sc broker holdings --json` → positions (ISIN, quantity, quote, FIFO price)
 *   - `sc broker overview --json` → totals (valuation, securities, crypto → cash residual)
 *
 * This module parses those payloads, maps them onto `AssetFormData`, and builds an import plan
 * (new / price-update / quantity-drift / unchanged + cash). It performs NO I/O, runs NO
 * subprocess, stores NO token: the app never talks to Scalable, only to pasted text.
 *
 * Shape tolerance is deliberate: the CLI prints the broker GraphQL fields
 * (`inventory.position.filled`, `quoteTick.midPrice`, `portfolioIsinPerformance.*`,
 * `valuation`/`securitiesValuation`/`cryptoValuation`), but the exact `--json` envelope may
 * vary by CLI version — so every field is read through several candidate paths and the
 * envelope accepts a bare array, `{ holdings }`, `{ items }` or `{ inventory: { items } }`.
 *
 * Quantity rule (the ledger owns it): for ledger types (stock/etf/bond/crypto/commodity)
 * `quantity`/`averageCost` are replay-derived and are NEVER written by the sync. A mismatch
 * between the broker quantity and the ledger quantity is reported as a drift warning for the
 * user to reconcile with a Registro adjustment — the plan carries the numbers, not the write.
 */

import type { Asset, AssetClass, AssetFormData, AssetType } from '@/types/assets';
import { isLedgerAssetType } from '@/types/assetTransactions';

// ─── Input shapes (what the two `sc` commands print) ─────────────────────────

export interface ScalableHoldingInput {
  isin: string;
  name: string;
  /** Raw `type` string from the broker, as printed (e.g. "ETF"). */
  rawType: string;
  /** Units held (`inventory.position.filled`). */
  quantity: number;
  /** Current quote per unit, native currency (`quoteTick.midPrice`). */
  price: number;
  currency: string;
  /** FIFO unit price, when the broker reports it (`inventory.position.fifoPrice`). */
  averageCost?: number;
  /** Position market value, when reported (`portfolioIsinPerformance.valuation`). */
  valuation?: number;
}

export interface ScalableOverviewInput {
  valuation: number;
  securitiesValuation: number;
  cryptoValuation: number;
  currency: string;
}

/**
 * The interest-bearing overnight account («Deposito non vincolato»), from `sc overnight --json`.
 * A SEPARATE balance from the broker cash residual: Scalable's broker valuation excludes it, so
 * `valuation − securities − crypto` is the broker's cash alone and this is its own account.
 */
export interface ScalableOvernightInput {
  balance: number;
  /** Annual rate as a fraction (the CLI prints `0.026` for 2,6%). */
  interestRate?: number;
  /** ISO date of the next payout, when the CLI reports one. */
  nextPayoutDate?: string;
  currentAccruedAmount?: number;
  estimatedNextPayoutAmount?: number;
  /** The account's own name, e.g. «Deposito non vincolato». */
  displayName?: string;
  isActive: boolean;
  currency: string;
}

// ─── Tolerant readers ─────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** First defined (non-null) value found walking the candidate paths. */
function pickPath(root: Record<string, unknown>, paths: string[]): unknown {
  for (const path of paths) {
    let node: unknown = root;
    let found = true;
    for (const key of path.split('.')) {
      if (!isRecord(node) || !(key in node)) {
        found = false;
        break;
      }
      node = node[key];
    }
    if (found && node !== undefined && node !== null && node !== '') return node;
  }
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return undefined;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/** User-facing parse failure: the message is shown verbatim in the tile's reading line. */
export class ScalableParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScalableParseError';
  }
}

function parseJsonDocument(raw: string, label: string): unknown {
  if (raw.trim() === '') throw new ScalableParseError(`Incolla prima l'output di ${label}.`);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ScalableParseError(
      `Il testo incollato non è un JSON valido: ricopia l'intero output di ${label}.`
    );
  }
}

/** Envelope variants: bare array, or an object holding the array under a known key. */
function extractHoldingRows(doc: unknown): unknown[] {
  if (Array.isArray(doc)) return doc;
  if (isRecord(doc)) {
    // sc CLI envelope: { ok: true, command: 'broker.holdings', data: { result: { items: [...] } } }
    // or { result: { items: [...] } }
    const data = doc['data'];
    if (isRecord(data) && isRecord(data['result']) && Array.isArray(data['result']['items'])) {
      return data['result']['items'] as unknown[];
    }
    if (isRecord(doc['result']) && Array.isArray(doc['result']['items'])) {
      return doc['result']['items'] as unknown[];
    }
    // Fallback keys used by other formats
    for (const key of ['holdings', 'items', 'positions']) {
      if (Array.isArray(doc[key])) return doc[key] as unknown[];
    }
    const inventory = doc['inventory'];
    if (isRecord(inventory) && Array.isArray(inventory['items'])) {
      return inventory['items'] as unknown[];
    }
  }
  throw new ScalableParseError(
    "Nessuna posizione trovata: l'output atteso è quello di `sc broker holdings --json`."
  );
}

function parseHoldingRow(row: unknown): ScalableHoldingInput | null {
  if (!isRecord(row)) return null;
  const isin = toText(row['isin']);
  if (!isin) return null;
  const quantity =
    toNumber(pickPath(row, ['quantity', 'inventory.position.filled', 'filled', 'shares'])) ?? 0;
  if (quantity <= 0) return null;
  const price = toNumber(
    pickPath(row, [
      'quote_mid_price',
      'quoteTick.midPrice',
      'quote.midPrice',
      'midPrice',
      'price',
      'currentPrice',
      'portfolioIsinPerformance.valuation',
    ])
  );
  if (price === undefined || price < 0) return null;
  return {
    isin: isin.toUpperCase(),
    name: toText(row['name']) ?? isin.toUpperCase(),
    rawType: toText(pickPath(row, ['security_type', 'type'])) ?? '',
    quantity,
    price,
    currency: (
      toText(pickPath(row, ['quote_currency', 'quoteTick.currency', 'portfolioIsinPerformance.currency', 'currency'])) ??
      'EUR'
    ).toUpperCase(),
    averageCost: toNumber(pickPath(row, ['fifo_price', 'inventory.position.fifoPrice', 'fifoPrice', 'averageCost'])),
    valuation: toNumber(pickPath(row, ['valuation', 'portfolioIsinPerformance.valuation', 'marketValue'])),
  };
}

/**
 * Parse the pasted `sc broker holdings --json` output. Rows without ISIN, with no positive
 * quantity or no usable price are skipped and counted; a duplicated ISIN keeps its first row.
 */
export function parseScalableHoldingsJson(raw: string): {
  holdings: ScalableHoldingInput[];
  skipped: number;
} {
  const rows = extractHoldingRows(parseJsonDocument(raw, '`sc broker holdings --json`'));
  const holdings: ScalableHoldingInput[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  rows.forEach((row) => {
    const parsed = parseHoldingRow(row);
    if (!parsed || seen.has(parsed.isin)) {
      skipped += 1;
      return;
    }
    seen.add(parsed.isin);
    holdings.push(parsed);
  });
  if (holdings.length === 0) {
    throw new ScalableParseError(
      'Nessuna posizione valida: servono ISIN, quantità e prezzo per ogni riga (`sc broker holdings --json`).'
    );
  }
  return { holdings, skipped };
}

function extractOverviewNode(doc: unknown): Record<string, unknown> {
  if (!isRecord(doc)) {
    throw new ScalableParseError("Formato overview non riconosciuto: usa `sc broker overview --json`.");
  }
  for (const key of ['overview', 'valuation', 'portfolio', 'brokerOverview']) {
    if (isRecord(doc[key])) return { ...doc, ...(doc[key] as Record<string, unknown>) };
  }
  // Also check nested paths that the CLI may use
  const data = doc['data'];
  if (isRecord(data)) {
    for (const key of ['overview', 'valuation', 'portfolio', 'brokerOverview']) {
      if (isRecord(data[key])) return { ...doc, ...(data[key] as Record<string, unknown>) };
    }
    const result = data['result'];
    if (isRecord(result)) {
      for (const key of ['overview', 'valuation', 'portfolio', 'brokerOverview']) {
        if (isRecord(result[key])) return { ...doc, ...(result[key] as Record<string, unknown>) };
      }
    }
  }
  return doc;
}

/** Parse the pasted `sc broker overview --json` output (optional second input). */
export function parseScalableOverviewJson(raw: string): ScalableOverviewInput {
  const node = extractOverviewNode(parseJsonDocument(raw, '`sc broker overview --json`'));
  // `extractOverviewNode` merges a found `valuation` object into the node, so its fields may
  // sit top-level (`total`, `securities`, `crypto` — the live `broker.overview` shape) or nested.
  const valuationObj = pickPath(node, ['valuation', 'totalValuation', 'totalValue', 'total']);
  let valuation: number | undefined;
  if (typeof valuationObj === 'number') {
    valuation = valuationObj;
  } else if (valuationObj && typeof valuationObj === 'object' && 'total' in valuationObj) {
    valuation = toNumber(valuationObj['total']);
  }
  const securitiesValuation =
    toNumber(pickPath(node, ['securitiesValuation', 'securitiesValue', 'securities'])) ?? 0;
  const cryptoValuation = toNumber(pickPath(node, ['cryptoValuation', 'cryptoValue', 'crypto'])) ?? 0;
  if (valuation === undefined || isNaN(valuation)) {
    throw new ScalableParseError(
      'Totale non trovato: incolla per intero l’output di `sc broker overview --json`.'
    );
  }
  return {
    valuation,
    securitiesValuation,
    cryptoValuation,
    currency: (toText(node['currency']) ?? 'EUR').toUpperCase(),
  };
}

/**
 * Parse `sc overnight --json` — the interest-bearing account, a balance the broker's own
 * valuation does NOT contain (verified: broker cash 120,00 € against a 59.201,61 € deposit).
 * `data.result.balance` is the current amount; `current_interest_bearing_amount` is the fallback
 * for a CLI version that only prints the accrual base. No currency field is printed: Scalable
 * is a euro account, so the rate is declared rather than inferred from a missing key.
 */
export function parseScalableOvernightJson(raw: string): ScalableOvernightInput {
  const doc = parseJsonDocument(raw, '`sc overnight --json`');
  if (!isRecord(doc)) {
    throw new ScalableParseError('Formato overnight non riconosciuto: usa `sc overnight --json`.');
  }
  const data = doc['data'];
  const account = isRecord(data) ? data['account'] : undefined;
  const result = isRecord(data) ? data['result'] : undefined;
  const node = isRecord(result) ? result : doc;

  const balance = toNumber(
    pickPath(node, ['balance', 'current_interest_bearing_amount', 'amount', 'value'])
  );
  if (balance === undefined || isNaN(balance)) {
    throw new ScalableParseError(
      'Saldo del deposito non trovato: incolla per intero l’output di `sc overnight --json`.'
    );
  }
  const nextPayout = toText(pickPath(node, ['next_payout_date', 'nextPayoutDate']));
  return {
    balance,
    interestRate: toNumber(pickPath(node, ['interest_rate', 'interestRate'])),
    nextPayoutDate: nextPayout !== undefined && !Number.isNaN(Date.parse(nextPayout))
      ? new Date(nextPayout).toISOString()
      : undefined,
    currentAccruedAmount: toNumber(pickPath(node, ['current_accrued_amount', 'currentAccruedAmount'])),
    estimatedNextPayoutAmount: toNumber(
      pickPath(node, ['estimated_next_payout_amount', 'estimatedNextPayoutAmount'])
    ),
    displayName: toText(pickPath(isRecord(account) ? account : {}, ['display_name', 'displayName'])),
    isActive: (isRecord(account) ? account['is_active'] ?? account['isActive'] : undefined) !== false,
    currency: 'EUR',
  };
}

// ─── Broker type → AssetType/AssetClass ───────────────────────────────────────

/**
 * Best-effort mapping of the broker's security `type` onto the app's types. The broker-side
 * vocabulary is not contractual, so anything unrecognized falls back to ETF/equity AND is
 * flagged `typeUncertain` — the preview names it and the user corrects it on Patrimonio.
 */
const SCALABLE_TYPE_MAP: Record<string, { type: AssetType; assetClass: AssetClass }> = {
  ETF: { type: 'etf', assetClass: 'equity' },
  ETP: { type: 'etf', assetClass: 'equity' },
  ETC: { type: 'commodity', assetClass: 'commodity' },
  STOCK: { type: 'stock', assetClass: 'equity' },
  SHARE: { type: 'stock', assetClass: 'equity' },
  AKTIE: { type: 'stock', assetClass: 'equity' },
  EQUITY: { type: 'stock', assetClass: 'equity' },
  BOND: { type: 'bond', assetClass: 'bonds' },
  ANLEIHE: { type: 'bond', assetClass: 'bonds' },
  FUND: { type: 'etf', assetClass: 'equity' },
  FONDS: { type: 'etf', assetClass: 'equity' },
  MUTUALFUND: { type: 'etf', assetClass: 'equity' },
  CRYPTO: { type: 'crypto', assetClass: 'crypto' },
  COIN: { type: 'crypto', assetClass: 'crypto' },
  COMMODITY: { type: 'commodity', assetClass: 'commodity' },
};

export interface MappedScalableType {
  type: AssetType;
  assetClass: AssetClass;
  /** True when the broker string matched nothing and the ETF fallback was used. */
  typeUncertain: boolean;
}

export function mapScalableType(rawType: string): MappedScalableType {
  const key = rawType.toUpperCase().replace(/[^A-Z]/g, '');
  const mapped = SCALABLE_TYPE_MAP[key];
  if (mapped) return { ...mapped, typeUncertain: false };
  return { type: 'etf', assetClass: 'equity', typeUncertain: true };
}

/** Italian 26% on gains, 12.5% on bonds — the same defaults the dialogs suggest. */
export function defaultTaxRateFor(type: AssetType): number {
  return type === 'bond' ? 12.5 : 26;
}

/** A fresh `AssetFormData` for a broker position not yet tracked. Prices are broker-fed, so Yahoo auto-update stays off. */
export function mapHoldingToAssetFormData(holding: ScalableHoldingInput): AssetFormData {
  const { type, assetClass } = mapScalableType(holding.rawType);
  return {
    ticker: holding.isin,
    displayTicker: holding.name,
    name: holding.name,
    type,
    assetClass,
    currency: holding.currency,
    quantity: holding.quantity,
    ...(holding.averageCost !== undefined && holding.averageCost > 0
      ? { averageCost: holding.averageCost }
      : {}),
    taxRate: defaultTaxRateFor(type),
    currentPrice: holding.price,
    isLiquid: true,
    autoUpdatePrice: false,
    isin: holding.isin,
    exchange: 'Scalable Capital',
  };
}

// ─── Import plan (the preview) ───────────────────────────────────────────────

export type HoldingDiffKind =
  | 'new'
  | 'price-update'
  | 'drift-only'
  | 'price-and-drift'
  | 'unchanged';

export interface HoldingDiff {
  kind: HoldingDiffKind;
  holding: ScalableHoldingInput;
  /** Creation payload for `kind === 'new'`; price patch preview otherwise. */
  formData: AssetFormData;
  existingAssetId?: string;
  existingName?: string;
  prevPrice?: number;
  /** Relative price move vs the tracked price, null when the tracked price is 0. */
  priceDeltaPct: number | null;
  /** Broker quantity minus tracked quantity — a number to reconcile, never an auto-write. */
  quantityDrift: number;
  typeUncertain: boolean;
}

export interface CashPlan {
  /** valuation − securities − crypto from the overview: the residual cash estimate. */
  balance: number;
  currency: string;
}

/**
 * The overnight deposit as its OWN cash account, never folded into the broker residual: the
 * two are different balances at the broker and earn differently (the deposit pays interest on
 * a monthly schedule). Kept apart so the preview's two numbers are the two real ones.
 */
export interface DepositPlan {
  balance: number;
  currency: string;
  /** Annual rate as a fraction; DECLARED in the preview, never written (no Asset field holds it). */
  interestRate?: number;
  /** ISO date of the next payout, declared in the preview. */
  nextPayoutDate?: string;
  estimatedNextPayoutAmount?: number;
  displayName?: string;
  isActive: boolean;
}

/** A zero deposit is a real reading (the account was emptied), not an absent one: it still syncs. */
function resolveScalableDepositPlan(overnight: ScalableOvernightInput | null): DepositPlan | null {
  if (!overnight) return null;
  return {
    balance: overnight.balance,
    currency: overnight.currency,
    interestRate: overnight.interestRate,
    nextPayoutDate: overnight.nextPayoutDate,
    estimatedNextPayoutAmount: overnight.estimatedNextPayoutAmount,
    displayName: overnight.displayName,
    isActive: overnight.isActive,
  };
}

/** Cash is whatever the totals cannot attribute to securities or crypto. */
export function resolveScalableCashBalance(overview: ScalableOverviewInput): CashPlan {
  return {
    balance: overview.valuation - overview.securitiesValuation - overview.cryptoValuation,
    currency: overview.currency,
  };
}

const PRICE_EPS = 1e-9;
const QTY_EPS = 1e-6;

export interface ScalableImportPlan {
  holdings: HoldingDiff[];
  /** Null when no overview was pasted: positions sync without the cash residual. */
  cash: CashPlan | null;
  /** Null when the overnight account was not read: the broker balance is unaffected by it. */
  deposit: DepositPlan | null;
  warnings: string[];
  stats: {
    holdingCount: number;
    newCount: number;
    priceUpdateCount: number;
    driftCount: number;
    unchangedCount: number;
    skippedCount: number;
  };
}

/**
 * Diff broker positions against the tracked assets (matched by ISIN). Price moves become
 * updates; quantity mismatches on ledger types become drift warnings only — the plan never
 * proposes a quantity write for them.
 */
export function buildScalableImportPlan(
  holdings: ScalableHoldingInput[],
  overview: ScalableOverviewInput | null,
  existingAssets: Pick<Asset, 'id' | 'name' | 'isin' | 'type' | 'assetClass' | 'quantity' | 'currentPrice'>[],
  overnight: ScalableOvernightInput | null = null
): ScalableImportPlan {
  const byIsin = new Map<string, (typeof existingAssets)[number]>();
  for (const asset of existingAssets) {
    const isin = asset.isin?.trim().toUpperCase();
    if (isin && !byIsin.has(isin)) byIsin.set(isin, asset);
  }

  const warnings: string[] = [];
  const diffs: HoldingDiff[] = holdings.map((holding) => {
    const existing = byIsin.get(holding.isin);
    const formData = mapHoldingToAssetFormData(holding);
    const typeUncertain = mapScalableType(holding.rawType).typeUncertain;
    if (!existing) {
      if (typeUncertain) {
        warnings.push(
          `«${holding.name}»: tipo broker «${holding.rawType || 'sconosciuto'}» non riconosciuto, proposto come ETF azionario — verifica su Patrimonio.`
        );
      }
      return {
        kind: 'new',
        holding,
        formData,
        priceDeltaPct: null,
        quantityDrift: 0,
        typeUncertain,
      } satisfies HoldingDiff;
    }
    const priceMoved = Math.abs(existing.currentPrice - holding.price) > PRICE_EPS;
    const drift = holding.quantity - existing.quantity;
    const hasDrift = isLedgerAssetType(existing.type) && Math.abs(drift) > QTY_EPS;
    const kind: HoldingDiffKind = priceMoved
      ? hasDrift
        ? 'price-and-drift'
        : 'price-update'
      : hasDrift
        ? 'drift-only'
        : 'unchanged';
    if (hasDrift) {
      warnings.push(
        `«${existing.name}»: il broker riporta ${holding.quantity} quote contro ${existing.quantity} nel Registro — il prezzo si aggiorna, la quantità no (riconcilia con una rettifica).`
      );
    }
    return {
      kind,
      holding,
      formData,
      existingAssetId: existing.id,
      existingName: existing.name,
      prevPrice: existing.currentPrice,
      priceDeltaPct:
        existing.currentPrice !== 0
          ? (holding.price - existing.currentPrice) / Math.abs(existing.currentPrice)
          : null,
      quantityDrift: hasDrift ? drift : 0,
      typeUncertain,
    } satisfies HoldingDiff;
  });

  const stats = {
    holdingCount: holdings.length,
    newCount: diffs.filter((d) => d.kind === 'new').length,
    priceUpdateCount: diffs.filter((d) => d.kind === 'price-update' || d.kind === 'price-and-drift').length,
    driftCount: diffs.filter((d) => d.kind === 'drift-only' || d.kind === 'price-and-drift').length,
    unchangedCount: diffs.filter((d) => d.kind === 'unchanged').length,
    skippedCount: 0,
  };

  return {
    holdings: diffs,
    cash: overview ? resolveScalableCashBalance(overview) : null,
    deposit: resolveScalableDepositPlan(overnight),
    warnings,
    stats,
  };
}

/** Suggested cash-account name for the residual liquidity of an account without one yet. */
export const SCALABLE_CASH_ACCOUNT_NAME = 'Scalable — Liquidità';

/**
 * Suggested name for the overnight deposit's own account. Distinct from the liquidity account
 * on purpose: Scalable reports the two separately and they are not the same money.
 */
export const SCALABLE_DEPOSIT_ACCOUNT_NAME = 'Scalable — Deposito';

/**
 * The tickers the sync WRITES on the two Scalable cash accounts. They are the stable identity
 * a re-sync matches on — the user may rename either account, and matching by name (or by the
 * shared `exchange: 'Scalable Capital'`) would then create a duplicate on the next sync.
 */
export const SCALABLE_CASH_TICKER = 'SCALABLE-EUR';
export const SCALABLE_DEPOSIT_TICKER = 'SCALABLE-DEP';
