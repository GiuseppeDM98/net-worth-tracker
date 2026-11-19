'use client';

/**
 * «Scrivi il piano operativo» (2026-11-19, doc/guide/consulente-piano.md): ONE request to the run
 * route with `stage: 'plan'`, read to its end, then the document reread so the page «Il piano
 * operativo» appears. Started from the click, like the run (`useConsulenteRun`), never from a
 * mount; a second click while one is in flight sends nothing. `error` is the stage's sentence or
 * the thrown one — a 429 or a network failure writes nothing on the document, so the row says it.
 */

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { requestPlanQuietly } from './useConsulenteRun';

export type ConsulentePlanState = 'idle' | 'running' | 'failed';

export function useConsulentePlan(ownerId: string) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConsulentePlanState>('idle');
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const write = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState('running');
    setError(null);
    // `requestPlanQuietly` never throws: a thrown request comes back as a failed outcome with its sentence.
    void requestPlanQuietly(ownerId, () => {})
      .then(async (result) => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.allocationAdvice.all(ownerId) });
        setState(result.ok ? 'idle' : 'failed');
        setError(result.ok ? null : result.error);
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [ownerId, queryClient]);

  return { state, error, write };
}
