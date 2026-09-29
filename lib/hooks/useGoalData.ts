'use client';

/**
 * React Query hooks for goal-based investing (`goalBasedInvesting/{uid}`).
 *
 * The goals and their assignments are ONE document, read by the Obiettivi tab and by Allocazione
 * (goal-driven targets): one key, `queryKeys.goals.all`, so the two pages share the read and the
 * Obiettivi save reaches Allocazione through the invalidation (2026-09-29).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getGoalData, saveGoalData } from '@/lib/services/goalService';
import type { GoalBasedInvestingData } from '@/types/goals';

/**
 * The owner's goal document, `null` when none was saved yet.
 *
 * @param ownerId - Whose goals (`useActiveAccount().ownerId`, never the viewer's uid)
 */
export function useGoalData(ownerId: string | undefined) {
  return useQuery<GoalBasedInvestingData | null>({
    queryKey: queryKeys.goals.all(ownerId || ''),
    queryFn: () => getGoalData(ownerId!),
    enabled: !!ownerId,
  });
}

/** Replace the whole goal document, then invalidate its key so every reader refetches. */
export function useSaveGoalData(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GoalBasedInvestingData) => saveGoalData(ownerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.all(ownerId) });
    },
  });
}
