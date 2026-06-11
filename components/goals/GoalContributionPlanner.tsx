/**
 * GoalContributionPlanner (B3) — "Dove metto il prossimo versamento".
 *
 * Enter an amount of new cash; it's split across goals weighted by remaining gap × priority
 * (the same weighting the goal-driven allocation uses), so the most urgent under-funded goals
 * get the most. Collapsed by default — it's a tool, not status. Ephemeral, client-side only,
 * safe in demo mode (no mutation).
 *
 * Mirrors the Allocazione page's ContributionAllocator for cross-page consistency.
 */

'use client';

import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatCurrency } from '@/lib/utils/formatters';
import { allocateContributionAcrossGoals } from '@/lib/utils/goalTrajectory';
import { InvestmentGoal, GoalProgress } from '@/types/goals';
import { PRIORITY_META } from './goalVerdictMeta';

interface GoalContributionPlannerProps {
  goals: InvestmentGoal[];
  progressList: GoalProgress[];
}

export function GoalContributionPlanner({ goals, progressList }: GoalContributionPlannerProps) {
  const reducedMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [amountInput, setAmountInput] = useState('');

  const amount = Number(amountInput) || 0;

  const plan = useMemo(
    () => allocateContributionAcrossGoals(goals, progressList, amount),
    [goals, progressList, amount]
  );

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="overflow-hidden py-0">
        <CollapsibleTrigger asChild>
          <div className="group flex cursor-pointer select-none items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Pianifica un versamento
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Dove indirizzare nuova liquidità tra i tuoi obiettivi
                </p>
              </div>
            </div>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, height: 0 }}
            animate={reducedMotion ? undefined : { opacity: 1, height: 'auto' }}
            transition={reducedMotion ? undefined : { duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="border-t border-border px-4 pb-5 pt-4">
              <label
                htmlFor="goal-contribution-amount"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Quanto vuoi versare?
              </label>
              <div className="relative max-w-[220px]">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                  €
                </span>
                <Input
                  id="goal-contribution-amount"
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
                <ul className="mt-4 divide-y divide-border/50 rounded-xl border border-border bg-muted/20">
                  {plan.map((slice) => (
                    <li
                      key={slice.goalId}
                      className="flex items-center justify-between gap-3 px-3.5 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: slice.color }}
                        />
                        <span className="truncate text-sm font-medium text-foreground" title={slice.goalName}>
                          {slice.goalName}
                        </span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_META[slice.priority].chipClass}`}
                        >
                          {PRIORITY_META[slice.priority].label}
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                          +{formatCurrency(slice.add)}
                        </p>
                        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                          mancano {formatCurrency(slice.gap)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : amount > 0 ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  Nessun obiettivo con un importo target ancora da colmare. Imposta un importo
                  obiettivo per ricevere una ripartizione.
                </p>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">
                  Inserisci un importo per vedere come ripartirlo tra gli obiettivi sotto target.
                </p>
              )}

              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70">
                Ripartizione pesata su quanto manca a ciascun obiettivo per la sua priorità (Alta
                3× · Media 2× · Bassa 1×). Stima indicativa, non un consiglio finanziario.
              </p>
            </div>
          </motion.div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
