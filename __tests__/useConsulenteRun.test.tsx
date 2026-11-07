/**
 * `useConsulenteRun` (components/allocation/consulente/useConsulenteRun.ts, AI-03): the stage's
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
});
