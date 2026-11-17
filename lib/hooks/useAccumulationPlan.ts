'use client';

/**
 * The mutation hooks of the `accumulationPlans` collection (the Accumulo tab). The read is
 * `useAccumulationPlans` (`useAccumulationPlans.ts`, re-exported here), apart so the Allocazione
 * page's Piano note never pulls the service that writes plans.
 *
 * `ownerId` is always the owner's (`useActiveAccount`), never the viewer's — a delegated member
 * manages a plan on the shared account's data. Every mutation invalidates only
 * `queryKeys.accumulationPlans.all(ownerId)`: unlike the trade ledger or a pension contribution,
 * nothing here writes to `assets` or the dashboard overview (the ledger `buy`/`sell` a user records
 * from Registro operazioni already carries its own invalidation). The Piano's note on Bilanciamento
 * reads that same key, so it follows every write.
 */

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import {
  createDraftPlan,
  updateDraftPlan,
  activatePlan,
  setInstallmentLine,
  setDisposal,
  applyRecalibration,
  dismissRecalibration,
  revisePlan,
  closePlan,
  reactivatePlan,
  deleteDraftPlan,
  type ActivatePlanInput,
  type MeasurementInput,
  type SetInstallmentLinePatch,
  type RevisePlanInput,
} from '@/lib/services/accumulationPlanService';
import type {
  AccumulationPlanDraft,
  AccumulationPlanStatus,
  InstallmentLineStatus,
} from '@/types/accumulationPlan';
import type { RecalibrationLine, PlanRevisionInput } from '@/lib/utils/accumulationPlanUtils';

export { useAccumulationPlans, selectOpenPlan } from '@/lib/hooks/useAccumulationPlans';

function invalidateAccumulationPlans(queryClient: QueryClient, ownerId: string): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.accumulationPlans.all(ownerId) });
}

export function useCreateDraftPlan(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: AccumulationPlanDraft) => createDraftPlan(ownerId, draft),
    onSuccess: () => invalidateAccumulationPlans(queryClient, ownerId),
  });
}

export function useUpdateDraftPlan(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, draft }: { planId: string; draft: AccumulationPlanDraft }) =>
      updateDraftPlan(planId, draft),
    onSuccess: () => invalidateAccumulationPlans(queryClient, ownerId),
  });
}

export function useActivatePlan(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, input }: { planId: string; input: ActivatePlanInput }) =>
      activatePlan(planId, input),
    onSuccess: () => invalidateAccumulationPlans(queryClient, ownerId),
  });
}

export function useSetInstallmentLine(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      planId,
      index,
      positionId,
      patch,
      measurementInput,
    }: {
      planId: string;
      index: number;
      positionId: string;
      patch: SetInstallmentLinePatch;
      measurementInput: MeasurementInput;
    }) => setInstallmentLine(planId, index, positionId, patch, measurementInput),
    onSuccess: () => invalidateAccumulationPlans(queryClient, ownerId),
  });
}

export function useSetDisposal(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      planId,
      assetId,
      patch,
    }: {
      planId: string;
      assetId: string;
      patch: { status: InstallmentLineStatus; transactionIds?: string[]; executedAmountEur?: number };
    }) => setDisposal(planId, assetId, patch),
    onSuccess: () => invalidateAccumulationPlans(queryClient, ownerId),
  });
}

export function useApplyRecalibration(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, index, lines }: { planId: string; index: number; lines: RecalibrationLine[] }) =>
      applyRecalibration(planId, index, lines),
    onSuccess: () => invalidateAccumulationPlans(queryClient, ownerId),
  });
}

export function useDismissRecalibration(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, index, quantities }: { planId: string; index: number; quantities: Record<string, number> }) =>
      dismissRecalibration(planId, index, quantities),
    onSuccess: () => invalidateAccumulationPlans(queryClient, ownerId),
  });
}

export function useRevisePlan(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, revision, input }: { planId: string; revision: PlanRevisionInput; input: RevisePlanInput }) =>
      revisePlan(planId, revision, input),
    onSuccess: () => invalidateAccumulationPlans(queryClient, ownerId),
  });
}

export function useClosePlan(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      planId,
      status,
    }: {
      planId: string;
      status: Extract<AccumulationPlanStatus, 'completed' | 'cancelled'>;
    }) => closePlan(ownerId, planId, status),
    onSuccess: () => invalidateAccumulationPlans(queryClient, ownerId),
  });
}

export function useReactivatePlan(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => reactivatePlan(ownerId, planId, new Date()),
    onSuccess: () => invalidateAccumulationPlans(queryClient, ownerId),
  });
}

export function useDeleteDraftPlan(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => deleteDraftPlan(ownerId, planId),
    onSuccess: () => invalidateAccumulationPlans(queryClient, ownerId),
  });
}
