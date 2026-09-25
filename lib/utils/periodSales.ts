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
 * Since 2026-09-20 a sell can carry the tax the broker REALLY withheld (`withheldTaxEur`, typed in
 * the sale form over the prefilled estimate): where it is there it replaces the estimate, sell by
 * sell, and `taxIsWithheld` says when the whole figure is a fact, so the words can drop «circa».
 * The field keeps its name (`estimatedTax`) because stored overview payloads carry it.
 *
 * SDK-free (it is read by the email Lambda): the ledger replay comes from `assetTransactionUtils`.
 */

import { replayTransactionsWithEffects, LedgerValidationError } from '@/lib/utils/assetTransactionUtils';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { estimateSaleTax } from '@/lib/utils/saleTax';
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
   * The tax withheld on the sells that carry one, plus `max(taxable gain, 0) × taxRate / 100` over
   * the sells that do not — the taxable gain carries no commission (`taxableGainEur`); `null` when a sell needs the estimate and the asset carries no `taxRate`,
   * so a missing input is never printed as «0 € di tasse».
   */
  estimatedTax: number | null;
  /**
   * True when every sell of the instrument in the period carries its withheld tax. Optional like
   * the summary's: a stored overview payload predates it, and absent reads as an estimate.
   */
  taxIsWithheld?: boolean;
}

export interface PeriodSalesSummary {
  /** Net of fees, EUR, over every instrument sold in the period. */
  proceeds: number;
  realizedGain: number;
  /** Sum of the instruments' taxes; `null` when ANY sold instrument's is unknown. */
  estimatedTax: number | null;
  /**
   * True when the whole figure is what the broker withheld, with no estimated part. Absent on a
   * payload computed before the field existed — read as an estimate.
   */
  taxIsWithheld?: boolean;
  /** Largest proceeds first. */
  instruments: PeriodSaleInstrument[];
  /** Ledgers that failed to replay (an over-sell, a trade before its baseline) — counted, not fatal. */
  brokenLedgers: number;
  /**
   * Every purchase recorded in the same period, on ANY instrument (fees included, migration
   * baselines excluded); `null` when there was none. A FACT beside the sale, never a claim that
   * the proceeds funded it — a purchase paid from a salary looks the same in the ledger. Absent on
   * a payload computed before the field existed (overview source version 18).
   */
  purchases?: PeriodPurchases | null;
}

export interface PeriodPurchases {
  /** Σ quantity × priceEur + fees, EUR. */
  amount: number;
  /** Distinct instruments bought. */
  instrumentCount: number;
}

export interface DateRange {
  start: Date;
  end: Date;
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
    let taxableById: Map<string, number>;
    try {
      const { effects } = replayTransactionsWithEffects(ledger);
      effectsById = new Map(effects.map((effect) => [effect.transactionId, effect.realizedPnlEur ?? 0]));
      taxableById = new Map(effects.map((effect) => [effect.transactionId, effect.taxableGainEur ?? 0]));
    } catch (error) {
      if (!(error instanceof LedgerValidationError)) throw error;
      brokenLedgers += 1;
      continue;
    }

    const asset = assetsById.get(assetId);
    const proceeds = sold.reduce((sum, t) => sum + t.quantity * t.priceEur - (t.fees ?? 0), 0);
    const realizedGain = sold.reduce((sum, t) => sum + (effectsById.get(t.id) ?? 0), 0);
    // The withheld tax is a fact and wins sell by sell; the estimate covers only the gain of the
    // sells that carry none (netted among themselves, as before: a loss offsets a gain).
    const withTax = sold.filter((t) => t.withheldTaxEur !== undefined);
    const withheld = withTax.reduce((sum, t) => sum + (t.withheldTaxEur ?? 0), 0);
    const taxIsWithheld = withTax.length === sold.length;
    const gainToEstimate = sold
      .filter((t) => t.withheldTaxEur === undefined)
      .reduce((sum, t) => sum + (taxableById.get(t.id) ?? 0), 0);
    const estimated = taxIsWithheld ? 0 : estimateSaleTax(gainToEstimate, asset?.taxRate);
    instruments.push({
      id: assetId,
      name: asset ? getAssetDisplayTicker(asset) : assetId,
      proceeds,
      realizedGain,
      estimatedTax: estimated === null ? null : withheld + estimated,
      taxIsWithheld,
    });
  }

  if (instruments.length === 0) return null;
  instruments.sort((a, b) => b.proceeds - a.proceeds);

  const bought = transactions.filter((t) => t.type === 'buy' && !t.isBaseline && inRange(t.date));
  const purchases: PeriodPurchases | null =
    bought.length === 0
      ? null
      : {
          amount: bought.reduce((sum, t) => sum + t.quantity * t.priceEur + (t.fees ?? 0), 0),
          instrumentCount: new Set(bought.map((t) => t.assetId)).size,
        };

  const taxUnknown = instruments.some((row) => row.estimatedTax === null);
  return {
    proceeds: instruments.reduce((sum, row) => sum + row.proceeds, 0),
    realizedGain: instruments.reduce((sum, row) => sum + row.realizedGain, 0),
    estimatedTax: taxUnknown ? null : instruments.reduce((sum, row) => sum + (row.estimatedTax ?? 0), 0),
    taxIsWithheld: instruments.every((row) => row.taxIsWithheld === true),
    instruments,
    brokenLedgers,
    purchases,
  };
}

/**
 * Why a period fell, in the order the three verdicts (Panoramica, Patrimonio, email) all use — ONE
 * decision so the three surfaces can never disagree on the cause.
 *
 *   - `taxes-despite-market` the market gained and the estimated tax on the period's sales is at
 *                            least half of the whole drop: the tax IS the story, and the headline
 *                            names it (owner's call, 2026-09-13 — on the real account settembre
 *                            fell by 4.156 € with the market at +153 € and 4.089 € of withholding,
 *                            and «nonostante il mercato» stopped one step short of the cause)
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
  | 'taxes-despite-market'
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
  if (marketEffect >= 0) {
    // The whole drop is «Δ = market + own flows»; the tax explains it when it is at least half
    // of it. A caller without the own-flows half (the email) cannot measure the drop and keeps
    // the plain «despite-market» — never a guess from the tax alone.
    const drop = ownFlows === null ? null : -(marketEffect + ownFlows);
    if (drop !== null && drop > 0 && salesTax !== null && salesTax > 0 && salesTax >= drop / 2) {
      return 'taxes-despite-market';
    }
    return 'despite-market';
  }
  const marketLoss = Math.abs(marketEffect);
  if (salesTax !== null && salesTax > 0) {
    return salesTax >= marketLoss ? 'taxes-over-market' : 'market-and-taxes';
  }
  if (ownFlows !== null && ownFlows < 0 && Math.abs(ownFlows) > marketLoss) return 'flows-over-market';
  return 'market';
}

/**
 * Below this monthly change (in percent of the total) a period is «in pari» rather than «cresce».
 */
export const FLAT_PERIOD_PCT = 0.5;

/**
 * A period that did NOT fall, but only because the tax on its sales took the growth: the
 * counterpart of `taxes-despite-market` for the other sign. On the real account settembre 2026
 * closed at +124 € (+0,04%) with 4.089 € of estimated withholding on a VWCE sale, and the headline
 * read «Settembre sta andando bene» (owner's call, 2026-09-19).
 *
 *   - `flat`    the tax took at least half of the gross growth (Δ + tax) and what is left is
 *               below `FLAT_PERIOD_PCT` — «è in pari: le tasse … si sono prese la crescita»
 *   - `eroded`  the tax took at least half of the gross growth, and the period still grew
 *               visibly — «cresce, ma le tasse … si sono prese più di metà della crescita»
 *   - `null`    a falling period (`resolveDeclineCause` owns it), no taxed sale, or a tax that
 *               took less than half
 *
 * «At least half of Δ + tax» is simply «tax ≥ Δ». Needs only the delta and the tax, so the three
 * verdicts — the email included, which has no own-flows half — reach it alike.
 */
export type TaxedGrowth = 'flat' | 'eroded';

export function resolveTaxedGrowth(input: {
  delta: number;
  deltaPct: number;
  salesTax: number | null;
}): TaxedGrowth | null {
  const { delta, deltaPct, salesTax } = input;
  if (delta < 0 || salesTax === null || salesTax <= 0 || salesTax < delta) return null;
  return Math.abs(deltaPct) < FLAT_PERIOD_PCT ? 'flat' : 'eroded';
}
