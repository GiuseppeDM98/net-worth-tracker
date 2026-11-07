'use client';

/**
 * The rail beside the Consulente's scene (DESIGN.md → The Path-Scene Rule; AI-03, 2026-11-07):
 * where the reader is on the path, and, during the run, which stage is working. A strip above
 * the card below `desktop:`, a 160px column to its left at 1440 — ONE DOM, the breakpoint
 * decides (the names are `sr-only` on the strip).
 *
 * Path mode: one tick per step, the current one `aria-current="step"`; the interview's three
 * ticks (AI-04 passes them) light in the AI accent one round at a time and, while a round is on,
 * take the current step from the path. Run mode: four fills that scale in as their stage becomes
 * active — the accent while active, muted when done, destructive when failed; the list is
 * `aria-hidden` because the card's stage rows are what a screen reader reads. The ticks are not
 * buttons and carry no handler.
 */

import { cn } from '@/lib/utils';

export type PathRailStageState = 'done' | 'active' | 'pending' | 'failed';

export type PathRailProps =
  | {
      mode: 'path';
      steps: readonly string[];
      current: number;
      /** The interview's rounds (AI-04): `reached` is the ROUND number, 1-based — `2` is «Tornata 2 di 3» current, the first done; `null` before the interview opens (decision 86). */
      interview?: { total: 3; reached: number | null };
    }
  | { mode: 'run'; stages: readonly { label: string; state: PathRailStageState }[] };

const LIST_CLASS = 'flex gap-1 desktop:flex-col desktop:gap-2';
const STRIP_TICK_CLASS = 'h-1 flex-1 rounded-full desktop:h-4 desktop:w-1 desktop:flex-none';
const NAME_CLASS = 'sr-only desktop:not-sr-only desktop:text-[11px] desktop:leading-4';

function PathList({ steps, current, allDone }: { steps: readonly string[]; current: number; allDone: boolean }) {
  return (
    <ol aria-label="Il percorso" className={LIST_CLASS}>
      {steps.map((step, index) => {
        const isCurrent = !allDone && index === current;
        const done = allDone || index < current;
        return (
          <li key={step} aria-current={isCurrent ? 'step' : undefined} className="flex min-w-0 flex-1 items-center gap-2 desktop:flex-none">
            <span aria-hidden="true" className={cn(STRIP_TICK_CLASS, isCurrent ? 'bg-foreground' : done ? 'bg-foreground/50' : 'bg-border')} />
            <span className={cn(NAME_CLASS, isCurrent ? 'desktop:font-medium desktop:text-foreground' : 'desktop:text-muted-foreground')}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

function InterviewList({ total, reached }: { total: number; reached: number | null }) {
  const rounds = Array.from({ length: total }, (_, index) => index + 1);
  return (
    <ol aria-label="Il colloquio" aria-hidden={reached === null ? 'true' : undefined} className={cn(LIST_CLASS, 'mt-2 desktop:mt-4', reached === null && 'opacity-50')}>
      {rounds.map((round) => {
        const isCurrent = reached !== null && round === reached;
        const lit = reached !== null && round <= reached;
        return (
          <li key={round} aria-current={isCurrent ? 'step' : undefined} className="flex min-w-0 flex-1 items-center gap-2 desktop:flex-none">
            <span aria-hidden="true" className={cn(STRIP_TICK_CLASS, lit ? 'bg-[color:var(--ai-accent)]' : 'bg-border')} />
            <span className={cn(NAME_CLASS, isCurrent ? 'desktop:font-medium desktop:text-foreground' : 'desktop:text-muted-foreground')}>
              Tornata {round} di {total}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const FILL_COLOUR: Record<PathRailStageState, string> = {
  active: 'bg-[color:var(--ai-accent)]',
  done: 'bg-muted-foreground',
  failed: 'bg-destructive',
  pending: 'bg-border',
};

function RunList({ stages }: { stages: readonly { label: string; state: PathRailStageState }[] }) {
  return (
    <ol aria-label="Le fasi" aria-hidden="true" className={LIST_CLASS}>
      {stages.map((stage) => {
        const filled = stage.state !== 'pending';
        return (
          <li key={stage.label} data-state={stage.state} className="flex min-w-0 flex-1 items-center gap-2 desktop:flex-none">
            <span className={cn(STRIP_TICK_CLASS, 'relative overflow-hidden bg-border')}>
              <span
                data-fill=""
                className={cn(
                  'absolute inset-0 origin-left motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-spring desktop:origin-top',
                  filled ? 'scale-x-100 desktop:scale-y-100' : 'scale-x-0 desktop:scale-x-100 desktop:scale-y-0',
                  FILL_COLOUR[stage.state]
                )}
              />
            </span>
            <span className={cn(NAME_CLASS, stage.state === 'active' ? 'desktop:font-medium desktop:text-foreground' : 'desktop:text-muted-foreground')}>{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function PathRail(props: PathRailProps) {
  if (props.mode === 'run') {
    return (
      <nav aria-label="Dove sei" className="h-6 desktop:h-auto">
        <RunList stages={props.stages} />
      </nav>
    );
  }
  const interviewOn = props.interview !== undefined && props.interview.reached !== null;
  return (
    <nav aria-label="Dove sei" className="desktop:pt-1">
      <PathList steps={props.steps} current={props.current} allDone={interviewOn} />
      {props.interview && <InterviewList total={props.interview.total} reached={props.interview.reached} />}
    </nav>
  );
}
