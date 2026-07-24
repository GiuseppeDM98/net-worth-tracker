/**
 * InstrumentTradeList — renders the leverage-aware planner's flat `InstrumentTrade[]`
 * (spec 3-leveraged-etf-allocation/02 §4 "Rendering").
 *
 * The instrument-aware engine (leverageAwareAllocationUtils.ts) reasons over the real held
 * instruments, so its output is a flat list of concrete buys/sells — NOT the class → sub → instrument
 * tree the pro-rata planners produce. Rather than force it into `PlanRow`'s tree shape, we render it
 * as what it is: signed instrument trades, largest first, buy vs sell in the shared action colors
 * (`useActionColors`). A positive amount is a COMPRA, a negative one a VENDI.
 *
 * The trade shows the user-facing alias when set (`displayTicker`, ticker-display-alias), else the
 * ticker, else the name. Pure presentation; the panels own the amount input and the empty states.
 */
'use client';

import { formatCurrency } from '@/lib/services/chartService';
import type { InstrumentTrade } from '@/lib/utils/leverageAwareAllocationUtils';
import { useActionColors } from '@/lib/hooks/useActionColors';
import { ActionChip } from './ActionChip';

interface InstrumentTradeListProps {
  trades: InstrumentTrade[];
}

/** The label a trade shows: user alias → ticker → name. */
function tradeLabel(trade: InstrumentTrade): string {
  return trade.displayTicker || trade.ticker || trade.name;
}

export function InstrumentTradeList({ trades }: InstrumentTradeListProps) {
  const actionColors = useActionColors();

  if (trades.length === 0) return null;

  return (
    <div className="divide-y divide-border/50 rounded-xl border border-border bg-muted/20">
      {trades.map((trade) => {
        const isBuy = trade.amount >= 0;
        const action = isBuy ? 'COMPRA' : 'VENDI';
        const label = tradeLabel(trade);
        return (
          <div key={trade.assetId} className="flex items-start justify-between gap-3 px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-2">
                <ActionChip action={action} color={actionColors[action]} />
                <span className="truncate text-sm font-medium text-foreground" title={label}>
                  {label}
                </span>
              </div>
              {/* Show the full name as a subtitle only when the primary label wasn't already it. */}
              {label !== trade.name && (
                <p className="truncate text-[11px] text-muted-foreground" title={trade.name}>
                  {trade.name}
                </p>
              )}
            </div>
            <p
              className="shrink-0 font-mono text-lg font-bold tabular-nums leading-none"
              style={{ color: actionColors[action] }}
            >
              {isBuy ? '+' : '−'}
              {formatCurrency(Math.abs(trade.amount))}
            </p>
          </div>
        );
      })}
    </div>
  );
}
