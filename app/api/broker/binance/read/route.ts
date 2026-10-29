/**
 * Binance read-only proxy — POST /api/broker/binance/read.
 *
 * Reads the balances of the three wallets (Spot, Funding, Simple Earn) and Binance's own prices,
 * and answers the coins as `BinanceHoldingInput[]`: summed per coin, priced in EUR, and carrying a
 * Yahoo symbol only when Yahoo was verified to quote it. Owner-scoped like every broker route, and
 * no credential crosses it: the key lives in the server environment (`lib/server/binanceClient.ts`).
 *
 * Body: { ownerId: string }
 * Answer: { holdings: BinanceHoldingInput[], warnings: string[] }
 *
 * A wallet that could not be read comes back as a WARNING, never as an empty wallet: a quantity
 * that is silently short would read as a drift against the Registro.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { canUseBinance } from '@/lib/utils/binanceAccess';
import { parseOr400 } from '@/lib/server/validation';
import { getMultipleQuotes } from '@/lib/services/yahooFinanceService';
import {
  BinanceConfigError,
  BinanceReadError,
  readBinanceBalances,
  readBinancePrices,
} from '@/lib/server/binanceClient';
import {
  aggregateBinanceHoldings,
  binanceYahooSymbol,
  BinanceParseError,
  parseEarnPositions,
  parseFundingBalances,
  parseSpotBalances,
  resolveBinanceEurPrice,
  type BinanceHoldingInput,
} from '@/lib/utils/binanceImport';

const bodySchema = z.object({ ownerId: z.string().min(1) });

/** Only coins worth a Yahoo lookup are looked up: the dust is never created anyway. */
const YAHOO_LOOKUP_MIN_VALUE_EUR = 1;

async function withYahooTickers(holdings: BinanceHoldingInput[]): Promise<BinanceHoldingInput[]> {
  const candidates = holdings.filter(
    (holding) => (holding.price ?? 0) * holding.quantity >= YAHOO_LOOKUP_MIN_VALUE_EUR
  );
  if (candidates.length === 0) return holdings;
  const quotes = await getMultipleQuotes(candidates.map((holding) => binanceYahooSymbol(holding.asset)));
  return holdings.map((holding) => {
    const symbol = binanceYahooSymbol(holding.asset);
    const quote = quotes.get(symbol);
    // EUR only, the rule of every bridge: a quote in another currency under the EUR holding
    // currency would read as euros until the first refresh.
    return quote?.price !== null && quote?.price !== undefined && quote.price > 0 && quote.currency === 'EUR'
      ? { ...holding, yahooTicker: symbol }
      : holding;
  });
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

  try {
    const [raw, prices] = await Promise.all([readBinanceBalances(), readBinancePrices()]);
    const warnings = [...raw.warnings];
    const aggregated = aggregateBinanceHoldings({
      Spot: parseSpotBalances(raw.spot),
      ...(raw.funding !== null ? { Funding: parseFundingBalances(raw.funding) } : {}),
      ...(raw.earn !== null ? { Earn: parseEarnPositions(raw.earn) } : {}),
    });
    const priced = aggregated.map((holding) => {
      const price = resolveBinanceEurPrice(holding.asset, prices);
      return price === null ? holding : { ...holding, price };
    });
    return NextResponse.json({ holdings: await withYahooTickers(priced), warnings });
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
    console.error('[binance/read] unexpected failure', error);
    return NextResponse.json({ error: 'Lettura non riuscita: riprova.' }, { status: 500 });
  }
}
