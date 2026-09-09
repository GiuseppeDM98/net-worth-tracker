'use client';

/**
 * «Dettaglio», below the grid behind a disclosure: the next contribution split across the goals
 * (12, the input beside the split from `desktop:`) and how the calculation works (12, three
 * columns). Closed by default: the verdict and the five tiles already answer «sono in rotta?».
 *
 * The split is `allocateContributionAcrossGoals` (gap × priority, the weighting the goal-driven
 * allocation uses); the amount is ephemeral, client-side and safe in demo — nothing is written.
 */

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { GoalProgress, InvestmentGoal } from '@/types/goals';
import { allocateContributionAcrossGoals } from '@/lib/utils/goalTrajectory';
import { describeVersamento, EXPLAINER } from '@/lib/utils/goalsNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { PRIORITY_META } from '@/components/goals/goalVerdictMeta';

interface GoalsDettaglioProps {
  description: string;
  goals: InvestmentGoal[];
  progressList: GoalProgress[];
}

export function GoalsDettaglio({ description, goals, progressList }: GoalsDettaglioProps) {
  const [open, setOpen] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const amount = Number(amountInput.replace(',', '.')) || 0;

  const plan = useMemo(() => allocateContributionAcrossGoals(goals, progressList, amount), [goals, progressList, amount]);
  const reading = useMemo(() => describeVersamento(plan, amount), [plan, amount]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Dettaglio</span>
          <span className="text-[13px] text-muted-foreground">{description}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-1">
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
            <Tile eyebrow="Prossimo versamento" aside="gap × priorità" reading={reading} ariaLabel="Prossimo versamento">
              <div className="mt-3.5 grid grid-cols-1 gap-x-8 gap-y-4 desktop:grid-cols-[260px_minmax(0,1fr)]">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="goal-contribution-amount" className="text-[11px] font-medium text-muted-foreground">
                    Quanto vuoi versare?
                  </label>
                  <div className="relative max-w-[220px]">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground" aria-hidden="true">
                      €
                    </span>
                    <Input
                      id="goal-contribution-amount"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={100}
                      placeholder="1000"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      className="pl-7 font-mono tabular-nums"
                    />
                  </div>
                </div>

                {plan.length > 0 && (
                  <ul className="flex flex-col divide-y divide-border" aria-label="Ripartizione del versamento">
                    {plan.map((slice) => (
                      <li key={slice.goalId} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.color }} aria-hidden="true" />
                          <span className="truncate text-[13px] text-foreground">{slice.goalName}</span>
                          <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', PRIORITY_META[slice.priority].chipClass)}>{PRIORITY_META[slice.priority].label}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end font-mono tabular-nums leading-[1.3]">
                          <span className="text-[13px] font-semibold text-foreground">+{cachedFormatCurrencyEUR(slice.add, true)}</span>
                          <span className="text-[11px] text-muted-foreground">mancano {cachedFormatCurrencyEUR(slice.gap, true)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="mt-3.5 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
                Ripartizione pesata su quanto manca a ciascun obiettivo per la sua priorità (Alta <span className="font-mono">3×</span> · Media <span className="font-mono">2×</span> · Bassa <span className="font-mono">1×</span>); un obiettivo non riceve mai più di quanto gli manca. Una stima, non un consiglio: nulla viene salvato.
              </p>
            </Tile>
          </div>

          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
            <Tile eyebrow="Come funziona" ariaLabel="Come funziona il calcolo">
              <div className="mt-3 grid grid-cols-1 gap-5 text-[13px] leading-[1.5] text-muted-foreground desktop:grid-cols-3">
                {EXPLAINER.map((block) => (
                  <div key={block.title}>
                    <p className="mb-1 font-medium text-foreground">{block.title}</p>
                    {block.body}
                  </div>
                ))}
              </div>
            </Tile>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
