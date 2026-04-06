'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AssistantCreateThreadInput,
  AssistantThread,
  AssistantThreadDetail,
  AssistantThreadResponse,
  AssistantThreadsResponse,
} from '@/types/assistant';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { toDate } from '@/lib/utils/dateHelpers';

function normalizeThread(thread: any): AssistantThread {
  return {
    ...thread,
    createdAt: toDate(thread.createdAt),
    updatedAt: toDate(thread.updatedAt),
  };
}

function normalizeThreadDetail(detail: AssistantThreadResponse): AssistantThreadDetail {
  return {
    thread: normalizeThread(detail.thread),
    messages: detail.messages.map((message) => ({
      ...message,
      createdAt: toDate(message.createdAt),
    })),
  };
}

async function fetchThreads(userId: string): Promise<AssistantThread[]> {
  const response = await authenticatedFetch(`/api/ai/assistant/threads?userId=${userId}`);

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? 'Impossibile caricare i thread dell’assistente');
  }

  const payload = (await response.json()) as AssistantThreadsResponse;
  return payload.threads.map(normalizeThread);
}

async function fetchThread(threadId: string, userId: string): Promise<AssistantThreadDetail> {
  const response = await authenticatedFetch(
    `/api/ai/assistant/threads/${threadId}?userId=${userId}`
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? 'Impossibile caricare la conversazione');
  }

  const payload = (await response.json()) as AssistantThreadResponse;
  return normalizeThreadDetail(payload);
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
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? 'Impossibile eliminare il thread');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.assistant.threads(userId),
      });
    },
  });
}

export function useCreateAssistantThread(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<AssistantCreateThreadInput, 'userId'>) => {
      const response = await authenticatedFetch('/api/ai/assistant/threads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          ...input,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? 'Impossibile creare il thread');
      }

      const payload = (await response.json()) as { thread: AssistantThread };
      return normalizeThread(payload.thread);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.assistant.threads(userId),
      });
    },
  });
}
