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
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { getSettings } from '@/lib/services/assetAllocationService';
import { getAllAssets } from '@/lib/services/assetService';
import {
  getGoalData,
  saveGoalData,
  calculateGoalProgress,
  getUnassignedValue,
  validateAssignments,
  cleanOrphanedAssignments,
} from '@/lib/services/goalService';
import { GoalBasedInvestingData, InvestmentGoal, GoalAssetAssignment } from '@/types/goals';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Plus, Target, AlertTriangle } from 'lucide-react';
import { GoalsSkeleton } from '@/components/fire-simulations/GoalsSkeleton';
import { toast } from 'sonner';
import { GoalDetailCard } from '@/components/goals/GoalDetailCard';
import { GoalFormDialog } from '@/components/goals/GoalFormDialog';
import { AssetAssignmentDialog } from '@/components/goals/AssetAssignmentDialog';
import { useCountUp } from '@/lib/utils/useCountUp';
import { formatCurrency } from '@/lib/utils/formatters';

export function GoalBasedInvestingTab() {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const userId = user?.uid;

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

  // Average progress percentage across goals that have a target
  const avgProgress = useMemo(() => {
    const withTargets = goalProgressList.filter((p) => p.progressPercentage != null);
    if (withTargets.length === 0) return null;
    return (
      withTargets.reduce((sum, p) => sum + (p.progressPercentage ?? 0), 0) /
      withTargets.length
    );
  }, [goalProgressList]);

  // useCountUp must be called before any early return (React hook rules).
  // Pass null during loading so the animation fires only when real data arrives.
  const animatedAllocated = useCountUp(
    loadingSettings || loadingAssets || loadingGoals ? null : allocatedTotal,
    { duration: 620, once: true, fromPrevious: true }
  );

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
      {/* Hero Block — always visible, anchors the page hierarchy */}
      <Card className="overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
            Patrimonio Allocato
          </p>
          <p className="font-mono text-4xl font-bold tabular-nums leading-none tracking-tight text-foreground mt-1.5">
            {hasGoals && animatedAllocated != null
              ? formatCurrency(animatedAllocated)
              : '--'}
          </p>
        </div>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between px-6 py-3.5">
            <span className="text-sm text-muted-foreground">Obiettivi Attivi</span>
            <span className="text-sm font-semibold font-mono tabular-nums">
              {goals.length}
            </span>
          </div>
          <div className="flex items-center justify-between px-6 py-3.5">
            <span className="text-sm text-muted-foreground">Non Assegnato</span>
            <span className="text-sm font-semibold font-mono tabular-nums">
              {hasGoals ? formatCurrency(unassignedValue) : '--'}
            </span>
          </div>
          {avgProgress != null && (
            <div className="flex items-center justify-between px-6 py-3.5">
              <span className="text-sm text-muted-foreground">Progresso Medio</span>
              <span className="text-sm font-semibold font-mono tabular-nums">
                {avgProgress.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </Card>

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
          {/* Flat goal list — single Card, all goals as divide-y rows */}
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 desktop:flex-row desktop:items-center desktop:justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Obiettivi di Investimento
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Alloca mentalmente il tuo portafoglio verso obiettivi finanziari
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
              {goals.map((goal) => {
                const progress = goalProgressList.find((p) => p.goalId === goal.id);
                if (!progress) return null;
                const goalAssignments = cleanedAssignments.filter(
                  (a) => a.goalId === goal.id
                );
                return (
                  <GoalDetailCard
                    key={goal.id}
                    goal={goal}
                    progress={progress}
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
