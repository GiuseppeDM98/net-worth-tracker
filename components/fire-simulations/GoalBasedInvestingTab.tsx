/**
 * GOAL-BASED INVESTING TAB
 *
 * Orchestrates the goal-based investing feature. Fetches goal data and assets
 * via React Query, calculates progress for each goal, and renders child components.
 *
 * DATA FLOW:
 * 1. Settings query → check if feature is enabled
 * 2. Assets query → portfolio data (independent)
 * 3. Goal data query → goals + assignments (independent)
 * 4. Derived calculations via useMemo (depends on 2 + 3)
 *
 * When feature is disabled, shows a placeholder inviting the user to enable it in Settings.
 */

'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
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
import { toast } from 'sonner';
import { GoalSummaryCards } from '@/components/goals/GoalSummaryCards';
import { GoalAllocationPieChart } from '@/components/goals/GoalAllocationPieChart';
import { GoalDetailCard } from '@/components/goals/GoalDetailCard';
import { GoalFormDialog } from '@/components/goals/GoalFormDialog';
import { AssetAssignmentDialog } from '@/components/goals/AssetAssignmentDialog';

export function GoalBasedInvestingTab() {
  const { user } = useAuth();
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

  // Mutation for saving goal data
  const saveMutation = useMutation({
    mutationFn: (data: GoalBasedInvestingData) => saveGoalData(userId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goalData', userId] });
    },
  });

  const isEnabled = settings?.goalBasedInvestingEnabled ?? false;
  const goals = goalData?.goals ?? [];
  const assignments = goalData?.assignments ?? [];

  // Clean orphaned assignments on load
  const cleanedAssignments = useMemo(
    () => cleanOrphanedAssignments(assignments, assets),
    [assignments, assets]
  );

  // Calculate progress for all goals
  const goalProgressList = useMemo(
    () => goals.map((g) => calculateGoalProgress(g, cleanedAssignments, assets)),
    [goals, cleanedAssignments, assets]
  );

  // Calculate unassigned value
  const unassignedValue = useMemo(
    () => getUnassignedValue(assets, cleanedAssignments),
    [assets, cleanedAssignments]
  );

  // Validation warnings
  const validationErrors = useMemo(
    () => validateAssignments(cleanedAssignments, assets),
    [cleanedAssignments, assets]
  );

  // ==================== Goal CRUD Handlers ====================

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

    await saveMutation.mutateAsync({
      goals: updatedGoals,
      assignments: cleanedAssignments,
    });

    setGoalDialogOpen(false);
    setEditingGoal(null);
    toast.success(isEditing ? 'Obiettivo aggiornato' : 'Obiettivo creato');
  };

  const handleDeleteGoal = async (goalId: string) => {
    // Remove goal and all its assignments
    const updatedGoals = goals.filter((g) => g.id !== goalId);
    const updatedAssignments = cleanedAssignments.filter(
      (a) => a.goalId !== goalId
    );

    await saveMutation.mutateAsync({
      goals: updatedGoals,
      assignments: updatedAssignments,
    });

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
    // Remove any existing assignment for this goal+asset pair, then add new one
    const filtered = cleanedAssignments.filter(
      (a) => !(a.goalId === goalId && a.assetId === assetId)
    );

    const updated: GoalAssetAssignment[] =
      percentage > 0
        ? [...filtered, { goalId, assetId, percentage }]
        : filtered; // If percentage is 0, just remove

    await saveMutation.mutateAsync({
      goals,
      assignments: updated,
    });

    toast.success('Assegnazione aggiornata');
  };

  const handleRemoveAssignment = async (goalId: string, assetId: string) => {
    const updated = cleanedAssignments.filter(
      (a) => !(a.goalId === goalId && a.assetId === assetId)
    );

    await saveMutation.mutateAsync({
      goals,
      assignments: updated,
    });

    toast.success('Assegnazione rimossa');
  };

  // ==================== Loading State ====================

  if (loadingSettings || loadingAssets || loadingGoals) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    );
  }

  // ==================== Feature Disabled State ====================

  if (!isEnabled) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Target className="h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            Obiettivi di Investimento
          </h3>
          <p className="text-sm text-gray-500 max-w-md mb-6">
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

  return (
    <div className="space-y-6">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Obiettivi di Investimento
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Alloca mentalmente il tuo portafoglio verso obiettivi finanziari
          </p>
        </div>
        <Button onClick={handleCreateGoal}>
          <Plus className="mr-2 h-4 w-4" />
          Nuovo Obiettivo
        </Button>
      </div>

      {/* Validation warnings */}
      {validationErrors.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800">
                Attenzione: alcuni asset sono assegnati oltre il 100%
              </p>
              <ul className="mt-1 text-sm text-yellow-700">
                {validationErrors.map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {goals.length === 0 ? (
        // Empty state
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Target className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 mb-4">
              Nessun obiettivo creato. Inizia creando il tuo primo obiettivo di investimento.
            </p>
            <Button variant="outline" onClick={handleCreateGoal}>
              <Plus className="mr-2 h-4 w-4" />
              Crea Primo Obiettivo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <GoalSummaryCards
            progressList={goalProgressList}
            unassignedValue={unassignedValue}
          />

          {/* Pie Chart */}
          <GoalAllocationPieChart
            progressList={goalProgressList}
            unassignedValue={unassignedValue}
          />

          {/* Goal Detail Cards */}
          <div className="space-y-4">
            {goals.map((goal) => {
              const progress = goalProgressList.find(
                (p) => p.goalId === goal.id
              );
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
        </>
      )}

      {/* Goal Form Dialog */}
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

      {/* Asset Assignment Dialog */}
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
