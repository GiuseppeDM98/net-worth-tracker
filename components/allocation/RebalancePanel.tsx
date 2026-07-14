/**
 * RebalancePanel — the consolidated, prioritized trade list (body of ActionPlanner's
 * "Ribilancia" tab).
 *
 * Every off-target asset class becomes one signed move (buy the under-allocated, trim the
 * over-allocated), largest euro amount first. When everything is within the active band it
 * shows a calm "in linea" state rather than an empty list. Pure presentation over
 * `buildRebalancePlan` output — no Card chrome of its own; ActionPlanner provides it.
 */
'use client';

import { CheckCircle2 } from 'lucide-react';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { type RebalanceMove } from '@/lib/utils/allocationUtils';
import { useActionColors } from '@/lib/hooks/useActionColors';
import { ActionChip } from './ActionChip';

interface RebalancePanelProps {
  moves: RebalanceMove[];
}

export function RebalancePanel({ moves }: RebalancePanelProps) {
  const actionColors = useActionColors();

  if (moves.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <CheckCircle2 className="h-7 w-7" style={{ color: actionColors.OK }} aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Tutto in linea</p>
        <p className="text-xs text-muted-foreground">
          Nessun movimento necessario entro la soglia attuale.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {moves.map((move) => {
        const isBuy = move.action === 'COMPRA';
        return (
          <div key={move.assetClass} className="flex items-start justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <ActionChip action={move.action} color={actionColors[move.action]} />
                <span className="truncate text-sm font-medium text-foreground" title={move.label}>
                  {move.label}
                </span>
              </div>
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatPercentage(move.currentPercentage)}
                <span className="px-1 opacity-40">→</span>
                {formatPercentage(move.targetPercentage)}
              </p>
            </div>

            {/* A VENDI capped by frozen wealth prints what you CAN sell, never the raw gap: the gap
                stays visible as the % → % line on the left, but the euro figure has to be an order
                you can actually fill. When nothing at all is sellable, say so instead of "−0 €". */}
            <div className="shrink-0 text-right">
              {move.limitedByFrozen && move.amount < 0.5 ? (
                <p className="text-sm font-medium text-muted-foreground">Non negoziabile</p>
              ) : (
                <p
                  className="font-mono text-lg font-bold tabular-nums leading-none"
                  style={{ color: actionColors[move.action] }}
                >
                  {isBuy ? '+' : '−'}
                  {formatCurrency(move.amount)}
                </p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {move.limitedByFrozen
                  ? move.amount < 0.5
                    ? 'tutto in asset non negoziabili'
                    : `max vendibile · gap ${formatCurrency(move.requestedAmount)}`
                  : isBuy
                    ? 'da aggiungere'
                    : 'da ridurre'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
