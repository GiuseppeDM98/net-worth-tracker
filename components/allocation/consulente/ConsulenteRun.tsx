'use client';

/**
 * The RUN's screen: the four stages as rows that light up in turn, the page's one live region
 * saying which is on, the rail's fills beside the card (2026-11-07). Presentational —
 * the stream and its state are `useConsulenteRun`, started by the gesture that asked for the
 * run; a drop of the connection leaves the document where the run was, and the query that
 * reads it (`useAllocationAdvice`) rereads so the report shows what landed.
 *
 * The active row shows what the stage usually takes («di solito ~2 min») and the time it has
 * taken, counted from `stageStartedAt` on this browser; the elapsed is `aria-hidden` and the
 * headline stays the ONE live region — a clock announced every second would be noise.
 */

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { AllocationAdviceStage } from '@/types/allocationAdvice';
import { STAGE_COPY, describeRunHeadline, describeStageTypical } from '@/lib/utils/allocationAdviceNarrative';
import { runStageStates, stageOfRunStage, type StageRowState } from '@/lib/utils/allocationAdviceDocument';
import { AI_CONTROL_ACCENT_CLASS, AI_GENERATED_SURFACE_CLASS } from '@/lib/constants/aiAccent';
import { TILE_EYEBROW_CLASS, TILE_SURFACE_CLASS } from '@/components/ui/tile';
import { PathRail } from '@/components/ui/path-rail';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ConsulenteRunState } from './useConsulenteRun';

interface ConsulenteRunProps {
  state: Exclude<ConsulenteRunState, { kind: 'idle' }>;
  /** Starts the run again on the same answers, from the stage that failed, after a retryable failure. */
  onRetry: () => void;
  /** Back to the summary after a failure. */
  onBack: () => void;
}

/** The wrapper of the rail and the card: one column below `desktop:`, the 160px rail beside the 720px card at 1440 (The Path-Scene Rule). */
export const SCENE_GRID_CLASS = 'mx-auto grid w-full max-w-[720px] grid-cols-1 gap-4 desktop:max-w-[900px] desktop:grid-cols-[160px_1fr]';
/** The scene's card: the tile surface, clipped on x so the sliding body never shows a scrollbar (the fields' focus rings sit inside the padding). */
export const SCENE_CARD_CLASS = 'mx-auto w-full max-w-[720px] overflow-x-clip p-5 desktop:p-6';

const STATE_WORD: Record<StageRowState, string | null> = { done: ', fatto', active: ', in corso', failed: ', non riuscito', pending: null };

/**
 * «m:ss» of `now - since`; '' while there is nothing to count. The clock ticks once a second from
 * the mount; a stage that starts between two ticks reads 0:00 until the next (no setState in the
 * effect's body: `react-hooks/set-state-in-effect`).
 */
function useElapsed(since: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  if (since === null) return '';
  const seconds = Math.floor(Math.max(0, now - since) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * The stage rows: an icon, the stage's words, what it usually takes and — on the active row —
 * how long it has been going. The active row is a generated surface (DESIGN.md → The AI-Accent
 * Rule): a 1px accent frame laid over the list's lines in its band (decision 84).
 */
export function StageRows({ rows, elapsed }: { rows: readonly { stage: AllocationAdviceStage; state: StageRowState }[]; elapsed?: string }) {
  return (
    <ol aria-label="Le fasi" className="divide-y divide-border rounded-xl border border-border">
      {rows.map(({ stage, state }) => {
        const typical = describeStageTypical(stage);
        const active = state === 'active';
        return (
          <li
            key={stage}
            data-state={state}
            className={cn('flex items-start gap-3 px-4 py-3', active && cn('relative z-[1] -m-px border first:rounded-t-xl last:rounded-b-xl', AI_GENERATED_SURFACE_CLASS))}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
              {state === 'done' ? (
                <Check className="h-4 w-4 text-positive" />
              ) : active ? (
                <Loader2 className="h-4 w-4 animate-spin text-foreground" />
              ) : (
                <span className={cn('h-2 w-2 rounded-full', state === 'failed' ? 'bg-destructive' : 'bg-border')} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-[14px] font-medium', state === 'pending' ? 'text-muted-foreground' : 'text-foreground')}>
                {STAGE_COPY[stage].label}
                {STATE_WORD[state] && <span className="sr-only">{STATE_WORD[state]}</span>}
              </p>
              <p className="text-[13px] leading-[1.45] text-muted-foreground">{STAGE_COPY[stage].detail}</p>
            </div>
            {(typical || (active && elapsed)) && (
              <span className="shrink-0 pt-0.5 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                {typical}
                {active && elapsed && (
                  <span aria-hidden="true" className="block text-foreground">
                    {elapsed}
                  </span>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function ConsulenteRun({ state, onRetry, onBack }: ConsulenteRunProps) {
  const stage = state.kind === 'running' ? state.stage : null;
  const elapsed = useElapsed(state.kind === 'running' ? state.stageStartedAt : null);
  const rows = runStageStates(
    state.kind === 'failed' ? { status: 'failed', stage: stageOfRunStage(state.resumeFrom) } : state.kind === 'done' ? { status: 'done', stage: null } : { status: 'running', stage }
  );

  return (
    <div className={SCENE_GRID_CLASS}>
      <PathRail mode="run" stages={rows.map((row) => ({ label: STAGE_COPY[row.stage].label, state: row.state }))} />
      <section className={cn(TILE_SURFACE_CLASS, SCENE_CARD_CLASS)} aria-label="Corsa del Consulente">
        <h2 className={TILE_EYEBROW_CLASS}>Consulente · in corso</h2>
        <p className="mt-3 text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground desktop:text-[30px]" role="status" aria-live="polite">
          {state.kind === 'failed' ? 'Il percorso non si è concluso.' : state.kind === 'done' ? 'La proposta è pronta.' : describeRunHeadline(stage)}
        </p>
        {state.kind === 'failed' && <p className="mt-2 text-[14px] leading-[1.6] text-destructive">{state.error}</p>}
        <div className="mt-5">
          <StageRows rows={rows} elapsed={state.kind === 'running' ? elapsed : undefined} />
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Puoi lasciare la pagina: ogni fase viene salvata appena finisce.</p>
        {state.kind === 'failed' && (
          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 tablet:flex-row tablet:justify-between">
            <Button type="button" variant="outline" className="h-11 desktop:h-9" onClick={onBack}>
              Torna al riepilogo
            </Button>
            {state.retryable && (
              <Button type="button" className={cn('h-11 border border-transparent desktop:h-9', AI_CONTROL_ACCENT_CLASS)} onClick={onRetry}>
                Riprova
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
