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
import type {
  AssistantMessage,
  AssistantRegisterSummary,
  AssistantRouteOverride,
  AssistantRouteReading,
  AssistantStreamEvent,
  AssistantThreadDetail,
} from '@/types/assistant';

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
  it('sends `auto` with no period, and the assistant message ends with the server’s id and thread', async () => {
    const { result, onThreadIdResolved, onDraftConsumed } = setup();
    await act(async () => {
      await result.current.submit();
    });

    const [url, init] = authenticatedFetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/assistant/stream');
    // Every send is read by the router (2026-11-12): no mode, month, year or chat context of the page.
    expect(JSON.parse(init.body)).toEqual({ userId: 'owner-1', mode: 'auto', prompt: 'ho fatto spesa per 103 euro' });

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

// The page as only a chat (2026-11-12): every send is `auto`, the router's reading comes back as a
// `route` event and sets the turn's mode, and a re-send carries the reading it inherits. Seen RED
// with `chatContext: 'none'` kept in the body, with the `route` handler leaving the retry's ref
// alone, and with the placeholders born `'chat'`.
describe('useAssistantStreaming — the status of the tools (2026-11-26)', () => {
  it('a `status: computing` event is the hook\'s `streamStatus` while the stream is open', async () => {
    const encoder = new TextEncoder();
    let finish: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { finish = resolve; });
    const frame = (event: AssistantStreamEvent) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
    authenticatedFetchMock.mockImplementation(async () => new Response(new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(frame({ type: 'meta', threadId: 'thread-1', title: 'x' }));
        controller.enqueue(frame({ type: 'status', status: 'computing' }));
        await held;
        controller.enqueue(frame({ type: 'text', text: 'Fatto.' }));
        controller.enqueue(frame({ type: 'done', threadId: 'thread-1', messageId: 'msg-1', webSearchUsed: false }));
        controller.close();
      },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
    const { result } = setup();
    let submitted: Promise<void> = Promise.resolve();
    act(() => {
      submitted = result.current.submit('quanto ho speso a novembre?');
    });
    await waitFor(() => expect(result.current.streamStatus).toBe('computing'));
    finish();
    await act(async () => {
      await submitted;
    });
  });
});

describe('useAssistantStreaming — the reading of a turn', () => {
  const ROUTER: AssistantRouteReading = { route: { intent: 'month_analysis', period: { kind: 'month', year: 2026, month: 10 }, webSearch: false, confidence: 0.9 }, source: 'router' };
  const FALLBACK: AssistantRouteReading = { route: { intent: 'chat', period: { kind: 'none' }, webSearch: false, confidence: 0 }, source: 'fallback', reason: 'timeout' };
  const REGISTER_ROUTE: AssistantRouteOverride = { intent: 'register', period: { kind: 'none' }, webSearch: false };
  const bodies = () => authenticatedFetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
  const stream = (reading: AssistantRouteReading | null, end: 'done' | 'error' = 'done'): AssistantStreamEvent[] => [
    { type: 'meta', threadId: 'thread-1', title: 'x' },
    ...(reading ? [{ type: 'route' as const, reading }] : []),
    { type: 'text', text: 'Risposta.' },
    end === 'done' ? { type: 'done', threadId: 'thread-1', messageId: 'msg-1', webSearchUsed: false } : { type: 'error', error: 'Stream interrotto' },
  ];

  it('posts a route and `routeCarried` only when passed', async () => {
    authenticatedFetchMock.mockImplementation(async () => sseResponse(stream(null)));
    const { result } = setup();
    await act(async () => {
      await result.current.submit('ho speso 50 euro', { route: REGISTER_ROUTE });
    });
    await act(async () => {
      await result.current.submit('Da quale conto? → Conto A', { route: REGISTER_ROUTE, routeCarried: true });
    });
    expect(bodies()[0]).toEqual({ userId: 'owner-1', mode: 'auto', prompt: 'ho speso 50 euro', threadId: undefined, route: REGISTER_ROUTE });
    expect(bodies()[0]).not.toHaveProperty('routeCarried');
    expect(bodies()[1]).toMatchObject({ mode: 'auto', route: REGISTER_ROUTE, routeCarried: true });
    for (const body of bodies()) for (const key of ['month', 'year', 'chatContext']) expect(body).not.toHaveProperty(key);
  });

  it('a `route` event sets the turn’s mode and the answer’s reading', async () => {
    authenticatedFetchMock.mockImplementation(async () => sseResponse(stream(ROUTER)));
    const { result } = setup();
    await act(async () => {
      await result.current.submit('com’è andato ottobre?');
    });
    const [user, assistant] = result.current.renderedMessages;
    expect(user.mode).toBe('month_analysis');
    expect(assistant.mode).toBe('month_analysis');
    expect(assistant.routeReading).toEqual(ROUTER);
    expect(user.routeReading).toBeUndefined();
  });

  it('«Rigenera» re-sends the route that was passed', async () => {
    authenticatedFetchMock.mockImplementation(async () => sseResponse(stream(null, 'error')));
    const { result } = setup();
    await act(async () => {
      await result.current.submit('ho speso 50 euro', { route: REGISTER_ROUTE });
    });
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(2));
    expect(bodies()[1]).toMatchObject({ prompt: 'ho speso 50 euro', route: REGISTER_ROUTE, routeCarried: true });
  });

  it('«Rigenera» after an interrupted `auto` turn carries the router’s reading, never a fallback', async () => {
    authenticatedFetchMock.mockImplementation(async () => sseResponse(stream(ROUTER, 'error')));
    const { result } = setup();
    await act(async () => {
      await result.current.submit('com’è andato ottobre?');
    });
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(2));
    // The reading without its confidence: an override is stamped `confidence: 1` by the server.
    expect(bodies()[1]).toMatchObject({ prompt: 'com’è andato ottobre?', routeCarried: true, route: { intent: 'month_analysis', period: { kind: 'month', year: 2026, month: 10 }, webSearch: false } });
    expect(bodies()[1].route).not.toHaveProperty('confidence');

    authenticatedFetchMock.mockClear();
    authenticatedFetchMock.mockImplementation(async () => sseResponse(stream(FALLBACK, 'error')));
    const second = setup();
    await act(async () => {
      await second.result.current.submit('boh?');
    });
    await act(async () => {
      second.result.current.retry();
    });
    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(2));
    expect(bodies()[1]).not.toHaveProperty('route');
    expect(bodies()[1]).not.toHaveProperty('routeCarried');
  });

  it('after a register answer the next turn is born `register` until its own reading arrives', async () => {
    const registerReading: AssistantRouteReading = { route: { ...REGISTER_ROUTE, confidence: 0.95 }, source: 'router' };
    authenticatedFetchMock.mockImplementationOnce(async () => sseResponse(stream(registerReading)));
    // The second stream brings no reading: the placeholders keep the mode they were born with.
    authenticatedFetchMock.mockImplementationOnce(async () => sseResponse(stream(null)));
    const { result } = setup();
    await act(async () => {
      await result.current.submit('ho speso 50 euro');
    });
    await act(async () => {
      await result.current.submit('e 20 di benzina');
    });
    const modes = result.current.renderedMessages.map((message) => message.mode);
    expect(modes).toEqual(['register', 'register', 'register', 'register']);
    expect(result.current.renderedMessages.every((message) => message.monthContext === null)).toBe(true);
  });

  it('is born `chat` on an empty conversation, and with the passed route’s mode', async () => {
    authenticatedFetchMock.mockImplementation(async () => sseResponse(stream(null)));
    const { result } = setup();
    await act(async () => {
      await result.current.submit('ciao');
    });
    expect(result.current.renderedMessages.map((message) => message.mode)).toEqual(['chat', 'chat']);
    await act(async () => {
      await result.current.submit('ho speso 50 euro', { route: REGISTER_ROUTE });
    });
    expect(result.current.renderedMessages.slice(2).map((message) => message.mode)).toEqual(['register', 'register']);
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

describe('useAssistantStreaming — a submit from a render older than the last outcome (2026-11)', () => {
  it('keeps the outcomes recorded after the render that holds the submit: «Rispondi» records, then sends', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.submit();
    });
    // The question cards' «Rispondi»: its handler holds the `submit` of the render it was clicked in.
    const staleSubmit = result.current.submit;
    act(() => result.current.recordProposal('msg-1', 'thread-1', 'question:0', { status: 'answered', answer: 'Conto B' }));
    await act(async () => {
      await staleSubmit('Da quale conto? → Conto B [acc-b]');
    });
    expect(result.current.renderedMessages[1].proposals?.['question:0']).toMatchObject({ status: 'answered', answer: 'Conto B' });
  });
});

describe('useAssistantStreaming — a stale submit on a thread opened from the list (2026-11)', () => {
  it('starts from the cached thread, where the answers were recorded', async () => {
    const stored: AssistantMessage = { id: 'msg-1', threadId: 'thread-1', userId: 'owner-1', role: 'assistant', content: 'Domanda.', createdAt: new Date('2026-11-01T10:00:00Z'), mode: 'register' };
    const detail: AssistantThreadDetail = {
      thread: { id: 'thread-1', userId: 'owner-1', title: 'Registrazioni · 1 nov 2026', mode: 'register', pinnedMonth: null, createdAt: stored.createdAt, updatedAt: stored.createdAt, lastMessagePreview: '', messageCount: 1 },
      messages: [stored],
    };
    const { result, queryClient } = setup({ selectedThreadId: 'thread-1', threadMessages: [stored] });
    queryClient.setQueryData(queryKeys.assistant.thread('thread-1'), detail);
    const staleSubmit = result.current.submit;
    act(() => result.current.recordProposal('msg-1', 'thread-1', 'question:0', { status: 'answered', answer: 'Sì' }));
    await act(async () => {
      await staleSubmit('È abituale? → Sì');
    });
    expect(result.current.renderedMessages[0].proposals?.['question:0']).toMatchObject({ status: 'answered', answer: 'Sì' });
  });
});
