'use client';

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { AssistantMonthContextBundle, AssistantMonthSelectorValue } from '@/types/assistant';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';

/**
 * Fetches the numeric context bundle for a given month synchronously (no streaming).
 * Used to repopulate the context panel when an existing month_analysis thread is opened
 * and no active SSE bundle is present in component state.
 *
 * staleTime is 5 minutes: past-month data rarely changes, so we avoid redundant
 * Firestore reads when the user switches back to a thread they just viewed.
 */
async function fetchMonthContext(
  userId: string,
  year: number,
  month: number
): Promise<AssistantMonthContextBundle> {
  const response = await authenticatedFetch(
    `/api/ai/assistant/context?userId=${encodeURIComponent(userId)}&year=${year}&month=${month}`
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? 'Impossibile caricare il contesto mensile');
  }

  const payload = await response.json();
  return payload.bundle as AssistantMonthContextBundle;
}

export function useAssistantMonthContext(
  userId: string | undefined,
  month: AssistantMonthSelectorValue | null
): UseQueryResult<AssistantMonthContextBundle> {
  const enabled = !!userId && month !== null;

  return useQuery({
    queryKey: enabled
      ? queryKeys.assistant.context(userId!, month!.year, month!.month)
      : ['assistant', 'context', 'disabled'],
    queryFn: () => fetchMonthContext(userId!, month!.year, month!.month),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
