import type { BrokerTrade, SkippedBrokerTrade } from '@/lib/utils/brokerTrade';
import type {
  BrokerTradeRow,
  BrokerTradeSkip,
} from '@/lib/utils/brokerTradePlan';
import type { AssetTransactionSource } from '@/types/assetTransactions';

/**
 * The wire shapes of the two `trades` routes under `/api/broker`, mirrored on the client.
 *
 * They live here rather than being imported from the server service because that module is
 * `server-only` (it pulls the Admin SDK), and the preview is composed in the browser. The PURE
 * planner and the two parsers ARE shared, so what crosses the wire is only the plan, never a raw
 * broker payload: the browser never sees a Scalable config path or a Trade Republic session.
 *
 * A `BrokerTrade`'s `date` arrives as an ISO string, so every consumer re-hydrates it before
 * formatting — the type is deliberately narrower than the domain's, so a forgotten `new Date()` is
 * a type error rather than an «Invalid time value» at runtime.
 */

export interface BrokerTradeRowDto extends Omit<BrokerTradeRow, 'trade'> {
  trade: Omit<BrokerTrade, 'date'> & { date: string };
}

export interface BrokerTradeSkipDto extends Omit<BrokerTradeSkip, 'trade'> {
  trade: Omit<BrokerTrade, 'date'> & { date: string };
}

export interface SkippedBrokerTradeDto extends Omit<SkippedBrokerTrade, 'date'> {
  date?: string;
}

/** POST /api/broker/{scalable,traderepublic}/trades with no `apply` — a preview, no writes. */
export interface BrokerTradePreviewDto {
  source: AssetTransactionSource;
  toImport: BrokerTradeRowDto[];
  alreadyImported: BrokerTradeRowDto[];
  skipped: BrokerTradeSkipDto[];
  parserSkipped: SkippedBrokerTradeDto[];
  brokerCount: number;
}

/** The same route with `apply` — what the write actually did. */
export interface BrokerTradeImportResultDto {
  imported: number;
  duplicates: number;
  failed: { sourceRef: string; message: string }[];
  realizedPnlEur: number;
  /** Binance only: coins whose Registro quantity was raised to the real balance with an adjustment. */
  reconciled?: number;
}
