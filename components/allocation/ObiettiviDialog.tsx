'use client';

/**
 * ObiettiviDialog — the weight optimizer's objectives, edited where they are used. The form is `IdealAllocationTile`'s own (extracted in its `bare` mode: the same controlled
 * leaf Impostazioni used to host), kept in a local DRAFT:
 *   «Prova»   runs `runOptimizer` on the draft — mode Ideale, the whole portfolio as the base — and
 *             shows the report (objectives, conflicts, warnings). Nothing is written.
 *   «Salva gli obiettivi» writes `idealAllocation` and nothing else: `setSettings` without `targets`
 *             is a merge write, so every other setting stays as it is (settingsRoundTrip, PT7).
 * The draft never leaks out: closing the modal drops it.
 */
import { runGuarded } from '@/lib/utils/runGuarded';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import type { Asset, AssetAllocationSettings, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { ModelPortfolio } from '@/types/modelPortfolio';
import { groupMembers, modelGroups } from '@/lib/utils/modelPortfolio';
import { setSettings } from '@/lib/services/assetAllocationService';
import { calculateAssetValue } from '@/lib/services/assetService';
import { resolveAllocationRole } from '@/lib/utils/allocationUtils';
import { buildObjectivesEditorContext, describeClassTargets, findIdealAllocationProblem } from '@/lib/utils/idealAllocationEditor';
import type { AccumulationPlan } from '@/types/accumulationPlan';
import { planMemberAssetIds } from '@/lib/utils/accumulationPlanUtils';
import { buildStandaloneCandidates, runOptimizer, type OptimizerResult } from '@/lib/utils/weightOptimizer';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import {
  OBJECTIVES_ACTION_CANCEL,
  OBJECTIVES_ACTION_SAVE,
  OBJECTIVES_ACTION_TRY,
  OBJECTIVES_CLASS_TARGETS_EMPTY,
  OBJECTIVES_CLASS_TARGETS_EYEBROW,
  OBJECTIVES_CLASS_TARGETS_HREF,
  OBJECTIVES_CLASS_TARGETS_LINK,
  OBJECTIVES_CLASS_TARGETS_READING,
  OBJECTIVES_DIALOG_READING,
  OBJECTIVES_DIALOG_TITLE,
  OBJECTIVES_SAVED_TOAST,
  OBJECTIVES_TRY_EMPTY,
  OPTIMIZER_STATUS_INFEASIBLE_BOUNDS,
  OPTIMIZER_STATUS_NO_CANDIDATES,
} from '@/lib/utils/weightOptimizerNarrative';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { TILE_FOOTER_ACTION_CLASS } from '@/components/ui/tile';
import { IdealAllocationTile } from '@/components/settings/IdealAllocationTile';
import { OptimizerObjectivesReport } from '@/components/allocation/OptimizerReport';

interface ObiettiviDialogProps {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  targetLeverageRatio: number;
  /** The saved objectives (`DEFAULT_IDEAL_ALLOCATION` when the account has none). */
  saved: IdealAllocationSettings;
  /** The saved model portfolio: its instruments at 0 shares take part in «Prova» too (PO10). */
  model?: ModelPortfolio | null;
  /** The open plan: its instruments at 0 shares take part in «Prova» too (AL10). */
  plan?: AccumulationPlan | null;
  /** After a successful save: the page re-reads the settings. */
  onSaved: () => void;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}

export function ObiettiviDialog({ open, onClose, ownerId, allAssets, targets, targetLeverageRatio, saved, model, plan = null, onSaved, returnFocusTo }: ObiettiviDialogProps) {
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<IdealAllocationSettings>(saved);
  const [tryRequested, setTryRequested] = useState(false);
  const [saving, setSaving] = useState(false);

  const editorContext = useMemo(() => buildObjectivesEditorContext(targets, allAssets, calculateAssetValue), [targets, allAssets]);
  const classTargets = useMemo(() => describeClassTargets(targets, targetLeverageRatio), [targets, targetLeverageRatio]);
  const assetsById = useMemo(() => new Map(allAssets.map((asset) => [asset.id, asset])), [allAssets]);

  // The «Prova» base is the whole allocable portfolio: no amount to invest, the objectives alone.
  const baseEur = useMemo(
    () =>
      allAssets.reduce((sum, asset) => {
        const role = resolveAllocationRole(asset);
        if (role !== 'tradable' && role !== 'frozen') return sum;
        const value = calculateAssetValue(asset);
        return value > 0 ? sum + value : sum;
      }, 0),
    [allAssets],
  );
  const evaluateAssetIds = useMemo(() => new Set([...(model?.weights ?? []).flatMap((weight) => groupMembers(weight)), ...planMemberAssetIds(plan)]), [model, plan]);
  const standalone = useMemo(
    () => buildStandaloneCandidates(allAssets, baseEur, calculateAssetValue, evaluateAssetIds, modelGroups(model?.weights ?? [])),
    [allAssets, baseEur, evaluateAssetIds, model],
  );

  // `tryRequested` stays true after the first «Prova»: the report follows the draft from then on, as
  // the weights table of Composizione ideale follows its inputs.
  const result: OptimizerResult | null = useMemo(() => {
    if (!tryRequested) return null;
    return runOptimizer({
      positions: standalone.positions,
      assetsById,
      settings: draft,
      mode: 'ideal',
      baseEur,
      valueOf: calculateAssetValue,
      targets,
      targetLeverageRatio,
      fixBounds: standalone.fixBounds,
    });
  }, [tryRequested, standalone, assetsById, draft, baseEur, targets, targetLeverageRatio]);

  const labelOf = (key: string): string => standalone.positions.find((position) => position.key === key)?.label ?? key;

  const handleSave = async () => {
    const problem = findIdealAllocationProblem(draft);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    await runGuarded(
      async () => {
        // No `targets` in the payload: the merge write touches `idealAllocation` and nothing else.
        await setSettings(ownerId, { idealAllocation: draft } as AssetAllocationSettings);
        toast.success(OBJECTIVES_SAVED_TOAST);
        await queryClient.invalidateQueries({ queryKey: queryKeys.settings.all(ownerId) });
        onSaved();
        onClose();
      },
      (error) => {
        toast.error(describeWriteError(error));
      },
      () => setSaving(false),
    );
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      width="xl"
      eyebrow="Accumulo"
      title={OBJECTIVES_DIALOG_TITLE}
      reading={OBJECTIVES_DIALOG_READING}
      returnFocusTo={returnFocusTo}
      footer={
        <>
          <Button variant="outline" className="h-11 text-[12px] desktop:h-8" onClick={onClose} disabled={saving}>
            {OBJECTIVES_ACTION_CANCEL}
          </Button>
          <Button variant="outline" className="h-11 text-[12px] desktop:h-8" onClick={() => setTryRequested(true)} disabled={!draft.enabled || standalone.positions.length === 0}>
            {OBJECTIVES_ACTION_TRY}
          </Button>
          <Button className="h-11 text-[12px] desktop:h-8" onClick={() => void handleSave()} disabled={isDemo || saving}>
            {OBJECTIVES_ACTION_SAVE}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <section aria-label={OBJECTIVES_CLASS_TARGETS_EYEBROW} className="rounded-[10px] bg-muted px-3.5 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{OBJECTIVES_CLASS_TARGETS_EYEBROW}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">{classTargets.rows.length > 0 ? OBJECTIVES_CLASS_TARGETS_READING : OBJECTIVES_CLASS_TARGETS_EMPTY}</p>
          {classTargets.rows.length > 0 && (
            <ul className="mt-2 divide-y divide-border">
              {classTargets.rows.map((row) => (
                <li key={row.assetClass} className="flex items-baseline justify-between gap-3 py-1.5 text-[13px] text-foreground">
                  <span>{row.label}</span>
                  <span className="font-mono tabular-nums">{row.valueText}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
            {classTargets.leverageText && <span className="text-muted-foreground">{classTargets.leverageText}</span>}
            <Link href={OBJECTIVES_CLASS_TARGETS_HREF} className={TILE_FOOTER_ACTION_CLASS}>
              {OBJECTIVES_CLASS_TARGETS_LINK}
            </Link>
          </div>
        </section>
        <IdealAllocationTile
          bare
          value={draft}
          onChange={setDraft}
          targetLeverageRatio={targetLeverageRatio}
          factorClassOptions={editorContext.factorClassOptions}
          secondLevelReadyClasses={editorContext.secondLevelReadyClasses}
          secondLevelGaps={editorContext.secondLevelGaps}
          tradableAssets={editorContext.tradableAssets}
          disabled={isDemo}
        />

        {draft.enabled && standalone.positions.length === 0 && <p className="text-[12px] text-muted-foreground">{OBJECTIVES_TRY_EMPTY}</p>}
        {tryRequested && result && (
          <>
            {result.status === 'no_candidates' && <p className="text-[12px] text-muted-foreground">{OPTIMIZER_STATUS_NO_CANDIDATES}</p>}
            {result.status === 'infeasible_bounds' && <p className="text-[12px] text-destructive">{OPTIMIZER_STATUS_INFEASIBLE_BOUNDS}</p>}
            {result.status === 'ok' && <OptimizerObjectivesReport result={result} labelOf={labelOf} />}
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
