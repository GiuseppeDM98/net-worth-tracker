/**
 * ActionPlanner — "Cosa faccio" (A4): one block, three answers to the same question.
 *
 * The page used to scatter the things a user actually does into a prominent card (rebalance plan)
 * and a buried collapsible (contribution planner). They are answers to ONE question — "what do I do
 * to get closer to target?" — so they belong together behind a segmented switch:
 *   - Ribilancia → sell the over-allocated, buy the under-allocated (RebalancePanel).
 *   - Versa      → split new cash with no selling (ContributionPanel).
 *   - Preleva    → take money out, draining what is above target first (WithdrawalPanel).
 *
 * The three cover a portfolio's whole life: Versa is the accumulation question, Preleva the
 * decumulation one, Ribilancia the no-net-flow one. Surfacing them as peer tabs (not collapsed
 * cards at the page bottom) matters: each is a primary action in its phase. The segmented pill
 * follows DESIGN.md "Segmented Pill Control, Variant B" (Framer `layoutId`, spring 400/35).
 *
 * Pure presentation; no data fetching, no mutation (no demo-mode concern).
 */
'use client';

import { useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { type AllocatableHolding, type RebalanceMove } from '@/lib/utils/allocationUtils';
import type { LeveragePlanInputs } from '@/lib/utils/leverageAwareAllocationUtils';
import type { AllocationData } from '@/types/assets';
import { RebalancePanel } from './RebalancePanel';
import { ContributionPanel } from './ContributionPanel';
import { WithdrawalPanel } from './WithdrawalPanel';

type Mode = 'rebalance' | 'contribute' | 'withdraw';

const MODES: { key: Mode; label: string }[] = [
  { key: 'rebalance', label: 'Ribilancia' },
  { key: 'contribute', label: 'Versa' },
  { key: 'withdraw', label: 'Preleva' },
];

interface ActionPlannerProps {
  moves: RebalanceMove[];
  byAssetClass: Record<string, AllocationData>;
  /** MUST already have orphaned sub-targets stripped (`stripOrphanedSubTargets`). */
  bySubCategory: Record<string, AllocationData>;
  bySpecificAsset: Record<string, AllocationData>;
  /** Per-instrument rows of the rebalanceable portfolio; Versa and Preleva drill down to these. */
  holdings: AllocatableHolding[];
  /** Present only when the portfolio has leveraged exposure: routes all three modes through the
   *  instrument-aware engine instead of the class-level pro-rata planners. */
  leverage?: LeveragePlanInputs;
}

export function ActionPlanner({
  moves,
  byAssetClass,
  bySubCategory,
  bySpecificAsset,
  holdings,
  leverage,
}: ActionPlannerProps) {
  const reducedMotion = useReducedMotion();
  const layoutId = useId();
  const [mode, setMode] = useState<Mode>('rebalance');

  return (
    <Card className="overflow-hidden py-0">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Cosa faccio
        </p>

        <div
          role="tablist"
          aria-label="Tipo di azione"
          className="flex items-center gap-1 self-start rounded-lg bg-muted p-1 sm:self-auto"
        >
          {MODES.map((option) => {
            const isActive = mode === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setMode(option.key)}
                className={cn(
                  'relative rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId={`action-pill-${layoutId}`}
                    className="absolute inset-0 rounded-md bg-background shadow-sm"
                    transition={
                      reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }
                    }
                  />
                )}
                <span className="relative z-10">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {mode === 'rebalance' && <RebalancePanel moves={moves} leverage={leverage} />}
      {mode === 'contribute' && (
        <ContributionPanel
          byAssetClass={byAssetClass}
          bySubCategory={bySubCategory}
          bySpecificAsset={bySpecificAsset}
          holdings={holdings}
          leverage={leverage}
        />
      )}
      {mode === 'withdraw' && (
        <WithdrawalPanel
          byAssetClass={byAssetClass}
          bySubCategory={bySubCategory}
          holdings={holdings}
          leverage={leverage}
        />
      )}
    </Card>
  );
}
