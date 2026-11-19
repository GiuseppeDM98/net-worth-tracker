/**
 * The operating plan from the client (2026-11-19): `useConsulentePlan` — «Scrivi il piano
 * operativo» sends ONE request however many clicks, and says a failed or thrown request in its
 * sentence — and the plan `useConsulenteRevision` asks after a revision, which never fails it.
 * The route is a mocked `authenticatedFetch` answering SSE streams the test feeds.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConsulentePlan } from '@/components/allocation/consulente/useConsulentePlan';
import { useConsulenteRevision } from '@/components/allocation/consulente/useConsulenteRevision';

const { authenticatedFetch } = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch }));

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
function wrapperOf(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  authenticatedFetch.mockReset();
});

describe('useConsulentePlan', () => {
  // Mutation: the in-flight ref dropped.
  it('two write() in a row send one request; the done event returns to idle and rereads the document', async () => {
    const plan = sseResponse();
    authenticatedFetch.mockImplementation(() => Promise.resolve(plan.response));
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useConsulentePlan('u1'), { wrapper: wrapperOf(client) });

    act(() => {
      result.current.write();
      result.current.write();
    });
    expect(result.current.state).toBe('running');
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(authenticatedFetch.mock.calls[0][1].body)).toEqual({ userId: 'u1', stage: 'plan' });
    await act(async () => {
      plan.send({ type: 'done' });
      plan.close();
      await flush();
    });
    await waitFor(() => expect(result.current.state).toBe('idle'));
    expect(result.current.error).toBeNull();
    expect(invalidate).toHaveBeenCalled();
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
  });

  it('a thrown request is failed with its sentence; an error event with the stage\'s', async () => {
    authenticatedFetch.mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ error: "Hai fatto troppe richieste al Consulente in un'ora. Riprova più tardi." }), { status: 429 })));
    const client = new QueryClient();
    const { result } = renderHook(() => useConsulentePlan('u1'), { wrapper: wrapperOf(client) });
    act(() => {
      result.current.write();
    });
    await waitFor(() => expect(result.current.state).toBe('failed'));
    expect(result.current.error).toBe("Hai fatto troppe richieste al Consulente in un'ora. Riprova più tardi.");

    const plan = sseResponse();
    authenticatedFetch.mockImplementationOnce(() => Promise.resolve(plan.response));
    act(() => {
      result.current.write();
    });
    expect(result.current.state).toBe('running');
    expect(result.current.error).toBeNull();
    await act(async () => {
      plan.send({ type: 'error', error: 'Il Consulente non ha scritto un piano leggibile.', retryable: true });
      plan.close();
      await flush();
    });
    await waitFor(() => expect(result.current.state).toBe('failed'));
    expect(result.current.error).toBe('Il Consulente non ha scritto un piano leggibile.');
  });
});

describe('useConsulenteRevision asks the plan after the revision (2026-11-19)', () => {
  // Mutation: the plan request dropped after the revise.
  it('after a revise that ended ok it requests the plan, and returns idle with onDone whatever the plan says', async () => {
    const revise = sseResponse();
    authenticatedFetch
      .mockImplementationOnce(() => Promise.resolve(revise.response))
      .mockImplementationOnce(() => Promise.reject(new Error('rete giù')));
    const client = new QueryClient();
    const onDone = vi.fn();
    const { result } = renderHook(() => useConsulenteRevision('u1'), { wrapper: wrapperOf(client) });
    act(() => {
      result.current.revise('meno cripto', null, onDone);
    });
    await act(async () => {
      revise.send({ type: 'done' });
      revise.close();
      await flush();
    });
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(authenticatedFetch.mock.calls[1][1].body)).toEqual({ userId: 'u1', stage: 'plan' });
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'idle' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a revise that failed asks no plan', async () => {
    const revise = sseResponse();
    authenticatedFetch.mockImplementationOnce(() => Promise.resolve(revise.response));
    const client = new QueryClient();
    const { result } = renderHook(() => useConsulenteRevision('u1'), { wrapper: wrapperOf(client) });
    act(() => {
      result.current.revise('meno cripto', null, vi.fn());
    });
    await act(async () => {
      revise.send({ type: 'error', error: 'Revisione interrotta.', retryable: true });
      revise.close();
      await flush();
    });
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'failed', error: 'Revisione interrotta.' }));
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
  });
});
