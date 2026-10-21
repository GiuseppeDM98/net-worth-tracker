'use client';

/**
 * PortafoglioModelloTile — «qual è il portafoglio a cui voglio arrivare, e quanto ne sono lontano?»
 *. Replaces Composizione ideale: the weights the
 * optimizer proposes are no longer ephemeral, they become THE model portfolio — one saved set of
 * market weights per instrument, with its date and origin — and a PAC starts from it.
 *
 * The tile shows «oggi · modello · differenza» (`describeModelVsToday`) and owns the four ways to
 * change it: «Ricalcola» (`IdealCompositionDialog`, which saves its result), «Modifica a mano»
 * (`ModelEditDialog`), «Aggiungi strumento da valutare» (`AssetDialog` in the empty mode, D7) and, from
 * the calculation, «Crea un PAC con questi pesi» — it chooses between that dialog and
 * `AccumulationPlanDialog` so two modals are never stacked. No calculation and no network call before
 * the reader asks.
 */
import { runGuarded } from '@/lib/utils/runGuarded';
import { Fragment, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { AccumulationPlan, PlanPosition, PlanDisposal, OptimizerSnapshot } from '@/types/accumulationPlan';
import type { ModelPortfolio } from '@/types/modelPortfolio';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import { calculateAssetValue, getAssetById } from '@/lib/services/assetService';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { addModelCandidate, describeModelExclusions, describeModelVsToday, groupMembers, MODEL_NO_TRADABLE_INSTRUMENTS, planPositionsToModelWeights } from '@/lib/utils/modelPortfolio';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { cachedFormatCurrencyEUR, formatPercentageIt } from '@/lib/utils/formatters';
import {
  describeModelOrigin,
  describeModelDebtNote,
  describeModelSalesHint,
  describeModelTileAside,
  MODEL_ACTION_ADD_CANDIDATE,
  MODEL_ACTION_EDIT,
  MODEL_ACTION_RECALCULATE,
  MODEL_ACTION_USE_PLAN,
  MODEL_SAVED_TOAST,
  MODEL_ADD_CANDIDATE_NEEDS_MODEL,
  MODEL_CANDIDATE_TAG,
  MODEL_COL_DIFF,
  MODEL_COL_INSTRUMENT,
  MODEL_COL_MODEL,
  MODEL_COL_TODAY,
  MODEL_GROUP_NO_BUY,
  MODEL_OUTSIDE_LABEL,
  MODEL_RECALCULATE_NEEDS_OBJECTIVES,
  MODEL_TILE_EMPTY_READING,
  MODEL_TILE_EYEBROW,
  MODEL_TILE_READ_FAILURE_READING,
  OPTIMIZER_ACTION_MODIFY_IN_SETTINGS,
  OPTIMIZER_OBJECTIVES_HREF,
} from '@/lib/utils/weightOptimizerNarrative';
import type { Narrative } from '@/lib/utils/narrative';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useSaveModelPortfolio } from '@/lib/hooks/useModelPortfolio';
import { Tile, TILE_SUB_EYEBROW_CLASS, type TileCollapse } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { AssetDialog } from '@/components/assets/AssetDialog';
import { IdealCompositionDialog } from '@/components/allocation/IdealCompositionDialog';
import { AccumulationPlanDialog } from '@/components/allocation/AccumulationPlanDialog';
import { ModelEditDialog } from '@/components/allocation/ModelEditDialog';
import { TILE_ACTION_CLASS } from '@/components/allocation/tiles/accumuloShared';

interface PortafoglioModelloTileProps {
  ownerId: string;
  allAssets: Asset[];
  targets: AssetAllocationTarget | null;
  targetLeverageRatio: number;
  idealAllocation: IdealAllocationSettings | null;
  band: RebalanceBand;
  /** The saved model, `null` when none; `readFailed` when the read itself failed (rule not deployed). */
  model: ModelPortfolio | null;
  /** The open plan: an active one with no model saved offers «Usa i pesi del piano» (AL14). */
  plan?: AccumulationPlan | null;
  readFailed: boolean;
  /** The row of the phone composition (The Closed-Row Rule); absent at 1440. */
  collapse?: TileCollapse;
  asideWhenClosed?: string;
  onAssetsChanged: () => void;
}

type View = 'closed' | 'composition' | 'pac' | 'edit' | 'candidate';

const HEAD_CLASS = 'py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';
const NUM_CELL_CLASS = 'py-1.5 pr-2 text-right font-mono tabular-nums';

function signedEur(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return cachedFormatCurrencyEUR(0, true);
  return `${rounded > 0 ? '+' : '−'}${cachedFormatCurrencyEUR(Math.abs(rounded), true)}`;
}

export function PortafoglioModelloTile({
  ownerId,
  allAssets,
  targets,
  targetLeverageRatio,
  idealAllocation,
  band,
  model,
  plan = null,
  readFailed,
  collapse,
  asideWhenClosed,
  onAssetsChanged,
}: PortafoglioModelloTileProps) {
  const isDemo = useDemoMode();
  const saveModel = useSaveModelPortfolio(ownerId);
  const [view, setView] = useState<View>('closed');
  const [pacSeed, setPacSeed] = useState<{ positions: PlanPosition[]; disposals?: PlanDisposal[]; optimizerSnapshot: OptimizerSnapshot } | undefined>(undefined);

  const assetsById = useMemo(() => new Map(allAssets.map((asset) => [asset.id, asset])), [allAssets]);
  const nameOf = (assetId: string): string => assetsById.get(assetId)?.name ?? assetId;
  const labelOf = (assetId: string): string => {
    const asset = assetsById.get(assetId);
    return asset ? getAssetDisplayTicker(asset) || asset.name : assetId;
  };

  const comparison = useMemo(() => (model ? describeModelVsToday(model.weights, allAssets, calculateAssetValue) : null), [model, allAssets]);
  const debtNote = useMemo(() => describeModelDebtNote(allAssets, calculateAssetValue), [allAssets]);
  const toBuyEur = comparison ? comparison.rows.reduce((sum, row) => sum + Math.max(0, row.diffEur), 0) : 0;

  const objectivesOn = !!idealAllocation?.enabled;
  // Mini-bars share ONE scale across the rows, so a long bar is a big weight on every row.
  const barScale = comparison ? Math.max(1, ...comparison.rows.flatMap((row) => [row.todayPct, row.modelPct])) * 1.12 : 1;
  const overweightLabels = comparison ? comparison.rows.filter((row) => row.diffEur < -1).map((row) => labelOf(row.assetId)) : [];

  const instrumentCount = model ? model.weights.reduce((sum, weight) => sum + groupMembers(weight).length, 0) : 0;

  const reading: Narrative = readFailed
    ? [{ text: MODEL_TILE_READ_FAILURE_READING }]
    : !model || !comparison
      ? [{ text: MODEL_TILE_EMPTY_READING }]
      : [
          { text: `${instrumentCount} strument${instrumentCount === 1 ? 'o' : 'i'}. ${describeModelOrigin(model.origin, model.updatedAt, model.optimizerSnapshot)} ` },
          ...(toBuyEur >= 1
            ? ([{ text: 'Per portare il portafoglio sul modello servono ' }, { text: cachedFormatCurrencyEUR(toBuyEur, true), mono: true }, { text: ' di acquisti.' }] as Narrative)
            : ([{ text: 'Il portafoglio è già sul modello.' }] as Narrative)),
        ];

  // AL14: with an active plan and no model, the plan's weights (and groups) become the model.
  const canUsePlan = !model && !readFailed && !!plan && plan.status === 'active';
  const handleUsePlan = async () => {
    if (!plan) return;
    const fit = planPositionsToModelWeights(plan.positions, assetsById, (asset) => asset.quantity);
    if (fit.portfolioWeights.length === 0) {
      toast.error(MODEL_NO_TRADABLE_INSTRUMENTS);
      return;
    }
    await runGuarded(
      async () => {
        await saveModel.mutateAsync({
          input: { weights: fit.portfolioWeights, origin: 'manual', optimizerSnapshot: plan.optimizerSnapshot },
          allAssets,
        });
        toast.success(MODEL_SAVED_TOAST);
        if (fit.excluded.length > 0) toast.info(describeModelExclusions(fit.excluded, labelOf));
      },
      (error) => {
        toast.error(describeWriteError(error));
      },
    );
  };

  const handleCandidateCreated = async (assetId: string) => {
    setView('closed');
    onAssetsChanged();
    if (!model) return;
    await runGuarded(
      async () => {
        // The page has not re-read the assets yet: validate against the new one explicitly.
        const created = await getAssetById(assetId);
        await saveModel.mutateAsync({
          input: { weights: addModelCandidate(model.weights, assetId), origin: model.origin, optimizerSnapshot: model.optimizerSnapshot },
          allAssets: created ? [...allAssets.filter((asset) => asset.id !== created.id), created] : allAssets,
        });
      },
      (error) => {
        toast.error(describeWriteError(error));
      },
    );
  };

  return (
    <>
      <Tile
        eyebrow={MODEL_TILE_EYEBROW}
        aside={comparison ? describeModelTileAside(comparison.baseEur) : undefined}
        asideWhenClosed={asideWhenClosed}
        collapse={collapse}
        reading={reading}
      >
        {comparison && comparison.rows.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className={HEAD_CLASS}>
                    {MODEL_COL_INSTRUMENT}
                  </th>
                  <th scope="col" className={`${HEAD_CLASS} text-right`}>
                    {MODEL_COL_TODAY}
                  </th>
                  <th scope="col" className={`${HEAD_CLASS} text-right`}>
                    {MODEL_COL_MODEL}
                  </th>
                  <th scope="col" className={`${HEAD_CLASS} pr-0 text-right`}>
                    {MODEL_COL_DIFF}
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => (
                  <Fragment key={row.assetId}>
                  <tr className="border-b border-border last:border-0">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">
                      {nameOf(row.assetId)}
                      <span className="block text-[11px] text-muted-foreground">
                        {labelOf(row.assetId)}
                        {row.candidate && (
                          <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[10.5px]">{MODEL_CANDIDATE_TAG}</span>
                        )}
                      </span>
                    </th>
                    <td className={`${NUM_CELL_CLASS} text-muted-foreground`}>{formatPercentageIt(row.todayPct, 1)}</td>
                    <td className={`${NUM_CELL_CLASS} text-foreground`}>
                      <span className="inline-flex items-center justify-end gap-2">
                        <span className="relative hidden h-[3px] w-14 rounded-full bg-muted tablet:inline-block" aria-hidden="true">
                          <span className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/60" style={{ width: `${(row.todayPct / barScale) * 100}%` }} />
                          <span className="absolute -inset-y-[3px] w-px bg-foreground" style={{ left: `${(row.modelPct / barScale) * 100}%` }} />
                        </span>
                        {formatPercentageIt(row.modelPct, 1)}
                      </span>
                    </td>
                    <td className={`${NUM_CELL_CLASS} pr-0 ${row.diffEur >= 1 ? 'text-positive' : 'text-muted-foreground'}`}>{signedEur(row.diffEur)}</td>
                  </tr>
                  {/* AL16: a group is drawn as in the Target step — the buyer is the head, the others indented. */}
                  {row.memberAssetIds.slice(1).map((memberId) => (
                    <tr key={memberId} className="border-b border-border last:border-0">
                      <th scope="row" className="py-1.5 pl-5 pr-2 text-left font-normal text-foreground">
                        {nameOf(memberId)}
                        <span className="block text-[11px] text-muted-foreground">
                          {labelOf(memberId)} · {MODEL_GROUP_NO_BUY}
                        </span>
                      </th>
                      <td colSpan={3} />
                    </tr>
                  ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {comparison.outside.assetIds.length > 0 && (
              <p className="mt-2 text-[12px] text-muted-foreground">
                <span className={TILE_SUB_EYEBROW_CLASS}>{MODEL_OUTSIDE_LABEL}</span>{' '}
                {comparison.outside.assetIds.map(labelOf).join(', ')} ·{' '}
                <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(comparison.outside.valueEur, true)}</span>
              </p>
            )}
            {overweightLabels.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">{describeModelSalesHint(overweightLabels)}</p>
            )}
            {debtNote && <p className="mt-1 text-[11px] text-muted-foreground">{debtNote}</p>}
          </div>
        )}

        {!objectivesOn && (
          <p className="mt-3 text-[12px] text-muted-foreground">
            {MODEL_RECALCULATE_NEEDS_OBJECTIVES}{' '}
            <Link href={OPTIMIZER_OBJECTIVES_HREF} className="underline underline-offset-2">
              {OPTIMIZER_ACTION_MODIFY_IN_SETTINGS}
            </Link>
          </p>
        )}
        {!model && !readFailed && <p className="mt-1 text-[11px] text-muted-foreground">{MODEL_ADD_CANDIDATE_NEEDS_MODEL}</p>}

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
          <Button className={TILE_ACTION_CLASS} onClick={() => setView('composition')} disabled={!targets || !objectivesOn}>
            {MODEL_ACTION_RECALCULATE}
          </Button>
          {canUsePlan && (
            <Button className={TILE_ACTION_CLASS} onClick={() => void handleUsePlan()} disabled={isDemo || saveModel.isPending}>
              {MODEL_ACTION_USE_PLAN}
            </Button>
          )}
          <Button variant="outline" className={TILE_ACTION_CLASS} onClick={() => setView('edit')} disabled={isDemo || readFailed}>
            {MODEL_ACTION_EDIT}
          </Button>
          <Button variant="outline" className={TILE_ACTION_CLASS} onClick={() => setView('candidate')} disabled={isDemo || !model}>
            {MODEL_ACTION_ADD_CANDIDATE}
          </Button>
        </div>
      </Tile>

      {view === 'composition' && targets && idealAllocation?.enabled && (
        <IdealCompositionDialog
          open
          onClose={() => setView('closed')}
          ownerId={ownerId}
          allAssets={allAssets}
          targets={targets}
          targetLeverageRatio={targetLeverageRatio}
          idealAllocation={idealAllocation}
          model={model}
          onCreatePac={(seed) => {
            setPacSeed(seed);
            setView('pac');
          }}
        />
      )}

      {view === 'pac' && targets && (
        <AccumulationPlanDialog
          open
          onClose={() => setView('closed')}
          ownerId={ownerId}
          plan={null}
          allAssets={allAssets}
          targets={targets}
          band={band}
          targetLeverageRatio={targetLeverageRatio}
          idealAllocation={idealAllocation}
          seedDraft={pacSeed}
          model={model}
          onAssetsChanged={onAssetsChanged}
          onSaved={() => setView('closed')}
        />
      )}

      {view === 'edit' && (
        <ModelEditDialog open onClose={() => setView('closed')} ownerId={ownerId} model={model} allAssets={allAssets} labelOf={labelOf} />
      )}

      {view === 'candidate' && (
        <AssetDialog open onClose={() => setView('closed')} createEmpty onCreated={(assetId) => void handleCandidateCreated(assetId)} />
      )}
    </>
  );
}
