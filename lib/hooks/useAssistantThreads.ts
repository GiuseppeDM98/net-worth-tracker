'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AssistantThread,
  AssistantThreadDetail,
  AssistantThreadResponse,
  AssistantThreadsResponse,
} from '@/types/assistant';
import { queryKeys } from '@/lib/query/queryKeys';
import { userFacingError } from '@/lib/utils/dialogNarrative';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { toDate } from '@/lib/utils/dateHelpers';

function normalizeThread(thread: any): AssistantThread {
  return {
    ...thread,
    createdAt: toDate(thread.createdAt),
    updatedAt: toDate(thread.updatedAt),
  };
}

function normalizeThreadDetail(threadResponse: AssistantThreadResponse): AssistantThreadDetail {
  return {
    thread: normalizeThread(threadResponse.thread),
    messages: threadResponse.messages.map((message) => ({
      ...message,
      createdAt: toDate(message.createdAt),
    })),
  };
}

async function fetchThreads(userId: string): Promise<AssistantThread[]> {
  const response = await authenticatedFetch(`/api/ai/assistant/threads?userId=${userId}`);

  if (!response.ok) {
    const errorResponse = await response.json().catch(() => null);
    throw userFacingError(errorResponse?.error ?? 'Impossibile caricare i thread dell’assistente');
  }

  const threadsResponse = (await response.json()) as AssistantThreadsResponse;
  return threadsResponse.threads.map(normalizeThread);
}

async function fetchThread(threadId: string, userId: string): Promise<AssistantThreadDetail> {
  const response = await authenticatedFetch(
    `/api/ai/assistant/threads/${threadId}?userId=${userId}`
  );

  if (!response.ok) {
    const errorResponse = await response.json().catch(() => null);
    throw userFacingError(errorResponse?.error ?? 'Impossibile caricare la conversazione');
  }

  const threadResponse = (await response.json()) as AssistantThreadResponse;
  return normalizeThreadDetail(threadResponse);
}

export function useAssistantThreads(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assistant.threads(userId || ''),
    queryFn: () => fetchThreads(userId!),
    enabled: !!userId,
  });
}

export function useAssistantThread(threadId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assistant.thread(threadId || ''),
    queryFn: () => fetchThread(threadId!, userId!),
    enabled: !!threadId && !!userId,
  });
}

export function useDeleteAssistantThread(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (threadId: string) => {
      const response = await authenticatedFetch(
        `/api/ai/assistant/threads/${threadId}?userId=${userId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const errorResponse = await response.json().catch(() => null);
        throw userFacingError(errorResponse?.error ?? 'Impossibile eliminare il thread');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.assistant.threads(userId),
      });
    },
  });
}
