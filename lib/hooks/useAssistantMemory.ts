'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AssistantMemoryDocument,
  AssistantMemoryItem,
  AssistantMemoryResponse,
  AssistantPreferences,
} from '@/types/assistant';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { toDate } from '@/lib/utils/dateHelpers';

function normalizeMemory(payload: AssistantMemoryResponse): AssistantMemoryDocument {
  return {
    preferences: payload.preferences,
    items: payload.items.map((item) => ({
      ...item,
      createdAt: toDate(item.createdAt),
      updatedAt: toDate(item.updatedAt),
      completedAt: item.completedAt ? toDate(item.completedAt) : undefined,
      lastEvaluationAt: item.lastEvaluationAt ? toDate(item.lastEvaluationAt) : undefined,
    })),
    suggestions: (payload.suggestions ?? []).map((suggestion) => ({
      ...suggestion,
      createdAt: toDate(suggestion.createdAt),
      updatedAt: toDate(suggestion.updatedAt),
    })),
    updatedAt: payload.updatedAt ? toDate(payload.updatedAt) : null,
    hasDummySnapshots: payload.hasDummySnapshots ?? false,
  };
}

async function fetchMemory(userId: string): Promise<AssistantMemoryDocument> {
  const response = await authenticatedFetch(`/api/ai/assistant/memory?userId=${userId}`);

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? 'Impossibile caricare memoria e preferenze');
  }

  const payload = (await response.json()) as AssistantMemoryResponse;
  return normalizeMemory(payload);
}

export function useAssistantMemory(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assistant.memory(userId || ''),
    queryFn: () => fetchMemory(userId!),
    enabled: !!userId,
  });
}

export function useUpdateAssistantMemory(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: {
      preferences?: Partial<AssistantPreferences>;
      item?: Partial<AssistantMemoryItem> & Pick<AssistantMemoryItem, 'id' | 'text' | 'category'>;
      suggestion?: any;
      action?: 'acceptSuggestion' | 'ignoreSuggestion' | 'reactivateGoal';
      suggestionId?: string;
      itemId?: string;
    }) => {
      const response = await authenticatedFetch('/api/ai/assistant/memory', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          ...updates,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? 'Impossibile aggiornare la memoria');
      }

      const payload = (await response.json()) as AssistantMemoryResponse;
      return normalizeMemory(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.assistant.memory(userId),
      });
    },
  });
}

export function useDeleteAssistantMemory(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: { itemId?: string; resetAll?: boolean }) => {
      const response = await authenticatedFetch('/api/ai/assistant/memory', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          ...options,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? 'Impossibile eliminare la memoria');
      }

      const payload = (await response.json()) as AssistantMemoryResponse;
      return normalizeMemory(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.assistant.memory(userId),
      });
    },
  });
}
