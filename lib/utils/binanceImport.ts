/**
 * Binance read-only bridge — the pure layer behind Impostazioni → Collegamenti.
 *
 * Same shape as `tradeRepublicImport.ts` (parse → map → plan, no I/O, no server-only import) with
 * three differences that come from the wire, not from taste:
 *
 * 1. **ONE ASSET, MANY WALLETS.** Binance splits the same coin across Spot, Funding and Simple Earn.
 *    The app tracks a coin as ONE asset, so the wallets are SUMMED per coin (`aggregateBinanceHoldings`)
 *    and the wallets that contributed travel along only to be named in the preview. Two wallets are
 *    two places a coin sits, never two positions.
 * 2. **EVERY COIN IS `crypto`, STABLECOINS INCLUDED.** The owner asked for one category and one
 *    broker label: `type: 'crypto'`, `assetClass: 'crypto'`, `exchange: 'Binance'`. A stablecoin is
 *    not reclassified as cash here — that is a judgement on the tracked asset, not on the sync.
 * 3. **THE PRICE COMES FROM BINANCE, THE TICKER FROM YAHOO.** Binance's own EUR price (direct pair,
 *    else through USDT) fills `currentPrice`, so a new asset never enters at 0. The Yahoo symbol
 *    `<COIN>-EUR` is written as the ticker ONLY when the read route verified Yahoo quotes it
 *    (`yahooTicker`); otherwise the asset gets a stable `BINANCE-<COIN>` identity and manual pricing,
 *    and the sync keeps its price current (`price-update`). Guessing a Yahoo symbol that does not
 *    exist would leave the asset unquotable for every later refresh.
 *
 * Quantity rule (the ledger owns it, as for every broker): for ledger types `quantity`/`averageCost`
 * are replay-derived and the sync NEVER writes them on an existing asset. A mismatch is a drift
 * warning to reconcile with a Registro adjustment. P/L is the app's: it compares the value with the
 * ledger's `averageCostEur`, so this module computes no cost basis.
 */

import type { Asset, AssetFormData } from '@/types/assets';
import { isLedgerAssetType } from '@/types/assetTransactions';

export const BINANCE_EXCHANGE = 'Binance';

/** Wallet labels as shown in the preview. */
export type BinanceWallet = 'Spot' | 'Funding' | 'Earn';

export interface BinanceHoldingInput {
  /** The coin code as Binance writes it (`BTC`). */
  asset: string;
  /** Units held, summed over every wallet. */
  quantity: number;
  /** The wallets that hold a non-zero balance of the coin, in a stable order. */
  wallets: BinanceWallet[];
  /** Binance's own EUR price per unit. Absent when no pair reaches EUR: the coin is then skipped. */
  price?: number;
  /** `<COIN>-EUR`, present ONLY when Yahoo was verified to quote it in EUR. */
  yahooTicker?: string;
}

export class BinanceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BinanceParseError';
  }
}

// ─── Tolerant readers ────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Binance sends every amount as a decimal STRING (`"0.03127829"`). */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function addTo(map: Record<string, number>, asset: unknown, quantity: number): void {
  if (typeof asset !== 'string' || asset.trim() === '' || !(quantity > 0)) return;
  map[asset] = (map[asset] ?? 0) + quantity;
}

/** `GET /api/v3/account` → `balances[]` of `{ asset, free, locked }`. */
export function parseSpotBalances(payload: unknown): Record<string, number> {
  if (!isRecord(payload) || !Array.isArray(payload['balances'])) {
    throw new BinanceParseError('Risposta Spot non riconosciuta: nessun elenco di saldi.');
  }
  const out: Record<string, number> = {};
  for (const row of payload['balances']) {
    if (isRecord(row)) addTo(out, row['asset'], toNumber(row['free']) + toNumber(row['locked']));
  }
  return out;
}

/** `POST /sapi/v1/asset/get-funding-asset` → an array of `{ asset, free, locked, freeze, withdrawing }`. */
export function parseFundingBalances(payload: unknown): Record<string, number> {
  if (!Array.isArray(payload)) {
    throw new BinanceParseError('Risposta Funding non riconosciuta: nessun elenco di saldi.');
  }
  const out: Record<string, number> = {};
  for (const row of payload) {
    if (isRecord(row)) addTo(out, row['asset'], toNumber(row['free']) + toNumber(row['locked']));
  }
  return out;
}

/** Simple Earn `position` pages (`flexible` and `locked` alike) → `rows[]` of `{ asset, totalAmount }`. */
export function parseEarnPositions(rows: unknown[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (isRecord(row)) addTo(out, row['asset'], toNumber(row['totalAmount']));
  }
  return out;
}

// ─── Prices ──────────────────────────────────────────────────────────────────

/**
 * Binance's EUR price of a coin, from the `ticker/price` map, or null when no pair reaches EUR.
 * Order: direct `<COIN>EUR`, inverse `EUR<COIN>`, then through USDT. `USDT` itself is priced from
 * `USDTEUR` or the inverse of `EURUSDT`.
 */
export function resolveBinanceEurPrice(asset: string, prices: Record<string, number>): number | null {
  if (asset === 'EUR') return 1;
  const usdtEur = prices['USDTEUR'] || (prices['EURUSDT'] ? 1 / prices['EURUSDT'] : null);
  if (asset === 'USDT') return usdtEur;
  if (prices[`${asset}EUR`]) return prices[`${asset}EUR`];
  if (prices[`EUR${asset}`]) return 1 / prices[`EUR${asset}`];
  if (usdtEur) {
    if (prices[`${asset}USDT`]) return prices[`${asset}USDT`] * usdtEur;
    if (prices[`USDT${asset}`]) return usdtEur / prices[`USDT${asset}`];
  }
  return null;
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

const WALLET_ORDER: BinanceWallet[] = ['Spot', 'Funding', 'Earn'];

/**
 * Sum the wallets per coin. `EUR` is dropped: a fiat balance is a cash account, not a crypto
 * position, and the owner asked for crypto only.
 */
export function aggregateBinanceHoldings(
  wallets: Partial<Record<BinanceWallet, Record<string, number>>>
): BinanceHoldingInput[] {
  const byAsset = new Map<string, { quantity: number; wallets: BinanceWallet[] }>();
  for (const wallet of WALLET_ORDER) {
    for (const [asset, quantity] of Object.entries(wallets[wallet] ?? {})) {
      if (asset === 'EUR' || !(quantity > 0)) continue;
      const entry = byAsset.get(asset) ?? { quantity: 0, wallets: [] };
      entry.quantity += quantity;
      entry.wallets.push(wallet);
      byAsset.set(asset, entry);
    }
  }
  return [...byAsset.entries()]
    .map(([asset, { quantity, wallets: held }]) => ({ asset, quantity, wallets: held }))
    .sort((a, b) => a.asset.localeCompare(b.asset));
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

/** Italian default on crypto gains, the same the dialogs suggest. */
export const BINANCE_DEFAULT_TAX_RATE = 26;

/** Below this EUR value a NEW coin is not created: dust would bury the real positions. */
export const BINANCE_MIN_NEW_VALUE_EUR = 1;

export function binanceYahooSymbol(asset: string): string {
  return `${asset}-EUR`;
}

/** The stable identity of a coin Yahoo does not quote. */
export function binanceManualTicker(asset: string): string {
  return `BINANCE-${asset}`;
}

export function mapBinanceHoldingToAssetFormData(holding: BinanceHoldingInput): AssetFormData {
  return {
    ticker: holding.yahooTicker ?? binanceManualTicker(holding.asset),
    displayTicker: holding.asset,
    name: holding.asset,
    type: 'crypto',
    assetClass: 'crypto',
    currency: 'EUR',
    quantity: holding.quantity,
    taxRate: BINANCE_DEFAULT_TAX_RATE,
    currentPrice: holding.price ?? 0,
    isLiquid: true,
    autoUpdatePrice: holding.yahooTicker !== undefined,
    exchange: BINANCE_EXCHANGE,
  };
}

// ─── Import plan (the preview) ───────────────────────────────────────────────

export type BinanceHoldingDiffKind = 'new' | 'price-update' | 'drift-only' | 'unchanged';

export interface BinanceHoldingDiff {
  kind: BinanceHoldingDiffKind;
  holding: BinanceHoldingInput;
  /** Creation payload for `kind === 'new'`. */
  formData: AssetFormData;
  existingAssetId?: string;
  existingName?: string;
  /** Broker quantity minus tracked quantity — a number to reconcile, never an auto-write. */
  quantityDrift: number;
}

export interface BinanceImportPlan {
  holdings: BinanceHoldingDiff[];
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

export type BinanceExistingAsset = Pick<
  Asset,
  'id' | 'name' | 'ticker' | 'displayTicker' | 'type' | 'quantity' | 'exchange' | 'autoUpdatePrice' | 'currentPrice'
>;

const QTY_EPS = 1e-8;
const PRICE_EPS = 1e-6;

/**
 * A tracked asset is Binance's when it carries the Binance label AND the coin's identity: the Yahoo
 * symbol or the `BINANCE-` ticker. The label alone would match a hand-made asset that happens to
 * share it; the ticker alone would merge a coin held at another broker into this one.
 */
function isBinanceAssetOf(asset: BinanceExistingAsset, coin: string): boolean {
  if (asset.exchange !== BINANCE_EXCHANGE) return false;
  return asset.ticker === binanceYahooSymbol(coin) || asset.ticker === binanceManualTicker(coin);
}

export function buildBinanceImportPlan(
  holdings: BinanceHoldingInput[],
  existingAssets: BinanceExistingAsset[]
): BinanceImportPlan {
  const warnings: string[] = [];
  const diffs: BinanceHoldingDiff[] = [];
  const unpriced: string[] = [];
  const dust: string[] = [];

  for (const holding of holdings) {
    const existing = existingAssets.find((asset) => isBinanceAssetOf(asset, holding.asset));
    const formData = mapBinanceHoldingToAssetFormData(holding);

    if (!existing) {
      if (holding.price === undefined) {
        unpriced.push(holding.asset);
        continue;
      }
      if (holding.quantity * holding.price < BINANCE_MIN_NEW_VALUE_EUR) {
        dust.push(holding.asset);
        continue;
      }
      diffs.push({ kind: 'new', holding, formData, quantityDrift: 0 });
      continue;
    }

    const drift = holding.quantity - existing.quantity;
    const hasDrift = isLedgerAssetType(existing.type) && Math.abs(drift) > QTY_EPS;
    if (hasDrift) {
      warnings.push(
        `«${existing.name}»: Binance riporta ${holding.quantity} contro ${existing.quantity} nel Registro — la quantità non viene toccata (riconcilia con una rettifica).`
      );
    }
    // A coin Yahoo quotes is repriced by the ordinary refresh; only a manually priced one needs the
    // sync's price, and only when it actually moved.
    const needsPrice =
      existing.autoUpdatePrice === false &&
      holding.price !== undefined &&
      Math.abs(holding.price - (existing.currentPrice ?? 0)) > PRICE_EPS;
    diffs.push({
      kind: needsPrice ? 'price-update' : hasDrift ? 'drift-only' : 'unchanged',
      holding,
      formData,
      existingAssetId: existing.id,
      existingName: existing.name,
      quantityDrift: hasDrift ? drift : 0,
    });
  }

  if (unpriced.length > 0) {
    warnings.push(
      `Nessun prezzo in EUR su Binance per ${unpriced.join(', ')}: non vengono creati. Aggiungili a mano su Patrimonio se li vuoi tracciare.`
    );
  }
  if (dust.length > 0) {
    warnings.push(
      `${dust.length === 1 ? '1 moneta sotto' : `${dust.length} monete sotto`} 1 € non ${dust.length === 1 ? 'viene creata' : 'vengono create'} (${dust.join(', ')}).`
    );
  }
  const manualNew = diffs.filter((d) => d.kind === 'new' && !d.holding.yahooTicker);
  if (manualNew.length > 0) {
    warnings.push(
      `${manualNew.map((d) => d.holding.asset).join(', ')}: Yahoo non quota la moneta in EUR, il prezzo è quello di Binance e si aggiorna a ogni sincronizzazione.`
    );
  }

  return {
    holdings: diffs,
    warnings,
    stats: {
      holdingCount: holdings.length,
      newCount: diffs.filter((d) => d.kind === 'new').length,
      priceUpdateCount: diffs.filter((d) => d.kind === 'price-update').length,
      driftCount: diffs.filter((d) => d.kind === 'drift-only').length,
      unchangedCount: diffs.filter((d) => d.kind === 'unchanged').length,
      skippedCount: unpriced.length + dust.length,
    },
  };
}
