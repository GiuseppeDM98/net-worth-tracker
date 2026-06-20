/**
 * ActionPlanner — "Cosa faccio" (A4): one block, two answers to the same question.
 *
 * The page used to scatter the two things a user actually does into a prominent card
 * (rebalance plan) and a buried collapsible (contribution planner). They are two answers to
 * one question — "what do I do to get closer to target?" — so they belong together behind a
 * segmented switch:
 *   - Ribilancia → sell the over-allocated, buy the under-allocated (RebalancePanel).
 *   - Versa      → split new cash with no selling (ContributionPanel).
 *
 * Surfacing "Versa" as a peer tab (not a collapsed card at the page bottom) matters: for an
 * accumulating investor, "where do I put new money" is a primary action. The segmented pill
 * follows DESIGN.md "Segmented Pill Control, Variant B" (Framer `layoutId`, spring 400/35).
 *
 * Pure presentation; no data fetching, no mutation (no demo-mode concern).
 */
'use client';

import { useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { type RebalanceMove } from '@/lib/utils/allocationUtils';
import type { AllocationData } from '@/types/assets';
import { RebalancePanel } from './RebalancePanel';
import { ContributionPanel } from './ContributionPanel';

type Mode = 'rebalance' | 'contribute';

const MODES: { key: Mode; label: string }[] = [
  { key: 'rebalance', label: 'Ribilancia' },
  { key: 'contribute', label: 'Versa' },
];

interface ActionPlannerProps {
  moves: RebalanceMove[];
  byAssetClass: Record<string, AllocationData>;
  bySubCategory: Record<string, AllocationData>;
}

export function ActionPlanner({ moves, byAssetClass, bySubCategory }: ActionPlannerProps) {
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

      {mode === 'rebalance' ? (
        <RebalancePanel moves={moves} />
      ) : (
        <ContributionPanel byAssetClass={byAssetClass} bySubCategory={bySubCategory} />
      )}
    </Card>
  );
}
