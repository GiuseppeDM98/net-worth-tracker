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
 *
 * Third mode «Con vendite mirate» lives only here — a PAC's instalments only buy: a tax cap in euro, a «Non vendere»
 * box per row (dialog state, saved only in the run's snapshot), the estimated tax per row in sale, and the total
 * line as the reading. In that mode the rows (name, current weight, box) are on screen BEFORE «Calcola», so the
 * locks can be set first; a row the app cannot sell is ticked, disabled, and says why under its name.
 */
import { useMemo, useState, type MouseEvent } from 'react';
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
  LIQUIDITY_CANDIDATE_KEY,
  type OptimizerMode,
  type OptimizerResult,
  type OptimizerSaleInput,
} from '@/lib/utils/weightOptimizer';
import { planMemberAssetIds, resolvePlanReserve, seedDisposalsFromSale, unitPriceEur, weightsToSeedPositions } from '@/lib/utils/accumulationPlanUtils';
import { compareAllocations } from '@/lib/services/assetAllocationService';
import { buildHoldings, resolveAllocationRole, type AllocatableHolding } from '@/lib/utils/allocationUtils';
import { candidateSaleTaxPerEuro } from '@/lib/utils/saleTax';
import { isLedgerAssetType } from '@/types/assetTransactions';
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
  formatSaleTaxCell,
  IDEAL_COMPOSITION_FIXED_DIFF,
  IDEAL_COMPOSITION_ACTION_CREATE_PAC,
  IDEAL_COMPOSITION_AMOUNT_HELP,
  IDEAL_COMPOSITION_AMOUNT_LABEL,
  IDEAL_COMPOSITION_COL_CURRENT,
  IDEAL_COMPOSITION_COL_DIFF,
  IDEAL_COMPOSITION_COL_IDEAL,
  IDEAL_COMPOSITION_COL_INSTRUMENT,
  IDEAL_COMPOSITION_COL_LOCK,
  IDEAL_COMPOSITION_COL_TAX,
  IDEAL_COMPOSITION_LOCK_FROZEN,
  IDEAL_COMPOSITION_LOCK_NOT_TRADED,
  IDEAL_COMPOSITION_LOCK_PROPERTY,
  IDEAL_COMPOSITION_LOCK_UNKNOWN_BASIS,
  IDEAL_COMPOSITION_LOCK_UNKNOWN_RATE,
  IDEAL_COMPOSITION_LOSSES_NOTE,
  IDEAL_COMPOSITION_PLAN_ALREADY_OPEN,
  IDEAL_COMPOSITION_REACHABLE_DISABLED_REASON,
  IDEAL_COMPOSITION_TAX_CAP_LABEL,
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { NarrativeText } from '@/components/ui/narrative-text';
import { OptimizerObjectivesReport } from '@/components/allocation/OptimizerReport';

const MODE_OPTIONS = [
  { value: 'ideal' as const, label: OPTIMIZER_MODE_LABELS.ideal },
  { value: 'targeted' as const, label: OPTIMIZER_MODE_LABELS.targeted },
  { value: 'reachable' as const, label: OPTIMIZER_MODE_LABELS.reachable },
];

const HEAD_CLASS = 'py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';
const NUM_CELL_CLASS = 'py-1.5 pr-2 text-right font-mono tabular-nums';
const AMOUNT_ID = 'ideal-composition-amount';
const AMOUNT_HELP_ID = 'ideal-composition-amount-help';
const AMOUNT_ERROR_ID = 'ideal-composition-amount-error';
const TAX_CAP_ID = 'ideal-composition-tax-cap';
/** In «Con vendite mirate» the € difference yields its width to «Tasse» on a phone: six columns do not fit at 390. */
const TARGETED_DIFF_CLASS = 'hidden desktop:table-cell';

/** Why a row's «Non vendere» box is ticked and cannot be unticked, or null when it is free. */
function forcedLockReason(
  position: { key: string; buyAssetId: string },
  asset: Asset | undefined,
  holdings: readonly AllocatableHolding[]
): string | null {
  if (!asset || position.key === LIQUIDITY_CANDIDATE_KEY) return null; // the liquidity is spent, never locked
  if (asset.type === 'realestate') return IDEAL_COMPOSITION_LOCK_PROPERTY;
  if (resolveAllocationRole(asset) === 'frozen') return IDEAL_COMPOSITION_LOCK_FROZEN;
  if (!isLedgerAssetType(asset.type)) return IDEAL_COMPOSITION_LOCK_NOT_TRADED;
  const tax = candidateSaleTaxPerEuro(position.buyAssetId, holdings);
  if (tax.kind !== 'unknown') return null;
  return tax.reason === 'rate' ? IDEAL_COMPOSITION_LOCK_UNKNOWN_RATE : IDEAL_COMPOSITION_LOCK_UNKNOWN_BASIS;
}

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
  const [taxCapInput, setTaxCapInput] = useState('');
  const [lockedKeys, setLockedKeys] = useState<string[]>([]);

  const amountEur = Number(amountInput.replace(',', '.')) || 0;
  const canReachable = amountEur > 0;
  // «Con vendite mirate» needs no amount: rebalancing with 0 € to invest is its point.
  const effectiveMode: OptimizerMode = mode === 'reachable' && !canReachable ? 'ideal' : mode;
  const isTargeted = effectiveMode === 'targeted';
  const investEur = effectiveMode === 'reachable' ? amountEur : 0;
  const taxCapEur = Math.max(0, Number(taxCapInput.replace(',', '.')) || 0);
  // What prices each candidate's sale, read only by «Con vendite mirate».
  const holdings = useMemo(() => buildHoldings(allAssets, calculateAssetValue), [allAssets]);

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

  // One row per candidate; in «Con vendite mirate» they exist before the calculation. The current weight is the
  // builder's value of the members — the one the optimizer reads, never the 1 € stand-in of «Liquidità».
  const targetedRows = isTargeted
    ? standalone.positions.map((p) => ({
        key: p.key,
        label: p.label,
        currentPct:
          standalone.baseEur > 0
            ? (p.memberAssetIds.reduce((sum, id) => {
                const a = standalone.assetsById.get(id);
                return a ? sum + standalone.valueOf(a) : sum;
              }, 0) /
                standalone.baseEur) *
              100
            : 0,
        lockReason: forcedLockReason(p, standalone.assetsById.get(p.buyAssetId), holdings),
      }))
    : [];

  // A forced lock is a lock to the optimizer too (a pension fund costs no tax, yet is never sold on the market).
  const buildSale = (): { taxCapEur: number; lockedKeys: string[] } => ({
    taxCapEur,
    lockedKeys: [...new Set([...lockedKeys, ...targetedRows.filter((r) => r.lockReason !== null).map((r) => r.key)])],
  });
  // The cash quota is the plan's own (`resolvePlanReserve`): the run never spends the cash a PAC would refill first.
  const buildOptimizerSale = (): OptimizerSaleInput => ({
    ...buildSale(),
    cashFloorEur: resolvePlanReserve(allAssets, targets, compareAllocations, { valueOf: calculateAssetValue, priceOf: unitPriceEur }).quotaEur,
  });

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
        ...(isTargeted ? { sale: buildOptimizerSale(), holdings } : {}),
      })
    );
  };

  const toggleLock = (key: string) => {
    setLockedKeys((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
    setRun(null);
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
    ...(isTargeted ? buildSale() : {}),
  });

  const handleCreatePac = () => {
    if (!okResult || openPlan) return;
    // «Con vendite mirate» seeds its sales too — the instruments only: spending the liquidity is not a sale, a
    // property is fixed (its share rounded to the hundredth is no order).
    const sold = (okResult.sale?.perCandidate ?? []).filter(
      (p) => p.key !== LIQUIDITY_CANDIDATE_KEY && standalone.assetsById.get(p.key)?.type !== 'realestate'
    );
    // Only what the proposal brings to 0% is sold whole; one trimmed — even out of the model — sells shares.
    const soldOut = new Set(okResult.weights.filter((w) => w.proposedPct === 0).map((w) => w.key));
    const disposals = seedDisposalsFromSale(sold, soldOut, standalone.assetsById, {
      valueOf: calculateAssetValue,
      priceOf: unitPriceEur,
    });
    // Never «Liquidità», a property or a frozen asset: only what the model keeps becomes a position — and never one
    // sold whole, which a plan refuses («Attiva piano» stayed off at the collaudo; the model keeps its 0% weight).
    const soldWhole = new Set(disposals.filter((d) => d.quantity === undefined).map((d) => d.assetId));
    const positions = weightsToSeedPositions(keptWeights.filter((w) => !soldWhole.has(w.key)));
    if (positions.length === 0) return;
    onCreatePac({ positions, ...(disposals.length > 0 ? { disposals } : {}), optimizerSnapshot: buildSnapshot(okResult) });
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
  const saleByKey = new Map(okResult?.sale?.perCandidate.map((p) => [p.key, p]) ?? []);
  const tableRows: Array<{ key: string; label: string; currentPct: number; lockReason: string | null }> = isTargeted
    ? targetedRows
    : (okResult?.weights ?? []).map((w) => ({ key: w.key, label: w.label, currentPct: w.currentPct, lockReason: null }));
  const showTable = isTargeted ? tableRows.length > 0 : okResult !== null;

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
            // Three modes do not fit a 390 row: below `desktop:` three equal cells, the labels on two lines.
            className="max-desktop:grid max-desktop:w-full max-desktop:grid-cols-3 max-desktop:rounded-2xl"
            optionClassName="min-h-11 leading-tight max-desktop:rounded-xl max-desktop:px-2 max-desktop:text-[13px] desktop:min-h-0"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {canReachable || isTargeted ? describeOptimizerMode(effectiveMode) : IDEAL_COMPOSITION_REACHABLE_DISABLED_REASON}
          </p>
        </div>

        {isTargeted && (
          <div>
            <label className="text-[13px] font-medium" htmlFor={TAX_CAP_ID}>
              {IDEAL_COMPOSITION_TAX_CAP_LABEL}
            </label>
            <Input
              id={TAX_CAP_ID}
              type="number"
              inputMode="decimal"
              className="mt-1.5 w-40"
              value={taxCapInput}
              onChange={(e) => {
                setTaxCapInput(e.target.value);
                setRun(null);
              }}
            />
          </div>
        )}

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

        {showTable && (
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
                        <Checkbox id={boxId} checked={locked} disabled={row.lockReason !== null} onCheckedChange={() => toggleLock(row.key)} />
                      </td>
                    )}
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">
                      {isTargeted ? (
                        <>
                          <Label htmlFor={boxId} title={row.lockReason ?? undefined} className="cursor-pointer text-[13px] font-normal">
                            {row.label}
                          </Label>
                          {/* Said in words: a tooltip is invisible on touch. */}
                          {row.lockReason && <span className="block text-[11px] text-muted-foreground">{row.lockReason}</span>}
                        </>
                      ) : (
                        row.label
                      )}
                    </th>
                    <td className={`${NUM_CELL_CLASS} text-muted-foreground`}>{formatPercentageIt(row.currentPct, 1)}</td>
                    <td className={`${NUM_CELL_CLASS} text-foreground`}>{weight ? formatPercentageIt(weight.proposedPct, 1) : ''}</td>
                    <td className={`${NUM_CELL_CLASS} text-muted-foreground ${isTargeted ? TARGETED_DIFF_CLASS : 'pr-0'}`}>
                      {!weight ? '' : fixedKeys.has(row.key) ? IDEAL_COMPOSITION_FIXED_DIFF : formatOptimizerWeightDiffEur(weight.currentPct, weight.proposedPct, standalone.baseEur)}
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
        )}

        {okResult && (
          <>
            {isTargeted && <p className="text-[11px] text-muted-foreground">{IDEAL_COMPOSITION_LOSSES_NOTE}</p>}

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
