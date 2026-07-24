/**
 * ContributionPanel — "Dove investire i prossimi €X" (body of ActionPlanner's "Versa" tab).
 *
 * A no-sell planner: enter an amount of new cash and see how to split it across asset classes,
 * within each class across its sub-categories, and within each of those down to the individual
 * INSTRUMENT — all moving toward target without selling anything. The instrument level honours the
 * specific-asset targets from Impostazioni when they exist (so it can tell you to buy something you
 * hold none of yet) and otherwise splits pro-rata across what you already hold.
 *
 * Input is ephemeral, computed entirely client-side via `buildContributionPlan` — no persistence,
 * no mutation, safe in demo mode. No Card chrome of its own; ActionPlanner provides it. Shares
 * PlanRow with WithdrawalPanel: the two plans are one tree with the sign flipped.
 */
'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { buildContributionPlan, type AllocatableHolding } from '@/lib/utils/allocationUtils';
import {
  planInstrumentContribution,
  type LeveragePlanInputs,
} from '@/lib/utils/leverageAwareAllocationUtils';
import { PlanRow, MIN_VISIBLE_AMOUNT } from './PlanRow';
import { InstrumentTradeList } from './InstrumentTradeList';
import type { AllocationData } from '@/types/assets';

interface ContributionPanelProps {
  byAssetClass: Record<string, AllocationData>;
  bySubCategory: Record<string, AllocationData>;
  bySpecificAsset: Record<string, AllocationData>;
  holdings: AllocatableHolding[];
  /** Present only under leverage: splits the contribution across the real (leveraged) instruments. */
  leverage?: LeveragePlanInputs;
}

export function ContributionPanel({
  byAssetClass,
  bySubCategory,
  bySpecificAsset,
  holdings,
  leverage,
}: ContributionPanelProps) {
  const [amountInput, setAmountInput] = useState('');
  const amount = Number(amountInput) || 0;

  const plan = useMemo(
    () =>
      buildContributionPlan(byAssetClass, bySubCategory, bySpecificAsset, holdings, amount).filter(
        (node) => node.amount >= MIN_VISIBLE_AMOUNT
      ),
    [byAssetClass, bySubCategory, bySpecificAsset, holdings, amount]
  );

  // Under leverage, spend the new cash on the real held instruments toward the notional target
  // (buys only), instead of the class-level 1x pro-rata split.
  const leverageTrades = useMemo(
    () =>
      leverage && amount > 0
        ? planInstrumentContribution(
            leverage.tradableAssets,
            leverage.currentNotionalByAssetClass,
            leverage.currentNotionalTotal,
            leverage.currentMarketTotal,
            leverage.targetPercentageByAssetClass,
            amount,
            leverage.targetLeverageRatio
          ).trades
        : null,
    [leverage, amount]
  );

  return (
    <div className="px-4 pb-5 pt-4">
      <label
        htmlFor="contribution-amount"
        className="mb-1.5 block text-xs font-medium text-muted-foreground"
      >
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

      {amount > 0 && leverageTrades ? (
        leverageTrades.length > 0 ? (
          <div className="mt-4">
            <InstrumentTradeList trades={leverageTrades} />
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            Con questo importo nessuna operazione avvicina l&apos;esposizione al target.
          </p>
        )
      ) : amount > 0 && plan.length > 0 ? (
        <div className="mt-4 divide-y divide-border/50 rounded-xl border border-border bg-muted/20">
          {plan.map((node) => (
            <div key={node.key} className="px-3.5 py-3">
              {/* Additions are neutral, not a signal — no action color, unlike a sell. */}
              <PlanRow node={node} depth={0} color="var(--foreground)" direction="contribute" />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Inserisci un importo per vedere la ripartizione consigliata verso il tuo target.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70">
        {leverage
          ? 'Ripartisce la nuova liquidità sugli strumenti reali che detieni (solo acquisti), verso l’esposizione nozionale target di ogni classe. Stima indicativa, non un consiglio finanziario.'
          : 'Colma prima le classi e sottocategorie sotto target, senza vendere nulla. La % di classe è sul portafoglio, quella di sottocategoria è sulla classe. Sul singolo strumento segue i tuoi asset specifici, se configurati; altrimenti ripartisce in proporzione a quanto detieni. Stima indicativa, non un consiglio finanziario.'}
      </p>
    </div>
  );
}
