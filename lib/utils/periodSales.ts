/**
 * The sales of a period, read from the trade ledger — what a falling month owes to the user's own
 * trades rather than to the market.
 *
 * Why this exists: the Panoramica, Patrimonio and the periodic email decompose a month's change
 * into «mercato» (the price effect) and «the user's own flows», and used to blame the market for
 * the whole drop whenever the price effect was negative. On the real account (settembre 2026) the
 * market explained a fifth of the decline: the rest was the capital-gains tax the broker withheld
 * on an ETF sale — in regime amministrato the tax leaves the account the day of the sale, with no
 * cashflow row to explain it. The ledger knows the sale and its realized gain, so the tax can be
 * ESTIMATED (gain × the instrument's `taxRate`) and named. It stays an estimate: no loss
 * compensation (minusvalenze pregresse), no per-instrument tax regime beyond `taxRate`.
 *
 * SDK-free (it is read by the email Lambda): the ledger replay comes from `assetTransactionUtils`.
 */

import { replayTransactionsWithEffects, LedgerValidationError } from '@/lib/utils/assetTransactionUtils';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import type { Asset } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';

export interface PeriodSaleInstrument {
  id: string;
  /** Alias → ticker → name, like every other instrument label. */
  name: string;
  /** Net of fees, EUR. */
  proceeds: number;
  /** Realized P&L of the period's sells, net of fees, EUR (negative = loss). */
  realizedGain: number;
  /**
   * `max(realizedGain, 0) × taxRate / 100`; `null` when the asset carries no `taxRate`, so a
   * missing input is never printed as «0 € di tasse».
   */
  estimatedTax: number | null;
}

export interface PeriodSalesSummary {
  /** Net of fees, EUR, over every instrument sold in the period. */
  proceeds: number;
  realizedGain: number;
  /** Sum of the instruments' estimates; `null` when ANY sold instrument has no `taxRate`. */
  estimatedTax: number | null;
  /** Largest proceeds first. */
  instruments: PeriodSaleInstrument[];
  /** Ledgers that failed to replay (an over-sell, a trade before its baseline) — counted, not fatal. */
  brokenLedgers: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

/** Realized loss → no tax; missing rate → unknown, never zero. */
function estimateTax(realizedGain: number, taxRate: number | undefined): number | null {
  if (taxRate === undefined || taxRate === null) return null;
  return realizedGain > 0 ? (realizedGain * taxRate) / 100 : 0;
}

/**
 * Sum the period's sells per instrument, each ledger replayed WHOLE so the realized P&L stands
 * against the PMC at the moment of the sale (a trade before the period moves the PMC of a trade
 * inside it). Returns `null` when nothing was sold in the range — «no sale» is a different fact
 * from «sold at zero».
 */
export function summarizePeriodSales(
  assets: Asset[],
  transactions: AssetTransaction[],
  range: DateRange,
): PeriodSalesSummary | null {
  const byAsset = new Map<string, AssetTransaction[]>();
  for (const transaction of transactions) {
    const list = byAsset.get(transaction.assetId) ?? [];
    list.push(transaction);
    byAsset.set(transaction.assetId, list);
  }
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const inRange = (date: Date) => date.getTime() >= range.start.getTime() && date.getTime() <= range.end.getTime();

  const instruments: PeriodSaleInstrument[] = [];
  let brokenLedgers = 0;

  for (const [assetId, ledger] of byAsset) {
    const sold = ledger.filter((t) => t.type === 'sell' && inRange(t.date));
    if (sold.length === 0) continue;

    let effectsById: Map<string, number>;
    try {
      const { effects } = replayTransactionsWithEffects(ledger);
      effectsById = new Map(effects.map((effect) => [effect.transactionId, effect.realizedPnlEur ?? 0]));
    } catch (error) {
      if (!(error instanceof LedgerValidationError)) throw error;
      brokenLedgers += 1;
      continue;
    }

    const asset = assetsById.get(assetId);
    const proceeds = sold.reduce((sum, t) => sum + t.quantity * t.priceEur - (t.fees ?? 0), 0);
    const realizedGain = sold.reduce((sum, t) => sum + (effectsById.get(t.id) ?? 0), 0);
    instruments.push({
      id: assetId,
      name: asset ? getAssetDisplayTicker(asset) : assetId,
      proceeds,
      realizedGain,
      estimatedTax: estimateTax(realizedGain, asset?.taxRate),
    });
  }

  if (instruments.length === 0) return null;
  instruments.sort((a, b) => b.proceeds - a.proceeds);

  const taxUnknown = instruments.some((row) => row.estimatedTax === null);
  return {
    proceeds: instruments.reduce((sum, row) => sum + row.proceeds, 0),
    realizedGain: instruments.reduce((sum, row) => sum + row.realizedGain, 0),
    estimatedTax: taxUnknown ? null : instruments.reduce((sum, row) => sum + (row.estimatedTax ?? 0), 0),
    instruments,
    brokenLedgers,
  };
}

/**
 * Why a period fell, in the order the three verdicts (Panoramica, Patrimonio, email) all use — ONE
 * decision so the three surfaces can never disagree on the cause.
 *
 *   - `despite-market`     the market gained: the user's own flows explain the whole drop
 *   - `taxes-over-market`  the market lost, and the estimated tax on the period's sales lost more
 *   - `market-and-taxes`   the market lost more than the tax did, but both weighed
 *   - `flows-over-market`  the market lost, no sale explains it, and the own flows outweigh it
 *   - `market`             the market lost and nothing else is known to have weighed more
 *   - `unknown`            no market effect measured
 *
 * `ownFlows` is «Δ − market» where the caller can measure it (the Panoramica; the email has its
 * own exact split and passes null).
 */
export type DeclineCause =
  | 'despite-market'
  | 'taxes-over-market'
  | 'market-and-taxes'
  | 'flows-over-market'
  | 'market'
  | 'unknown';

export function resolveDeclineCause(input: {
  marketEffect: number | null;
  ownFlows: number | null;
  salesTax: number | null;
}): DeclineCause {
  const { marketEffect, ownFlows, salesTax } = input;
  if (marketEffect === null) return 'unknown';
  if (marketEffect >= 0) return 'despite-market';
  const marketLoss = Math.abs(marketEffect);
  if (salesTax !== null && salesTax > 0) {
    return salesTax >= marketLoss ? 'taxes-over-market' : 'market-and-taxes';
  }
  if (ownFlows !== null && ownFlows < 0 && Math.abs(ownFlows) > marketLoss) return 'flows-over-market';
  return 'market';
}
