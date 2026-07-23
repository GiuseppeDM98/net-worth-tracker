'use client';

/**
 * "Plusvalenze realizzate" rows for Rendimenti (Fase D, spec 04 §5).
 *
 * Aggregates realized P&L by fiscal year across ALL ledger assets. replayTransactions computes
 * ONE asset's position state, so the transactions must be grouped by assetId before folding —
 * summing realizedByYear across assets is the aggregation step this module owns (kept out of the
 * shared engine per the Fase D scope: docs/specs/1-asset-transactions/05-impacts-testing-rollout.md
 * §1 does not list lib/utils/assetTransactionUtils.ts as touched by this phase).
 */

import { replayTransactions } from '@/lib/utils/assetTransactionUtils';
import { formatCurrency } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import type { AssetTransaction } from '@/types/assetTransactions';

/** Sum of realized P&L (EUR) per fiscal year, across every asset's own replay. */
export function aggregateRealizedByYear(transactions: AssetTransaction[]): Record<number, number> {
  const byAsset = new Map<string, AssetTransaction[]>();
  transactions.forEach((t) => {
    const arr = byAsset.get(t.assetId) ?? [];
    arr.push(t);
    byAsset.set(t.assetId, arr);
  });

  const totals: Record<number, number> = {};
  byAsset.forEach((assetTransactions) => {
    try {
      const { realizedByYear } = replayTransactions(assetTransactions);
      Object.entries(realizedByYear).forEach(([year, amount]) => {
        totals[Number(year)] = (totals[Number(year)] ?? 0) + amount;
      });
    } catch {
      // A per-asset sequence is server-validated at write time; an unexpected failure here should
      // not take down the whole "Plusvalenze realizzate" card — just skip that asset's contribution.
    }
  });
  return totals;
}

function signClass(value: number): string {
  if (value > 0) return 'text-positive';
  if (value < 0) return 'text-destructive';
  return 'text-foreground';
}

function formatSigned(value: number): string {
  return `${value > 0 ? '+' : ''}${formatCurrency(value)}`;
}

/** Flat divide-y rows (one per fiscal year, newest first) + a total row. Renders nothing when empty. */
export function RealizedGainsRows({ byYear }: { byYear: Record<number, number> }) {
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  if (years.length === 0) return null;

  const total = years.reduce((sum, year) => sum + byYear[year], 0);

  return (
    <>
      {years.map((year) => (
        <div key={year} className="flex items-center justify-between gap-4 px-6 py-3.5">
          <span className="text-sm font-medium text-foreground">{year}</span>
          <span className={cn('font-mono text-sm font-semibold tabular-nums', signClass(byYear[year]))}>
            {formatSigned(byYear[year])}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 bg-muted/30 px-6 py-3.5">
        <span className="text-sm font-semibold text-foreground">Totale</span>
        <span className={cn('font-mono text-sm font-bold tabular-nums', signClass(total))}>
          {formatSigned(total)}
        </span>
      </div>
    </>
  );
}
