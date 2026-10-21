'use client';

/**
 * PianiConclusiTile — «come sono andati i piani passati?» (doc/pac-ottimizzatore § RP6, PO9). Read-only:
 * one row per `completed` or `cancelled` plan, newest first — name, period, installments closed,
 * what was invested against what the plan could spend, and the largest class gap at its last
 * measurement. The one action is AL12's «Riattiva», on a plan interrupted under 30 days ago while no
 * other is open (D-AL2). The tab mounts it only when there is one.
 */
import { useRef } from 'react';
import type { AccumulationPlan } from '@/types/accumulationPlan';
import type { AssetAllocationTarget } from '@/types/assets';
import { canReactivatePlan, summarizeClosedPlan } from '@/lib/utils/accumuloSummary';
import { useReactivatePlan } from '@/lib/hooks/useAccumulationPlan';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { armedActionLabel, describeWriteError } from '@/lib/utils/dialogNarrative';
import { Button } from '@/components/ui/button';
import {
  ACCUMULO_ACTION_REACTIVATE,
  ACCUMULO_ACTION_REACTIVATE_VERB,
  ACCUMULO_CLOSED_PLANS_COLUMNS,
  ACCUMULO_REACTIVATE_COLUMN,
  ACCUMULO_CLOSED_PLANS_EYEBROW,
  describeClosedPlansAside,
  describeClosedPlanDrift,
  describeClosedPlanInstallments,
  describeClosedPlanInvested,
  describeClosedPlanPeriod,
} from '@/lib/utils/accumulationNarrative';
import { Tile, type TileCollapse } from '@/components/ui/tile';

const HEAD_CLASS = 'py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';
const CELL_CLASS = 'whitespace-nowrap py-1.5 pr-2 text-right font-mono text-[12px] tabular-nums text-muted-foreground';

interface PianiConclusiTileProps {
  ownerId: string;
  /** The closed plans, newest first. */
  plans: AccumulationPlan[];
  /** Every plan of the account: «Riattiva» needs to know none is open. */
  allPlans: AccumulationPlan[];
  targets: AssetAllocationTarget | null;
  /** The row of the phone composition (The Closed-Row Rule); absent at 1440. */
  collapse?: TileCollapse;
  asideWhenClosed?: string;
}

/** The row's armed «Riattiva» (AL12): one click arms, the second reactivates; the row says why it failed. */
function ReactivateButton({ ownerId, plan }: { ownerId: string; plan: AccumulationPlan }) {
  const isDemo = useDemoMode();
  const ref = useRef<HTMLButtonElement>(null);
  const mutation = useReactivatePlan(ownerId);
  const armed = useArmedDelete(ref, () => {
    mutation.mutate(plan.id);
  });
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        ref={ref}
        variant="outline"
        className="h-11 desktop:h-7"
        disabled={isDemo || mutation.isPending}
        onClick={armed.onClick}
        onBlur={armed.onBlur}
      >
        {armed.armed ? armedActionLabel(ACCUMULO_ACTION_REACTIVATE_VERB) : ACCUMULO_ACTION_REACTIVATE}
      </Button>
      {mutation.isError && (
        <p role="alert" className="text-[11px] text-destructive">
          {describeWriteError(mutation.error)}
        </p>
      )}
    </div>
  );
}

export function PianiConclusiTile({ ownerId, plans, allPlans, targets, collapse, asideWhenClosed }: PianiConclusiTileProps) {
  const now = new Date();
  const anyReactivable = plans.some((plan) => canReactivatePlan(plan, allPlans, now));
  return (
    <Tile eyebrow={ACCUMULO_CLOSED_PLANS_EYEBROW} aside={describeClosedPlansAside(plans.length)} asideWhenClosed={asideWhenClosed} collapse={collapse}>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left">
              {ACCUMULO_CLOSED_PLANS_COLUMNS.map((column, index) => (
                <th key={column} scope="col" className={`${HEAD_CLASS} ${index === 0 ? '' : 'text-right'} ${index === ACCUMULO_CLOSED_PLANS_COLUMNS.length - 1 ? 'pr-0' : ''}`}>
                  {column}
                </th>
              ))}
              {anyReactivable && (
                <th scope="col" className={`${HEAD_CLASS} text-right pr-0`}>
                  <span className="sr-only">{ACCUMULO_REACTIVATE_COLUMN}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => {
              const row = summarizeClosedPlan(plan, targets);
              return (
                <tr key={plan.id} className="border-b border-border last:border-0">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">
                    <span className="line-clamp-2 break-words">{row.name}</span>
                  </th>
                  <td className={CELL_CLASS}>{describeClosedPlanPeriod(row.startMonth, row.endMonth)}</td>
                  <td className={CELL_CLASS}>{describeClosedPlanInstallments(row.closedCount, row.totalMonths, row.interrupted)}</td>
                  <td className={CELL_CLASS}>{describeClosedPlanInvested(row.investedEur, row.plannedEur)}</td>
                  <td className={`${CELL_CLASS} ${anyReactivable ? '' : 'pr-0'}`}>{describeClosedPlanDrift(row.finalDrift)}</td>
                  {anyReactivable && (
                    <td className="py-1.5 text-right">
                      {canReactivatePlan(plan, allPlans, now) && <ReactivateButton ownerId={ownerId} plan={plan} />}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tile>
  );
}
