'use client';

/**
 * The RUN as state started from a gesture (2026-10-20): «Avvia la ricerca» calls `start`, which
 * sends the route ONE request per stage (strategy · instruments · review — Vercel's Hobby plan
 * stops a function at 300 s, a whole run is about five minutes at effort `medium` (2026-10-23)), reading each SSE stream to
 * its `done` before the next, and moves `state` stage by stage. A stage that fails or is cut is
 * remembered as `resumeFrom`: «Riprova» (`retry`) restarts there, on the persisted document,
 * never from scratch.
 *
 * Not an effect, by lesson: a first cut started the stream in a `useEffect` with a ref guard,
 * and React's StrictMode (dev) mounted the effect twice — the guard kept the FIRST closure, whose
 * cleanup had already flagged it cancelled, so every event was dropped and the page stayed on
 * «Avvio il percorso» while the server finished the run. A request that spends minutes and money
 * belongs to the click that asked for it, never to a mount.
 */

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { forEachSseEvent } from '@/lib/utils/sseReader';
import { queryKeys } from '@/lib/query/queryKeys';
import { ALLOCATION_ADVICE_RUN_STAGES, type AllocationAdviceRunEvent, type AllocationAdviceRunStage, type AllocationAdviceStage } from '@/types/allocationAdvice';
import type { AllocationAdviceAnswers } from '@/lib/utils/allocationAdviceProposal';

export type ConsulenteRunState =
  | { kind: 'idle' }
  | { kind: 'running'; answers: AllocationAdviceAnswers; stage: AllocationAdviceStage | null }
  | { kind: 'failed'; answers: AllocationAdviceAnswers; error: string; retryable: boolean; resumeFrom: AllocationAdviceRunStage }
  | { kind: 'done'; answers: AllocationAdviceAnswers };

/** The response's body, or the route's own sentence as a failure. */
async function openRunBody(response: Response): Promise<ReadableStream<Uint8Array>> {
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? 'Impossibile avviare il percorso del Consulente');
  }
  return response.body;
}

const CUT_SHORT = 'La corsa si è interrotta prima della fine. Riprova: riparte dalla fase rimasta a metà.';

export type StageOutcome = { ok: true } | { ok: false; error: string; retryable: boolean };

/** One stage's request, read to its end: `done` to go on, `error` or a cut to stop there. */
export async function requestStage(
  ownerId: string,
  payload: { stage: AllocationAdviceRunStage; answers?: AllocationAdviceAnswers; request?: string },
  onStage: (stage: AllocationAdviceStage) => void
): Promise<StageOutcome> {
  const response = await authenticatedFetch('/api/allocation-advice/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: ownerId, ...payload }),
  });
  const body = await openRunBody(response);
  // The terminal event, read after the stream closes: a stream that ends without one is a
  // stage the platform cut — the document says where (the query rereads it).
  const outcome: { value: StageOutcome } = { value: { ok: false, error: CUT_SHORT, retryable: true } };
  await forEachSseEvent<AllocationAdviceRunEvent>(body, (event) => {
    if (event.type === 'stage') onStage(event.stage);
    if (event.type === 'done') outcome.value = { ok: true };
    if (event.type === 'error') outcome.value = { ok: false, error: event.error, retryable: event.retryable ?? true };
  });
  return outcome.value;
}

export function useConsulenteRun(ownerId: string, onFinished: () => void) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConsulenteRunState>({ kind: 'idle' });
  // One stream at a time: a second `start` while one runs is ignored.
  const inFlight = useRef(false);

  const start = useCallback(
    (answers: AllocationAdviceAnswers, from: AllocationAdviceRunStage = 'strategy') => {
      if (inFlight.current) return;
      inFlight.current = true;
      // The chain's stages are run stages too; `revise` never starts here.
      setState({ kind: 'running', answers, stage: from === 'strategy' || from === 'revise' ? null : from });

      const run = async () => {
        const stages = ALLOCATION_ADVICE_RUN_STAGES.slice(ALLOCATION_ADVICE_RUN_STAGES.indexOf(from));
        let outcome: ConsulenteRunState = { kind: 'done', answers };
        for (const stage of stages) {
          const result = await requestStage(ownerId, stage === 'strategy' ? { stage, answers } : { stage }, (reached) => setState({ kind: 'running', answers, stage: reached }));
          // The report's query rereads after every stage: a reload mid-run shows what landed.
          await queryClient.invalidateQueries({ queryKey: queryKeys.allocationAdvice.all(ownerId) });
          if (!result.ok) {
            outcome = { kind: 'failed', answers, error: result.error, retryable: result.retryable, resumeFrom: stage };
            break;
          }
        }
        setState(outcome);
        if (outcome.kind === 'done') onFinished();
      };

      run()
        .catch((error: unknown) => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.allocationAdvice.all(ownerId) });
          setState({ kind: 'failed', answers, error: error instanceof Error ? error.message : 'Impossibile avviare il percorso del Consulente', retryable: true, resumeFrom: from });
        })
        .finally(() => {
          inFlight.current = false;
        });
    },
    [ownerId, onFinished, queryClient]
  );

  /** After a failure: the same answers, from the stage that failed. */
  const retry = useCallback(() => {
    if (state.kind !== 'failed') return;
    start(state.answers, state.resumeFrom);
  }, [state, start]);

  const reset = useCallback(() => setState({ kind: 'idle' }), []);

  return { state, start, retry, reset };
}
