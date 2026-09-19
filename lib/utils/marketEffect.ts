/**
 * The market effect of one instrument between two valuations — the ONE rule the Panoramica (the
 * live portfolio against the previous snapshot) and Storico's Driver (snapshot against snapshot)
 * share, so «mercato» means the same thing on both pages.
 *
 * SDK-free: both callers hand in plain `{ quantity, totalValue }` rows; nothing here reaches the
 * Firebase layer, so the module is readable by the server and by the tests without mocks.
 */

import type { AssetTransaction } from '@/types/assetTransactions';
import type { PensionContribution } from '@/types/pension';
import { valueEffectMonth } from '@/lib/utils/pensionReturn';

/** A position at one valuation: EUR value and the quantity it was held in. */
export interface PositionValue {
  quantity: number;
  totalValue: number;
}

/**
 * The market effect of an instrument traded between two valuations, from the ledger:
 *
 *   Δvalue − net money put in − quantity the ledger does not explain × today's unit value
 *
 * where «money put in» is Σ buys (quantity × priceEur + fees) − Σ sells (quantity × priceEur −
 * fees). For a held quote this is the old `q_prev × Δu`; for a bought one `q × (u_now − p) − fees`;
 * for a sold one `q × (p − u_prev) − fees`. A quantity change no BUY/SELL explains — a migration
 * baseline, an adjustment, a hand-edited quantity — moves no money the ledger knows, so it is
 * valued at the current unit price and kept OUT of the market (it lands in «altre variazioni»).
 *
 * `trades` must already be scoped to the window between the two valuations. Returns null when the
 * instrument has no BUY/SELL in it (the caller keeps `q_prev × Δu`), and for a position closed
 * with an unexplained remainder (no price left to value it at).
 */
export function tradeAwarePriceEffect(
  previous: PositionValue | undefined,
  current: PositionValue | undefined,
  trades: AssetTransaction[]
): number | null {
  const moneyTrades = trades.filter((t) => (t.type === 'buy' && !t.isBaseline) || t.type === 'sell');
  if (moneyTrades.length === 0) return null;

  let moneyIn = 0;
  let tradedQuantity = 0;
  for (const trade of moneyTrades) {
    const fees = trade.fees ?? 0;
    if (trade.type === 'buy') {
      moneyIn += trade.quantity * trade.priceEur + fees;
      tradedQuantity += trade.quantity;
    } else {
      moneyIn -= trade.quantity * trade.priceEur - fees;
      tradedQuantity -= trade.quantity;
    }
  }

  const previousQuantity = previous?.quantity ?? 0;
  const currentQuantity = current?.quantity ?? 0;
  const unexplainedQuantity = currentQuantity - previousQuantity - tradedQuantity;
  const currentUnit = current && current.quantity > 0 ? current.totalValue / current.quantity : null;
  // Float noise from quantities like 0.1 + 0.2 is not a quantity the ledger failed to explain.
  const hasUnexplained = Math.abs(unexplainedQuantity) > 1e-9;
  if (hasUnexplained && currentUnit === null) return null;

  const valueChange = (current?.totalValue ?? 0) - (previous?.totalValue ?? 0);
  return valueChange - moneyIn - (hasUnexplained ? unexplainedQuantity * currentUnit! : 0);
}

/**
 * What was paid into one pension fund after the month `afterKey` ('YYYY-MM'), through
 * `throughKey` when given — attributed to the month its VALUE moved (`valueEffectMonth`, the rule
 * Previdenza's «Rendimento del fondo» uses). A fund's market effect is its value change minus this.
 */
export function pensionPaidInBetween(
  contributions: PensionContribution[],
  assetId: string,
  afterKey: string,
  throughKey?: string
): number {
  return contributions
    .filter((c) => {
      if (c.assetId !== assetId) return false;
      const key = valueEffectMonth(c);
      return key > afterKey && (throughKey === undefined || key <= throughKey);
    })
    .reduce((sum, c) => sum + c.amount, 0);
}
