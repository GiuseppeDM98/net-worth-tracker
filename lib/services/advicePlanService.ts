/**
 * The click of the Consulente's «Applica» that creates the plan of accumulation (2026-11-20,
 * doc/guide/consulente-piano.md § After «Applica»): client SDK, through the app's own services.
 *
 * Not atomic, idempotent on a second press: the steps run in order and each is awaited — the
 * investment account saved as a setting, the missing instruments (each matched by ISIN or name on
 * the re-read assets before it is created, with the page's own matcher), the plan written and
 * activated (or the active plan revised), the model. A step that fails throws `AdvicePlanError`
 * naming it and what was done before it; a press after it rebuilds the plan on the re-read data, so
 * the instruments are found and a draft left by a failed activation is replaced. Once the plan is
 * active nothing throws: a model that cannot be written is `modelError`.
 *
 * Loaded by the «Applica» page with `await import()` only: the Consulente's route keeps it out of
 * its first load.
 */

import type { AccumulationPlan, AccumulationPlanDraft } from '@/types/accumulationPlan';
import type { Asset, AssetAllocationSettings, AssetAllocationTarget } from '@/types/assets';
import { createAsset, getAllAssets } from '@/lib/services/assetService';
import { setSettings } from '@/lib/services/assetAllocationService';
import { createAndActivatePlan, PlanWriteError, revisePlan } from '@/lib/services/accumulationPlanService';
import { saveModelPortfolio } from '@/lib/services/modelPortfolioService';
import { ADVICE_PLAN_COPY, newInstrumentId, type AdvicePlanBuild } from '@/lib/utils/advicePlan';
import { findAdviceInstrument } from '@/lib/utils/operatingPlanFacts';
import { diffRevisionDisposals, isPlanSourceAccount, type AllocationCompare, type PlanDeps } from '@/lib/utils/accumulationPlanUtils';
import { MODEL_NO_TRADABLE_INSTRUMENTS, planPositionsToModelWeights, type ModelBasis } from '@/lib/utils/modelPortfolio';
import { describeWriteError } from '@/lib/utils/dialogNarrative';

export interface AdvicePlanRun {
  ownerId: string;
  build: AdvicePlanBuild;
  assets: Asset[];
  /** `selectOpenPlan(plans) ?? null`. */
  openPlan: AccumulationPlan | null;
  /** The targets the build was made on. */
  targets: AssetAllocationTarget;
  /**
   * `buildModelBasis({ ...settings, targets }, goalsAfter)`: the goal document the click wrote when «Gli
   * obiettivi» is ticked, else the route's — never the cache's, which still holds the goals of before.
   */
  basis: ModelBasis;
  /** The account was chosen on the page: the same click saves it as «Conto per gli investimenti». */
  saveSourceAsSetting: boolean;
  sourceAssetId: string;
  compare: AllocationCompare;
  deps: PlanDeps;
  today: Date;
}

export type AdvicePlanStep = 'setting' | 'instruments' | 'plan' | 'activate';

/** The click failed at `step`; `done` lists what it wrote before. */
export class AdvicePlanError extends Error {
  readonly step: AdvicePlanStep;
  readonly done: AdvicePlanStep[];
  constructor(step: AdvicePlanStep, done: AdvicePlanStep[], message: string, options: { cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = 'AdvicePlanError';
    this.step = step;
    this.done = [...done];
  }
}

/** Runs one step: any throw becomes the `AdvicePlanError` of that step. */
async function runStep<T>(step: AdvicePlanStep, done: readonly AdvicePlanStep[], work: () => Promise<T>): Promise<T> {
  return work().catch((error: unknown) => {
    throw new AdvicePlanError(step, [...done], describeWriteError(error), { cause: error });
  });
}

/** The draft with every `new:<ref>` replaced by the id of the instrument created or found. */
function withRealIds(draft: AccumulationPlanDraft, ids: Map<string, string>): AccumulationPlanDraft {
  const real = (id: string) => ids.get(id) ?? id;
  return {
    ...draft,
    positions: draft.positions.map((position) => ({
      ...position,
      memberAssetIds: position.memberAssetIds.map(real),
      buyAssetId: real(position.buyAssetId),
    })),
    disposals: draft.disposals.map((disposal) => ({
      ...disposal,
      assetId: real(disposal.assetId),
      ...(disposal.reinvestAssetId ? { reinvestAssetId: real(disposal.reinvestAssetId) } : {}),
    })),
  };
}

export async function executeAdvicePlan(run: AdvicePlanRun): Promise<{
  planId: string;
  action: AdvicePlanBuild['action'];
  /** Why the model was not written (the plan stands), or null. */
  modelError: string | null;
}> {
  const { ownerId, build, openPlan, targets, basis, compare, deps, today } = run;
  if (build.blocked !== null || build.issues.length > 0) {
    throw new Error('Il piano non può essere creato da qui: rileggi la pagina.');
  }
  if (build.action !== 'create' && !openPlan) throw new Error('Il piano aperto non è più quello della pagina: rileggi la pagina.');

  let assets = await getAllAssets(ownerId);
  const source = assets.find((asset) => asset.id === run.sourceAssetId);
  if (!source || !isPlanSourceAccount(source)) throw new AdvicePlanError('plan', [], ADVICE_PLAN_COPY.sourceGone);

  const done: AdvicePlanStep[] = [];

  // 1. The account, as a setting of its own: a write without `targets` takes the merge branch.
  if (run.saveSourceAsSetting) {
    await runStep('setting', done, () => setSettings(ownerId, { investmentCashAssetId: run.sourceAssetId } as AssetAllocationSettings));
    done.push('setting');
  }

  // 2. The instruments: matched on the re-read assets first, so a second press creates none.
  const ids = new Map<string, string>();
  if (build.toCreate.length > 0) {
    await runStep('instruments', done, async () => {
      for (const item of build.toCreate) {
        const found = findAdviceInstrument(assets, item.formData);
        ids.set(newInstrumentId(item.ref), found ? found.id : await createAsset(ownerId, item.formData));
      }
      assets = await getAllAssets(ownerId);
    });
    done.push('instruments');
  }
  const draft = withRealIds(build.draft, ids);
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const weights = planPositionsToModelWeights(draft.positions, assetsById, (asset) => asset.quantity).portfolioWeights;

  // 3. The plan.
  if (build.action === 'revise' && openPlan) {
    const diff = diffRevisionDisposals(openPlan, draft.disposals);
    await runStep('plan', done, () =>
      revisePlan(
        openPlan.id,
        {
          monthlyInflowEur: draft.liquidity.monthlyInflowEur,
          reserveEur: draft.liquidity.reserveEur,
          // Already the months that remain, in the active plan's numbering: nothing is shifted here.
          remainingMonths: draft.months,
          positions: draft.positions,
          sourceCashAssetIds: draft.liquidity.sourceCashAssetIds,
          reviewMonthIndex: draft.reviewMonthIndex ?? null,
          // The Consulente's revision replaces the notes of a previous click (none = an empty list).
          advisorNotes: draft.advisorNotes ?? [],
          disposals: diff.newDisposals,
          removedDisposalAssetIds: diff.removedDisposalAssetIds,
          movedDisposalMonthIndexes: diff.movedDisposalMonthIndexes,
        },
        { allAssets: assets, deps, today }
      )
    );
    const modelError = weights.length === 0
      ? MODEL_NO_TRADABLE_INSTRUMENTS
      : await saveModelPortfolio(ownerId, { weights, origin: 'manual' }, assets, basis)
          .then(() => null)
          .catch((error: unknown) => describeWriteError(error));
    return { planId: openPlan.id, action: build.action, modelError };
  }

  const result = await createAndActivatePlan({
    ownerId,
    draft,
    existingDraftId: build.action === 'replace' ? openPlan?.id : undefined,
    activate: { allAssets: assets, targets, compare, deps, today },
    ...(weights.length > 0 ? { model: { input: { weights, origin: 'manual' as const }, basis } } : {}),
  }).catch((error: unknown) => {
    if (error instanceof PlanWriteError) {
      // An activation that fails leaves the draft written: the plan step is done, the next press replaces it.
      throw new AdvicePlanError(error.step, error.step === 'activate' ? [...done, 'plan'] : done, error.message, { cause: error });
    }
    throw new AdvicePlanError('plan', done, describeWriteError(error), { cause: error });
  });
  return {
    planId: result.planId,
    action: build.action,
    modelError: weights.length === 0 ? MODEL_NO_TRADABLE_INSTRUMENTS : result.modelError,
  };
}
