'use client';

/**
 * The REPORT: while a run is still going, its stage and a reread; once it ends, the BOOK
 * (`ConsulenteBook`, 2026-11-08) — the verdict on the cover, one page per section of the model's
 * text and tile of figures, «Applica» as the last page, one checkbox per thing it writes, the
 * plans shown before anything moves. A failed run is a book over the text it has, its sentence on
 * the cover and the way back on the last page.
 *
 * This file owns the data and the writes: the plans (`buildProposalRows`, `planRoleChanges`,
 * `planGoalDocument`), `useConsulenteRevision`, the apply state. The writes go through the app's own
 * services (`setSettings`, `updateAssetAllocationRole`, `saveGoalData`) and then the «applied» route
 * records them; every reader's key is invalidated.
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import type { Asset } from '@/types/assets';
import type { GoalBasedInvestingData } from '@/types/goals';
import { calculateAssetValue, updateAssetAllocationRole } from '@/lib/services/assetService';
import { setSettings } from '@/lib/services/assetAllocationService';
import { saveGoalData } from '@/lib/services/goalService';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { queryKeys } from '@/lib/query/queryKeys';
import { useAllocationAdvice } from '@/lib/hooks/useAllocationAdvice';
import { useConsulenteRevision } from './useConsulenteRevision';
import { StageRows } from './ConsulenteRun';
import { ConsulenteBook } from './ConsulenteBook';
import type { ApplyState } from './ConsulenteBookPages';
import type { BookPageId } from '@/lib/utils/allocationAdviceBook';
import { buildTargetsFromProposal, currentAllocationOnBase, planGoalDocument, planRoleChanges } from '@/lib/utils/allocationAdviceApply';
import { runStageStates } from '@/lib/utils/allocationAdviceDocument';
import { removedGoalIds } from '@/lib/utils/allocationAdviceDraft';
import { buildConsulenteVerdict, buildProposalRows, describeApplySummary, describeRunHeadline } from '@/lib/utils/allocationAdviceNarrative';
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

/** The report's «applied» record, or the route's refusal as a failure. */
async function markApplied(ownerId: string, applied: { targetsWritten: boolean; rolesChanged: number; goalsWritten: number }): Promise<void> {
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
  const revising = revision.state.kind === 'running';
  const proposal = document.report?.proposal ?? document.strategy?.proposal ?? null;
  // Today's Italian day once per mount: the applied verdict says when the review is near or due.
  const [todayIso] = useState(() => getItalyDateIso());
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

  const goalsCount = goalPlan ? goalPlan.created.length + goalPlan.updated.length + goalPlan.removed.length : 0;
  const rolesCount = applyRoles ? roles.changes.length : 0;
  const applySummary = describeApplySummary({ targets: applyTargets, roles: rolesCount, goals: applyGoals ? goalsCount : 0 });
  const canApply = document.status === 'ready' && !revising && proposal !== null && (applyTargets || rolesCount > 0 || (applyGoals && goalsCount > 0));

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
      await markApplied(ownerId, written);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.all(ownerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.goals.all(ownerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allocationAdvice.all(ownerId) }),
      ]);
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
      }}
      canApply={canApply}
      onApply={() => void apply()}
      pageId={pageId}
      onPageChange={onPageChange}
      onRedo={onRedo}
    />
  );
}
