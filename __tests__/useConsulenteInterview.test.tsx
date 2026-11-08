/**
 * `useConsulenteInterview` (components/allocation/consulente/useConsulenteInterview.ts, 2026-11-08):
 * one round per gesture — the `stage: 'interview'` body, the terminal `interview` event read back
 * through the stored schema (askedAt a Date), the route's `error` and a cut stream as failures,
 * `abort()` on «Salta il colloquio» ignoring what lands afterwards (criterion 9 of AI-04), a
 * second request while one runs ignored. The route is a mocked `authenticatedFetch`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useConsulenteInterview } from '@/components/allocation/consulente/useConsulenteInterview';
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
const answers = initialAnswers(null, null, []);
const EMPTY = { rounds: [], skipped: false };
const ROUND = {
  note: 'Vedo un reddito concentrato.',
  satisfied: false,
  questions: [{ id: 'reddito', kind: 'single', text: 'Quanto dipendi dal reddito?', why: "l'86% delle entrate", options: [{ value: 'si', label: 'Sì' }, { value: 'no', label: 'No' }], allowOther: true }],
  model: 'opus-finto',
  askedAt: '2026-11-08T11:00:00.000Z',
};

afterEach(() => {
  authenticatedFetch.mockReset();
});

describe('useConsulenteInterview', () => {
  it('posts stage interview with the answers, the rounds and the revision, and hands the round back with askedAt a Date and no answers', async () => {
    const stream = sseResponse();
    authenticatedFetch.mockResolvedValueOnce(stream.response);
    const { result } = renderHook(() => useConsulenteInterview('u1'));
    expect(result.current.state).toEqual({ kind: 'idle' });
    const onRound = vi.fn();

    act(() => {
      result.current.requestRound({ answers, interview: EMPTY, revision: { requests: 'niente ornitorinchi' } }, onRound);
    });
    expect(result.current.state).toEqual({ kind: 'asking' });
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(1));
    const [url, init] = authenticatedFetch.mock.calls[0];
    expect(url).toBe('/api/allocation-advice/run');
    expect(JSON.parse(init.body)).toEqual({ userId: 'u1', stage: 'interview', answers, interview: EMPTY, revision: { requests: 'niente ornitorinchi' } });
    expect(init.signal).toBeInstanceOf(AbortSignal);

    await act(async () => {
      stream.send({ type: 'interview', round: ROUND });
      stream.close();
      await flush();
    });
    await waitFor(() => expect(onRound).toHaveBeenCalledTimes(1));
    expect(onRound.mock.calls[0][0]).toMatchObject({ note: 'Vedo un reddito concentrated.'.replace('concentrated', 'concentrato'), model: 'opus-finto', answers: [] });
    expect(onRound.mock.calls[0][0].askedAt).toEqual(new Date('2026-11-08T11:00:00.000Z'));
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('omits the revision key when there is none, and ignores a second request while one runs', async () => {
    const stream = sseResponse();
    authenticatedFetch.mockResolvedValueOnce(stream.response);
    const { result } = renderHook(() => useConsulenteInterview('u1'));
    act(() => {
      result.current.requestRound({ answers, interview: EMPTY }, vi.fn());
      result.current.requestRound({ answers, interview: EMPTY }, vi.fn());
    });
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(authenticatedFetch.mock.calls[0][1].body)).toEqual({ userId: 'u1', stage: 'interview', answers, interview: EMPTY });
    await act(async () => {
      stream.send({ type: 'interview', round: ROUND });
      stream.close();
      await flush();
    });
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
  });

  it("fails with the route's error event, retryable as sent, and with the route's sentence on a non-ok status", async () => {
    const stream = sseResponse();
    authenticatedFetch.mockResolvedValueOnce(stream.response);
    const { result } = renderHook(() => useConsulenteInterview('u1'));
    act(() => {
      result.current.requestRound({ answers, interview: EMPTY }, vi.fn());
    });
    await act(async () => {
      stream.send({ type: 'error', error: 'Il modello non ha prodotto domande leggibili. Riprova.', retryable: true });
      stream.close();
      await flush();
    });
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'failed', error: 'Il modello non ha prodotto domande leggibili. Riprova.', retryable: true }));

    authenticatedFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Il colloquio ha già tre tornate: avvia la ricerca.' }), { status: 400 }));
    act(() => {
      result.current.requestRound({ answers, interview: EMPTY }, vi.fn());
    });
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'failed', error: 'Il colloquio ha già tre tornate: avvia la ricerca.', retryable: true }));
  });

  it('a stream that ends with no terminal event, and a round the schema refuses, are failures in the product\'s words', async () => {
    const cut = sseResponse();
    authenticatedFetch.mockResolvedValueOnce(cut.response);
    const { result } = renderHook(() => useConsulenteInterview('u1'));
    act(() => {
      result.current.requestRound({ answers, interview: EMPTY }, vi.fn());
    });
    await act(async () => {
      cut.close();
      await flush();
    });
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'failed', error: 'La tornata si è interrotta prima della fine. Riprova.', retryable: true }));

    const unreadable = sseResponse();
    authenticatedFetch.mockResolvedValueOnce(unreadable.response);
    const onRound = vi.fn();
    act(() => {
      result.current.requestRound({ answers, interview: EMPTY }, onRound);
    });
    await act(async () => {
      unreadable.send({ type: 'interview', round: { ...ROUND, model: '' } });
      unreadable.close();
      await flush();
    });
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'failed', error: 'Il Consulente ha risposto in una forma che non leggo. Riprova.', retryable: true }));
    expect(onRound).not.toHaveBeenCalled();
  });

  it('abort() goes back to idle, aborts the request\'s signal and ignores the round that lands afterwards (criterion 9)', async () => {
    const stream = sseResponse();
    authenticatedFetch.mockResolvedValueOnce(stream.response);
    const { result } = renderHook(() => useConsulenteInterview('u1'));
    const onRound = vi.fn();
    act(() => {
      result.current.requestRound({ answers, interview: EMPTY }, onRound);
    });
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(1));
    const signal: AbortSignal = authenticatedFetch.mock.calls[0][1].signal;
    expect(signal.aborted).toBe(false);

    act(() => {
      result.current.abort();
    });
    expect(result.current.state).toEqual({ kind: 'idle' });
    expect(signal.aborted).toBe(true);

    await act(async () => {
      stream.send({ type: 'interview', round: ROUND });
      stream.close();
      await flush();
    });
    expect(onRound).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ kind: 'idle' });

    // A new round can start right away.
    const next = sseResponse();
    authenticatedFetch.mockResolvedValueOnce(next.response);
    act(() => {
      result.current.requestRound({ answers, interview: EMPTY }, onRound);
    });
    expect(result.current.state).toEqual({ kind: 'asking' });
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(2));
    await act(async () => {
      next.send({ type: 'interview', round: ROUND });
      next.close();
      await flush();
    });
    await waitFor(() => expect(onRound).toHaveBeenCalledTimes(1));
  });

  it('an unmount mid-round aborts the request and drops its outcome', async () => {
    const stream = sseResponse();
    authenticatedFetch.mockResolvedValueOnce(stream.response);
    const { result, unmount } = renderHook(() => useConsulenteInterview('u1'));
    const onRound = vi.fn();
    act(() => {
      result.current.requestRound({ answers, interview: EMPTY }, onRound);
    });
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(1));
    const signal: AbortSignal = authenticatedFetch.mock.calls[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      stream.send({ type: 'interview', round: ROUND });
      stream.close();
      await flush();
    });
    expect(onRound).not.toHaveBeenCalled();
  });
});
