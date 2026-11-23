'use client';

/**
 * The plan of accumulation's PATH: eight screens on the guided paths' card (`PathCard`), the answers on this
 * browser (`plan-path-draft:v1:{ownerId}`), ONE «Conferma» that creates the plan ACTIVE through
 * `createAndActivatePlan` (doc/guide/accumulo.md § Il percorso: creare e rivedere). The reducer and every rule
 * are lib/utils/planPath.ts; the words lib/utils/planPathNarrative.ts; the bodies PianoScreens.tsx.
 *
 * «Conferma» reads the Italian month again (a press after midnight on the 1st never creates a plan that
 * starts in a month the summary did not show) and is disabled while it writes; an activation that fails
 * leaves a draft the next press adopts and overwrites.
 *
 * In a REVISION (`context.revision`, 2026-11-21) the same screens revise the active plan from its first intact
 * instalment: «Conferma» calls `revisePlan` with the input the summary previewed, on the assets read again at
 * the press, then writes the model when its box is on (§ Il percorso: creare e rivedere). No month check: a
 * revision starts from the plan's instalment, whatever the month.
 */

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import type { MonthKey } from '@/types/accumulationPlan';
import { queryKeys } from '@/lib/query/queryKeys';
import {
  PLAN_PATH_SCREENS,
  describePlanPathBlock,
  firstPlanPathRefusal,
  initialPlanPathDraft,
  parseStoredPlanPath,
  planPathReducer,
  planPathStorageKey,
  planPathToDraft,
  planPathToRevision,
  reconcilePlanPathAnswers,
  restorePlanPathDraft,
  type PlanPathContext,
} from '@/lib/utils/planPath';
import {
  PLAN_PATH_CONFIRM,
  PLAN_PATH_CONFIRMING,
  PLAN_PATH_DONE_FOOTER,
  PLAN_PATH_NEXT,
  PLAN_PATH_REVISING,
  buildPlanPathSummary,
  describeActivationFailed,
  describeMonthChanged,
  describePlanActive,
  describePlanRevised,
  firstInstalmentMonth,
  planPathScreenCopy,
} from '@/lib/utils/planPathNarrative';
import { clearStored, readStoredJson, writeStoredJson } from '@/lib/utils/pathDraftStorage';
import { modelWeightMap } from '@/lib/utils/accumulationPlanUtils';
import { comparePlanToModel, isModelStale, planPositionsToModelWeights, type ModelBasis } from '@/lib/utils/modelPortfolio';
import { ACCUMULO_HREF, ACCUMULO_OPEN_LINK, describeModelNotUpdated } from '@/lib/utils/accumuloCopy';
import { toMonthKey } from '@/lib/utils/planMonths';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { getAllAssets } from '@/lib/services/assetService';
import { createAndActivatePlan, PlanWriteError, revisePlan } from '@/lib/services/accumulationPlanService';
import { saveModelPortfolio } from '@/lib/services/modelPortfolioService';
import { compareAllocations } from '@/lib/services/assetAllocationService';
import { useMonthlySavingsMedian } from '@/lib/hooks/useMonthlySavingsMedian';
import { lazyComponent } from '@/components/ui/lazy-component';
import { PATH_BUTTON_CLASS, PathCard, PathDoneCard } from '@/components/ui/path-card';
import { Button } from '@/components/ui/button';
import { ContoScreen, DurataScreen, PartenzaScreen, RiepilogoScreen, RiservaScreen, StrumentiScreen, VenditeScreen, VersamentoScreen } from './PianoScreens';

// «Nuovo strumento…»: the asset form is a chunk of its own, loaded when the reader asks for it.
const AssetDialog = lazyComponent(() => import('@/components/assets/AssetDialog').then((module) => module.AssetDialog));

type RunState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'monthChanged'; firstMonth: MonthKey }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; firstMonth: MonthKey; firstEur: number; modelError: string | null };

export interface PianoWizardProps {
  ownerId: string;
  context: PlanPathContext;
  /** `buildModelBasis({ ...settings, targets }, goals)`: what the model written with the plan rests on. */
  basis: ModelBasis;
  /** «Conferma» found another Italian month: the host rebuilds the context on it. */
  onMonthChanged: (month: MonthKey) => void;
  /** The host re-reads the assets (an instrument created from «Aggiungi uno strumento»). */
  onAssetsChanged: () => void;
  /** The plan is active (or revised): the host keeps the done card instead of its own screens. */
  onCreated: () => void;
}

/** The month the summary read: the mount's (react-hooks/purity); only the preview's revision row reads it. */
function mountDate(): Date {
  return new Date();
}

export function PianoWizard({ ownerId, context, basis, onMonthChanged, onAssetsChanged, onCreated }: PianoWizardProps) {
  const queryClient = useQueryClient();
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  const storageKey = planPathStorageKey(ownerId);
  const [draft, dispatch] = useReducer(planPathReducer, null, () =>
    restorePlanPathDraft(readStoredJson(storage, storageKey, parseStoredPlanPath), context)
  );
  const [run, setRun] = useState<RunState>({ kind: 'idle' });
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [today] = useState(mountDate);
  const writing = useRef(false);
  const revision = context.revision;

  // The assets changed (re-read after a write, another tab): the answers are checked against them again.
  // Adjusted during render, not in an effect (React's «storing information from previous renders»).
  const [seenAssets, setSeenAssets] = useState(context.assets);
  if (seenAssets !== context.assets) {
    setSeenAssets(context.assets);
    dispatch({ type: 'reset', draft: { ...draft, answers: reconcilePlanPathAnswers(draft.answers, context) } });
  }

  // Every change onto this browser (a value `parseStoredPlanPath` refused is overwritten); done clears it.
  useEffect(() => {
    if (run.kind === 'done') return;
    writeStoredJson(storage, storageKey, draft);
  }, [storage, storageKey, draft, run.kind]);

  const { screen, answers } = draft;
  const index = PLAN_PATH_SCREENS.indexOf(screen);
  const copy = planPathScreenCopy(screen, context);
  const savingsMedian = useMonthlySavingsMedian(ownerId, context.assets, { enabled: screen === 'versamento' });

  const assetsById = useMemo(() => new Map(context.assets.map((asset) => [asset.id, asset])), [context.assets]);
  const model = context.model;
  const modelUsable = !!model && Object.keys(modelWeightMap(model)).length > 0;
  const modelStale = !!model && isModelStale(model, basis, context.assets);

  const onSummary = screen === 'riepilogo';
  const summary = useMemo(() => (onSummary ? buildPlanPathSummary(answers, context, today) : null), [onSummary, answers, context, today]);
  const modelWeights = useMemo(
    () => (onSummary ? planPositionsToModelWeights(answers.positions, assetsById, (asset) => asset.quantity).portfolioWeights : []),
    [onSummary, answers.positions, assetsById]
  );
  // The rule the deleted editor had (2026-11-21): on when the quotas differ from the model, or no model exists.
  const modelDiffers = !model || comparePlanToModel(answers.positions, model).count > 0;
  const updateModel = modelWeights.length > 0 && (answers.updateModel ?? modelDiffers);

  const block = onSummary ? null : describePlanPathBlock(screen, answers, context);
  const refusal = onSummary ? firstPlanPathRefusal(answers, context, today) : null;

  const finish = (firstMonth: MonthKey, firstEur: number, modelError: string | null) => {
    onCreated();
    for (const key of [queryKeys.accumulationPlans.all(ownerId), queryKeys.modelPortfolio.byOwner(ownerId), queryKeys.assets.all(ownerId)]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
    clearStored(storage, storageKey);
    setRun({ kind: 'done', firstMonth, firstEur, modelError });
  };

  // A revision: the gate inside `revisePlan` reads the assets as they are NOW, the input is the summary's.
  const confirmRevision = async () => {
    if (writing.current || !summary || !revision) return;
    writing.current = true;
    setRun({ kind: 'running' });
    const input = planPathToRevision(answers, context);
    // `.then` rather than try/catch, as below (reactCompilerCoverage.test.ts).
    const written = await getAllAssets(ownerId)
      .then((assets) => revisePlan(revision.plan.id, input, { allAssets: assets, deps: context.deps, today: new Date() }).then(() => assets))
      .then(
        (assets) => ({ ok: true as const, assets }),
        (error: unknown) => ({ ok: false as const, error })
      );
    if (!written.ok) {
      writing.current = false;
      setRun({ kind: 'failed', message: describeWriteError(written.error) });
      return;
    }
    // The rule the deleted editor had (2026-11-21): the model's snapshot from the model when the quotas came from it, else the plan's.
    const optimizerSnapshot = answers.start === 'model' ? context.model?.optimizerSnapshot : revision.plan.optimizerSnapshot;
    const modelError = updateModel
      ? await saveModelPortfolio(ownerId, { weights: modelWeights, origin: 'manual', optimizerSnapshot }, written.assets, basis).then(
          () => null,
          (error: unknown) => describeWriteError(error)
        )
      : null;
    writing.current = false;
    finish(summary.firstMonth, summary.firstEur, modelError);
  };

  const confirm = async () => {
    if (revision) return confirmRevision();
    if (writing.current || !summary) return;
    // The month the summary showed is the month read at mount: another one writes nothing.
    const nowMonth = toMonthKey(new Date());
    if (nowMonth !== context.todayMonth) {
      onMonthChanged(nowMonth);
      setRun({ kind: 'monthChanged', firstMonth: firstInstalmentMonth(nowMonth) });
      return;
    }
    writing.current = true;
    setRun({ kind: 'running' });
    // The gate reads the assets as they are NOW: an account deleted in another tab is `source_missing`, nothing written.
    const read = await getAllAssets(ownerId).then(
      (assets) => ({ ok: true as const, assets }),
      (error: unknown) => ({ ok: false as const, error })
    );
    if (!read.ok) {
      writing.current = false;
      setRun({ kind: 'failed', message: describeWriteError(read.error) });
      return;
    }
    const planDraft = planPathToDraft(answers, context);
    const model = updateModel ? { input: { weights: modelWeights, origin: 'manual' as const, optimizerSnapshot: planDraft.optimizerSnapshot }, basis } : undefined;
    // `.then` rather than try/catch: the React Compiler does not lower a conditional inside a try (reactCompilerCoverage.test.ts).
    const outcome = await createAndActivatePlan({
      ownerId,
      draft: planDraft,
      existingDraftId: answers.serverDraftId,
      activate: { allAssets: read.assets, targets: context.targets, compare: compareAllocations, deps: context.deps, today: new Date() },
      model,
    }).then(
      (result) => ({ ok: true as const, modelError: result.modelError }),
      (error: unknown) => ({ ok: false as const, error })
    );
    writing.current = false;
    if (outcome.ok) {
      finish(summary.firstMonth, summary.firstEur, outcome.modelError);
      return;
    }
    const { error } = outcome;
    if (error instanceof PlanWriteError && error.step === 'activate' && error.planId) {
      // The draft stands: the next press overwrites it and activates it, never a second plan.
      dispatch({ type: 'adopt', serverDraftId: error.planId });
      void queryClient.invalidateQueries({ queryKey: queryKeys.accumulationPlans.all(ownerId) });
      setRun({ kind: 'failed', message: describeActivationFailed(error.message) });
      return;
    }
    setRun({ kind: 'failed', message: error instanceof PlanWriteError ? error.message : describeWriteError(error) });
  };

  const restart = () => {
    clearStored(storage, storageKey);
    dispatch({ type: 'reset', draft: initialPlanPathDraft(context) });
    setRun({ kind: 'idle' });
  };

  if (run.kind === 'done') {
    const help = run.modelError ? [PLAN_PATH_DONE_FOOTER, describeModelNotUpdated(run.modelError)] : PLAN_PATH_DONE_FOOTER;
    return (
      <PathDoneCard
        ariaLabel={revision ? 'Piano rivisto' : 'Piano attivo'}
        headline={revision ? describePlanRevised(run.firstMonth, run.firstEur) : describePlanActive(run.firstMonth, run.firstEur)}
        help={help}
      >
        <Button asChild className={PATH_BUTTON_CLASS}>
          <Link href={ACCUMULO_HREF}>{ACCUMULO_OPEN_LINK}</Link>
        </Button>
      </PathDoneCard>
    );
  }

  const running = run.kind === 'running';
  const status =
    run.kind === 'failed'
      ? ({ tone: 'failure', text: run.message } as const)
      : run.kind === 'monthChanged'
        ? ({ tone: 'warning', text: describeMonthChanged(run.firstMonth) } as const)
        : (block ?? refusal)
          ? ({ tone: 'warning', text: (block ?? refusal)! } as const)
          : null;
  const primary = onSummary
    ? { label: running ? (revision ? PLAN_PATH_REVISING : PLAN_PATH_CONFIRMING) : PLAN_PATH_CONFIRM, onClick: () => void confirm(), disabled: running || refusal !== null }
    : { label: PLAN_PATH_NEXT, onClick: () => dispatch({ type: 'next' }), disabled: block !== null };

  const props = { answers, dispatch, context };
  return (
    <>
      <PathCard
        step={{ index, total: PLAN_PATH_SCREENS.length, theme: copy.theme }}
        question={copy.question}
        help={copy.help}
        back={{ onClick: () => dispatch({ type: 'back' }), disabled: index === 0 || running }}
        restart={{ onConfirm: restart, disabled: running }}
        status={status}
        primary={primary}
      >
        {screen === 'partenza' && <PartenzaScreen {...props} modelUsable={modelUsable} modelStale={modelStale} />}
        {screen === 'versamento' && <VersamentoScreen {...props} savingsMedian={savingsMedian} />}
        {screen === 'durata' && <DurataScreen {...props} />}
        {screen === 'conto' && <ContoScreen {...props} />}
        {screen === 'riserva' && <RiservaScreen {...props} />}
        {screen === 'vendite' && <VenditeScreen {...props} />}
        {screen === 'strumenti' && <StrumentiScreen {...props} onNewInstrument={() => setAssetDialogOpen(true)} />}
        {screen === 'riepilogo' && summary && (
          <RiepilogoScreen
            summary={summary}
            modelBox={modelWeights.length > 0 ? { checked: updateModel, onChange: (checked) => dispatch({ type: 'set', patch: { updateModel: checked } }) } : null}
          />
        )}
      </PathCard>
      {assetDialogOpen && (
        <AssetDialog
          fallback={null}
          open
          onClose={() => setAssetDialogOpen(false)}
          createEmpty
          onCreated={(assetId) => {
            // The assets are not read again yet: the row carries the pending label until they are.
            dispatch({ type: 'add', assetId, created: true, context });
            onAssetsChanged();
            setAssetDialogOpen(false);
          }}
        />
      )}
    </>
  );
}
