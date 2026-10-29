/**
 * Binance TRADE history — the pure layer behind «Importa operazioni», sibling to
 * `tradeRepublicTradeImport.ts`.
 *
 * Binance has no ledger of «operations»: the same coin moves through five products, each with its
 * own wire (Spot `myTrades`, Convert `tradeFlow`, card/bank purchases, Dust → BNB, Earn rewards).
 * This module turns all of them into `BrokerTrade` LEGS — one BUY or SELL of ONE coin — so the
 * importer downstream (preview, idempotency, `createAssetTransaction`) stays broker-agnostic.
 *
 * Three decisions that come from the wire, not from taste:
 *
 * 1. **EVERY LEG IS PRICED IN EUR, AT THE DAY.** Binance prices a pair in its quote (USDT, BTC…),
 *    never in EUR, so each leg's value is the quote amount times the quote's EUR close of that day
 *    (`historicalEurPrice`: direct `<COIN>EUR`, else `<COIN>USDT` through `EURUSDT`). A day with no
 *    kline looks one day either side, the way `binance_test.py` does. Without a price the leg is
 *    skipped WITH A REASON — never written at 0, which would invent a free acquisition.
 * 2. **A SWAP IS TWO LEGS.** BTC/USDT bought = a SELL of USDT and a BUY of BTC, each its own
 *    ledger operation with its own `sourceRef` suffix. A coin the owner does not track
 *    (`asset-not-found`) is dropped by the plan, never created.
 * 3. **A DISPOSAL IS NEVER LARGER THAN WHAT THE HISTORY ACQUIRED.** Deposits, withdrawals and
 *    transfers are not imported (they carry no cost), so a coin can leave the history with more
 *    units sold than bought. The ledger would refuse that sell (422). The simulation below clips it
 *    to the units the history holds and names the rest, so the import is complete where it can
 *    be and says where it cannot — the same «declared, not approximated» posture as the baseline.
 *
 * Pure: no I/O, no `server-only`. It takes already-fetched payloads.
 */

import {
  dedupeBrokerTrades,
  sortBrokerTrades,
  toFiniteNumber,
  type BrokerTrade,
  type BrokerTradeParseResult,
  type SkippedBrokerTrade,
} from '@/lib/utils/brokerTrade';

const DAY_MS = 86_400_000;

/** What the server read, as one JSON-safe payload. `klines`: symbol → UTC day index → daily close. */
export interface BinanceHistoryPayload {
  /** `myTrades` rows, each tagged with `_base` / `_quote` by the reader. */
  spotTrades: unknown[];
  convert: unknown[];
  fiatBuys: unknown[];
  dust: unknown[];
  earnRewards: unknown[];
  klines: Record<string, Record<string, number>>;
  /** Products the reader could not read, in words: they surface in the preview, never as silence. */
  readWarnings?: string[];
  /** Coin → quantity Binance reports today (Spot + Funding + Earn): what the Registro is reconciled to. */
  heldBalances?: Record<string, number>;
}

interface JsonObject {
  [key: string]: unknown;
}

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonObject) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(row: JsonObject, key: string): string | undefined {
  const value = row[key];
  if (typeof value === 'string' && value !== '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/** A `sourceRef` is `[A-Za-z0-9_-]{1,128}`: anything else a wire id could carry is flattened. */
function refPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '');
}

// ─── Historical prices ───────────────────────────────────────────────────────

/** Daily close of a symbol at `ts`, or the day before / after (the script's tolerance). */
function closeAt(klines: BinanceHistoryPayload['klines'], symbol: string, ts: number): number | null {
  const days = klines[symbol];
  if (!days) return null;
  const day = Math.floor(ts / DAY_MS);
  for (const candidate of [day, day - 1, day + 1]) {
    const close = days[String(candidate)];
    if (typeof close === 'number' && close > 0) return close;
  }
  return null;
}

/** EUR price of one unit of `coin` at `ts`, or null when no kline reaches EUR. */
export function historicalEurPrice(
  coin: string,
  ts: number,
  klines: BinanceHistoryPayload['klines']
): number | null {
  if (coin === 'EUR') return 1;
  const direct = closeAt(klines, `${coin}EUR`, ts);
  if (direct !== null) return direct;
  const eurUsdt = closeAt(klines, 'EURUSDT', ts);
  if (eurUsdt === null) return null;
  if (coin === 'USDT') return 1 / eurUsdt;
  const usdt = closeAt(klines, `${coin}USDT`, ts);
  return usdt === null ? null : usdt / eurUsdt;
}

/** The symbols whose klines the parser can ask for, so the reader fetches exactly those. */
export function binanceKlineSymbols(coins: Iterable<string>): string[] {
  const symbols = new Set<string>(['EURUSDT']);
  for (const coin of coins) {
    if (coin === 'EUR' || coin === 'USDT') continue;
    symbols.add(`${coin}EUR`);
    symbols.add(`${coin}USDT`);
  }
  return [...symbols].sort();
}

// ─── Legs ────────────────────────────────────────────────────────────────────

interface Leg {
  ts: number;
  ref: string;
  coin: string;
  side: 'buy' | 'sell';
  quantity: number;
  /** Total EUR value of the leg. For a buy this is the cost, for a sell the proceeds. */
  valueEur: number;
  label: string;
}

interface Collector {
  legs: Leg[];
  skipped: SkippedBrokerTrade[];
  klines: BinanceHistoryPayload['klines'];
}

function skip(collector: Collector, ref: string, label: string, ts: number, reason: string): void {
  collector.skipped.push({ sourceRef: ref, label, date: new Date(ts), reason });
}

function addLeg(collector: Collector, leg: Leg): void {
  // EUR is cash, not a position: a leg in it has no asset to land on.
  if (leg.coin === 'EUR' || !(leg.quantity > 0) || !Number.isFinite(leg.valueEur)) return;
  collector.legs.push(leg);
}

function eurPrice(collector: Collector, coin: string, ts: number): number | null {
  return historicalEurPrice(coin, ts, collector.klines);
}

/** `myTrades`: the base coin against the quote coin, plus a fee leg when it is paid in a third coin. */
function collectSpot(collector: Collector, rows: unknown[]): void {
  for (const raw of rows) {
    const row = asObject(raw);
    if (!row) continue;
    const symbol = text(row, 'symbol') ?? text(row, '_symbol');
    const id = text(row, 'id');
    const base = text(row, '_base');
    const quote = text(row, '_quote');
    const ts = toFiniteNumber(row['time']);
    const qty = toFiniteNumber(row['qty']);
    const quoteQty = toFiniteNumber(row['quoteQty']);
    if (!symbol || !id || !base || !quote || ts === null || qty === null || quoteQty === null) continue;
    const ref = `s-${refPart(symbol)}-${refPart(id)}`;
    const label = `${base}/${quote}`;
    const quotePx = eurPrice(collector, quote, ts);
    if (quotePx === null) {
      skip(collector, ref, label, ts, `Nessun prezzo storico in EUR per ${quote}: operazione esclusa.`);
      continue;
    }
    const value = quoteQty * quotePx;
    const feeAsset = text(row, 'commissionAsset');
    const feeQty = toFiniteNumber(row['commission']) ?? 0;
    const feePx = feeAsset ? eurPrice(collector, feeAsset, ts) : null;
    const feeEur = feeAsset && feePx !== null ? feeQty * feePx : 0;
    const thirdAssetFee = feeAsset !== undefined && feeAsset !== base && feeAsset !== quote && feeAsset !== 'EUR';

    if (row['isBuyer'] === true) {
      // A fee in the bought coin comes out of the units received.
      const netQty = qty - (feeAsset === base ? feeQty : 0);
      addLeg(collector, { ts, ref: `${ref}-q`, coin: quote, side: 'sell', quantity: quoteQty, valueEur: value, label });
      addLeg(collector, {
        ts,
        ref: `${ref}-b`,
        coin: base,
        side: 'buy',
        quantity: netQty,
        valueEur: value + (feeAsset === base ? 0 : feeEur),
        label,
      });
    } else {
      addLeg(collector, {
        ts,
        ref: `${ref}-b`,
        coin: base,
        side: 'sell',
        quantity: qty,
        valueEur: Math.max(value - feeEur, 0),
        label,
      });
      addLeg(collector, {
        ts,
        ref: `${ref}-q`,
        coin: quote,
        side: 'buy',
        quantity: quoteQty - (feeAsset === quote ? feeQty : 0),
        valueEur: value,
        label,
      });
    }
    if (thirdAssetFee && feeAsset) {
      addLeg(collector, { ts, ref: `${ref}-f`, coin: feeAsset, side: 'sell', quantity: feeQty, valueEur: feeEur, label });
    }
  }
}

/** Convert: sell `fromAsset`, buy `toAsset`, both at the value of whichever side has a price. */
function collectConvert(collector: Collector, rows: unknown[]): void {
  for (const raw of rows) {
    const row = asObject(raw);
    if (!row || row['orderStatus'] !== 'SUCCESS') continue;
    const orderId = text(row, 'orderId');
    const from = text(row, 'fromAsset');
    const to = text(row, 'toAsset');
    const ts = toFiniteNumber(row['createTime']);
    const fromQty = toFiniteNumber(row['fromAmount']);
    const toQty = toFiniteNumber(row['toAmount']);
    if (!orderId || !from || !to || ts === null || fromQty === null || toQty === null) continue;
    const ref = `c-${refPart(orderId)}`;
    const label = `Convert ${from} → ${to}`;
    const fromPx = eurPrice(collector, from, ts);
    const toPx = fromPx === null ? eurPrice(collector, to, ts) : null;
    const value = fromPx !== null ? fromQty * fromPx : toPx !== null ? toQty * toPx : null;
    if (value === null) {
      skip(collector, ref, label, ts, `Nessun prezzo storico in EUR per ${from} né ${to}: operazione esclusa.`);
      continue;
    }
    addLeg(collector, { ts, ref: `${ref}-s`, coin: from, side: 'sell', quantity: fromQty, valueEur: value, label });
    addLeg(collector, { ts, ref: `${ref}-b`, coin: to, side: 'buy', quantity: toQty, valueEur: value, label });
  }
}

/** Card / bank purchases: the EUR actually paid is the cost, fee included. Other fiat is declared. */
function collectFiat(collector: Collector, rows: unknown[]): void {
  for (const raw of rows) {
    const row = asObject(raw);
    if (!row || String(row['status']).toLowerCase() !== 'completed') continue;
    const orderNo = text(row, 'orderNo');
    const coin = text(row, 'cryptoCurrency');
    const ts = toFiniteNumber(row['createTime']);
    const paid = toFiniteNumber(row['sourceAmount']);
    const got = toFiniteNumber(row['obtainAmount']);
    if (!orderNo || !coin || ts === null || paid === null || got === null) continue;
    const ref = `f-${refPart(orderNo)}`;
    const label = `Acquisto ${coin}`;
    if (text(row, 'fiatCurrency') !== 'EUR') {
      skip(collector, ref, label, ts, `Acquisto pagato in ${text(row, 'fiatCurrency') ?? 'valuta sconosciuta'}: solo l’EUR è importato.`);
      continue;
    }
    addLeg(collector, { ts, ref, coin, side: 'buy', quantity: got, valueEur: paid, label });
  }
}

/** Dust → BNB: the small coin is sold for the BNB it became (service charge included). */
function collectDust(collector: Collector, rows: unknown[]): void {
  for (const raw of rows) {
    const row = asObject(raw);
    if (!row) continue;
    const transId = text(row, 'transId');
    const from = text(row, 'fromAsset');
    const ts = toFiniteNumber(row['operateTime']);
    const amount = toFiniteNumber(row['amount']);
    const received = toFiniteNumber(row['transferedAmount']);
    const charge = toFiniteNumber(row['serviceChargeAmount']) ?? 0;
    if (!transId || !from || ts === null || amount === null || received === null) continue;
    const ref = `d-${refPart(transId)}-${refPart(from)}`;
    const label = `Dust ${from} → BNB`;
    const bnbPx = eurPrice(collector, 'BNB', ts);
    if (bnbPx === null) {
      skip(collector, ref, label, ts, 'Nessun prezzo storico in EUR per BNB: operazione esclusa.');
      continue;
    }
    const value = (received + charge) * bnbPx;
    addLeg(collector, { ts, ref: `${ref}-s`, coin: from, side: 'sell', quantity: amount, valueEur: value, label });
    addLeg(collector, { ts, ref: `${ref}-b`, coin: 'BNB', side: 'buy', quantity: received, valueEur: value, label });
  }
}

/** Earn rewards are an acquisition at the market value of the day. */
function collectRewards(collector: Collector, rows: unknown[]): void {
  for (const raw of rows) {
    const row = asObject(raw);
    if (!row) continue;
    const coin = text(row, 'asset');
    const ts = toFiniteNumber(row['time']);
    const qty = toFiniteNumber(row['rewards'] ?? row['amount']);
    if (!coin || ts === null || qty === null || qty <= 0) continue;
    const ref = `r-${refPart(coin)}-${ts}-${refPart(text(row, '_rewardType') ?? text(row, 'type') ?? 'x')}`;
    const label = `Reward ${coin}`;
    const px = eurPrice(collector, coin, ts);
    if (px === null) {
      skip(collector, ref, label, ts, `Nessun prezzo storico in EUR per ${coin}: operazione esclusa.`);
      continue;
    }
    addLeg(collector, { ts, ref, coin, side: 'buy', quantity: qty, valueEur: qty * px, label });
  }
}

// ─── Parse ───────────────────────────────────────────────────────────────────

/**
 * Normalize the Binance history into chronological BUY / SELL legs.
 *
 * Chronological because the clipping below is a running balance: a sell is judged against what the
 * history had bought UP TO THAT MOMENT.
 */
export function parseBinanceTrades(payload: unknown): BrokerTradeParseResult {
  const body = asObject(payload) ?? {};
  const collector: Collector = {
    legs: [],
    skipped: [],
    klines: (asObject(body['klines']) as BinanceHistoryPayload['klines'] | null) ?? {},
  };
  collectSpot(collector, asArray(body['spotTrades']));
  collectConvert(collector, asArray(body['convert']));
  collectFiat(collector, asArray(body['fiatBuys']));
  collectDust(collector, asArray(body['dust']));
  collectRewards(collector, asArray(body['earnRewards']));
  asArray(body['readWarnings']).forEach((warning, index) => {
    if (typeof warning === 'string') collector.skipped.push({ sourceRef: `warning-${index}`, label: 'Lettura Binance', reason: warning });
  });

  // Stable sort: legs of one event keep their relative order (sell the quote, then buy the base).
  const legs = collector.legs
    .map((leg, index) => ({ leg, index }))
    .sort((a, b) => a.leg.ts - b.leg.ts || a.index - b.index)
    .map(({ leg }) => leg);

  const held = new Map<string, number>();
  const trades: BrokerTrade[] = [];
  const EPS = 1e-12;
  for (const leg of legs) {
    let quantity = leg.quantity;
    let valueEur = leg.valueEur;
    const current = held.get(leg.coin) ?? 0;
    if (leg.side === 'sell') {
      if (current <= EPS) {
        skip(
          collector,
          leg.ref,
          leg.label,
          leg.ts,
          `Nessun acquisto di ${leg.coin} nello storico prima di questa vendita (deposito o trasferimento?): esclusa.`
        );
        continue;
      }
      if (quantity > current) {
        skip(
          collector,
          leg.ref,
          leg.label,
          leg.ts,
          `Venduti ${quantity} ${leg.coin} ma lo storico ne ha acquistati ${current}: importata la parte coperta.`
        );
        valueEur *= current / quantity;
        quantity = current;
      }
      held.set(leg.coin, current - quantity);
    } else {
      held.set(leg.coin, current + quantity);
    }
    if (!(quantity > 0) || !(valueEur >= 0)) continue;
    trades.push({
      sourceRef: leg.ref,
      source: 'binance',
      type: leg.side,
      coin: leg.coin,
      label: leg.label,
      date: new Date(leg.ts),
      quantity,
      pricePerUnit: valueEur / quantity,
      currency: 'EUR',
    });
  }
  return { trades: sortBrokerTrades(dedupeBrokerTrades(trades)), skipped: collector.skipped };
}
