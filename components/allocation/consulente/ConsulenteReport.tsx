'use client';

/**
 * The REPORT: while a run is still going, its stage and a reread; once it ends, the BOOK
 * (`ConsulenteBook`, 2026-11-08) — the verdict on the cover, one page per section of the model's
 * text and tile of figures, «Applica» as the last page, one checkbox per thing it writes, the
 * plans shown before anything moves. A failed run is a book over the text it has, its sentence on
 * the cover and the way back on the last page.
 *
 * This file owns the data and the writes: the plans (`buildProposalRows`, `planRoleChanges`,
 * `planGoalDocument`), `useConsulenteRevision`, the apply state, the operating plan's row on
 * «Applica» (`useConsulentePlan`, 2026-11-19) and the plan of accumulation the same click creates
 * (2026-11-20: `ConsulentePlanTick`, loaded on demand, builds it; `executeAdvicePlan`, imported on
 * the click, writes it). The writes go through the app's own services (`setSettings`,
 * `updateAssetAllocationRole`, `saveGoalData`, then the plan's) and the «applied» route records
 * them; every reader's key is invalidated.
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import type { Asset, AssetAllocationSettings, AssetAllocationTarget } from '@/types/assets';
import type { GoalBasedInvestingData } from '@/types/goals';
import { calculateAssetValue, updateAssetAllocationRole } from '@/lib/services/assetService';
import { compareAllocations, setSettings } from '@/lib/services/assetAllocationService';
import { resolveEffectiveTargets } from '@/lib/services/effectiveTargets';
import { saveGoalData } from '@/lib/services/goalService';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { queryKeys } from '@/lib/query/queryKeys';
import { useAllocationAdvice } from '@/lib/hooks/useAllocationAdvice';
import { useConsulenteRevision } from './useConsulenteRevision';
import { useConsulentePlan } from './useConsulentePlan';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useSettings } from '@/lib/hooks/useSettings';
import { unitPriceEur } from '@/lib/utils/costBasisEur';
import { describeModelNotUpdated } from '@/lib/utils/accumuloCopy';
import { lazyComponent } from '@/components/ui/lazy-component';
import type { AdvicePlanReady } from './ConsulentePlanTick';
import { operatingPlanOf } from '@/lib/utils/operatingPlan';
import { StageRows } from './ConsulenteRun';
import { ConsulenteBook } from './ConsulenteBook';
import type { ApplyState, PlanRow } from './ConsulenteBookPages';
import type { BookPageId } from '@/lib/utils/allocationAdviceBook';
import { buildTargetsFromProposal, currentAllocationOnBase, planGoalDocument, planRoleChanges } from '@/lib/utils/allocationAdviceApply';
import { RUN_STALE_AFTER_MS, runStageStates } from '@/lib/utils/allocationAdviceDocument';
import { removedGoalIds } from '@/lib/utils/allocationAdviceDraft';
import { ADVICE_PLAN_TICK_COPY, buildConsulenteVerdict, buildProposalRows, describeAdvicePlanFailure, describeApplySummary, describeRunHeadline } from '@/lib/utils/allocationAdviceNarrative';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { formatDate } from '@/lib/utils/formatters';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { PageVerdict } from '@/components/ui/page-verdict';
import { Tile } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';

interface ConsulenteReportProps {
  ownerId: string;
  document: AllocationAdviceDocument;
  assets: Asset[];
  goalData: GoalBasedInvestingData | null;
  /** The book's page by id, kept by the host across the running view and a revision. */
  pageId: string | null;
  onPageChange: (id: BookPageId) => void;
  onRedo: () => void;
}

// At module scope: the React Compiler does not lower an `import()` inside a component. The plan's
// tick and its executor carry the builder and the plan's services: neither is in the route's first load.
const loadAdvicePlanService = () => import('@/lib/services/advicePlanService');
const LazyPlanTick = lazyComponent(() => import('./ConsulentePlanTick').then((module) => module.ConsulentePlanTick));

const planDeps = { valueOf: calculateAssetValue, priceOf: unitPriceEur };

type PlanAction = AdvicePlanReady['build']['action'];
type AppliedRecord = { targetsWritten: boolean; rolesChanged: number; goalsWritten: number; planId?: string; planAction?: PlanAction };

/** The plan's outcome of THIS press, for the applied body: why it was not created, why the model was not written. */
type PlanOutcome = { failure: string | null; modelError: string | null };

/** The plan's click; a failure becomes its sentence. `wroteSettings`: the same press wrote targets, roles and goals. */
async function runAdvicePlan(
  run: AdvicePlanReady & { ownerId: string; assets: Asset[]; targets: AssetAllocationTarget },
  wroteSettings: boolean
): Promise<{ result: { planId: string; planAction: PlanAction } | null; outcome: PlanOutcome }> {
  const failed = (error: { step: 'setting' | 'instruments' | 'plan' | 'activate'; done: readonly ('setting' | 'instruments' | 'plan' | 'activate')[]; message: string }) => ({
    result: null,
    outcome: { failure: describeAdvicePlanFailure(error, wroteSettings), modelError: null },
  });
  let service: Awaited<ReturnType<typeof loadAdvicePlanService>>;
  try {
    service = await loadAdvicePlanService();
  } catch (error) {
    // The chunk did not load: nothing of the plan was written.
    return failed({ step: 'plan', done: [], message: describeWriteError(error) });
  }
  try {
    const done = await service.executeAdvicePlan({ ...run, compare: compareAllocations, deps: planDeps, today: new Date() });
    return { result: { planId: done.planId, planAction: done.action }, outcome: { failure: null, modelError: done.modelError } };
  } catch (error) {
    return failed(error instanceof service.AdvicePlanError ? error : { step: 'plan', done: [], message: describeWriteError(error) });
  }
}

/** The report's «applied» record, or the route's refusal as a failure. */
async function markApplied(ownerId: string, applied: AppliedRecord): Promise<void> {
  const response = await authenticatedFetch('/api/allocation-advice/applied', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: ownerId, applied }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? "Impossibile registrare l'applicazione del percorso");
  }
}

export function ConsulenteReport({ ownerId, document, assets, goalData, pageId, onPageChange, onRedo }: ConsulenteReportProps) {
  const queryClient = useQueryClient();
  // A run still going rereads the document while it lasts.
  useAllocationAdvice(ownerId, { enabled: document.status === 'running' });
  const revision = useConsulenteRevision(ownerId);
  const settingsQuery = useSettings(ownerId);
  const revising = revision.state.kind === 'running';
  const planWriter = useConsulentePlan(ownerId);
  const isDemo = useDemoMode();
  const proposal = document.report?.proposal ?? document.strategy?.proposal ?? null;
  // Today's Italian day once per mount: the applied verdict says when the review is near or due.
  const [todayIso] = useState(() => getItalyDateIso());
  // The page's opening instant: a stored plan still `running` after the run's staleness window was cut — the row offers the button again.
  const [openedAt] = useState(() => Date.now());
  const verdict = useMemo(() => buildConsulenteVerdict(document, todayIso), [document, todayIso]);
  const base = useMemo(() => currentAllocationOnBase(assets, calculateAssetValue), [assets]);
  const rows = useMemo(() => (proposal ? buildProposalRows(proposal, base.pctByClass) : []), [proposal, base.pctByClass]);
  const roles = useMemo(() => (proposal ? planRoleChanges(proposal, assets) : { changes: [], unmatched: [] }), [proposal, assets]);
  const goalPlan = useMemo(
    () => (proposal ? planGoalDocument(proposal, goalData, assets, removedGoalIds(document.answers), new Date()) : null),
    [proposal, goalData, assets, document.answers]
  );

  const [applyTargets, setApplyTargets] = useState(true);
  const [applyRoles, setApplyRoles] = useState(true);
  const [applyGoals, setApplyGoals] = useState(true);
  const [applyState, setApplyState] = useState<ApplyState>({ phase: 'idle' });
  // The plan of accumulation the same click creates (2026-11-20): ticked by default, built by the tick.
  const [applyPlan, setApplyPlan] = useState(true);
  const [planReady, setPlanReady] = useState<AdvicePlanReady | null>(null);
  const [planOutcome, setPlanOutcome] = useState<PlanOutcome | null>(null);
  const [creatingPlan, setCreatingPlan] = useState(false);

  const goalsCount = goalPlan ? goalPlan.created.length + goalPlan.updated.length + goalPlan.removed.length : 0;
  const rolesCount = applyRoles ? roles.changes.length : 0;
  const planTicked = document.status === 'ready' && applyPlan && planReady !== null;
  const applySummary = describeApplySummary({ targets: applyTargets, roles: rolesCount, goals: applyGoals ? goalsCount : 0, plan: planTicked ? planReady.build.action : null });
  const canApply = document.status === 'ready' && !revising && proposal !== null && (applyTargets || rolesCount > 0 || (applyGoals && goalsCount > 0) || planTicked);

  // What the plan is built on: the portfolio and the targets AS THE CLICK LEAVES THEM — the ticked
  // roles applied, the proposal's targets, the goals it writes (none of them is in the cache yet).
  // On an applied report, the live settings and goals.
  const settings = settingsQuery.data ?? null;
  const goalsAfter = document.status === 'ready' && applyGoals && goalPlan?.document ? goalPlan.document : goalData;
  const planAssets = useMemo(() => {
    if (document.status !== 'ready' || !applyRoles || roles.changes.length === 0) return assets;
    const to = new Map(roles.changes.map((change) => [change.assetId, change.to]));
    return assets.map((asset) => {
      const role = to.get(asset.id);
      return role ? { ...asset, allocationRole: role } : asset;
    });
  }, [document.status, applyRoles, roles.changes, assets]);
  const planTargets = useMemo(
    () =>
      document.status === 'ready' && proposal
        ? resolveEffectiveTargets({ ...(settings ?? {}), targets: buildTargetsFromProposal(proposal) } as AssetAllocationSettings, goalsAfter, planAssets).targets
        : resolveEffectiveTargets(settings, goalData, planAssets).targets,
    [document.status, proposal, settings, goalsAfter, goalData, planAssets]
  );
  const recordedPlanId = document.status === 'applied' ? (document.applied?.planId ?? null) : null;
  const tickMode: 'tick' | 'button' | null =
    operatingPlanOf(document) === null || pageId !== 'applica'
      ? null
      : document.status === 'ready'
        ? 'tick'
        : document.status === 'applied' && document.applied?.targetsWritten && !recordedPlanId
          ? 'button'
          : null;
  const planTick = tickMode ? (
    <LazyPlanTick
      key={tickMode}
      ownerId={ownerId}
      document={document}
      assets={planAssets}
      targets={planTargets}
      goalsAfter={goalsAfter}
      mode={tickMode}
      checked={applyPlan}
      onCheckedChange={setApplyPlan}
      targetsTicked={applyTargets}
      onBuild={setPlanReady}
      fallback={<p className="text-[12px] text-muted-foreground">{ADVICE_PLAN_TICK_COPY.loading}</p>}
    />
  ) : null;
  const planDone =
    recordedPlanId && document.applied
      ? {
          sentence: ADVICE_PLAN_TICK_COPY.done[document.applied.planAction ?? 'create'],
          modelNote: planOutcome?.modelError ? describeModelNotUpdated(planOutcome.modelError) : null,
        }
      : null;

  // The operating plan's row (2026-11-19): null with a usable plan of this report. A plan started in
  // another tab reads «running» until the document is read again — no polling.
  const stored = document.operatingPlan ?? null;
  const ofThisReport = stored !== null && document.report !== null && stored.reportFinishedAt.getTime() === document.report.finishedAt.getTime();
  const storedRunning = ofThisReport && stored.status === 'running' && openedAt - stored.startedAt.getTime() <= RUN_STALE_AFTER_MS;
  const planRow: PlanRow | null =
    operatingPlanOf(document) !== null || document.report === null
      ? null
      : {
          state:
            planWriter.state === 'running' || storedRunning
              ? 'running'
              : planWriter.state === 'failed' || (ofThisReport && stored.status === 'failed')
                ? 'failed'
                : ofThisReport && stored.status === 'ready' && stored.plan?.usable === false
                  ? 'unusable'
                  : 'absent',
          message:
            planWriter.state === 'failed'
              ? planWriter.error
              : ofThisReport && stored.status === 'failed'
                ? stored.error
                : ofThisReport && stored.status === 'ready' && stored.plan?.usable === false
                  ? stored.plan.corrections.at(-1) ?? null
                  : null,
          onWrite: planWriter.write,
          disabled: isDemo || revising,
        };

  const invalidateAfterWrite = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all(ownerId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.all(ownerId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.allocationAdvice.all(ownerId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.accumulationPlans.all(ownerId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.modelPortfolio.byOwner(ownerId) }),
    ]);

  // «Crea il piano di accumulo» on an applied report: the plan alone, then the record with the counts it already has.
  const createPlan = async () => {
    if (!planReady || !document.applied) return;
    setCreatingPlan(true);
    const { targetsWritten, rolesChanged, goalsWritten } = document.applied;
    const { result, outcome } = await runAdvicePlan({ ...planReady, ownerId, assets: planAssets, targets: planTargets }, false);
    setPlanOutcome(outcome);
    if (result) {
      await markApplied(ownerId, { targetsWritten, rolesChanged, goalsWritten, ...result }).catch((error: unknown) =>
        setPlanOutcome({ failure: describeWriteError(error), modelError: outcome.modelError })
      );
    }
    await invalidateAfterWrite().catch(() => undefined);
    setCreatingPlan(false);
  };

  const apply = async () => {
    if (!proposal) return;
    setApplyState({ phase: 'writing' });
    const written = { targetsWritten: false, rolesChanged: 0, goalsWritten: 0 };
    const save = async () => {
      if (applyTargets) {
        await setSettings(ownerId, { targets: buildTargetsFromProposal(proposal) });
        written.targetsWritten = true;
      }
      if (applyRoles) {
        for (const change of roles.changes) {
          await updateAssetAllocationRole(change.assetId, change.to);
          written.rolesChanged += 1;
        }
      }
      if (applyGoals && goalPlan?.document) {
        await saveGoalData(ownerId, goalPlan.document);
        written.goalsWritten = goalsCount;
      }
      // The plan after the settings, before the record: a plan that fails leaves the settings applied.
      let record: AppliedRecord = written;
      if (planTicked && planReady) {
        const { result, outcome } = await runAdvicePlan({ ...planReady, ownerId, assets: planAssets, targets: planTargets }, true);
        setPlanOutcome(outcome);
        if (result) record = { ...written, ...result };
      }
      await markApplied(ownerId, record);
      await invalidateAfterWrite();
    };
    await save()
      .then(() => setApplyState({ phase: 'done' }))
      .catch((error: unknown) => setApplyState({ phase: 'error', message: describeWriteError(error) }));
  };

  if (document.status === 'running') {
    // A reload does not know when the stage began: no elapsed, the aside keeps «avviato il …».
    return (
      <div className="flex flex-col gap-3">
        <PageVerdict verdict={{ headline: describeRunHeadline(document.stage), tone: 'neutral', sentence: [{ text: 'Il percorso è ancora in corso: la pagina rilegge ogni fase appena viene salvata.' }] }} ariaLabel="Stato del percorso" />
        <Tile eyebrow="Le fasi" generated aside={`avviato il ${document.startedAt ? formatDate(document.startedAt) : '—'}`}>
          <div className="mt-3">
            <StageRows rows={runStageStates({ status: 'running', stage: document.stage })} />
          </div>
        </Tile>
        <Button type="button" variant="outline" className="h-11 w-fit desktop:h-9" onClick={onRedo}>
          Ricomincia il percorso
        </Button>
      </div>
    );
  }

  return (
    <ConsulenteBook
      ownerId={ownerId}
      document={document}
      verdict={verdict}
      proposal={proposal}
      rows={rows}
      roles={roles}
      goalPlan={goalPlan}
      revision={revision}
      apply={{
        document,
        proposal,
        rows,
        roles,
        goalPlan,
        goalsCount,
        applySummary,
        applyTargets,
        setApplyTargets,
        applyRoles,
        setApplyRoles,
        applyGoals,
        setApplyGoals,
        applyState,
        planRow,
        planTick,
        planDone,
        planFailure: planOutcome?.failure ?? null,
        onCreatePlan: planReady && !isDemo ? () => void createPlan() : null,
        creatingPlan,
      }}
      canApply={canApply}
      onApply={() => void apply()}
      pageId={pageId}
      onPageChange={onPageChange}
      onRedo={onRedo}
    />
  );
}
