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
 *   Below desktop:    ONE sequence, the DOM above (DESIGN.md → The First-Screen Rule,
 *                     since 2026-10-15): the verdict (whole: no strip) → Obiettivi
 *                     open → «Il resto della pagina» → Traiettoria, Milestone, Allocazione
 *                     derivata, Assegnazioni as closed rows (`useMobileSections` with `tab:
 *                     'goals'`, doc/guide/fire-obiettivi.md § Composizione mobile) → Dettaglio.
 *                     Choosing a goal opens the Traiettoria row where it is, without moving the
 *                     focus. Off, or without a goal: one tile, no rows.
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
import { useAssets } from '@/lib/hooks/useAssets';
import { useSettings } from '@/lib/hooks/useSettings';
import { useGoalData, useSaveGoalData } from '@/lib/hooks/useGoalData';
import Link from 'next/link';
import { Plus, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { calculateGoalProgress, cleanOrphanedAssignments } from '@/lib/services/goalService';
import type { GoalAssetAssignment, InvestmentGoal } from '@/types/goals';
import type { AssetSlice } from '@/lib/utils/assetSlice';
import type { Asset } from '@/types/assets';
import { computeGoalTrajectory, type GoalRow } from '@/lib/utils/goalTrajectory';
import { buildMilestones, GOALS_SECTION_IDS, summarizeAssignments, summarizeDerivedAllocation, summarizeGoals, summarizeTrajectory, sumAssetValues } from '@/lib/utils/goalsSummary';
import { useMobileSections, type SectionSpec } from '@/lib/hooks/useMobileSections';
import { useTabletComposition, useTabletStage } from '@/lib/hooks/useTabletComposition';
import {
  COMPACT_GRID_CLASS,
  COMPACT_GRID_WRAPPER_CLASS,
  INDEX_CLASS,
  PLAIN_GRID_CLASS,
  leadCellClass,
  REST_CELL_CLASS,
  STAGE_CLASS,
  STAGE_WRAPPER_CLASS,
  VERDICT_CELL_CLASS,
} from '@/lib/utils/tabletComposition';
import {
  ALLOCAZIONE_DERIVATA_ASIDE,
  ALLOCAZIONE_DERIVATA_FOOTER,
  GOALS_CLOSED_ASIDES,
  buildGoalsVerdict,
  buildTraiettoriaChips,
  describeAllocazioneDerivata,
  describeAssegnazioni,
  describeAssegnazioniAside,
  describeAssegnazioniFooter,
  describeGoalCaption,
  describeGoalStatus,
  describeGoalsClosedAnswers,
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
import { GOALS_TAB_SKELETON_CELLS } from './tabSkeletons';
import { cn } from '@/lib/utils';
import { RowActionsHold, useRestoredCopyReread } from '@/components/ui/row-actions-hold';
import { PageVerdict } from '@/components/ui/page-verdict';
import { PageRest } from '@/components/ui/page-rest';
import { Tile, TILE_CELL_CLASS, TILE_ROW_CELL_CLASS } from '@/components/ui/tile';
import { RowAnswers } from '@/components/ui/row-answers';
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

/** The grid's geometry, for the skeleton: the same spans as the tiles below — shared with the page's lazy-tab wait. */
const SKELETON_CELLS = GOALS_TAB_SKELETON_CELLS;

const EMPTY_ASSETS: Asset[] = [];

/**
 * The rows below `desktop:`, in the DOM's order (The Closed-Row Rule): every tile but Obiettivi,
 * THE tile (The First-Screen Rule). Module-level; the tab hands the controller the rows PRESENT through
 * `resolveGoalsSections` (none without goals, Allocazione derivata only with goal-driven targets).
 */
const GOALS_SECTIONS: readonly SectionSpec[] = [
  { id: GOALS_SECTION_IDS.traiettoria, eyebrow: 'Traiettoria' },
  { id: GOALS_SECTION_IDS.milestone, eyebrow: 'Milestone' },
  { id: GOALS_SECTION_IDS.allocazione, eyebrow: 'Allocazione derivata' },
  { id: GOALS_SECTION_IDS.assegnazioni, eyebrow: 'Assegnazioni' },
];
const NO_SECTIONS: readonly SectionSpec[] = [];

function resolveGoalsSections(input: { hasGoals: boolean; hasDerived: boolean }): readonly SectionSpec[] {
  if (!input.hasGoals) return NO_SECTIONS;
  return GOALS_SECTIONS.filter((section) => section.id !== GOALS_SECTION_IDS.allocazione || input.hasDerived);
}

const ASIDE_BUTTON_CLASS =
  'inline-flex h-9 items-center gap-1 rounded-md border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 desktop:h-7';

export function GoalBasedInvestingTab() {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();

  // ─── Dialogs and the selection ───────────────────────────────────────────────
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<InvestmentGoal | null>(null);
  const [assignmentGoalId, setAssignmentGoalId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  // ─── Queries (the keys every page shares, 2026-09-29) ───────────────────────────
  const { data: settings, isLoading: loadingSettings, isError: settingsError } = useSettings(ownerId);
  const { data: assets = EMPTY_ASSETS, isLoading: loadingAssets, isError: assetsError } = useAssets(ownerId);
  const goalsQuery = useGoalData(ownerId);
  const { data: goalData, isLoading: loadingGoals, isError: goalsError } = goalsQuery;
  // Every save here rewrites the WHOLE document from `goals` and the assignments in memory: started from a
  // restored copy still being reread it would erase what another device saved since (components/ui/row-actions-hold.tsx).
  const held = useRestoredCopyReread([goalsQuery]);

  // Invalidates `goals.all`, which Allocazione reads too (goal-driven targets).
  const saveMutation = useSaveGoalData(ownerId || '');

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

  // ─── The phone composition (2026-10-15) ──────────────────────────────────────
  // No strip: the verdict is whole. Choosing a goal opens the Traiettoria row where
  // it stands — no scroll, no focus move: the list is where the reader is (`reveal` is the cells').
  const hasGoalRows = isEnabled && overview.counts.total > 0;
  const hasDerived = derivedAllocation !== null;
  const sectionSpecs = useMemo(() => resolveGoalsSections({ hasGoals: hasGoalRows, hasDerived }), [hasGoalRows, hasDerived]);
  const sections = useMobileSections({ route: 'fire-simulations', tab: 'goals', sections: sectionSpecs });
  // At 768 the rows on two columns, on a tablet in landscape the index beside the verdict and THE
  // tile (lib/utils/tabletComposition.ts): those the tab renders, in DOM order — the Traiettoria
  // only with a goal selected and its trajectory read.
  const stageRef = useTabletStage();
  const tablet = useTabletComposition({
    sections,
    order: sectionSpecs.filter((section) => (trajectory && selectedRow) || section.id !== GOALS_SECTION_IDS.traiettoria).map((section) => section.id),
  });
  const traiettoriaCollapse = sections.collapse(GOALS_SECTION_IDS.traiettoria);
  const handleSelectGoal = (goalId: string) => {
    setSelectedGoalId(goalId);
    traiettoriaCollapse?.onOpenChange(true);
  };
  const obiettiviRows = useMemo(() => overview.goals.map((line) => ({ line, caption: describeGoalCaption(line), status: describeGoalStatus(line) })), [overview.goals]);
  const milestoneRows = useMemo(() => milestones.map((entry) => ({ entry, note: describeMilestoneNote(entry) })), [milestones]);
  // What each closed row answers in the landscape index (2026-10-16): the same views the tiles print.
  const rowAnswers = useMemo(
    () => describeGoalsClosedAnswers({ trajectory, goalCount: overview.counts.total, milestones, derivedAllocation, assignments: assignmentsView }),
    [trajectory, overview.counts.total, milestones, derivedAllocation, assignmentsView],
  );

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
  // A quota in percent or in units (lib/utils/assetSlice.ts): stored as typed, converted before every formula.
  const handleSaveAssignment = async (goalId: string, assetId: string, slice: AssetSlice) => {
    const filtered = cleanedAssignments.filter((a) => !(a.goalId === goalId && a.assetId === assetId));
    const quota: GoalAssetAssignment = 'units' in slice ? { goalId, assetId, units: slice.units } : { goalId, assetId, percentage: slice.percent };
    const isEmpty = 'units' in slice ? !(slice.units > 0) : !(slice.percent > 0);
    const updated: GoalAssetAssignment[] = isEmpty ? filtered : [...filtered, quota];
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
      <button type="button" onClick={handleCreateGoal} disabled={isDemo || held} className={ASIDE_BUTTON_CLASS}>
        <Plus className="h-3 w-3" aria-hidden="true" />
        Nuovo obiettivo
      </button>
    </span>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  // The verdict and the grid: the stage's children, in both of its forms below.
  const stageContent = (
    <>
      <div data-stage="verdict" className={cn('pt-1', hasGoals && VERDICT_CELL_CLASS)}>
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sugli obiettivi" />
      </div>

      {/* ONE sequence, no `order-*` (The First-Screen Rule). Tablet: Obiettivi on two columns, the closed
          rows two by two at 768, an open row on the whole grid row; in landscape the rows in the
          index beside the verdict and Obiettivi. Without a goal, Obiettivi alone on the grid of
          before, on both columns at 768 (not THE tile's cell: there is no stage). */}
      <div className={hasGoals ? COMPACT_GRID_WRAPPER_CLASS : undefined}>
      <div className={hasGoals ? COMPACT_GRID_CLASS : PLAIN_GRID_CLASS}>
        <div data-stage="lead" className={cn(TILE_CELL_CLASS, leadCellClass(hasGoals), hasGoals ? 'desktop:col-span-5 desktop:row-span-2' : 'desktop:col-span-12')}>
          <ObiettiviTile
            reading={hasGoals ? describeObiettivi(overview) : null}
            aside={newGoalButton}
            rows={obiettiviRows}
            selectedId={effectiveSelectedId}
            onSelect={handleSelectGoal}
            footer={hasGoals ? describeObiettiviFooter(overview) : null}
            emptyCopy="Nessun obiettivo ancora: crea il primo con «Nuovo obiettivo», poi assegnagli una quota di uno o più strumenti."
          />
        </div>

        {/* The index: «Il resto» and every row; without a goal a plain `contents` box. */}
        <RowAnswers value={rowAnswers}>
        <div className={hasGoals ? INDEX_CLASS : 'contents'}>
        {hasGoals && <PageRest sections={sections} className={REST_CELL_CLASS} />}

        {trajectory && selectedRow && (
          <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(GOALS_SECTION_IDS.traiettoria), 'desktop:col-span-7')}>
            <TraiettoriaTile
              collapse={traiettoriaCollapse}
              asideWhenClosed={trajectory.name}
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
          <div
            className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(GOALS_SECTION_IDS.milestone), derivedAllocation ? 'desktop:col-span-4' : 'desktop:col-span-7')}
          >
            <MilestoneTile
              collapse={sections.collapse(GOALS_SECTION_IDS.milestone)}
              asideWhenClosed={GOALS_CLOSED_ASIDES[GOALS_SECTION_IDS.milestone]}
              reading={describeMilestone(milestones)}
              aside={MILESTONE_ASIDE}
              rows={milestoneRows}
              footer={MILESTONE_FOOTER}
            />
          </div>
        )}

        {hasGoals && derivedAllocation && (
          <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(GOALS_SECTION_IDS.allocazione), 'desktop:col-span-3')}>
            <AllocazioneDerivataTile
              collapse={sections.collapse(GOALS_SECTION_IDS.allocazione)}
              asideWhenClosed={GOALS_CLOSED_ASIDES[GOALS_SECTION_IDS.allocazione]}
              reading={describeAllocazioneDerivata(derivedAllocation)}
              aside={ALLOCAZIONE_DERIVATA_ASIDE}
              rows={derivedAllocation.rows}
              footer={ALLOCAZIONE_DERIVATA_FOOTER}
            />
          </div>
        )}

        {hasGoals && (
          <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(GOALS_SECTION_IDS.assegnazioni), 'desktop:col-span-12')}>
            <AssegnazioniTile
              collapse={sections.collapse(GOALS_SECTION_IDS.assegnazioni)}
              asideWhenClosed={describeAssegnazioniAside(assignmentsView)}
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
        </RowAnswers>
      </div>
      </div>
    </>
  );

  return (
    <RowActionsHold held={held}>
    <div className="space-y-4">
      {/* The stage: the verdict over the grid; on a tablet in landscape, with goals, the answer on
          the left (verdict and Obiettivi) and the index on the right (lib/utils/tabletComposition.ts).
          Without a goal no rows: a plain box, unmeasured. The two forms are the same `div` in the
          same place, so React keeps the node and its subtree when the first goal is created, and
          the measuring ref attaches then. */}
      <div className={STAGE_WRAPPER_CLASS}>
        {hasGoals ? (
          <div ref={stageRef} className={STAGE_CLASS}>{stageContent}</div>
        ) : (
          <div className="space-y-4">{stageContent}</div>
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
        <AssetAssignmentDialog open onClose={() => setAssignmentGoalId(null)} onSave={handleSaveAssignment} goalId={assignmentGoalId} goals={goals} assets={assets} assignments={cleanedAssignments} />
      )}
    </div>
    </RowActionsHold>
  );
}
