/**
 * `useConsulenteRun` (components/allocation/consulente/useConsulenteRun.ts, 2026-11-07): the stage's
 * clock — `stageStartedAt` stamped when the run opens, at every `stage` event and at a retry. The
 * route is a mocked `authenticatedFetch` answering SSE streams the test feeds; only `Date` is faked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConsulenteRun } from '@/components/allocation/consulente/useConsulenteRun';
import { initialAnswers } from '@/lib/utils/allocationAdviceDraft';

const { authenticatedFetch } = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch }));

/** One SSE response the test writes to, event by event. */
function sseResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const encoder = new TextEncoder();
  return {
    response: new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    send: (event: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)),
    close: () => controller.close(),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const T0 = new Date('2026-06-15T12:00:00').getTime();
const answers = initialAnswers(null, null, []);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  authenticatedFetch.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useConsulenteRun', () => {
  it('stamps stageStartedAt at the start, at every stage event and at the retry', async () => {
    const streams = [sseResponse(), sseResponse(), sseResponse()];
    authenticatedFetch.mockImplementation(() => Promise.resolve(streams.shift()!.response));
    const [strategy, instruments, retried] = [...streams];
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const onFinished = vi.fn();
    const { result } = renderHook(() => useConsulenteRun('u1', onFinished), { wrapper });

    act(() => {
      result.current.start(answers);
    });
    expect(result.current.state).toMatchObject({ kind: 'running', stage: null, stageStartedAt: T0 });

    vi.setSystemTime(T0 + 1_000);
    await act(async () => {
      strategy.send({ type: 'stage', stage: 'context' });
      await flush();
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ kind: 'running', stage: 'context', stageStartedAt: T0 + 1_000 }));

    vi.setSystemTime(T0 + 2_000);
    await act(async () => {
      strategy.send({ type: 'stage', stage: 'strategy' });
      await flush();
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ kind: 'running', stage: 'strategy', stageStartedAt: T0 + 2_000 }));

    await act(async () => {
      strategy.send({ type: 'done' });
      strategy.close();
      await flush();
    });
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(authenticatedFetch.mock.calls[0][1].body)).toMatchObject({ userId: 'u1', stage: 'strategy', answers });
    expect(JSON.parse(authenticatedFetch.mock.calls[1][1].body)).toEqual({ userId: 'u1', stage: 'instruments' });

    await act(async () => {
      instruments.send({ type: 'stage', stage: 'instruments' });
      instruments.send({ type: 'error', error: 'Ricerca interrotta: ornitorinco.', retryable: true });
      instruments.close();
      await flush();
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ kind: 'failed', error: 'Ricerca interrotta: ornitorinco.', retryable: true, resumeFrom: 'instruments' }));

    vi.setSystemTime(T0 + 3_000);
    act(() => {
      result.current.retry();
    });
    expect(result.current.state).toMatchObject({ kind: 'running', stage: 'instruments', stageStartedAt: T0 + 3_000 });
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(3));
    expect(JSON.parse(authenticatedFetch.mock.calls[2][1].body)).toEqual({ userId: 'u1', stage: 'instruments' });
    expect(onFinished).not.toHaveBeenCalled();

    await act(async () => {
      retried.send({ type: 'done' });
      retried.close();
      await flush();
    });
  });

  it('remembers the stage in flight when its request throws, so «Riprova» never re-pays a saved stage (2026-11-07)', async () => {
    const strategy = sseResponse();
    authenticatedFetch
      .mockImplementationOnce(() => Promise.resolve(strategy.response))
      // The instruments request answers a non-ok status: `openRunBody` throws the route's sentence.
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ error: 'Servizio non disponibile.' }), { status: 503 })));
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useConsulenteRun('u1', vi.fn()), { wrapper });

    act(() => {
      result.current.start(answers);
    });
    await act(async () => {
      strategy.send({ type: 'done' });
      strategy.close();
      await flush();
    });
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.state).toMatchObject({ kind: 'failed', error: 'Servizio non disponibile.', retryable: true, resumeFrom: 'instruments' }));
  });
});

describe('the interview rides with the run (2026-11-08)', () => {
  it('sends the interview with the strategy, keeps it in every state, and «Riprova» on a failed strategy resends it', async () => {
    const streams = [sseResponse(), sseResponse(), sseResponse(), sseResponse()];
    authenticatedFetch.mockImplementation(() => Promise.resolve(streams.shift()!.response));
    const [first, retried, instruments, review] = [...streams];
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useConsulenteRun('u1', vi.fn()), { wrapper });
    const interview = {
      rounds: [{ note: 'Vedo un reddito concentrato.', satisfied: false, questions: [], answers: [], model: 'opus-finto', askedAt: new Date(T0) }],
      skipped: false,
    };

    act(() => {
      result.current.start(answers, 'strategy', interview);
    });
    expect(result.current.state).toMatchObject({ kind: 'running', interview });
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(1));
    const sent = JSON.parse(authenticatedFetch.mock.calls[0][1].body);
    expect(sent).toMatchObject({ userId: 'u1', stage: 'strategy', interview: { skipped: false } });
    expect(sent.interview.rounds[0].askedAt).toBe(new Date(T0).toISOString());

    await act(async () => {
      first.send({ type: 'stage', stage: 'strategy' });
      first.send({ type: 'error', error: 'Ricerca interrotta: ornitorinco.', retryable: true });
      first.close();
      await flush();
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ kind: 'failed', resumeFrom: 'strategy', interview }));

    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(authenticatedFetch.mock.calls[1][1].body)).toMatchObject({ stage: 'strategy', interview: { skipped: false } });
    await act(async () => {
      retried.send({ type: 'done' });
      retried.close();
      await flush();
    });
    // The chain goes on without the interview: the later stages read it from the document.
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(3));
    expect(JSON.parse(authenticatedFetch.mock.calls[2][1].body)).toEqual({ userId: 'u1', stage: 'instruments' });
    await act(async () => {
      instruments.send({ type: 'done' });
      instruments.close();
      await flush();
    });
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(4));
    await act(async () => {
      review.send({ type: 'done' });
      review.close();
      await flush();
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ kind: 'done', interview }));
  });

  it('without an interview the strategy body carries null, as before', async () => {
    const strategy = sseResponse();
    authenticatedFetch.mockImplementation(() => Promise.resolve(strategy.response));
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useConsulenteRun('u1', vi.fn()), { wrapper });
    act(() => {
      result.current.start(answers);
    });
    expect(result.current.state).toMatchObject({ kind: 'running', interview: null });
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(authenticatedFetch.mock.calls[0][1].body)).toEqual({ userId: 'u1', stage: 'strategy', answers, interview: null });
    await act(async () => {
      strategy.send({ type: 'error', error: 'x', retryable: false });
      strategy.close();
      await flush();
    });
  });
});
