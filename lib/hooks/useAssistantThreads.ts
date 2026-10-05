'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

function normalizeThread(thread: AssistantThread): AssistantThread {
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

async function fetchThreadsPage(userId: string, after: string | undefined): Promise<AssistantThreadsResponse> {
  const cursor = after ? `&after=${encodeURIComponent(after)}` : '';
  const response = await authenticatedFetch(`/api/ai/assistant/threads?userId=${userId}${cursor}`);

  if (!response.ok) {
    const errorResponse = await response.json().catch(() => null);
    throw userFacingError(errorResponse?.error ?? 'Impossibile caricare i thread dell’assistente');
  }

  const threadsResponse = (await response.json()) as AssistantThreadsResponse;
  return { threads: threadsResponse.threads.map(normalizeThread), nextCursor: threadsResponse.nextCursor };
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

/**
 * The owner's threads, one page of 50 at a time (PERF-10): `data` is the threads of every page read
 * so far, most recent first, and `hasNextPage` says another page exists — the list's «Mostra
 * altre» calls `fetchNextPage`, and every count on the page says «più di N» while it does
 * (`describeAssistantHeader`, `describeThreadsReading`), so no thread is ever hidden in silence.
 *
 * The key is the one every writer already invalidates (the stream's end, the delete): an
 * invalidation re-reads every page loaded, each from the cursor of the fresh page before it.
 * Not persisted (`lib/constants/persistCache.ts`).
 */
export function useAssistantThreads(userId: string | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.assistant.threads(userId || ''),
    queryFn: ({ pageParam }) => fetchThreadsPage(userId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data): AssistantThread[] => data.pages.flatMap((page) => page.threads),
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
