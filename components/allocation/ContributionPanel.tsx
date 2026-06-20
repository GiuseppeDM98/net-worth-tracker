/**
 * ContributionPanel — "Dove investire i prossimi €X" (body of ActionPlanner's "Versa" tab).
 *
 * A no-sell planner: enter an amount of new cash and see how to split it across asset
 * classes AND — within each class — across its sub-categories, to move toward target WITHOUT
 * selling anything. Answers the recurring question for an accumulating investor down to the
 * sleeve level. Input is ephemeral, computed entirely client-side via
 * `allocateContributionHierarchical` — no persistence, no mutation, safe in demo mode.
 *
 * No Card chrome of its own; ActionPlanner provides it. Previously this lived behind a
 * collapsible card; it is now a peer tab of the rebalance plan because for an accumulator
 * "where do I put new money" is a primary action, not a buried tool.
 */
'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { allocateContributionHierarchical } from '@/lib/utils/allocationUtils';
import type { AllocationData } from '@/types/assets';

interface ContributionPanelProps {
  byAssetClass: Record<string, AllocationData>;
  bySubCategory: Record<string, AllocationData>;
}

export function ContributionPanel({ byAssetClass, bySubCategory }: ContributionPanelProps) {
  const [amountInput, setAmountInput] = useState('');
  const amount = Number(amountInput) || 0;

  // Class slices (each with its sub-category split); keep only classes that receive money.
  const plan = useMemo(
    () =>
      allocateContributionHierarchical(byAssetClass, bySubCategory, amount).filter((s) => s.add >= 0.5),
    [byAssetClass, bySubCategory, amount]
  );

  return (
    <div className="px-4 pb-5 pt-4">
      <label htmlFor="contribution-amount" className="mb-1.5 block text-xs font-medium text-muted-foreground">
        Quanto vuoi investire?
      </label>
      <div className="relative max-w-[220px]">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
          €
        </span>
        <Input
          id="contribution-amount"
          type="number"
          inputMode="decimal"
          min={0}
          step={100}
          placeholder="1.000"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          className="pl-7 font-mono tabular-nums"
        />
      </div>

      {amount > 0 && plan.length > 0 ? (
        <div className="mt-4 divide-y divide-border/50 rounded-xl border border-border bg-muted/20">
          {plan.map((slice) => {
            const subSlices = slice.subSlices.filter((s) => s.add >= 0.5);
            return (
              <div key={slice.assetClass} className="px-3.5 py-3">
                {/* Class row */}
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-foreground" title={slice.label}>
                    {slice.label}
                  </span>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      +{formatCurrency(slice.add)}
                    </p>
                    <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      → {formatPercentage(slice.newPercentage)}
                    </p>
                  </div>
                </div>

                {/* Sub-category split within this class */}
                {subSlices.length > 0 && (
                  <div className="mt-2 space-y-1.5 pl-4">
                    {subSlices.map((sub) => (
                      <div key={sub.assetClass} className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs text-muted-foreground" title={sub.label}>
                          {sub.label}
                        </span>
                        <div className="shrink-0 text-right font-mono tabular-nums">
                          <span className="text-xs font-medium text-foreground">
                            +{formatCurrency(sub.add)}
                          </span>
                          <span className="ml-1.5 text-[10px] text-muted-foreground">
                            → {formatPercentage(sub.newPercentage)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Inserisci un importo per vedere la ripartizione consigliata verso il tuo target.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70">
        Colma prima le classi e sottocategorie sotto target, senza vendere nulla. La % di classe è
        sul portafoglio, quella di sottocategoria è sulla classe. Stima indicativa, non un consiglio
        finanziario.
      </p>
    </div>
  );
}
