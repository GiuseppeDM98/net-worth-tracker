/**
 * The import PLAN for broker trades: which rows are new, which are already in the ledger, and why
 * a row cannot be imported at all. Pure - the preview is composed in the client, which already
 * holds the tracked assets and the existing trades.
 *
 * WHY A PLAN AND NOT A WRITE. A broker history is not the user's assertion that it is correct: it
 * can hold an instrument that is not in Portafoglio, a trade dated before the asset's baseline,
 * or a sell whose lots the ledger cannot reconstruct. Writing any of those produces a replay that
 * either throws or silently misstates the position. So the rows are classified first, the user
 * sees exactly what would happen, and only the accepted ones are written - through
 * 'createAssetTransaction', which re-validates every one of them anyway.
 *
 * IDEMPOTENCY IS THE POINT OF THIS MODULE. The match is on (source, sourceRef) - the broker's own
 * id - never on date+isin+quantity: two identical trades on the same day are a real thing, and
 * matching on content would silently drop the second forever. A trade the user has since EDITED
 * keeps its source fields and is reported as already-imported, so a re-sync never overwrites an
 * edit and never duplicates it.
 */

import type { Asset } from '@/types/assets';
import type { AssetTransaction, AssetTransactionSource } from '@/types/assetTransactions';
import { isLedgerAssetType } from '@/types/assetTransactions';
import type { BrokerTrade, SkippedBrokerTrade } from '@/lib/utils/brokerTrade';
import { BINANCE_EXCHANGE, binanceManualTicker, binanceYahooSymbol } from '@/lib/utils/binanceImport';

/** The asset facts the plan needs - the client's `Asset` is a superset. */
export type PlanAsset = Pick<Asset, 'id' | 'isin' | 'name' | 'type'> &
  Partial<Pick<Asset, 'ticker' | 'exchange'>>;

/** The ledger fields the dedupe reads - `source`/`sourceRef` are exactly what it needs. */
export type PlanExistingTransaction = Pick<AssetTransaction, 'source' | 'sourceRef'>;

export type BrokerTradeRowStatus = 'new' | 'already-imported';

export type BrokerTradeSkipReason = 'no-isin' | 'asset-not-found' | 'asset-not-ledger' | 'before-baseline';

export interface BrokerTradeRow {
  trade: BrokerTrade;
  status: BrokerTradeRowStatus;
  /** Set when the row is importable: the Portafoglio asset it belongs to. */
  assetId?: string;
}

export interface BrokerTradeSkip {
  trade: BrokerTrade;
  reason: BrokerTradeSkipReason;
  /** Italian, user-facing. The preview prints it verbatim. */
  message: string;
}

export interface BrokerTradePlan {
  /** Importable and not yet in the ledger, oldest first. This is what a write would take. */
  toImport: BrokerTradeRow[];
  /** Already present under the same (source, sourceRef): the idempotency proof, shown as a count. */
  alreadyImported: BrokerTradeRow[];
  /** Rows that cannot become ledger entries, each with the reason. */
  skipped: BrokerTradeSkip[];
  /** Broker rows the PARSER itself refused (cash movements, unsettled, unparseable detail). */
  parserSkipped: SkippedBrokerTrade[];
  /** Parsable trades the broker has, before the ledger's own checks. */
  brokerCount: number;
}

/** The identity of one broker trade, as stored on the ledger row. */
export function brokerTradeKey(source: AssetTransactionSource, sourceRef: string): string {
  return source + ':' + sourceRef;
}

/** The (source, sourceRef) pairs already in the ledger, as one lookup set. */
export function indexExistingBrokerTransactions(existing: readonly PlanExistingTransaction[]): Set<string> {
  const keys = new Set<string>();
  for (const transaction of existing) {
    if (transaction.source && transaction.sourceRef) {
      keys.add(brokerTradeKey(transaction.source, transaction.sourceRef));
    }
  }
  return keys;
}

/** The Binance sync's own asset for a coin: the label AND the coin's identity (see `binanceImport.ts`). */
export function findAssetByCoin<T extends PlanAsset>(assets: readonly T[], coin: string): T | undefined {
  return assets.find(
    (asset) =>
      asset.exchange === BINANCE_EXCHANGE &&
      (asset.ticker === binanceYahooSymbol(coin) || asset.ticker === binanceManualTicker(coin))
  );
}

function findAssetByIsin(assets: readonly PlanAsset[], isin: string): PlanAsset | undefined {
  const wanted = isin.trim().toUpperCase();
  return assets.find((asset) => (asset.isin ?? '').trim().toUpperCase() === wanted);
}

/**
 * Classify parsed broker trades against the ledger's assets and existing trades.
 *
 * The four skips, in the order they are checked - each one exists because writing that row would
 * produce a ledger that is wrong rather than incomplete:
 *
 * 1. no-isin - the join key is missing, so the row cannot be attached to any asset. Attaching it
 *    by name would be a guess.
 * 2. asset-not-found - the instrument is not in Portafoglio. It is not created here: an asset
 *    needs a type, a class and a currency that only the user can choose (the same reason the
 *    broker ASSET import is a preview with per-row fields).
 * 3. asset-not-ledger - the asset exists but is cash/realestate/pensionFund, whose quantity is not
 *    the result of trading. A buy into one would be silently dropped by the replay.
 * 4. before-baseline - the trade predates the asset's own baseline, so the replay has no cost
 *    basis for it. Backfilling needs the position as it stood at that date, which only a baseline
 *    BUY can supply; it is declared, never approximated.
 */
export function buildBrokerTradePlan(input: {
  trades: readonly BrokerTrade[];
  parserSkipped?: readonly SkippedBrokerTrade[];
  assets: readonly PlanAsset[];
  existingTransactions: readonly PlanExistingTransaction[];
  /** Baseline date per asset id, when the asset has one. An asset without one accepts any date. */
  baselineByAssetId?: ReadonlyMap<string, Date>;
}): BrokerTradePlan {
  const existing = indexExistingBrokerTransactions(input.existingTransactions);
  const toImport: BrokerTradeRow[] = [];
  const alreadyImported: BrokerTradeRow[] = [];
  const skipped: BrokerTradeSkip[] = [];

  for (const trade of input.trades) {
    if (existing.has(brokerTradeKey(trade.source, trade.sourceRef))) {
      alreadyImported.push({ trade, status: 'already-imported' });
      continue;
    }

    if (!trade.isin && !trade.coin) {
      skipped.push({ trade, reason: 'no-isin', message: 'Nessun ISIN nel dettaglio: operazione esclusa.' });
      continue;
    }

    const asset = trade.isin ? findAssetByIsin(input.assets, trade.isin) : findAssetByCoin(input.assets, trade.coin!);
    if (!asset) {
      skipped.push({ trade, reason: 'asset-not-found', message: 'Asset non presente nel Portafoglio: aggiungilo per importare questa operazione.' });
      continue;
    }

    if (!isLedgerAssetType(asset.type)) {
      skipped.push({ trade, reason: 'asset-not-ledger', message: 'L’asset non è gestito dal registro: operazione esclusa.' });
      continue;
    }

    const baseline = input.baselineByAssetId?.get(asset.id);
    if (baseline && trade.date.getTime() < baseline.getTime()) {
      skipped.push({ trade, reason: 'before-baseline', message: 'Operazione antecedente alla baseline dell’asset: la base di costo non è ricostruibile.' });
      continue;
    }

    toImport.push({ trade, status: 'new', assetId: asset.id });
  }

  return {
    toImport,
    alreadyImported,
    skipped,
    parserSkipped: [...(input.parserSkipped ?? [])],
    brokerCount: input.trades.length,
  };
}

/**
 * A one-line summary for the sync surface, so a drift is visible without opening the preview.
 * Italian, user-facing, and states the ACTIONABLE number first: an unchanged sync must read as
 * «nothing to do», never as a silent success that hides a broker the ledger does not know.
 */
export function summarizeBrokerTradePlan(plan: BrokerTradePlan): string {
  const toImport = plan.toImport.length;
  const already = plan.alreadyImported.length;
  const skipped = plan.skipped.length;
  if (toImport === 0 && already > 0) {
    return 'Registro aggiornato: ' + already + ' operazioni già presenti, nessuna nuova.';
  }
  if (toImport === 0 && already === 0) {
    return skipped > 0
      ? 'Nessuna operazione importabile: ' + skipped + ' non compatibili.'
      : 'Nessuna operazione trovata presso il broker.';
  }
  const parts = [toImport + ' operazioni da importare'];
  if (already > 0) parts.push(already + ' già presenti');
  if (skipped > 0) parts.push(skipped + ' non compatibili');
  return parts.join(', ') + '.';
}
