'use client';

/**
 * IdealCompositionDialog — Allocazione's standalone weight-optimizer tool. Unlike the PAC's `OptimizerPanel` (whose candidates are the
 * bozza's own positions, §9), every candidate here is a single tradable instrument straight from the
 * portfolio — `buildStandaloneCandidates` (§4.2/§4.4) — so the tool works even with no plan open.
 * Reuses the SAME engine (`runOptimizer`) and the SAME objectives/conflicts/warnings presentation
 * (`OptimizerObjectivesReport`, §4.3) as the PAC view; only the weights table (its own € column) and
 * the final action ("Crea un PAC con questi pesi" instead of "Usa questi pesi") are its own, because
 * those are genuinely different acts. Never writes to Firestore — "Crea un PAC" hands the seeded
 * positions to the CALLER, which opens `AccumulationPlanDialog` itself (never two modals stacked).
 *
 * Third mode «Con vendite mirate» lives only here — the
 * PAC does not sell (T4): a tax cap in euro, a «Non vendere» box per row (dialog state, never
 * persisted), the estimated tax per row in sale and a total line. In that mode the table shows its
 * rows (name, current weight, box) BEFORE «Calcola», so the locks can be set first.
 */
import { useMemo, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import type { Asset, AssetAllocationTarget, AssetClass, IdealAllocationSettings } from '@/types/assets';
import type { PlanPosition, PlanDisposal, OptimizerSnapshot } from '@/types/accumulationPlan';
import { resolveAllocationRole } from '@/lib/utils/allocationUtils';
import {
  buildStandaloneCandidates,
  findSecondLevelGaps,
  hasSpecificAssetTargets,
  runOptimizer,
  taxPerEuroSoldOf,
  type OptimizerMode,
  type OptimizerResult,
  type OptimizerSaleInput,
} from '@/lib/utils/weightOptimizer';
import { planMemberAssetIds, weightsToSeedPositions, seedDisposalsFromSale, unitPriceEur } from '@/lib/utils/accumulationPlanUtils';
import { groupMembers, modelGroups, proposalToModelWeights, describeModelExclusions, MODEL_NO_TRADABLE_INSTRUMENTS } from '@/lib/utils/modelPortfolio';
import { useSaveModelPortfolio } from '@/lib/hooks/useModelPortfolio';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { toast } from 'sonner';
import type { ModelPortfolio } from '@/types/modelPortfolio';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { calculateAssetValue } from '@/lib/services/assetService';
import { useAccumulationPlans, selectOpenPlan } from '@/lib/hooks/useAccumulationPlan';
import { buildIdealAllocationInput, describeIdealComposition } from '@/lib/utils/settingsNarrative';
import { formatPercentageIt } from '@/lib/utils/formatters';
import {
  describeOptimizerMode,
  describeSecondLevelGaps,
  describeTargetedSaleTotal,
  formatOptimizerWeightDiffEur,
  formatSaleTaxCell,
  IDEAL_COMPOSITION_ACTION_CREATE_PAC,
  IDEAL_COMPOSITION_AMOUNT_LABEL,
  IDEAL_COMPOSITION_COL_CURRENT,
  IDEAL_COMPOSITION_COL_DIFF,
  IDEAL_COMPOSITION_COL_IDEAL,
  IDEAL_COMPOSITION_COL_INSTRUMENT,
  IDEAL_COMPOSITION_COL_LOCK,
  IDEAL_COMPOSITION_COL_TAX,
  IDEAL_COMPOSITION_LOCK_FROZEN,
  IDEAL_COMPOSITION_LOCK_UNKNOWN_BASIS,
  IDEAL_COMPOSITION_PLAN_ALREADY_OPEN,
  IDEAL_COMPOSITION_REACHABLE_DISABLED_REASON,
  IDEAL_COMPOSITION_TAX_CAP_LABEL,
  IDEAL_COMPOSITION_TITLE,
  MODEL_SAVE_ACTION,
  MODEL_SAVE_REPLACES_NOTE,
  MODEL_SAVED_TOAST,
  OPTIMIZER_ACTION_CALCULATE,
  OPTIMIZER_ACTION_MODIFY_IN_SETTINGS,
  OPTIMIZER_OBJECTIVES_HREF,
  OPTIMIZER_MODE_ARIA_LABEL,
  OPTIMIZER_MODE_LABELS,
  OPTIMIZER_OBJECTIVES_TITLE,
  OPTIMIZER_SPECIFIC_ASSETS_NOTE,
  OPTIMIZER_STATUS_INFEASIBLE_BOUNDS,
  OPTIMIZER_STATUS_NO_CANDIDATES,
} from '@/lib/utils/weightOptimizerNarrative';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { NarrativeText } from '@/components/ui/narrative-text';
import { OptimizerObjectivesReport } from '@/components/allocation/OptimizerReport';

// Ideale · Con vendite mirate · Raggiungibile col PAC.
const MODE_OPTIONS = [
  { value: 'ideal' as const, label: OPTIMIZER_MODE_LABELS.ideal },
  { value: 'targeted' as const, label: OPTIMIZER_MODE_LABELS.targeted },
  { value: 'reachable' as const, label: OPTIMIZER_MODE_LABELS.reachable },
];

const HEAD_CLASS = 'py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';
const NUM_CELL_CLASS = 'py-1.5 pr-2 text-right font-mono tabular-nums';
/** In «Con vendite mirate» the € difference yields its width to «Tasse» on a phone: six columns
 *  measured 393px in a 356px dialog body at 390 (collaudo, 2026-09-27). */
const TARGETED_DIFF_CLASS = 'hidden desktop:table-cell';

/** Why a row's «Non vendere» box is ticked and cannot be unticked, or null when it is free. */
function forcedLockReason(asset: Asset | undefined): string | null {
  if (!asset) return null;
  if (resolveAllocationRole(asset) === 'frozen') return IDEAL_COMPOSITION_LOCK_FROZEN;
  if (taxPerEuroSoldOf(asset) === null) return IDEAL_COMPOSITION_LOCK_UNKNOWN_BASIS;
  return null;
}

interface IdealCompositionDialogProps {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  targetLeverageRatio: number;
  idealAllocation: IdealAllocationSettings;
  /** The saved model portfolio: its instruments, even at 0 shares, are candidates (RO1, PO10). */
  model: ModelPortfolio | null;
  /** "Crea un PAC con questi pesi": hands the caller a fresh draft's seed — the caller opens
   *  `AccumulationPlanDialog` itself (never nested under this one). */
  onCreatePac: (seed: { positions: PlanPosition[]; disposals?: PlanDisposal[]; optimizerSnapshot: OptimizerSnapshot }) => void;
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
  onCreatePac,
}: IdealCompositionDialogProps) {
  const isDemo = useDemoMode();
  const saveModel = useSaveModelPortfolio(ownerId);
  const [amountInput, setAmountInput] = useState('');
  const [mode, setMode] = useState<OptimizerMode>('ideal');
  const [calcRequested, setCalcRequested] = useState(false);
  const [taxCapInput, setTaxCapInput] = useState('');
  const [lockedKeys, setLockedKeys] = useState<string[]>([]);

  const assetsById = useMemo(() => new Map(allAssets.map((a) => [a.id, a])), [allAssets]);

  const allocablePortfolioEur = useMemo(
    () =>
      allAssets.reduce((sum, a) => {
        const role = resolveAllocationRole(a);
        if (role !== 'tradable' && role !== 'frozen') return sum;
        const value = calculateAssetValue(a);
        return value > 0 ? sum + value : sum;
      }, 0),
    [allAssets]
  );
  const amountEur = Number(amountInput.replace(',', '.')) || 0;
  const canReachable = amountEur > 0;
  // «Con vendite mirate» needs no amount: rebalancing with 0 € to invest is its point.
  const effectiveMode: OptimizerMode = mode === 'reachable' && !canReachable ? 'ideal' : mode;
  const isTargeted = effectiveMode === 'targeted';
  const baseEur = allocablePortfolioEur + (canReachable ? amountEur : 0);
  const taxCapEur = Math.max(0, Number(taxCapInput.replace(',', '.')) || 0);
  const sale: OptimizerSaleInput | undefined = useMemo(
    () => (isTargeted ? { taxCapEur, lockedKeys } : undefined),
    [isTargeted, taxCapEur, lockedKeys]
  );


  // AL10: an open plan's instruments, even at 0 shares, are candidates beside the model's.
  const plansQuery = useAccumulationPlans(ownerId);
  const openPlan = selectOpenPlan(plansQuery.data);
  const evaluateAssetIds = useMemo(() => new Set([...(model?.weights ?? []).flatMap((w) => groupMembers(w)), ...planMemberAssetIds(openPlan)]), [model, openPlan]);
  const standalone = useMemo(
    () => buildStandaloneCandidates(allAssets, baseEur, calculateAssetValue, evaluateAssetIds, modelGroups(model?.weights ?? [])),
    [allAssets, baseEur, evaluateAssetIds, model]
  );

  const result: OptimizerResult | null = useMemo(() => {
    return runOptimizer({
      positions: standalone.positions,
      assetsById,
      settings: idealAllocation,
      mode: effectiveMode,
      baseEur,
      valueOf: calculateAssetValue,
      targets,
      targetLeverageRatio,
      fixBounds: standalone.fixBounds,
      sale,
    });
  }, [
    standalone,
    assetsById,
    idealAllocation,
    effectiveMode,
    baseEur,
    targets,
    targetLeverageRatio,
    sale,
  ]);


  const readingInput = buildIdealAllocationInput(idealAllocation, targetLeverageRatio);

  const labelOf = (key: string): string => standalone.positions.find((p) => p.key === key)?.label ?? key;

  const secondLevelGapLines = describeSecondLevelGaps(
    findSecondLevelGaps(allAssets, targets, idealAllocation.factorObjectives.map((f) => f.assetClass), calculateAssetValue)
  );
  const showSpecificAssetsNote = hasSpecificAssetTargets(targets, Object.keys(targets) as AssetClass[]);

  // RM2 on the proposed weights: what the model / «Crea un PAC» can keep, rescaled to 100, and what it leaves out.
  const modelFit =
    result && result.status === 'ok'
      ? proposalToModelWeights(
          result.weights.map((w) => {
            // AL16: a group keeps its members; the key of a group candidate is its buyer.
            const members = standalone.positions.find((p) => p.key === w.key)?.memberAssetIds ?? [w.key];
            return { assetId: w.key, pct: w.proposedPct, ...(members.length > 1 ? { memberAssetIds: members } : {}) };
          }),
          assetsById,
          (a) => a.quantity,
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
    ...(isTargeted ? { taxCapEur, lockedKeys } : {}),
  });

  const handleCreatePac = () => {
    if (!result || result.status !== 'ok' || openPlan) return;
    // B1: a frozen asset and a liquidity account never become PAC positions (RM2).
    const positions = weightsToSeedPositions(keptWeights);
    if (positions.length === 0) return;
    // RP2: «Con vendite mirate» seeds its sales too (partial for an instrument that stays in the plan).
    const disposals = seedDisposalsFromSale(
      result.sale?.perCandidate ?? [],
      new Set(keptWeights.map((w) => w.key)),
      assetsById,
      { valueOf: calculateAssetValue, priceOf: unitPriceEur }
    );
    onCreatePac({ positions, disposals, optimizerSnapshot: buildSnapshot(result) });
  };

  // RO3: the result becomes the model portfolio (RM2 weights, `origin: 'optimizer'`, the snapshot).
  const handleSaveModel = async () => {
    if (!result || result.status !== 'ok' || !modelFit || modelFit.portfolioWeights.length === 0) return;
    try {
      await saveModel.mutateAsync({
        input: { weights: modelFit.portfolioWeights, origin: 'optimizer', optimizerSnapshot: buildSnapshot(result) },
        allAssets,
      });
      toast.success(MODEL_SAVED_TOAST);
      onClose();
    } catch (error) {
      toast.error(describeWriteError(error));
    }
  };

  const toggleLock = (key: string) =>
    setLockedKeys((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));

  const okResult = calcRequested && result?.status === 'ok' ? result : null;
  const weightByKey = new Map(okResult?.weights.map((w) => [w.key, w]) ?? []);
  const saleByKey = new Map(okResult?.sale?.perCandidate.map((p) => [p.key, p]) ?? []);

  // One row per candidate; in targeted mode the rows exist before the calculation (§9.3).
  const tableRows = isTargeted
    ? standalone.positions.map((p) => {
        const asset = assetsById.get(p.buyAssetId);
        return {
          key: p.key,
          label: p.label,
          currentPct: baseEur > 0 && asset ? (calculateAssetValue(asset) / baseEur) * 100 : 0,
          lockReason: forcedLockReason(asset),
        };
      })
    : (okResult?.weights ?? []).map((w) => ({ key: w.key, label: w.label, currentPct: w.currentPct, lockReason: null }));

  const weightsTable = (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-border text-left">
          {isTargeted && (
            <th scope="col" className={HEAD_CLASS}>
              {IDEAL_COMPOSITION_COL_LOCK}
            </th>
          )}
          <th scope="col" className={HEAD_CLASS}>
            {IDEAL_COMPOSITION_COL_INSTRUMENT}
          </th>
          <th scope="col" className={`${HEAD_CLASS} text-right`}>
            {IDEAL_COMPOSITION_COL_CURRENT}
          </th>
          <th scope="col" className={`${HEAD_CLASS} text-right`}>
            {IDEAL_COMPOSITION_COL_IDEAL}
          </th>
          <th scope="col" className={`${HEAD_CLASS} text-right ${isTargeted ? TARGETED_DIFF_CLASS : 'pr-0'}`}>
            {IDEAL_COMPOSITION_COL_DIFF}
          </th>
          {isTargeted && (
            <th scope="col" className={`${HEAD_CLASS} pr-0 text-right`}>
              {IDEAL_COMPOSITION_COL_TAX}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {tableRows.map((row) => {
          const weight = weightByKey.get(row.key);
          const saleRow = saleByKey.get(row.key);
          const locked = row.lockReason !== null || lockedKeys.includes(row.key);
          const boxId = `ideal-composition-lock-${row.key}`;
          const onRowClick = (event: MouseEvent<HTMLTableRowElement>) => {
            // The box and its label toggle on their own; the rest of the row is the 44px touch target.
            if (!isTargeted || row.lockReason !== null) return;
            if ((event.target as HTMLElement).closest('label, button')) return;
            toggleLock(row.key);
          };
          return (
            <tr
              key={row.key}
              onClick={onRowClick}
              className={`border-b border-border last:border-0 ${isTargeted ? 'h-11 desktop:h-auto' : ''} ${
                isTargeted && row.lockReason === null ? 'cursor-pointer' : ''
              }`}
            >
              {isTargeted && (
                <td className="py-1.5 pr-2" title={row.lockReason ?? undefined}>
                  <Checkbox
                    id={boxId}
                    checked={locked}
                    disabled={row.lockReason !== null}
                    onCheckedChange={() => toggleLock(row.key)}
                  />
                </td>
              )}
              <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">
                {isTargeted ? (
                  <Label htmlFor={boxId} title={row.lockReason ?? undefined} className="cursor-pointer text-[13px] font-normal">
                    {row.label}
                  </Label>
                ) : (
                  row.label
                )}
              </th>
              <td className={`${NUM_CELL_CLASS} text-muted-foreground`}>{formatPercentageIt(row.currentPct, 1)}</td>
              <td className={`${NUM_CELL_CLASS} text-foreground`}>{weight ? formatPercentageIt(weight.proposedPct, 1) : ''}</td>
              <td className={`${NUM_CELL_CLASS} text-muted-foreground ${isTargeted ? TARGETED_DIFF_CLASS : 'pr-0'}`}>
                {weight ? formatOptimizerWeightDiffEur(weight.currentPct, weight.proposedPct, baseEur) : ''}
              </td>
              {isTargeted && (
                <td className={`${NUM_CELL_CLASS} pr-0 text-muted-foreground`}>
                  {saleRow ? formatSaleTaxCell(saleRow.soldEur, saleRow.taxEur) : ''}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <ResponsiveModal open={open} onClose={onClose} width="xl" title={IDEAL_COMPOSITION_TITLE}>
      <div className="space-y-4">
        <div className="rounded-lg bg-muted p-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {OPTIMIZER_OBJECTIVES_TITLE}
          </p>
          <NarrativeText segments={describeIdealComposition(readingInput)} className="text-[13px] text-foreground" />
          <Link href={OPTIMIZER_OBJECTIVES_HREF} className="mt-1.5 inline-block text-[11px] underline underline-offset-2">
            {OPTIMIZER_ACTION_MODIFY_IN_SETTINGS}
          </Link>
        </div>

        <div>
          <label className="text-[13px] font-medium" htmlFor="ideal-composition-amount">
            {IDEAL_COMPOSITION_AMOUNT_LABEL}
          </label>
          <Input
            id="ideal-composition-amount"
            type="number"
            inputMode="decimal"
            className="mt-1.5 w-40"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
          />
        </div>

        <div>
          <SegmentedPill
            options={MODE_OPTIONS}
            value={effectiveMode}
            onChange={(next) => {
              if (next === 'reachable' && !canReachable) return;
              setMode(next);
            }}
            layoutId="ideal-composition-mode"
            ariaLabel={OPTIMIZER_MODE_ARIA_LABEL}
            semantics="radio"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {canReachable || isTargeted ? describeOptimizerMode(effectiveMode) : IDEAL_COMPOSITION_REACHABLE_DISABLED_REASON}
          </p>
        </div>

        {isTargeted && (
          <div>
            <label className="text-[13px] font-medium" htmlFor="ideal-composition-tax-cap">
              {IDEAL_COMPOSITION_TAX_CAP_LABEL}
            </label>
            <Input
              id="ideal-composition-tax-cap"
              type="number"
              inputMode="decimal"
              className="mt-1.5 w-40"
              value={taxCapInput}
              onChange={(e) => setTaxCapInput(e.target.value)}
            />
          </div>
        )}

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

        {isTargeted && tableRows.length > 0 && weightsTable}

        {!calcRequested && (
          <Button className="h-11 text-[12px] desktop:h-8" onClick={() => setCalcRequested(true)} disabled={standalone.positions.length === 0}>
            {OPTIMIZER_ACTION_CALCULATE}
          </Button>
        )}

        {calcRequested && result && (
          <>
            {result.status === 'no_candidates' && <p className="text-[12px] text-muted-foreground">{OPTIMIZER_STATUS_NO_CANDIDATES}</p>}
            {result.status === 'infeasible_bounds' && (
              <p className="text-[12px] text-destructive">{OPTIMIZER_STATUS_INFEASIBLE_BOUNDS}</p>
            )}

            {result.status === 'ok' && (
              <>
                {!isTargeted && weightsTable}
                {isTargeted && result.sale && <p className="text-[13px] text-foreground">{describeTargetedSaleTotal(result.sale)}</p>}

                <OptimizerObjectivesReport result={result} labelOf={labelOf} />

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      className="h-11 text-[12px] desktop:h-8"
                      onClick={() => void handleSaveModel()}
                      disabled={isDemo || saveModel.isPending || keptWeights.length === 0}
                    >
                      {MODEL_SAVE_ACTION}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 text-[12px] desktop:h-8"
                      onClick={handleCreatePac}
                      disabled={!!openPlan || keptWeights.length === 0}
                    >
                      {IDEAL_COMPOSITION_ACTION_CREATE_PAC}
                    </Button>
                  </div>
                  {model && <p className="mt-1.5 text-[11px] text-muted-foreground">{MODEL_SAVE_REPLACES_NOTE}</p>}
                  {exclusionNote && <p className="mt-1.5 text-[11px] text-muted-foreground">{exclusionNote}</p>}
                  {keptWeights.length === 0 && <p className="mt-1.5 text-[11px] text-muted-foreground">{MODEL_NO_TRADABLE_INSTRUMENTS}</p>}
                  {openPlan && <p className="mt-1.5 text-[11px] text-muted-foreground">{IDEAL_COMPOSITION_PLAN_ALREADY_OPEN}</p>}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
