/**
 * `useAssistantStreaming` — what Registra added to the stream's life (2026-11): the assistant
 * message adopts the id of the document the server wrote when the stream ends (a card's outcome is
 * saved on that document), the `register` event reaches the companion, and `recordProposal`
 * writes an outcome in the two places the session reads a message from — the stream buffer and
 * the cached thread. The fetch answers a faked SSE body.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { authenticatedFetchMock, toastErrorMock } = vi.hoisted(() => ({ authenticatedFetchMock: vi.fn(), toastErrorMock: vi.fn() }));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: authenticatedFetchMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastErrorMock } }));

import { useAssistantStreaming } from '@/lib/hooks/useAssistantStreaming';
import { queryKeys } from '@/lib/query/queryKeys';
import type { AssistantMessage, AssistantRegisterSummary, AssistantStreamEvent, AssistantThreadDetail } from '@/types/assistant';

const SUMMARY: AssistantRegisterSummary = { accounts: [], categories: 3, costCentersEnabled: false, membersEnabled: false, recent: { rows: 4, cut: 0 } };

/** A streamed answer as the route sends it: one `data:` frame per event. */
function sseResponse(events: AssistantStreamEvent[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function setup(overrides: Partial<Parameters<typeof useAssistantStreaming>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onThreadIdResolved = vi.fn();
  const onDraftConsumed = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const hook = renderHook(
    () =>
      useAssistantStreaming({
        ownerId: 'owner-1',
        selectedThreadId: undefined,
        onThreadIdResolved,
        draft: 'ho fatto spesa per 103 euro',
        onDraftConsumed,
        threadMessages: undefined,
        mode: 'register',
        selectedMonth: { year: 2026, month: 11 },
        selectedYear: 2026,
        chatContextType: 'none',
        preferences: undefined,
        ...overrides,
      }),
    { wrapper },
  );
  return { ...hook, queryClient, onThreadIdResolved, onDraftConsumed };
}

const REGISTER_STREAM: AssistantStreamEvent[] = [
  { type: 'meta', threadId: 'thread-1', title: 'Registrazioni · 1 nov 2026' },
  { type: 'register', summary: SUMMARY },
  { type: 'text', text: 'Ti propongo ' },
  { type: 'text', text: 'questa riga.' },
  { type: 'done', threadId: 'thread-1', messageId: 'msg-1', webSearchUsed: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  authenticatedFetchMock.mockImplementation(async () => sseResponse(REGISTER_STREAM));
});

describe('useAssistantStreaming — a register stream', () => {
  it('sends the mode with no period, and the assistant message ends with the server’s id and thread', async () => {
    const { result, onThreadIdResolved, onDraftConsumed } = setup();
    await act(async () => {
      await result.current.submit();
    });

    const [url, init] = authenticatedFetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/assistant/stream');
    expect(JSON.parse(init.body)).toEqual({ userId: 'owner-1', mode: 'register', prompt: 'ho fatto spesa per 103 euro' });

    const [user, assistant] = result.current.renderedMessages;
    expect(result.current.renderedMessages).toHaveLength(2);
    expect(assistant).toMatchObject({ id: 'msg-1', threadId: 'thread-1', role: 'assistant', content: 'Ti propongo questa riga.' });
    // The user's message was never the server's: it keeps its local id.
    expect(user.id).toMatch(/^local-user-/);
    expect(user.role).toBe('user');
    expect(result.current.streamingMessageId).toBeUndefined();
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isInterrupted).toBe(false);
    expect(onThreadIdResolved).toHaveBeenCalledWith('thread-1');
    expect(onDraftConsumed).toHaveBeenCalledTimes(1);
  });

  it('hands the companion what the server read, and forgets it at a thread switch', async () => {
    const { result } = setup();
    expect(result.current.registerSummary).toBeNull();
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.registerSummary).toEqual(SUMMARY);
    act(() => result.current.resetStream());
    expect(result.current.registerSummary).toBeNull();
    expect(result.current.renderedMessages).toEqual([]);
  });

  it('keeps the local id on a stream that fails before its end: its cards offer no button', async () => {
    authenticatedFetchMock.mockImplementation(async () =>
      sseResponse([{ type: 'meta', threadId: 'thread-1', title: 'x' }, { type: 'text', text: 'Ti propongo' }, { type: 'error', error: 'Stream interrotto' }]),
    );
    const { result } = setup();
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.renderedMessages[1].id).toMatch(/^local-assistant-/);
    expect(result.current.renderedMessages[1].content).toBe('Ti propongo');
    expect(result.current.isInterrupted).toBe(true);
    expect(toastErrorMock).toHaveBeenCalledWith('Stream interrotto');
  });
});

describe('useAssistantStreaming — recordProposal', () => {
  it('writes the outcome on the message in the stream buffer', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.submit();
    });
    act(() => result.current.recordProposal('msg-1', 'thread-1', 'expense:0', { status: 'written', writtenIds: ['exp-1'] }));

    const [user, assistant] = result.current.renderedMessages;
    expect(assistant.proposals?.['expense:0']).toMatchObject({ status: 'written', writtenIds: ['exp-1'] });
    expect(assistant.proposals?.['expense:0'].at).toBeInstanceOf(Date);
    expect(user.proposals).toBeUndefined();

    act(() => result.current.recordProposal('msg-1', 'thread-1', 'expense:1', { status: 'ignored' }));
    expect(Object.keys(result.current.renderedMessages[1].proposals ?? {})).toEqual(['expense:0', 'expense:1']);
  });

  it('writes it in the cached thread too — what a thread opened from the list shows', async () => {
    const stored: AssistantMessage = { id: 'msg-1', threadId: 'thread-1', userId: 'owner-1', role: 'assistant', content: 'Ecco.', createdAt: new Date('2026-11-01T10:00:00Z'), mode: 'register' };
    const detail: AssistantThreadDetail = {
      thread: { id: 'thread-1', userId: 'owner-1', title: 'Registrazioni · 1 nov 2026', mode: 'register', pinnedMonth: null, createdAt: stored.createdAt, updatedAt: stored.createdAt, lastMessagePreview: '', messageCount: 1 },
      messages: [stored],
    };
    const { result, queryClient } = setup({ selectedThreadId: 'thread-1', threadMessages: [stored] });
    queryClient.setQueryData(queryKeys.assistant.thread('thread-1'), detail);

    act(() => result.current.recordProposal('msg-1', 'thread-1', 'expense:0', { status: 'ignored' }));

    await waitFor(() => {
      const cached = queryClient.getQueryData<AssistantThreadDetail>(queryKeys.assistant.thread('thread-1'));
      expect(cached?.messages[0].proposals?.['expense:0'].status).toBe('ignored');
    });
    // A thread that was never read has no cache to write: nothing is invented.
    act(() => result.current.recordProposal('msg-9', 'thread-9', 'expense:0', { status: 'ignored' }));
    expect(queryClient.getQueryData(queryKeys.assistant.thread('thread-9'))).toBeUndefined();
  });
});
