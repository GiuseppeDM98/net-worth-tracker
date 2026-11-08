'use client';

/**
 * One ROUND of the interview as state started from a gesture (2026-11-08, doc/guide/consulente.md § The path):
 * «Avvia il colloquio», «Continua», «Riprova» and «Rivedi il report» call `requestRound`, which sends
 * the route ONE `stage: 'interview'` request and reads its SSE stream to the terminal event — the
 * round (`interview`) or the product's sentence (`error`). The round crosses JSON, so it is read
 * back through `interviewRoundStoredSchema` (`askedAt` to a Date), never trusted as typed.
 *
 * «Salta il colloquio» and an unmount call `abort()`: the fetch is aborted through its
 * `AbortController`, the state goes back to `idle`, and every later event or rejection of that
 * request is ignored (`signal.aborted` checked first). The slot the route took is spent.
 *
 * Not an effect, by the lesson in `useConsulenteRun.ts`: a request that spends belongs to the click
 * that asked for it. The only effect here aborts on unmount. Promise chains, no `try … finally`:
 * the React Compiler skips a hook that holds one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { forEachSseEvent } from '@/lib/utils/sseReader';
import { interviewRoundStoredSchema, type AllocationAdviceAnswers } from '@/lib/utils/allocationAdviceProposal';
import type { AllocationAdviceInterview, AllocationAdviceInterviewRound, AllocationAdviceRunEvent } from '@/types/allocationAdvice';

export type ConsulenteInterviewState = { kind: 'idle' } | { kind: 'asking' } | { kind: 'failed'; error: string; retryable: boolean };

export interface InterviewRoundPayload {
  answers: AllocationAdviceAnswers;
  interview: AllocationAdviceInterview;
  /** «Chiedi una modifica»: the ONE round about the written request. */
  revision?: { requests: string } | null;
}

const UNREADABLE = 'Il Consulente ha risposto in una forma che non leggo. Riprova.';
const CUT_SHORT = 'La tornata si è interrotta prima della fine. Riprova.';
const NOT_STARTED = 'Impossibile avviare il colloquio del Consulente';

/** The response's body, or the route's own sentence (a 400, a 429, a 503) as a failure. */
async function openRoundBody(response: Response): Promise<ReadableStream<Uint8Array>> {
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? NOT_STARTED);
  }
  return response.body;
}

type RoundOutcome = { ok: true; round: AllocationAdviceInterviewRound } | { ok: false; error: string; retryable: boolean };

/** One round's request, read to its end: the terminal `interview` or `error`; a stream that ends with neither is a cut. */
async function requestRoundOnce(ownerId: string, payload: InterviewRoundPayload, signal: AbortSignal): Promise<RoundOutcome> {
  const response = await authenticatedFetch('/api/allocation-advice/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: ownerId, stage: 'interview', answers: payload.answers, interview: payload.interview, ...(payload.revision ? { revision: payload.revision } : {}) }),
    signal,
  });
  const body = await openRoundBody(response);
  const outcome: { value: RoundOutcome } = { value: { ok: false, error: CUT_SHORT, retryable: true } };
  await forEachSseEvent<AllocationAdviceRunEvent>(body, (event) => {
    if (event.type === 'interview') {
      const parsed = interviewRoundStoredSchema.safeParse({ ...event.round, answers: [] });
      outcome.value = parsed.success ? { ok: true, round: parsed.data } : { ok: false, error: UNREADABLE, retryable: true };
    }
    if (event.type === 'error') outcome.value = { ok: false, error: event.error, retryable: event.retryable ?? true };
  });
  return outcome.value;
}

export function useConsulenteInterview(ownerId: string) {
  const [state, setState] = useState<ConsulenteInterviewState>({ kind: 'idle' });
  // The request in flight, aborted by «Salta il colloquio» or the unmount; null between requests.
  const inFlight = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    const current = inFlight.current;
    if (!current) return;
    inFlight.current = null;
    current.abort();
    setState({ kind: 'idle' });
  }, []);

  // The only effect: a scene left mid-round does not let the round land on an unmounted hook.
  useEffect(() => abort, [abort]);

  const requestRound = useCallback(
    (payload: InterviewRoundPayload, onRound: (round: AllocationAdviceInterviewRound) => void) => {
      // One round at a time: a second request while one runs is ignored.
      if (inFlight.current) return;
      const controller = new AbortController();
      inFlight.current = controller;
      setState({ kind: 'asking' });
      const { signal } = controller;

      requestRoundOnce(ownerId, payload, signal)
        .then((outcome) => {
          if (signal.aborted) return;
          inFlight.current = null;
          if (outcome.ok) {
            setState({ kind: 'idle' });
            onRound(outcome.round);
            return;
          }
          setState({ kind: 'failed', error: outcome.error, retryable: outcome.retryable });
        })
        .catch((error: unknown) => {
          if (signal.aborted) return;
          inFlight.current = null;
          setState({ kind: 'failed', error: error instanceof Error ? error.message : NOT_STARTED, retryable: true });
        });
    },
    [ownerId]
  );

  return { state, requestRound, abort };
}
