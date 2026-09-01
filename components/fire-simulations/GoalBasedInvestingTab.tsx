'use client';

/**
 * FIRE › OBIETTIVI — a verdict over tiles (2026-08-26)
 *
 * The tab answers «sono in rotta?» before it shows a number: a rule-generated verdict
 * (`buildGoalsVerdict` in lib/utils/goalsNarrative.ts) judges the dated goals — every one in time,
 * some late, all late, nothing to judge — and gives each goal its clause, over a 12-column grid of
 * tiles that each answer one question with a reading line above their figures.
 *
 *   Desktop (12 col): Obiettivi(5, 2 rows) | Traiettoria(7)
 *                                          | Milestone(4) | Allocazione derivata(3)
 *                     Assegnazioni(12)
 *   Mobile (1 col):   Obiettivi → Traiettoria → Milestone → Allocazione derivata → Assegnazioni
 *
 * Without goal-driven allocation the Allocazione derivata tile is absent and Milestone takes its
 * columns. A «Dettaglio» disclosure below the grid holds the next contribution's split and the
 * explainer. The page has NO period axis — a goal is read today — and its one selection, the goal
 * the Traiettoria draws, is a row of the Obiettivi tile (`aria-current`).
 *
 * This file is the ORCHESTRATOR and computes nothing: the numbers come from
 * lib/utils/goalsSummary.ts over the trajectories `goalTrajectory.ts` already computes, the
 * words from lib/utils/goalsNarrative.ts. The two dialogs (goal form, asset assignment) are
 * unchanged; every write rewrites the goal document whole (`saveGoalData`).
 *
 * DATA FLOW:
 * 1. Settings query  → is the feature enabled, is the allocation goal-driven
 * 2. Assets query    → portfolio data (independent)
 * 3. Goal data query → goals + assignments (independent)
 * 4. Pure layer      → rows, overview, trajectory, milestones, allocation, assignments
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { getSettings } from '@/lib/services/assetAllocationService';
import { getAllAssets } from '@/lib/services/assetService';
import { calculateGoalProgress, cleanOrphanedAssignments, getGoalData, saveGoalData } from '@/lib/services/goalService';
import type { GoalAssetAssignment, GoalBasedInvestingData, InvestmentGoal } from '@/types/goals';
import { computeGoalTrajectory, type GoalRow } from '@/lib/utils/goalTrajectory';
import { buildMilestones, summarizeAssignments, summarizeDerivedAllocation, summarizeGoals, summarizeTrajectory, sumAssetValues } from '@/lib/utils/goalsSummary';
import {
  ALLOCAZIONE_DERIVATA_ASIDE,
  ALLOCAZIONE_DERIVATA_FOOTER,
  buildGoalsVerdict,
  buildTraiettoriaChips,
  describeAllocazioneDerivata,
  describeAssegnazioni,
  describeAssegnazioniAside,
  describeAssegnazioniFooter,
  describeGoalCaption,
  describeGoalStatus,
  describeMilestone,
  describeMilestoneNote,
  describeObiettivi,
  describeObiettiviFooter,
  describeTraiettoria,
  describeTraiettoriaFooter,
  DETTAGLIO_DESCRIPTION,
  MILESTONE_ASIDE,
  MILESTONE_FOOTER,
  resolveTraiettoriaHero,
} from '@/lib/utils/goalsNarrative';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { Tile, TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { ObiettiviTile } from '@/components/goals/tiles/ObiettiviTile';
import { TraiettoriaTile } from '@/components/goals/tiles/TraiettoriaTile';
import { MilestoneTile } from '@/components/goals/tiles/MilestoneTile';
import { AllocazioneDerivataTile } from '@/components/goals/tiles/AllocazioneDerivataTile';
import { AssegnazioniTile } from '@/components/goals/tiles/AssegnazioniTile';
import { GoalProjectionChart } from '@/components/goals/GoalProjectionChart';
import { GoalsDettaglio } from '@/components/goals/GoalsDettaglio';
import { GoalFormDialog } from '@/components/goals/GoalFormDialog';
import { AssetAssignmentDialog } from '@/components/goals/AssetAssignmentDialog';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 14 },
  { span: 7, lines: 10 },
  { span: 4, lines: 6 },
  { span: 3, lines: 5 },
  { span: 12, lines: 8 },
];

const ASIDE_BUTTON_CLASS =
  'inline-flex h-9 items-center gap-1 rounded-md border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 desktop:h-7';

export function GoalBasedInvestingTab() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();

  // ─── Dialogs and the selection ───────────────────────────────────────────────
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<InvestmentGoal | null>(null);
  const [assignmentGoalId, setAssignmentGoalId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  // ─── Queries (shared keys with the other FIRE tabs) ──────────────────────────
  const { data: settings, isLoading: loadingSettings, isError: settingsError } = useQuery({
    queryKey: ['settings', ownerId],
    queryFn: () => getSettings(ownerId!),
    enabled: !!user && !!ownerId,
  });

  const { data: assets = [], isLoading: loadingAssets, isError: assetsError } = useQuery({
    queryKey: ['assets', ownerId],
    queryFn: () => getAllAssets(ownerId!),
    enabled: !!user && !!ownerId,
  });

  const { data: goalData, isLoading: loadingGoals, isError: goalsError } = useQuery({
    queryKey: ['goalData', ownerId],
    queryFn: () => getGoalData(ownerId!),
    enabled: !!user && !!ownerId,
  });

  const saveMutation = useMutation({
    mutationFn: (data: GoalBasedInvestingData) => saveGoalData(ownerId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goalData', ownerId] });
    },
  });

  const isEnabled = settings?.goalBasedInvestingEnabled ?? false;
  const isGoalDriven = settings?.goalDrivenAllocationEnabled ?? false;
  const goals = useMemo(() => goalData?.goals ?? [], [goalData]);
  const assignments = useMemo(() => goalData?.assignments ?? [], [goalData]);

  // ─── The pure layer ──────────────────────────────────────────────────────────
  const cleanedAssignments = useMemo(() => cleanOrphanedAssignments(assignments, assets), [assignments, assets]);
  const goalProgressList = useMemo(() => goals.map((g) => calculateGoalProgress(g, cleanedAssignments, assets)), [goals, cleanedAssignments, assets]);

  // One "now" per mount so trajectories, ordering and the chart's axis stay stable.
  const now = useMemo(() => new Date(), []);

  const goalRows = useMemo<GoalRow[]>(
    () =>
      goals
        .map((goal) => {
          const progress = goalProgressList.find((p) => p.goalId === goal.id);
          if (!progress) return null;
          const trajectory = computeGoalTrajectory({
            currentValue: progress.currentValue,
            targetAmount: goal.targetAmount,
            targetDate: goal.targetDate,
            monthlyContribution: goal.monthlyContribution,
            recommendedAllocation: goal.recommendedAllocation,
            now,
          });
          return { goal, progress, trajectory };
        })
        .filter((r): r is GoalRow => r != null),
    [goals, goalProgressList, now],
  );

  const portfolioTotal = useMemo(() => sumAssetValues(assets), [assets]);
  const overview = useMemo(() => summarizeGoals(goalRows, portfolioTotal), [goalRows, portfolioTotal]);

  // The selection falls back to the most urgent goal, and follows a deletion.
  const effectiveSelectedId = overview.goals.some((g) => g.id === selectedGoalId) ? selectedGoalId : (overview.goals[0]?.id ?? null);
  const selectedRow = useMemo(() => goalRows.find((r) => r.goal.id === effectiveSelectedId) ?? null, [goalRows, effectiveSelectedId]);
  const trajectory = useMemo(() => (selectedRow ? summarizeTrajectory(selectedRow, now) : null), [selectedRow, now]);

  const milestones = useMemo(() => buildMilestones(goalRows), [goalRows]);
  const orderedGoals = useMemo(() => overview.goals.map((line) => goals.find((g) => g.id === line.id)).filter((g): g is InvestmentGoal => g != null), [overview.goals, goals]);
  const derivedAllocation = useMemo(() => (isGoalDriven ? summarizeDerivedAllocation(orderedGoals, cleanedAssignments, assets) : null), [isGoalDriven, orderedGoals, cleanedAssignments, assets]);
  const assignmentsView = useMemo(() => summarizeAssignments(orderedGoals, cleanedAssignments, assets), [orderedGoals, cleanedAssignments, assets]);

  // ─── The words ───────────────────────────────────────────────────────────────
  const verdict = useMemo(() => buildGoalsVerdict({ enabled: isEnabled, overview: isEnabled ? overview : null }), [isEnabled, overview]);
  const obiettiviRows = useMemo(() => overview.goals.map((line) => ({ line, caption: describeGoalCaption(line), status: describeGoalStatus(line) })), [overview.goals]);
  const milestoneRows = useMemo(() => milestones.map((entry) => ({ entry, note: describeMilestoneNote(entry) })), [milestones]);

  // ─── Goal CRUD ───────────────────────────────────────────────────────────────
  const handleCreateGoal = () => {
    setEditingGoal(null);
    setGoalDialogOpen(true);
  };

  const handleEditGoal = (goal: InvestmentGoal) => {
    setEditingGoal(goal);
    setGoalDialogOpen(true);
  };

  const handleSaveGoal = async (goal: InvestmentGoal) => {
    const isEditing = goals.some((g) => g.id === goal.id);
    const updatedGoals = isEditing ? goals.map((g) => (g.id === goal.id ? goal : g)) : [...goals, goal];
    await saveMutation.mutateAsync({ goals: updatedGoals, assignments: cleanedAssignments });
    setGoalDialogOpen(false);
    setEditingGoal(null);
    if (!isEditing) setSelectedGoalId(goal.id);
    toast.success(isEditing ? 'Obiettivo aggiornato' : 'Obiettivo creato');
  };

  const handleDeleteGoal = async (goalId: string) => {
    const updatedGoals = goals.filter((g) => g.id !== goalId);
    const updatedAssignments = cleanedAssignments.filter((a) => a.goalId !== goalId);
    await saveMutation.mutateAsync({ goals: updatedGoals, assignments: updatedAssignments });
    toast.success('Obiettivo eliminato');
  };

  // ─── Assignments ─────────────────────────────────────────────────────────────
  const handleSaveAssignment = async (goalId: string, assetId: string, percentage: number) => {
    const filtered = cleanedAssignments.filter((a) => !(a.goalId === goalId && a.assetId === assetId));
    const updated: GoalAssetAssignment[] = percentage > 0 ? [...filtered, { goalId, assetId, percentage }] : filtered;
    await saveMutation.mutateAsync({ goals, assignments: updated });
    toast.success('Assegnazione aggiornata');
  };

  const handleRemoveAssignment = async (goalId: string, assetId: string) => {
    const updated = cleanedAssignments.filter((a) => !(a.goalId === goalId && a.assetId === assetId));
    await saveMutation.mutateAsync({ goals, assignments: updated });
    toast.success('Assegnazione rimossa');
  };

  // ─── Loading ─────────────────────────────────────────────────────────────────
  // A failed read comes BEFORE the wait: these queries default to undefined, and a plan built
  // on a base that was never read is a number with nothing behind it.
  if (resolveSurfaceState({ loading: loadingSettings || loadingAssets || loadingGoals, failed: settingsError || assetsError || goalsError }) === 'failed') {
    return (
      <ErrorNotice
        className="max-w-[920px]"
        notice={describeReadFailure({
          consequence: 'Obiettivi e strumenti non sono stati letti: senza di essi la pagina direbbe che non hai obiettivi.',
          untouched: 'Gli obiettivi e le assegnazioni registrati non sono stati toccati.',
        })}
      />
    );
  }

  if (loadingSettings || loadingAssets || loadingGoals) {
    return <TileGridSkeleton cells={SKELETON_CELLS} />;
  }

  // ─── Feature disabled: the verdict says so, one tile points at the switch ──
  if (!isEnabled) {
    return (
      <div className="space-y-4">
        <div className="pt-1">
          <PageVerdict verdict={verdict} ariaLabel="Verdetto sugli obiettivi" />
        </div>
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-5')}>
            <Tile eyebrow="Obiettivi" ariaLabel="Obiettivi">
              <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">
                Assegna quote del portafoglio a obiettivi come una casa, la pensione o un fondo emergenza, e la pagina dirà se ogni scadenza è in rotta.
              </p>
              <Link href="/dashboard/settings" className={cn(ASIDE_BUTTON_CLASS, 'mt-4 w-fit')}>
                <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                Abilita nelle Impostazioni
              </Link>
            </Tile>
          </div>
        </div>
      </div>
    );
  }

  const hasGoals = overview.counts.total > 0;
  const newGoalButton = (
    <span className="flex items-center gap-2">
      {isDemo && <span>non disponibile in demo</span>}
      <button type="button" onClick={handleCreateGoal} disabled={isDemo} className={ASIDE_BUTTON_CLASS}>
        <Plus className="h-3 w-3" aria-hidden="true" />
        Nuovo obiettivo
      </button>
    </span>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="pt-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sugli obiettivi" />
      </div>

      {/* Tablet (768-1439): every tile full width, in the phone's order. */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none', hasGoals ? 'desktop:col-span-5 desktop:row-span-2' : 'desktop:col-span-12')}>
          <ObiettiviTile
            reading={hasGoals ? describeObiettivi(overview) : null}
            aside={newGoalButton}
            rows={obiettiviRows}
            selectedId={effectiveSelectedId}
            onSelect={setSelectedGoalId}
            footer={hasGoals ? describeObiettiviFooter(overview) : null}
            emptyCopy="Nessun obiettivo ancora: crea il primo con «Nuovo obiettivo», poi assegnagli una quota di uno o più strumenti."
          />
        </div>

        {trajectory && selectedRow && (
          <div className={cn(TILE_CELL_CLASS, 'order-2 tablet:col-span-2 desktop:order-none desktop:col-span-7')}>
            <TraiettoriaTile
              reading={describeTraiettoria(trajectory)}
              name={trajectory.name}
              hero={resolveTraiettoriaHero(trajectory)}
              chips={buildTraiettoriaChips(trajectory)}
              notes={trajectory.notes}
              chart={
                trajectory.series.length >= 2 ? (
                  <GoalProjectionChart
                    series={trajectory.series}
                    deadlineTs={selectedRow.goal.targetDate ? new Date(selectedRow.goal.targetDate).getTime() : null}
                    color={trajectory.color}
                    height="100%"
                    ariaLabel={`Traiettoria di ${trajectory.name}: il valore proiettato al ritmo attuale, la linea tratteggiata orizzontale è il target${trajectory.deadline ? ', quella verticale la scadenza' : ''}.`}
                  />
                ) : null
              }
              footer={describeTraiettoriaFooter(trajectory)}
              onEdit={() => handleEditGoal(selectedRow.goal)}
              onDelete={() => handleDeleteGoal(selectedRow.goal.id)}
              isDemo={isDemo}
            />
          </div>
        )}

        {hasGoals && (
          <div className={cn(TILE_CELL_CLASS, 'order-3 tablet:col-span-2 desktop:order-none', derivedAllocation ? 'desktop:col-span-4' : 'desktop:col-span-7')}>
            <MilestoneTile reading={describeMilestone(milestones)} aside={MILESTONE_ASIDE} rows={milestoneRows} footer={MILESTONE_FOOTER} />
          </div>
        )}

        {hasGoals && derivedAllocation && (
          <div className={cn(TILE_CELL_CLASS, 'order-4 tablet:col-span-2 desktop:order-none desktop:col-span-3')}>
            <AllocazioneDerivataTile reading={describeAllocazioneDerivata(derivedAllocation)} aside={ALLOCAZIONE_DERIVATA_ASIDE} rows={derivedAllocation.rows} footer={ALLOCAZIONE_DERIVATA_FOOTER} />
          </div>
        )}

        {hasGoals && (
          <div className={cn(TILE_CELL_CLASS, 'order-5 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
            <AssegnazioniTile
              reading={describeAssegnazioni(assignmentsView)}
              aside={describeAssegnazioniAside(assignmentsView)}
              view={assignmentsView}
              onAdd={setAssignmentGoalId}
              onRemove={handleRemoveAssignment}
              footer={describeAssegnazioniFooter(assignmentsView)}
              isDemo={isDemo}
            />
          </div>
        )}
      </div>

      {hasGoals && <GoalsDettaglio description={DETTAGLIO_DESCRIPTION} goals={goals} progressList={goalProgressList} />}

      {/* Dialogs */}
      <GoalFormDialog
        open={goalDialogOpen}
        onClose={() => {
          setGoalDialogOpen(false);
          setEditingGoal(null);
        }}
        onSave={handleSaveGoal}
        goal={editingGoal}
        existingGoals={goals}
      />

      {assignmentGoalId && (
        <AssetAssignmentDialog open onClose={() => setAssignmentGoalId(null)} onSave={handleSaveAssignment} goalId={assignmentGoalId} assets={assets} assignments={cleanedAssignments} />
      )}
    </div>
  );
}
