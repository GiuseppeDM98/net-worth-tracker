/**
 * WithdrawalPanel — "Da dove prelevo i prossimi €X" (body of ActionPlanner's "Preleva" tab).
 *
 * The decumulation mirror of ContributionPanel. Enter an amount and see which asset classes, which
 * sub-categories within them, and finally which instruments to sell — draining whatever sits ABOVE
 * target first, so the withdrawal moves the portfolio toward its allocation instead of distorting
 * it further. That ordering is the whole point: the naive answer ("sell a bit of everything")
 * wastes the one free rebalancing opportunity a withdrawal hands you.
 *
 * Unlike the contribution, the instrument level comes strictly from what is HELD: you can be told
 * to buy something you do not own, never to sell it.
 *
 * Input is ephemeral, computed client-side via `buildWithdrawalPlan` — no persistence, no mutation,
 * safe in demo mode. No Card chrome of its own; ActionPlanner provides it.
 */
'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/services/chartService';
import { useActionColors } from '@/lib/hooks/useActionColors';
import { buildWithdrawalPlan, type AllocatableHolding } from '@/lib/utils/allocationUtils';
import {
  planInstrumentWithdrawal,
  type LeveragePlanInputs,
} from '@/lib/utils/leverageAwareAllocationUtils';
import { PlanRow, MIN_VISIBLE_AMOUNT } from './PlanRow';
import { InstrumentTradeList } from './InstrumentTradeList';
import type { AllocationData } from '@/types/assets';

interface WithdrawalPanelProps {
  byAssetClass: Record<string, AllocationData>;
  bySubCategory: Record<string, AllocationData>;
  holdings: AllocatableHolding[];
  /** Present only under leverage: raises the cash by selling the real instruments toward target. */
  leverage?: LeveragePlanInputs;
}

export function WithdrawalPanel({
  byAssetClass,
  bySubCategory,
  holdings,
  leverage,
}: WithdrawalPanelProps) {
  const [amountInput, setAmountInput] = useState('');
  const amount = Number(amountInput) || 0;
  const actionColors = useActionColors();

  const totalValue = useMemo(
    () => Object.values(byAssetClass).reduce((sum, data) => sum + data.currentValue, 0),
    [byAssetClass]
  );

  const plan = useMemo(
    () =>
      buildWithdrawalPlan(byAssetClass, bySubCategory, holdings, amount).filter(
        (node) => node.amount >= MIN_VISIBLE_AMOUNT
      ),
    [byAssetClass, bySubCategory, holdings, amount]
  );

  // Under leverage, raise the cash by selling the real instruments toward the notional target
  // (sells only), instead of the class-level 1x drain.
  const leverageTrades = useMemo(
    () =>
      leverage && amount > 0
        ? planInstrumentWithdrawal(
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

  // The plan still returns a full drain when asked for more than exists (Σtake is capped at the
  // total), but presenting that as a normal answer would hide the fact that it is not enough.
  const exceedsPortfolio = amount > 0 && amount >= totalValue;

  return (
    <div className="px-4 pb-5 pt-4">
      <label
        htmlFor="withdrawal-amount"
        className="mb-1.5 block text-xs font-medium text-muted-foreground"
      >
        Quanto vuoi prelevare?
      </label>
      <div className="relative max-w-[220px]">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
          €
        </span>
        <Input
          id="withdrawal-amount"
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

      {exceedsPortfolio && (
        <p className="mt-3 text-xs" style={{ color: actionColors.VENDI }}>
          L&apos;importo supera il patrimonio ribilanciabile ({formatCurrency(totalValue)}). Il piano
          qui sotto liquida tutto.
        </p>
      )}

      {amount > 0 && leverageTrades ? (
        leverageTrades.length > 0 ? (
          <div className="mt-4">
            <InstrumentTradeList trades={leverageTrades} />
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            Con questo importo nessuna vendita avvicina l&apos;esposizione al target.
          </p>
        )
      ) : amount > 0 && plan.length > 0 ? (
        <div className="mt-4 divide-y divide-border/50 rounded-xl border border-border bg-muted/20">
          {plan.map((node) => (
            <div key={node.key} className="px-3.5 py-3">
              <PlanRow node={node} depth={0} color={actionColors.VENDI} direction="withdraw" />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Inserisci un importo per vedere da dove conviene prelevare.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70">
        {leverage
          ? 'Raccoglie la cifra vendendo gli strumenti reali che detieni (solo vendite), riportando l’esposizione nozionale verso il target. Le tasse sulla plusvalenza non sono considerate. Stima indicativa, non un consiglio finanziario.'
          : 'Attinge prima da classi e sottocategorie sopra target, così il prelievo ti riavvicina all’obiettivo. Dove non c’è un target, ripartisce in proporzione a quanto detieni. Le tasse sulla plusvalenza non sono considerate. Stima indicativa, non un consiglio finanziario.'}
      </p>
    </div>
  );
}
