'use client';

/**
 * «Chiedi una modifica» on a finished report (2026-10-20): ONE request to the run route with
 * `stage: 'revise'`, the user's words and, since 2026-11-08, the round of questions the
 * Consulente asked about them (`useConsulenteInterview`, or `{ rounds: [], skipped: true }`) —
 * the review again, on the same strategy and instruments — read to its end, then the document
 * reread so the report shows the revision. Started from the click, like the run
 * (`useConsulenteRun`), never from a mount.
 */

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import type { AllocationAdviceInterview } from '@/types/allocationAdvice';
import { requestStage } from './useConsulenteRun';

export type ConsulenteRevisionState = { kind: 'idle' } | { kind: 'running' } | { kind: 'failed'; error: string };

export function useConsulenteRevision(ownerId: string) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConsulenteRevisionState>({ kind: 'idle' });
  const inFlight = useRef(false);

  const revise = useCallback(
    (request: string, interview: AllocationAdviceInterview | null, onDone: () => void) => {
      if (inFlight.current || request.trim() === '') return;
      inFlight.current = true;
      setState({ kind: 'running' });

      const run = async () => {
        const result = await requestStage(ownerId, { stage: 'revise', request, interview }, () => {});
        await queryClient.invalidateQueries({ queryKey: queryKeys.allocationAdvice.all(ownerId) });
        if (result.ok) {
          setState({ kind: 'idle' });
          onDone();
          return;
        }
        setState({ kind: 'failed', error: result.error });
      };

      run()
        .catch((error: unknown) => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.allocationAdvice.all(ownerId) });
          setState({ kind: 'failed', error: error instanceof Error ? error.message : 'Impossibile rivedere il report' });
        })
        .finally(() => {
          inFlight.current = false;
        });
    },
    [ownerId, queryClient]
  );

  return { state, revise };
}
