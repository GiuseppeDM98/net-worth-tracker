'use client';

/**
 * IdealCompositionDialog — «Ricalcola il portafoglio modello». Unlike the PAC's `OptimizerPanel` (whose candidates
 * are the draft's own positions), the candidates here are the whole page's base (`buildStandaloneCandidates`,
 * 2026-11-12): the instruments, every property fixed at its value net of its loans, and «Liquidità» — the
 * accounts net of the personal loans — whose weight says how much stays on the accounts and is never saved.
 * The amount to invest is taken from the accounts: it does not grow the base, it cannot exceed them, and it
 * counts only in «Raggiungibile».
 *
 * The optimizer runs on «Calcola» only, in the handler, and any new input clears its result (2026-11-12): a
 * calculation per keystroke froze the dialog. The dialog is a tile lifted off the page (The Modal-Is-A-Tile
 * Rule): the eyebrow, the act as the title, the reading as the status, the actions in the footer. It writes
 * only the model, through «Salva come portafoglio modello»; «Crea un PAC» hands the seed to the CALLER, which
 * opens `AccumulationPlanDialog` itself (never two modals stacked).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { Asset, AssetAllocationTarget, AssetClass, IdealAllocationSettings } from '@/types/assets';
import type { OptimizerSnapshot, PlanSeedDraft } from '@/types/accumulationPlan';
import type { ModelPortfolio } from '@/types/modelPortfolio';
import {
  buildStandaloneCandidates,
  findSecondLevelGaps,
  hasSpecificAssetTargets,
  runOptimizer,
  type OptimizerMode,
  type OptimizerResult,
} from '@/lib/utils/weightOptimizer';
import { planMemberAssetIds, weightsToSeedPositions } from '@/lib/utils/accumulationPlanUtils';
import {
  describeModelExclusions,
  groupMembers,
  modelGroups,
  MODEL_NO_TRADABLE_INSTRUMENTS,
  proposalToModelWeights,
  type ModelBasis,
} from '@/lib/utils/modelPortfolio';
import { useSaveModelPortfolio } from '@/lib/hooks/useModelPortfolio';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { runGuarded } from '@/lib/utils/runGuarded';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { calculateAssetValue } from '@/lib/services/assetService';
import { useAccumulationPlans, selectOpenPlan } from '@/lib/hooks/useAccumulationPlan';
import { buildIdealAllocationInput, describeIdealComposition } from '@/lib/utils/settingsNarrative';
import { formatPercentageIt } from '@/lib/utils/formatters';
import { ACCUMULO_ACTION_CANCEL } from '@/lib/utils/accumulationNarrative';
import {
  describeAmountAboveLiquidity,
  describeIdealCompositionStatus,
  describeOptimizerMode,
  describeSecondLevelGaps,
  formatOptimizerWeightDiffEur,
  IDEAL_COMPOSITION_FIXED_DIFF,
  IDEAL_COMPOSITION_ACTION_CREATE_PAC,
  IDEAL_COMPOSITION_AMOUNT_HELP,
  IDEAL_COMPOSITION_AMOUNT_LABEL,
  IDEAL_COMPOSITION_COL_CURRENT,
  IDEAL_COMPOSITION_COL_DIFF,
  IDEAL_COMPOSITION_COL_IDEAL,
  IDEAL_COMPOSITION_COL_INSTRUMENT,
  IDEAL_COMPOSITION_PLAN_ALREADY_OPEN,
  IDEAL_COMPOSITION_REACHABLE_DISABLED_REASON,
  IDEAL_COMPOSITION_TITLE,
  MODEL_SAVE_ACTION,
  MODEL_SAVE_REPLACES_NOTE,
  MODEL_SAVED_TOAST,
  MODEL_TILE_EYEBROW,
  OPTIMIZER_ACTION_CALCULATE,
  OPTIMIZER_ACTION_MODIFY_IN_SETTINGS,
  OPTIMIZER_OBJECTIVES_HREF,
  OPTIMIZER_MODE_ARIA_LABEL,
  OPTIMIZER_MODE_LABELS,
  OPTIMIZER_OBJECTIVES_TITLE,
  OPTIMIZER_SPECIFIC_ASSETS_NOTE,
} from '@/lib/utils/weightOptimizerNarrative';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { NarrativeText } from '@/components/ui/narrative-text';
import { OptimizerObjectivesReport } from '@/components/allocation/OptimizerReport';

const MODE_OPTIONS = [
  { value: 'ideal' as const, label: OPTIMIZER_MODE_LABELS.ideal },
  { value: 'reachable' as const, label: OPTIMIZER_MODE_LABELS.reachable },
];

const HEAD_CLASS = 'py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';
const NUM_CELL_CLASS = 'py-1.5 pr-2 text-right font-mono tabular-nums';
const AMOUNT_ID = 'ideal-composition-amount';
const AMOUNT_HELP_ID = 'ideal-composition-amount-help';
const AMOUNT_ERROR_ID = 'ideal-composition-amount-error';

interface IdealCompositionDialogProps {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  targetLeverageRatio: number;
  idealAllocation: IdealAllocationSettings;
  /** The saved model portfolio: its instruments, even at 0 shares, are candidates. */
  model: ModelPortfolio | null;
  /** What the model rests on: the save stamps it. */
  basis: ModelBasis;
  /** «Crea un PAC con questi pesi»: hands the caller a fresh draft's seed — the caller opens the editor itself. */
  onCreatePac: (seed: PlanSeedDraft) => void;
}

export function IdealCompositionDialog({
  open,
  onClose,
  ownerId,
  allAssets,
  targets,
  targetLeverageRatio,
  idealAllocation,
  model,
  basis,
  onCreatePac,
}: IdealCompositionDialogProps) {
  const isDemo = useDemoMode();
  const saveModel = useSaveModelPortfolio(ownerId);
  const [amountInput, setAmountInput] = useState('');
  const [mode, setMode] = useState<OptimizerMode>('ideal');
  // The last calculation, `null` until «Calcola» and again after any new input.
  const [run, setRun] = useState<OptimizerResult | null>(null);

  const amountEur = Number(amountInput.replace(',', '.')) || 0;
  const canReachable = amountEur > 0;
  const effectiveMode: OptimizerMode = mode === 'reachable' && !canReachable ? 'ideal' : mode;
  const investEur = effectiveMode === 'reachable' ? amountEur : 0;

  // An open plan's instruments, even at 0 shares, are candidates beside the model's.
  const plansQuery = useAccumulationPlans(ownerId);
  const openPlan = selectOpenPlan(plansQuery.data);
  const evaluateAssetIds = useMemo(
    () => new Set([...(model?.weights ?? []).flatMap((w) => groupMembers(w)), ...planMemberAssetIds(openPlan)]),
    [model, openPlan]
  );
  const standalone = useMemo(
    () => buildStandaloneCandidates(allAssets, calculateAssetValue, investEur, evaluateAssetIds, modelGroups(model?.weights ?? [])),
    [allAssets, investEur, evaluateAssetIds, model]
  );

  const labelOf = (key: string): string => standalone.positions.find((p) => p.key === key)?.label ?? key;
  const instrumentCount = standalone.instrumentCount;
  const negativeFixedLabels = standalone.negativeFixedKeys.map(labelOf);
  const amountAboveLiquidity = amountEur > 0 && amountEur > standalone.liquidityEur;
  const fixedKeys = new Set(standalone.fixedKeys);
  const canCalculate = instrumentCount > 0 && negativeFixedLabels.length === 0 && !amountAboveLiquidity;

  const readingInput = buildIdealAllocationInput(idealAllocation, targetLeverageRatio);
  const secondLevelGapLines = describeSecondLevelGaps(
    findSecondLevelGaps(allAssets, targets, idealAllocation.factorObjectives.map((f) => f.assetClass), calculateAssetValue)
  );
  const showSpecificAssetsNote = hasSpecificAssetTargets(targets, Object.keys(targets) as AssetClass[]);

  const calculate = () => {
    setRun(
      runOptimizer({
        positions: standalone.positions,
        assetsById: standalone.assetsById,
        settings: idealAllocation,
        mode: effectiveMode,
        baseEur: standalone.baseEur,
        valueOf: standalone.valueOf,
        targets,
        targetLeverageRatio,
        fixBounds: standalone.fixBounds,
      })
    );
  };

  const okResult = run?.status === 'ok' ? run : null;

  // What the model / «Crea un PAC» can keep, rescaled to 100, and what it leaves out («Liquidità», a property…).
  const modelFit = okResult
    ? proposalToModelWeights(
        okResult.weights.map((w) => {
          // A group keeps its members; the key of a group candidate is its buyer.
          const members = standalone.positions.find((p) => p.key === w.key)?.memberAssetIds ?? [w.key];
          return { assetId: w.key, pct: w.proposedPct, ...(members.length > 1 ? { memberAssetIds: members } : {}) };
        }),
        standalone.assetsById,
        (a) => a.quantity
      )
    : null;
  const keptWeights = (modelFit?.weights ?? []).map((w) => ({
    key: w.assetId,
    label: labelOf(w.assetId),
    proposedPct: w.pct,
    ...(w.memberAssetIds ? { memberAssetIds: w.memberAssetIds } : {}),
  }));
  const exclusionNote = modelFit ? describeModelExclusions(modelFit.excluded, labelOf) : '';

  const buildSnapshot = (computed: OptimizerResult): OptimizerSnapshot => ({
    computedAt: new Date(),
    mode: effectiveMode,
    settingsUsed: idealAllocation,
    weights: computed.weights.map((w) => ({ key: w.key, proposedPct: w.proposedPct })),
    objectives: computed.objectives,
    conflicts: computed.conflicts,
  });

  const handleCreatePac = () => {
    if (!okResult || openPlan) return;
    // Never «Liquidità», a property or a frozen asset: only what the model keeps becomes a position.
    const positions = weightsToSeedPositions(keptWeights);
    if (positions.length === 0) return;
    onCreatePac({ positions, optimizerSnapshot: buildSnapshot(okResult) });
  };

  const handleSaveModel = async () => {
    if (!okResult || !modelFit || modelFit.portfolioWeights.length === 0) return;
    await runGuarded(
      async () => {
        await saveModel.mutateAsync({
          input: { weights: modelFit.portfolioWeights, origin: 'optimizer', optimizerSnapshot: buildSnapshot(okResult) },
          allAssets,
          basis,
        });
        toast.success(MODEL_SAVED_TOAST);
        onClose();
      },
      (error) => {
        toast.error(describeWriteError(error));
      }
    );
  };

  const weightByKey = new Map(okResult?.weights.map((w) => [w.key, w]) ?? []);
  const tableRows = (okResult?.weights ?? []).map((w) => ({ key: w.key, label: w.label, currentPct: w.currentPct }));

  const footer = okResult ? (
    <>
      <Button variant="outline" onClick={onClose}>
        {ACCUMULO_ACTION_CANCEL}
      </Button>
      <Button variant="outline" onClick={handleCreatePac} disabled={!!openPlan || keptWeights.length === 0}>
        {IDEAL_COMPOSITION_ACTION_CREATE_PAC}
      </Button>
      <Button onClick={() => void handleSaveModel()} disabled={isDemo || saveModel.isPending || keptWeights.length === 0}>
        {MODEL_SAVE_ACTION}
      </Button>
    </>
  ) : (
    <>
      <Button variant="outline" onClick={onClose}>
        {ACCUMULO_ACTION_CANCEL}
      </Button>
      <Button onClick={calculate} disabled={!canCalculate}>
        {OPTIMIZER_ACTION_CALCULATE}
      </Button>
    </>
  );

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      width="xl"
      eyebrow={MODEL_TILE_EYEBROW}
      title={IDEAL_COMPOSITION_TITLE}
      reading={describeIdealCompositionStatus(run, negativeFixedLabels, standalone.liquidityEur, {
        instrumentCount,
        baseEur: standalone.baseEur,
      })}
      footer={footer}
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-muted p-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{OPTIMIZER_OBJECTIVES_TITLE}</p>
          <NarrativeText segments={describeIdealComposition(readingInput)} className="text-[13px] text-foreground" />
          <Link href={OPTIMIZER_OBJECTIVES_HREF} className="mt-1.5 inline-block text-[11px] underline underline-offset-2">
            {OPTIMIZER_ACTION_MODIFY_IN_SETTINGS}
          </Link>
        </div>

        <div>
          <label className="text-[13px] font-medium" htmlFor={AMOUNT_ID}>
            {IDEAL_COMPOSITION_AMOUNT_LABEL}
          </label>
          <Input
            id={AMOUNT_ID}
            type="number"
            inputMode="decimal"
            className="mt-1.5 w-40"
            value={amountInput}
            aria-invalid={amountAboveLiquidity}
            aria-describedby={amountAboveLiquidity ? `${AMOUNT_HELP_ID} ${AMOUNT_ERROR_ID}` : AMOUNT_HELP_ID}
            onChange={(e) => {
              setAmountInput(e.target.value);
              setRun(null);
            }}
          />
          <p id={AMOUNT_HELP_ID} className="mt-1.5 text-[11px] text-muted-foreground">
            {IDEAL_COMPOSITION_AMOUNT_HELP}
          </p>
          {amountAboveLiquidity && (
            <p id={AMOUNT_ERROR_ID} className="mt-1 text-[11px] text-destructive">
              {describeAmountAboveLiquidity(standalone.liquidityEur)}
            </p>
          )}
        </div>

        <div>
          <SegmentedPill
            options={MODE_OPTIONS}
            value={effectiveMode}
            onChange={(next) => {
              if (next === 'reachable' && !canReachable) return;
              setMode(next);
              setRun(null);
            }}
            layoutId="ideal-composition-mode"
            ariaLabel={OPTIMIZER_MODE_ARIA_LABEL}
            semantics="radio"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {canReachable ? describeOptimizerMode(effectiveMode) : IDEAL_COMPOSITION_REACHABLE_DISABLED_REASON}
          </p>
        </div>

        {showSpecificAssetsNote && <p className="text-[11px] text-muted-foreground">{OPTIMIZER_SPECIFIC_ASSETS_NOTE}</p>}
        {instrumentCount === 0 && <p className="text-[11px] text-muted-foreground">{MODEL_NO_TRADABLE_INSTRUMENTS}</p>}

        {secondLevelGapLines.length > 0 && (
          <div className="flex flex-col gap-1">
            {secondLevelGapLines.map((line) => (
              <p key={line} className="text-[11px] text-warning-foreground">
                {line}
              </p>
            ))}
          </div>
        )}

        {okResult && (
          <>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className={HEAD_CLASS}>
                    {IDEAL_COMPOSITION_COL_INSTRUMENT}
                  </th>
                  <th scope="col" className={`${HEAD_CLASS} text-right`}>
                    {IDEAL_COMPOSITION_COL_CURRENT}
                  </th>
                  <th scope="col" className={`${HEAD_CLASS} text-right`}>
                    {IDEAL_COMPOSITION_COL_IDEAL}
                  </th>
                  <th scope="col" className={`${HEAD_CLASS} pr-0 text-right`}>
                    {IDEAL_COMPOSITION_COL_DIFF}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => {
                  const weight = weightByKey.get(row.key);
                  return (
                    <tr key={row.key} className="border-b border-border last:border-0">
                      <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">
                        {row.label}
                      </th>
                      <td className={`${NUM_CELL_CLASS} text-muted-foreground`}>{formatPercentageIt(row.currentPct, 1)}</td>
                      <td className={`${NUM_CELL_CLASS} text-foreground`}>{weight ? formatPercentageIt(weight.proposedPct, 1) : ''}</td>
                      <td className={`${NUM_CELL_CLASS} pr-0 text-muted-foreground`}>
                        {!weight ? '' : fixedKeys.has(row.key) ? IDEAL_COMPOSITION_FIXED_DIFF : formatOptimizerWeightDiffEur(weight.currentPct, weight.proposedPct, standalone.baseEur)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <OptimizerObjectivesReport result={okResult} labelOf={labelOf} />

            {model && <p className="text-[11px] text-muted-foreground">{MODEL_SAVE_REPLACES_NOTE}</p>}
            {exclusionNote && <p className="text-[11px] text-muted-foreground">{exclusionNote}</p>}
            {keptWeights.length === 0 && <p className="text-[11px] text-muted-foreground">{MODEL_NO_TRADABLE_INSTRUMENTS}</p>}
            {openPlan && <p className="text-[11px] text-muted-foreground">{IDEAL_COMPOSITION_PLAN_ALREADY_OPEN}</p>}
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
