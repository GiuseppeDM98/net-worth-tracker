'use client';

/**
 * ObiettiviTile — «quali obiettivi guidano il portafoglio ideale?».
 * Lists the objectives of «Allocazione ideale» with their priority and opens `ObiettiviDialog` to
 * change them; Impostazioni › Allocazione keeps a read-only summary and a link here. With a saved
 * model portfolio whose snapshot carries the calculation, each objective is a target → reached bar
 * (`ObjectiveBars`, RO4) and the first conflict of that calculation is quoted under them; without a
 * snapshot — or when the model was written by hand — the tile lists the objectives as words.
 */
import { useMemo, useRef } from 'react';
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { AccumulationPlan, OptimizerSnapshot } from '@/types/accumulationPlan';
import { evaluateObjectivesAt } from '@/lib/utils/weightOptimizer';
import { projectPlanOutcome, resolvePositionStates } from '@/lib/utils/accumulationPlanUtils';
import { calculateAssetValue } from '@/lib/services/assetService';
import { buildIdealAllocationInput, describeIdealComposition, listIdealObjectives } from '@/lib/utils/settingsNarrative';
import {
  describeConflictReading,
  OBJECTIVES_ACTION_EDIT,
  OBJECTIVES_OFF_READING,
  OBJECTIVES_TILE_CALCULATED_ON,
  OBJECTIVES_TILE_PLAN_ASIDE,
  OBJECTIVES_TILE_PLAN_NOTE,
  OBJECTIVES_TILE_ASIDE,
  OBJECTIVES_TILE_EYEBROW,
} from '@/lib/utils/weightOptimizerNarrative';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { Tile, type TileCollapse } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { ObjectiveBars } from '@/components/allocation/OptimizerReport';
import { DEPS, TILE_ACTION_CLASS } from '@/components/allocation/tiles/accumuloShared';

interface ObiettiviTileProps {
  idealAllocation: IdealAllocationSettings | null;
  targetLeverageRatio: number;
  /** The saved model's calculation, when it has one (A2). */
  snapshot?: OptimizerSnapshot;
  onEdit: () => void;
  /** The button that opened the modal, so closing it can return the focus there. */
  editRef?: React.RefObject<HTMLButtonElement | null>;
  disabled?: boolean;
  /** The open plan, when there is one: the bars then show what ITS end state reaches (A4). */
  plan?: AccumulationPlan | null;
  ownerId?: string;
  allAssets?: Asset[];
  targets?: AssetAllocationTarget | null;
  /** The row of the phone composition (The Closed-Row Rule); absent at 1440. */
  collapse?: TileCollapse;
  asideWhenClosed?: string;
}

export function ObiettiviTile({ idealAllocation, targetLeverageRatio, snapshot, onEdit, editRef, disabled, plan, allAssets, targets, collapse, asideWhenClosed }: ObiettiviTileProps) {
  const isDemo = useDemoMode();
  const fallbackRef = useRef<HTMLButtonElement>(null);
  const enabled = !!idealAllocation?.enabled;
  const input = idealAllocation ? buildIdealAllocationInput(idealAllocation, targetLeverageRatio) : null;
  const objectives = enabled && input ? listIdealObjectives(input) : [];
  // With an open plan the bars are the plan's own end state (what the PAC reaches), computed on the
  // same objectives.
  const planActive = enabled && !!plan && plan.status === 'active' && !!targets && !!allAssets;
  const planObjectives = useMemo(() => {
    if (!planActive || !plan || !targets || !allAssets || !idealAllocation) return null;
    const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));
    const states = resolvePositionStates(plan.positions, assetsById, DEPS, plan.disposals);
    const outcome = projectPlanOutcome(states, plan.installments, plan.residualEur ?? 0, assetsById, plan.positions, DEPS);
    const weightsPctByKey = Object.fromEntries(outcome.positions.map((position) => [position.positionId, position.finalWeightPct]));
    const remainingEur = plan.installments.reduce(
      (sum, installment) => sum + installment.lines.filter((line) => line.status === 'planned').reduce((acc, line) => acc + line.plannedAmountEur, 0),
      0,
    );
    const baseEur = states.reduce((sum, state) => sum + state.currentValueEur, 0) + remainingEur;
    const objectives = evaluateObjectivesAt({
      positions: plan.positions.map((position) => ({ key: position.id, label: position.label, memberAssetIds: position.memberAssetIds, buyAssetId: position.buyAssetId })),
      assetsById,
      settings: idealAllocation,
      baseEur,
      valueOf: calculateAssetValue,
      targets,
      targetLeverageRatio,
      weightsPctByKey,
    });
    return objectives.length > 0 ? objectives : null;
  }, [planActive, plan, targets, allAssets, idealAllocation, targetLeverageRatio]);

  const reached = planObjectives
    ? { objectives: planObjectives, conflicts: snapshot?.conflicts }
    : enabled && snapshot && snapshot.objectives.length > 0
      ? snapshot
      : null;
  const firstConflict = reached?.conflicts?.[0];

  return (
    <Tile
      eyebrow={OBJECTIVES_TILE_EYEBROW}
      collapse={collapse}
      asideWhenClosed={asideWhenClosed}
      aside={planObjectives ? OBJECTIVES_TILE_PLAN_ASIDE : OBJECTIVES_TILE_ASIDE}
      reading={enabled && input ? describeIdealComposition(input) : [{ text: OBJECTIVES_OFF_READING }]}
    >
      {reached && (
        <div className="mt-3">
          <ObjectiveBars objectives={reached.objectives} />
          {firstConflict && <p className="mt-3 rounded-[10px] bg-muted px-3 py-2.5 text-[12px] text-foreground">{describeConflictReading(firstConflict, reached.objectives)}</p>}
          <p className="mt-2 text-[11px] text-muted-foreground">{planObjectives ? OBJECTIVES_TILE_PLAN_NOTE : OBJECTIVES_TILE_CALCULATED_ON}</p>
        </div>
      )}
      {!reached && objectives.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {objectives.map((objective) => (
            <li key={objective} className="py-2 text-[13px] text-foreground">
              {objective}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
        <Button ref={editRef ?? fallbackRef} variant="outline" className={TILE_ACTION_CLASS} disabled={disabled || isDemo || !idealAllocation} onClick={onEdit}>
          {OBJECTIVES_ACTION_EDIT}
        </Button>
      </div>
    </Tile>
  );
}
