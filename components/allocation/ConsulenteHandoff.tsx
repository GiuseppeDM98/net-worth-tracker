'use client';

/**
 * ConsulenteHandoff — «Dal Consulente» on Allocazione › Accumulo (owner, 2026-11-12): the plan toward the targets
 * «Applica» just wrote. Three views of ONE state, so two modals are never stacked (The Modal-Is-A-Tile Rule): the
 * hand-off (the instruments matched, to create, out of the plan), `AssetDialog` for one «Crea», the plan editor
 * seeded by the optimizer. The seed is computed once per assets' read, on a clock fixed for the dialog's life; no
 * model is called — the weights are the app's, the owner confirms them in the editor.
 */
import { useMemo, useState } from 'react';
import type { Asset, AssetAllocationTarget, AssetPrefill, IdealAllocationSettings } from '@/types/assets';
import type { PlanSeedDraft } from '@/types/accumulationPlan';
import type { ModelPortfolio } from '@/types/modelPortfolio';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import type { ModelBasis } from '@/lib/utils/modelPortfolio';
import type { AllocationAdviceProposal, InstrumentCandidates } from '@/lib/utils/allocationAdviceProposal';
import { DEFAULT_IDEAL_ALLOCATION } from '@/lib/constants/idealAllocation';
import { calculateAssetValue } from '@/lib/services/assetService';
import { deriveTargetLeverageRatio } from '@/lib/services/assetAllocationService';
import { buildTargetsFromProposal } from '@/lib/utils/allocationAdviceApply';
import { buildHandoffSeed, planConsulenteHandoff } from '@/lib/utils/allocationAdviceHandoff';
import {
  describeHandoffNotBuyable,
  describeHandoffReading,
  describeHandoffUnnamed,
  HANDOFF_CREATED_PENDING,
  HANDOFF_EYEBROW,
  HANDOFF_NO_TICKER,
  HANDOFF_TITLE,
} from '@/lib/utils/accumulationNarrative';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { AssetDialog } from '@/components/assets/AssetDialog';
import { AccumulationPlanDialog } from '@/components/allocation/AccumulationPlanDialog';

interface ConsulenteHandoffProps {
  ownerId: string;
  basis: ModelBasis;
  /** The applied proposal (`handoffProposalOf`). */
  proposal: AllocationAdviceProposal;
  candidates: InstrumentCandidates | null;
  /** The interview's «da tenere», by name. */
  keepAssets: readonly string[];
  allAssets: Asset[];
  /** The settings' targets — «Applica» wrote the proposal's; null only before the re-read, then the proposal's. */
  targets: AssetAllocationTarget | null;
  band: RebalanceBand;
  targetLeverageRatio: number;
  idealAllocation: IdealAllocationSettings | null;
  model: ModelPortfolio | null;
  /** Impostazioni › Spese «Conto per gli investimenti»: the new plan starts on it; null = none. */
  investmentAccountId: string | null;
  onAssetsChanged: () => void;
  onClose: () => void;
}

type HandoffView = { kind: 'handoff' } | { kind: 'asset'; prefill: AssetPrefill } | { kind: 'pac'; seed: PlanSeedDraft };

const ROW_CLASS = 'flex min-h-11 items-center justify-between gap-3 py-2';

export function ConsulenteHandoff(props: ConsulenteHandoffProps) {
  const { proposal, candidates, keepAssets, allAssets, idealAllocation, onClose } = props;
  const [view, setView] = useState<HandoffView>({ kind: 'handoff' });
  const [openedAt] = useState(() => new Date()); // the snapshot's clock, fixed for the dialog's life
  const handoff = useMemo(() => planConsulenteHandoff(proposal, candidates, keepAssets, allAssets), [proposal, candidates, keepAssets, allAssets]);
  const outcome = useMemo(
    () =>
      buildHandoffSeed({
        proposal,
        assets: allAssets,
        matchedAssetIds: handoff.matched.map((m) => m.assetId),
        criteria: idealAllocation ?? DEFAULT_IDEAL_ALLOCATION,
        targetLeverageRatio: deriveTargetLeverageRatio(buildTargetsFromProposal(proposal)),
        valueOf: calculateAssetValue,
        now: openedAt,
      }),
    [proposal, allAssets, handoff, idealAllocation, openedAt],
  );
  // A row just created waits for the assets' re-read: no second «Crea» in between (the refetch is not awaited).
  const [createdNames, setCreatedNames] = useState<string[]>([]);

  if (view.kind === 'asset') {
    return (
      <AssetDialog
        open
        createEmpty
        prefill={view.prefill}
        onCreated={() => {
          setCreatedNames((names) => [...names, view.prefill.name]);
          props.onAssetsChanged();
        }}
        onClose={() => setView({ kind: 'handoff' })}
      />
    );
  }
  if (view.kind === 'pac') {
    return (
      <AccumulationPlanDialog
        open
        plan={null}
        seedDraft={view.seed}
        advisorKeepAssetIds={handoff.keepAssetIds}
        ownerId={props.ownerId}
        allAssets={allAssets}
        targets={props.targets ?? buildTargetsFromProposal(proposal)}
        band={props.band}
        targetLeverageRatio={props.targetLeverageRatio}
        idealAllocation={idealAllocation}
        model={props.model}
        basis={props.basis}
        reviewByIso={proposal.reviewByIso}
        investmentAccountId={props.investmentAccountId}
        onAssetsChanged={props.onAssetsChanged}
        onSaved={onClose}
        onClose={onClose}
      />
    );
  }

  const unnamed = handoff.unnamed.map((row) => row.subTarget);
  const notBuyable = handoff.notBuyable.map((row) => row.name);
  return (
    <ResponsiveModal
      open
      onClose={onClose}
      width="lg"
      eyebrow={HANDOFF_EYEBROW}
      title={HANDOFF_TITLE}
      reading={describeHandoffReading(handoff, outcome)}
      footer={
        <>
          <Button type="button" variant="outline" className="h-11 desktop:h-9" onClick={onClose}>
            Annulla
          </Button>
          <Button
            type="button"
            className="h-11 tablet:order-2 desktop:h-9"
            disabled={outcome.seed.positions.length === 0}
            onClick={() => setView({ kind: 'pac', seed: outcome.seed })}
          >
            Apri l&apos;editor
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-border">
        {handoff.matched.map((row) => (
          <li key={row.assetId} className={ROW_CLASS}>
            <span className="text-[14px] leading-[1.45]">
              {row.subTarget} · {row.name}
            </span>
            <span className="shrink-0 text-[12px] text-muted-foreground">{row.held ? 'in portafoglio' : '0 quote'}</span>
          </li>
        ))}
        {handoff.toCreate.map((row) => {
          const created = createdNames.includes(row.prefill.name);
          return (
            <li key={`${row.assetClass}:${row.name}`} className={ROW_CLASS}>
              <span className="flex flex-col">
                <span className="text-[14px] leading-[1.45]">
                  {row.subTarget} · {row.name}
                </span>
                {created ? (
                  <span className="text-[12px] text-muted-foreground">{HANDOFF_CREATED_PENDING}</span>
                ) : (
                  row.prefill.ticker === '' &&
                  row.prefill.type !== 'bond' && <span className="text-[12px] text-muted-foreground">{HANDOFF_NO_TICKER}</span>
                )}
              </span>
              {!created && (
                <Button type="button" variant="outline" className="h-11 shrink-0 desktop:h-9" onClick={() => setView({ kind: 'asset', prefill: row.prefill })}>
                  Crea
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {unnamed.length > 0 && <p className="mt-3 text-[12px] text-muted-foreground">{describeHandoffUnnamed(unnamed)}</p>}
      {notBuyable.length > 0 && <p className="mt-3 text-[12px] text-muted-foreground">{describeHandoffNotBuyable(notBuyable)}</p>}
    </ResponsiveModal>
  );
}
