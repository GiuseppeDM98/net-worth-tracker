/**
 * GOAL-BASED INVESTING TAB
 *
 * Trade Republic hierarchy: hero block first, flat divide-y goal list.
 * GoalSummaryCards removed — hero block covers totals, flat list is the single
 * representation per goal. Pie chart removed — values readable from the list directly.
 *
 * DATA FLOW:
 * 1. Settings query  → check if feature is enabled
 * 2. Assets query    → portfolio data (independent)
 * 3. Goal data query → goals + assignments (independent)
 * 4. Derived calculations via useMemo (depends on 2 + 3)
 */

'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { getSettings } from '@/lib/services/assetAllocationService';
import { getAllAssets } from '@/lib/services/assetService';
import {
  getGoalData,
  saveGoalData,
  calculateGoalProgress,
  getUnassignedValue,
  getAvailablePercentage,
  validateAssignments,
  cleanOrphanedAssignments,
} from '@/lib/services/goalService';
import { calculateAssetValue } from '@/lib/services/assetService';
import { GoalBasedInvestingData, InvestmentGoal, GoalAssetAssignment } from '@/types/goals';
import {
  computeGoalTrajectory,
  sortGoalRowsByUrgency,
  buildGoalsVerdictSummary,
  type GoalRow,
} from '@/lib/utils/goalTrajectory';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Plus, Target, AlertTriangle } from 'lucide-react';
import { GoalsSkeleton } from '@/components/fire-simulations/GoalsSkeleton';
import { toast } from 'sonner';
import { GoalDetailCard } from '@/components/goals/GoalDetailCard';
import { GoalFormDialog } from '@/components/goals/GoalFormDialog';
import { AssetAssignmentDialog } from '@/components/goals/AssetAssignmentDialog';
import { GoalsHero, type FreeAsset } from '@/components/goals/GoalsHero';
import { GoalContributionPlanner } from '@/components/goals/GoalContributionPlanner';
import { GoalMilestoneTimeline } from '@/components/goals/GoalMilestoneTimeline';

export function GoalBasedInvestingTab() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const userId = ownerId;

  // Dialog state
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<InvestmentGoal | null>(null);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [assignmentGoalId, setAssignmentGoalId] = useState<string | null>(null);

  // Queries
  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ['settings', userId],
    queryFn: () => getSettings(userId!),
    enabled: !!userId,
  });

  const { data: assets = [], isLoading: loadingAssets } = useQuery({
    queryKey: ['assets', userId],
    queryFn: () => getAllAssets(userId!),
    enabled: !!userId,
  });

  const { data: goalData, isLoading: loadingGoals } = useQuery({
    queryKey: ['goalData', userId],
    queryFn: () => getGoalData(userId!),
    enabled: !!userId,
  });

  const saveMutation = useMutation({
    mutationFn: (data: GoalBasedInvestingData) => saveGoalData(userId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goalData', userId] });
    },
  });

  const isEnabled = settings?.goalBasedInvestingEnabled ?? false;
  const goals = goalData?.goals ?? [];
  const assignments = goalData?.assignments ?? [];

  const cleanedAssignments = useMemo(
    () => cleanOrphanedAssignments(assignments, assets),
    [assignments, assets]
  );

  const goalProgressList = useMemo(
    () => goals.map((g) => calculateGoalProgress(g, cleanedAssignments, assets)),
    [goals, cleanedAssignments, assets]
  );

  const unassignedValue = useMemo(
    () => getUnassignedValue(assets, cleanedAssignments),
    [assets, cleanedAssignments]
  );

  const validationErrors = useMemo(
    () => validateAssignments(cleanedAssignments, assets),
    [cleanedAssignments, assets]
  );

  // Hero metric: sum of all allocated portions across goals
  const allocatedTotal = useMemo(
    () => goalProgressList.reduce((sum, p) => sum + p.currentValue, 0),
    [goalProgressList]
  );

  // Single "now" per render pass so trajectories + ordering stay stable.
  const now = useMemo(() => new Date(), []);

  // Per-goal trajectory (required pace, projected date, verdict), then urgency ordering + hero summary.
  const goalRows = useMemo<GoalRow[]>(() => {
    return goals
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
      .filter((r): r is GoalRow => r != null);
  }, [goals, goalProgressList, now]);

  const sortedRows = useMemo(() => sortGoalRowsByUrgency(goalRows), [goalRows]);
  const verdictSummary = useMemo(() => buildGoalsVerdictSummary(goalRows), [goalRows]);

  // Assets that still have free (unassigned) value — drives the hero's "Non assegnato" panel (A7).
  const freeAssets = useMemo<FreeAsset[]>(() => {
    return assets
      .map((asset) => {
        const freePct = getAvailablePercentage(asset.id, cleanedAssignments);
        const freeValue = (calculateAssetValue(asset) * freePct) / 100;
        return { id: asset.id, name: asset.name, ticker: asset.ticker, freeValue, freePct };
      })
      .filter((a) => a.freePct > 0.5 && a.freeValue > 0.5)
      .sort((a, b) => b.freeValue - a.freeValue);
  }, [assets, cleanedAssignments]);

  // ==================== Goal CRUD ====================

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
    const updatedGoals = isEditing
      ? goals.map((g) => (g.id === goal.id ? goal : g))
      : [...goals, goal];

    await saveMutation.mutateAsync({ goals: updatedGoals, assignments: cleanedAssignments });
    setGoalDialogOpen(false);
    setEditingGoal(null);
    toast.success(isEditing ? 'Obiettivo aggiornato' : 'Obiettivo creato');
  };

  const handleDeleteGoal = async (goalId: string) => {
    const updatedGoals = goals.filter((g) => g.id !== goalId);
    const updatedAssignments = cleanedAssignments.filter((a) => a.goalId !== goalId);
    await saveMutation.mutateAsync({ goals: updatedGoals, assignments: updatedAssignments });
    toast.success('Obiettivo eliminato');
  };

  // ==================== Assignment Handlers ====================

  const handleOpenAssignment = (goalId: string) => {
    setAssignmentGoalId(goalId);
    setAssignmentDialogOpen(true);
  };

  const handleSaveAssignment = async (
    goalId: string,
    assetId: string,
    percentage: number
  ) => {
    const filtered = cleanedAssignments.filter(
      (a) => !(a.goalId === goalId && a.assetId === assetId)
    );
    const updated: GoalAssetAssignment[] =
      percentage > 0 ? [...filtered, { goalId, assetId, percentage }] : filtered;

    await saveMutation.mutateAsync({ goals, assignments: updated });
    toast.success('Assegnazione aggiornata');
  };

  const handleRemoveAssignment = async (goalId: string, assetId: string) => {
    const updated = cleanedAssignments.filter(
      (a) => !(a.goalId === goalId && a.assetId === assetId)
    );
    await saveMutation.mutateAsync({ goals, assignments: updated });
    toast.success('Assegnazione rimossa');
  };

  // ==================== Loading ====================

  if (loadingSettings || loadingAssets || loadingGoals) {
    return <GoalsSkeleton />;
  }

  // ==================== Feature Disabled ====================

  if (!isEnabled) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Target className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Obiettivi di Investimento
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Assegna porzioni del tuo portafoglio a obiettivi finanziari specifici
            come l&apos;acquisto di una casa, la pensione o un fondo emergenza.
          </p>
          <Button variant="outline" asChild>
            <a href="/dashboard/settings">
              <Settings className="mr-2 h-4 w-4" />
              Abilita nelle Impostazioni
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ==================== Main Render ====================

  const hasGoals = goals.length > 0;

  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      {/* Hero — allocated total + verdict + actionable KPIs (A1/A2/A7) */}
      <GoalsHero
        allocatedTotal={allocatedTotal}
        goalCount={goals.length}
        summary={verdictSummary}
        unassignedValue={unassignedValue}
        freeAssets={freeAssets}
        ready
      />

      {/* Validation warnings */}
      {validationErrors.length > 0 && (
        <Card className="border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-700/50">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Attenzione: alcuni asset sono assegnati oltre il 100%
              </p>
              <ul className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                {validationErrors.map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!hasGoals ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Target className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              Nessun obiettivo creato. Inizia creando il tuo primo obiettivo di investimento.
            </p>
            <Button variant="outline" onClick={handleCreateGoal} disabled={isDemo}>
              <Plus className="mr-2 h-4 w-4" />
              Crea Primo Obiettivo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Contribution planner — where to direct the next deposit (B3) */}
          <GoalContributionPlanner goals={goals} progressList={goalProgressList} />

          {/* Flat goal list — single Card, all goals as divide-y rows, sorted by urgency (A4) */}
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 desktop:flex-row desktop:items-center desktop:justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Obiettivi di Investimento
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ordinati per urgenza: prima quelli in ritardo, poi per scadenza
                </p>
              </div>
              <Button
                onClick={handleCreateGoal}
                disabled={isDemo}
                title={isDemo ? 'Non disponibile in modalita demo' : undefined}
                size="sm"
                className="w-full desktop:w-auto"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Nuovo Obiettivo
              </Button>
            </div>
            <div className="divide-y divide-border">
              {sortedRows.map(({ goal, progress, trajectory }) => {
                const goalAssignments = cleanedAssignments.filter(
                  (a) => a.goalId === goal.id
                );
                return (
                  <GoalDetailCard
                    key={goal.id}
                    goal={goal}
                    progress={progress}
                    trajectory={trajectory}
                    assignments={goalAssignments}
                    assets={assets}
                    onEdit={() => handleEditGoal(goal)}
                    onDelete={() => handleDeleteGoal(goal.id)}
                    onAddAssignment={() => handleOpenAssignment(goal.id)}
                    onRemoveAssignment={(assetId) =>
                      handleRemoveAssignment(goal.id, assetId)
                    }
                  />
                );
              })}
            </div>
          </Card>

          {/* Order goals will be reached (B4) */}
          <GoalMilestoneTimeline rows={sortedRows} />

          {/* Allocation-priority explanation — shown only when goal-driven allocation is active */}
          {settings?.goalDrivenAllocationEnabled && (
            <div className="rounded-lg border bg-muted/30 px-5 py-4 space-y-2">
              <p className="text-sm font-medium text-foreground">
                Come funziona l&apos;allocazione da obiettivi
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Il target di ogni classe di asset nella pagina{' '}
                <strong className="text-foreground">Allocazione</strong> viene calcolato pesando
                ogni obiettivo in base al <strong className="text-foreground">gap ancora da colmare</strong>{' '}
                (quanto manca al target) moltiplicato per la sua <strong className="text-foreground">priorità</strong>.
                Gli obiettivi già raggiunti non influenzano il calcolo.
              </p>
              <div className="flex gap-4 pt-1">
                <span className="text-xs font-mono text-foreground/80">Alta · 3×</span>
                <span className="text-xs font-mono text-foreground/80">Media · 2×</span>
                <span className="text-xs font-mono text-foreground/80">Bassa · 1×</span>
              </div>
            </div>
          )}

        </>
      )}

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
        <AssetAssignmentDialog
          open={assignmentDialogOpen}
          onClose={() => {
            setAssignmentDialogOpen(false);
            setAssignmentGoalId(null);
          }}
          onSave={handleSaveAssignment}
          goalId={assignmentGoalId}
          assets={assets}
          assignments={cleanedAssignments}
        />
      )}
    </div>
  );
}
