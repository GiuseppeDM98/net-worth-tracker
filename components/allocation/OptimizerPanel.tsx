'use client';

/**
 * OptimizerPanel — the PAC editor's "Ottimizzato" view of step 2.
 * Replaces the manual weight table when the reader picks "Ottimizzato": summarises the active
 * objectives from Impostazioni → Allocazione, lets them pick Raggiungibile/Ideale, resolves
 * instrument profiles for every position's members on "Calcola", runs the pure `optimizeWeights`
 * engine and renders its report. "Usa questi pesi" hands the caller the proposed weights AND the
 * `OptimizerSnapshot` to persist with the draft (§9.4) — this component never writes to Firestore
 * itself.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Asset, AssetAllocationTarget, AssetClass, IdealAllocationSettings } from '@/types/assets';
import type { AccumulationPlanDraft, OptimizerSnapshot } from '@/types/accumulationPlan';
import {
  findSecondLevelGaps,
  hasSpecificAssetTargets,
  runOptimizer,
  type OptimizerMode,
  type OptimizerResult,
} from '@/lib/utils/weightOptimizer';
import { calculateAssetValue } from '@/lib/services/assetService';
import { resolvePositionStates, unitPriceEur, type PlanDeps } from '@/lib/utils/accumulationPlanUtils';
import { buildIdealAllocationInput, describeIdealAllocation } from '@/lib/utils/settingsNarrative';
import {
  describeOptimizerMode,
  describeSecondLevelGaps,
  OPTIMIZER_ACTION_CALCULATE,
  OPTIMIZER_ACTION_MODIFY_IN_SETTINGS,
  OPTIMIZER_OBJECTIVES_HREF,
  OPTIMIZER_DISABLED_READING,
  OPTIMIZER_MODE_ARIA_LABEL,
  OPTIMIZER_MODE_LABELS,
  OPTIMIZER_OBJECTIVES_TITLE,
  OPTIMIZER_SPECIFIC_ASSETS_NOTE,
} from '@/lib/utils/weightOptimizerNarrative';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Button } from '@/components/ui/button';
import { NarrativeText } from '@/components/ui/narrative-text';
import { OptimizerReport } from '@/components/allocation/OptimizerReport';

const DEPS: PlanDeps = { valueOf: calculateAssetValue, priceOf: unitPriceEur };
const MODE_OPTIONS = [
  { value: 'reachable' as const, label: OPTIMIZER_MODE_LABELS.reachable },
  { value: 'ideal' as const, label: OPTIMIZER_MODE_LABELS.ideal },
];
const BELOW_HELD_EPSILON = 1e-6;

interface OptimizerPanelProps {
  draft: AccumulationPlanDraft;
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  targetLeverageRatio: number;
  idealAllocation: IdealAllocationSettings | null;
  liquidityL: number;
  onApply: (weightsByPositionKey: Record<string, number>, snapshot: OptimizerSnapshot) => void;
}

export function OptimizerPanel({
  draft,
  allAssets,
  targets,
  targetLeverageRatio,
  idealAllocation,
  liquidityL,
  onApply,
}: OptimizerPanelProps) {
  const [mode, setMode] = useState<OptimizerMode>('reachable');
  const [calcRequested, setCalcRequested] = useState(false);
  const [pendingIdealConfirm, setPendingIdealConfirm] = useState(false);

  const assetsById = useMemo(() => new Map(allAssets.map((a) => [a.id, a])), [allAssets]);
  const memberAssetIds = useMemo(
    () => Array.from(new Set(draft.positions.flatMap((p) => p.memberAssetIds))),
    [draft.positions]
  );

  const baseEur = useMemo(() => {
    const states = resolvePositionStates(draft.positions, assetsById, DEPS, draft.disposals);
    return states.reduce((sum, s) => sum + s.currentValueEur, 0) + liquidityL;
  }, [draft.positions, draft.disposals, assetsById, liquidityL]);

  const result: OptimizerResult | null = useMemo(() => {
    if (!idealAllocation?.enabled) return null;
    return runOptimizer({
      positions: draft.positions.map((p) => ({
        key: p.id,
        label: p.label,
        memberAssetIds: p.memberAssetIds,
        buyAssetId: p.buyAssetId,
      })),
      assetsById,
      settings: idealAllocation,
      mode,
      baseEur,
      valueOf: calculateAssetValue,
      targets,
      targetLeverageRatio,
    });
  }, [
    idealAllocation,
    draft.positions,
    assetsById,
    mode,
    baseEur,
    targets,
    targetLeverageRatio,
  ]);

  if (!idealAllocation?.enabled) {
    return (
      <div className="rounded-lg bg-muted p-4 text-[13px] text-muted-foreground">
        {OPTIMIZER_DISABLED_READING}{' '}
        <Link href={OPTIMIZER_OBJECTIVES_HREF} className="underline underline-offset-2">
          {OPTIMIZER_ACTION_MODIFY_IN_SETTINGS}
        </Link>
      </div>
    );
  }

  const readingInput = buildIdealAllocationInput(idealAllocation, targetLeverageRatio);

  const labelOf = (key: string): string => draft.positions.find((p) => p.id === key)?.label ?? key;

  // §3.3/G5 — preventive, shown before Calcola, never blocks it.
  const secondLevelGapLines = describeSecondLevelGaps(
    findSecondLevelGaps(
      allAssets,
      targets,
      idealAllocation.factorObjectives.map((f) => f.assetClass),
      calculateAssetValue
    )
  );
  // §3.5/G2 — declarative: specificAssets is never a soft objective here.
  const showSpecificAssetsNote = hasSpecificAssetTargets(targets, Object.keys(targets) as AssetClass[]);

  const belowHeld = (r: OptimizerResult): boolean =>
    mode === 'ideal' && r.weights.some((w) => w.proposedPct < w.currentPct - BELOW_HELD_EPSILON);

  const applyResult = (r: OptimizerResult) => {
    const weightsByPositionKey = Object.fromEntries(r.weights.map((w) => [w.key, w.proposedPct]));
    const snapshot: OptimizerSnapshot = {
      computedAt: new Date(),
      mode,
      settingsUsed: idealAllocation,
      weights: r.weights.map((w) => ({ key: w.key, proposedPct: w.proposedPct })),
      objectives: r.objectives,
    };
    onApply(weightsByPositionKey, snapshot);
    setPendingIdealConfirm(false);
  };

  const handleApplyClick = () => {
    if (!result || result.status !== 'ok') return;
    if (belowHeld(result)) setPendingIdealConfirm(true);
    else applyResult(result);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted p-3">
        <p className={'mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground'}>
          {OPTIMIZER_OBJECTIVES_TITLE}
        </p>
        <NarrativeText segments={describeIdealAllocation(readingInput)} className="text-[13px] text-foreground" />
        <Link href={OPTIMIZER_OBJECTIVES_HREF} className="mt-1.5 inline-block text-[11px] underline underline-offset-2">
          {OPTIMIZER_ACTION_MODIFY_IN_SETTINGS}
        </Link>
      </div>

      <div>
        <SegmentedPill
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
          layoutId="optimizer-mode"
          ariaLabel={OPTIMIZER_MODE_ARIA_LABEL}
          semantics="radio"
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">{describeOptimizerMode(mode)}</p>
      </div>

      {showSpecificAssetsNote && <p className="text-[11px] text-muted-foreground">{OPTIMIZER_SPECIFIC_ASSETS_NOTE}</p>}

      {secondLevelGapLines.length > 0 && (
        <div className="flex flex-col gap-1">
          {secondLevelGapLines.map((line) => (
            <p key={line} className="text-[11px] text-warning-foreground">
              {line}
            </p>
          ))}
        </div>
      )}

      {!calcRequested && (
        <Button className="h-11 text-[12px] desktop:h-8" onClick={() => setCalcRequested(true)} disabled={memberAssetIds.length === 0}>
          {OPTIMIZER_ACTION_CALCULATE}
        </Button>
      )}

      {calcRequested && result && (
        <OptimizerReport
          result={result}
          labelOf={labelOf}
          pendingIdealConfirm={pendingIdealConfirm}
          onApplyClick={handleApplyClick}
          onConfirmApply={() => applyResult(result)}
          onCancelConfirm={() => setPendingIdealConfirm(false)}
        />
      )}
    </div>
  );
}
