/**
 * Binance TRADE history — POST /api/broker/binance/trades.
 *
 * The same two-step contract as the Scalable and Trade Republic routes:
 *   { ownerId }                        → the plan (a preview: NO writes)
 *   { ownerId, apply: ["<ref>", ...] } → writes exactly those broker ids
 *
 * Owner-scoped through `assertCanAccessAccount`; the API key lives in the server environment and
 * never crosses this route. What is read: Spot trades of the coins currently held, Convert, card
 * and bank purchases, Dust → BNB and Earn rewards, valued in EUR at the day with the public daily
 * klines (`lib/utils/binanceTradeImport.ts`). Deposits, withdrawals and transfers carry no cost
 * and are NOT imported: a sell larger than what the history bought is clipped and declared.
 *
 * A history this wide is many sequential ledger writes, so the route may run long; the import is
 * idempotent per `sourceRef`, and a run cut short is simply run again.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { canUseBinance } from '@/lib/utils/binanceAccess';
import { parseOr400 } from '@/lib/server/validation';
import {
  BinanceConfigError,
  BinanceReadError,
  readBinanceBalances,
  readBinanceHistory,
  readBinanceKlines,
} from '@/lib/server/binanceClient';
import {
  buildBrokerTradePreview,
  importBrokerTrades,
  type BrokerTradesPayload,
} from '@/lib/server/brokerTradeImportService';
import {
  aggregateBinanceHoldings,
  BinanceParseError,
  parseEarnPositions,
  parseFundingBalances,
  parseSpotBalances,
} from '@/lib/utils/binanceImport';
import { binanceKlineSymbols, type BinanceHistoryPayload } from '@/lib/utils/binanceTradeImport';

const bodySchema = z.object({
  ownerId: z.string().min(1),
  // Absent = preview; present = write these broker ids. An empty array writes nothing, which is
  // deliberately different from omitting the field (that would mean «preview»).
  apply: z.array(z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/)).max(5000).optional(),
});

/** Every coin a history row names, so the klines cover exactly what the parser may price. */
function coinsOf(history: Awaited<ReturnType<typeof readBinanceHistory>>): Set<string> {
  const coins = new Set<string>(['BNB']);
  const add = (value: unknown) => {
    if (typeof value === 'string' && value !== '') coins.add(value);
  };
  for (const row of history.spotTrades as Array<Record<string, unknown>>) {
    add(row._base);
    add(row._quote);
    add(row.commissionAsset);
  }
  for (const row of history.convert as Array<Record<string, unknown>>) {
    add(row.fromAsset);
    add(row.toAsset);
  }
  for (const row of history.fiatBuys as Array<Record<string, unknown>>) add(row.cryptoCurrency);
  for (const row of history.dust as Array<Record<string, unknown>>) add(row.fromAsset);
  for (const row of history.earnRewards as Array<Record<string, unknown>>) add(row.asset);
  return coins;
}

/**
 * The history read is hundreds of Binance calls, and the tile makes TWO requests per sync (preview,
 * then apply). Reading twice trips Binance's rate limit on exactly the second pass, so the payload
 * of the preview is kept for a few minutes and the apply writes what the user just saw.
 */
const PAYLOAD_TTL_MS = 10 * 60_000;
const payloadCache = new Map<string, { at: number; payload: BrokerTradesPayload }>();

async function readPayload(ownerId: string, reuse: boolean): Promise<BrokerTradesPayload> {
  const cached = payloadCache.get(ownerId);
  if (reuse && cached && Date.now() - cached.at < PAYLOAD_TTL_MS) return cached.payload;
  const payload = await readFreshPayload();
  payloadCache.set(ownerId, { at: Date.now(), payload });
  return payload;
}

async function readFreshPayload(): Promise<BrokerTradesPayload> {
  const raw = await readBinanceBalances();
  const held = aggregateBinanceHoldings({
    Spot: parseSpotBalances(raw.spot),
    ...(raw.funding !== null ? { Funding: parseFundingBalances(raw.funding) } : {}),
    ...(raw.earn !== null ? { Earn: parseEarnPositions(raw.earn) } : {}),
  });
  const history = await readBinanceHistory(held.map((holding) => holding.asset));
  const klines = await readBinanceKlines(binanceKlineSymbols(coinsOf(history)));
  const list: BinanceHistoryPayload = {
    spotTrades: history.spotTrades,
    convert: history.convert,
    fiatBuys: history.fiatBuys,
    dust: history.dust,
    earnRewards: history.earnRewards,
    klines,
    readWarnings: [...raw.warnings, ...history.warnings],
    heldBalances: Object.fromEntries(held.map((holding) => [holding.asset, holding.quantity])),
  };
  return { list, details: {} };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let decoded;
  try {
    decoded = await requireFirebaseAuth(request);
  } catch (error) {
    return getApiAuthErrorResponse(error) ?? NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  }

  if (!canUseBinance(decoded.email)) {
    return NextResponse.json({ error: 'Accesso negato.' }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  const validated = parseOr400(bodySchema, body);
  if (!validated.ok) return validated.response;

  try {
    await assertCanAccessAccount(decoded, validated.data.ownerId);
  } catch (error) {
    return getApiAuthErrorResponse(error) ?? NextResponse.json({ error: 'Accesso negato.' }, { status: 403 });
  }

  const { ownerId, apply } = validated.data;
  try {
    const payload = await readPayload(ownerId, apply !== undefined);
    if (apply === undefined) {
      return NextResponse.json(await buildBrokerTradePreview(ownerId, 'binance', payload));
    }
    return NextResponse.json(await importBrokerTrades(ownerId, 'binance', payload, apply));
  } catch (error) {
    if (error instanceof BinanceConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof BinanceReadError) {
      return NextResponse.json({ error: error.message }, { status: error.status === 401 ? 401 : 502 });
    }
    if (error instanceof BinanceParseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error('[binance/trades] unexpected failure', error);
    return NextResponse.json({ error: 'Lettura non riuscita: riprova.' }, { status: 500 });
  }
}
