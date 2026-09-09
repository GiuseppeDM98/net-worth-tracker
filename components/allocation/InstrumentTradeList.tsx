/**
 * InstrumentTradeList — renders the leverage-aware planner's flat `InstrumentTrade[]`.
 *
 * The instrument-aware engine (leverageAwareAllocationUtils.ts) reasons over the real held
 * instruments, so its output is a flat list of concrete buys/sells — NOT the class → sub → instrument
 * tree the pro-rata planners produce. Rather than force it into `PlanRow`'s tree shape, we render it
 * as what it is: signed instrument trades, largest first, buy vs sell in the shared action colors.
 * A positive amount is a COMPRA, a negative one a VENDI.
 *
 * The rows are flat (`divide-y`, no box) because they live inside the Piano tile: a bordered,
 * tinted list inside a card is the card-within-card the tile form exists to remove (DESIGN.md →
 * Flat List Row). The amount is the row's dominant value at 15px — under the tile's 22px KPI
 * scale, above its 13px rows — because a trade is an order to fill, not a statistic to skim.
 * The action colours are neither gain nor loss, so they never come from the sign tokens; the
 * tile resolves them once (`useActionColors`) and passes them down — never a hook per list.
 *
 * The trade shows `displayTicker`, which `buildInstrumentExposures` already resolves via
 * `getAssetDisplayTicker` (alias → ticker → name) — this just guards the optional-field type.
 * Pure presentation; the tile owns the amount input and the empty states.
 */
'use client';

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import type { AllocationAction } from '@/lib/utils/allocationUtils';
import type { InstrumentTrade } from '@/lib/utils/leverageAwareAllocationUtils';
import { ActionChip } from './ActionChip';

interface InstrumentTradeListProps {
  trades: InstrumentTrade[];
  /** COMPRA/VENDI/OK colours resolved ONCE by the tile. */
  actionColors: Record<AllocationAction, string>;
  /** Accessible name of the list. */
  ariaLabel?: string;
}

const MINUS = '−';

function tradeLabel(trade: InstrumentTrade): string {
  return trade.displayTicker || trade.ticker;
}

export function InstrumentTradeList({ trades, actionColors: colors, ariaLabel }: InstrumentTradeListProps) {
  if (trades.length === 0) return null;

  return (
    <ul className="divide-y divide-border" aria-label={ariaLabel}>
      {trades.map((trade) => {
        const isBuy = trade.amount >= 0;
        const action: AllocationAction = isBuy ? 'COMPRA' : 'VENDI';
        const label = tradeLabel(trade);
        return (
          <li key={trade.assetId} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <ActionChip action={action} color={colors[action]} />
                <span className="truncate text-[13px] font-medium text-foreground" title={label}>
                  {label}
                </span>
              </div>
              {/* Show the full name as a subtitle only when the primary label wasn't already it. */}
              {label !== trade.name && (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={trade.name}>
                  {trade.name}
                </p>
              )}
            </div>
            <p
              className="shrink-0 font-mono text-[15px] font-semibold tabular-nums leading-none"
              style={{ color: colors[action] }}
            >
              {isBuy ? '+' : MINUS}
              {cachedFormatCurrencyEUR(Math.abs(trade.amount), true)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
