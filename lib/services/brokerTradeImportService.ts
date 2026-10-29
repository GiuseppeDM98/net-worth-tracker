import { authenticatedFetch } from '@/lib/utils/authFetch';
import type { BrokerTrade, SkippedBrokerTrade } from '@/lib/utils/brokerTrade';
import type {
  BrokerTradeImportResultDto,
  BrokerTradePreviewDto,
  BrokerTradeRowDto,
  BrokerTradeSkipDto,
  SkippedBrokerTradeDto,
} from '@/lib/types/brokerTradeImport';
import type { BrokerTradeRow, BrokerTradeSkip } from '@/lib/utils/brokerTradePlan';
import type { AssetTransactionSource } from '@/types/assetTransactions';

/**
 * The client's half of the broker trade import: two calls against the two `/trades` routes, and the
 * re-hydration the JSON boundary forces.
 *
 * DATES ARE THE WHOLE POINT OF THIS MODULE. `JSON.parse` hands back strings, and the plan's trades
 * are typed with a real `Date` because that is what the ledger's replay and every formatter expect.
 * A `date` left as a string is a `NaN` day and a thrown `toLocaleDateString` at the worst possible
 * moment, so the conversion happens ONCE, here, on the way in — and a row whose date does not parse
 * is dropped rather than passed on half-formed.
 *
 * NO CACHE, deliberately. The whole point of the preview is that it reflects the broker's history
 * at the moment it was opened, and a `staleTime` here would show yesterday's trades and then import
 * today's.
 */

const ROUTE: Record<AssetTransactionSource, string> = {
  scalable: '/api/broker/scalable/trades',
  traderepublic: '/api/broker/traderepublic/trades',
  binance: '/api/broker/binance/trades',
};

function readError(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
    return (data as { error: string }).error;
  }
  return fallback;
}

function rehydrateTrade(row: { trade: BrokerTradeRowDto['trade'] } | BrokerTradeSkipDto): BrokerTrade | null {
  const date = new Date(row.trade.date);
  if (Number.isNaN(date.getTime())) return null;
  return { ...row.trade, date };
}

function toRow(dto: BrokerTradeRowDto): BrokerTradeRow | null {
  const trade = rehydrateTrade(dto);
  return trade ? { ...dto, trade } : null;
}

function toSkip(dto: BrokerTradeSkipDto): BrokerTradeSkip | null {
  const trade = rehydrateTrade(dto);
  return trade ? { ...dto, trade } : null;
}

function toParserSkipped(dto: SkippedBrokerTradeDto): SkippedBrokerTrade {
  // A parser skip is a row that was REFUSED, so an unparseable date costs nothing: the reason is
  // the message, and the date is only a sort key. It is dropped rather than stored as an Invalid
  // Date, which would throw on any later comparison.
  const { date, ...rest } = dto;
  const parsed = date ? new Date(date) : null;
  return {
    ...rest,
    ...(parsed && !Number.isNaN(parsed.getTime()) ? { date: parsed } : {}),
  };
}

/**
 * Ask the server what would be written. NO WRITES — the route's preview branch never touches
 * Firestore, and the caller must still confirm with `applyBrokerTrades`.
 *
 * A row whose date fails to parse is dropped from the client-side view, which can only ever make the
 * preview show FEWER rows than would be written — the safe direction. The server never sees that
 * row either, because `apply` names the ids the user could actually see.
 */
export async function fetchBrokerTradePreview(
  ownerId: string,
  source: AssetTransactionSource
): Promise<Omit<BrokerTradePreviewDto, 'toImport' | 'alreadyImported' | 'skipped' | 'parserSkipped'> & {
  toImport: BrokerTradeRow[];
  alreadyImported: BrokerTradeRow[];
  skipped: BrokerTradeSkip[];
  parserSkipped: SkippedBrokerTrade[];
}> {
  const response = await authenticatedFetch(ROUTE[source], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId }),
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readError(data, 'Lettura delle operazioni non riuscita: riprova.'));
  }
  const payload = data as BrokerTradePreviewDto;
  if (!Array.isArray(payload?.toImport)) {
    throw new Error('Lettura delle operazioni non riuscita: riprova.');
  }
  return {
    source: payload.source,
    brokerCount: payload.brokerCount,
    toImport: payload.toImport.map(toRow).filter((row): row is BrokerTradeRow => row !== null),
    alreadyImported: (payload.alreadyImported ?? []).map(toRow).filter((row): row is BrokerTradeRow => row !== null),
    skipped: (payload.skipped ?? []).map(toSkip).filter((skip): skip is BrokerTradeSkip => skip !== null),
    parserSkipped: (payload.parserSkipped ?? []).map(toParserSkipped),
  };
}

/**
 * Write exactly the approved broker ids.
 *
 * The ids are the broker's own, never row indices: a re-render between the preview and the confirm
 * must not be able to shift which operation an index points at. The server rebuilds the plan
 * against the CURRENT ledger and writes only the intersection, so a row that stopped being
 * importable in the meantime is refused rather than written on the strength of a stale preview.
 */
export async function applyBrokerTrades(
  ownerId: string,
  source: AssetTransactionSource,
  sourceRefs: readonly string[]
): Promise<BrokerTradeImportResultDto> {
  const response = await authenticatedFetch(ROUTE[source], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId, apply: [...sourceRefs] }),
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readError(data, 'Salvataggio delle operazioni non riuscito: riprova.'));
  }
  return data as BrokerTradeImportResultDto;
}
