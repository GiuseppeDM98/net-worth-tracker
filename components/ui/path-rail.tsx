'use client';

/**
 * The rail beside the Consulente's scene (DESIGN.md → The Path-Scene Rule, 2026-11-07):
 * where the reader is on the path, and, during the run, which stage is working. A strip above
 * the card below `desktop:`, a 160px column to its left at 1440 — ONE DOM, the breakpoint
 * decides (the names are `sr-only` on the strip).
 *
 * Path mode: one tick per step, the current one `aria-current="step"`; the interview's three
 * ticks (the interview passes them) light in the AI accent one round at a time and, while a round is on,
 * take the current step from the path. Run mode: four fills that scale in as their stage becomes
 * active — the accent while active, muted when done, destructive when failed; the list is
 * `aria-hidden` because the card's stage rows are what a screen reader reads, and its wrapper is a
 * plain div, not a landmark. The strip is 24px tall in both modes, so the card stays put when the
 * run replaces the path (2026-11-07). In the path and the run the ticks are not buttons and carry no
 * handler. In the book the rail IS a control from `desktop:` (2026-11-08): the labels are buttons,
 * one Tab stop; below it the ticks stay 4px and the «Indice» button is the jump.
 */

import { cn } from '@/lib/utils';
import { useRovingFocus } from '@/lib/hooks/useRovingFocus';

export type PathRailStageState = 'done' | 'active' | 'pending' | 'failed';

export type PathRailProps =
  | {
      mode: 'path';
      steps: readonly string[];
      current: number;
      /** The interview's rounds: `reached` is the ROUND number, 1-based — `2` is «Tornata 2 di 3» current, the first done; `null` before the interview opens (2026-11-07). */
      interview?: { total: 3; reached: number | null };
    }
  | { mode: 'run'; stages: readonly { label: string; state: PathRailStageState }[] }
  | {
      mode: 'book';
      pages: readonly { id: string; title: string }[];
      current: number;
      /** The labels are buttons (the host passes `!useCompactLayout()`); without it plain items, the 4px ticks never a target. */
      interactive: boolean;
      onSelect: (index: number) => void;
    };

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

/** The tick of a book page: the current in ink, the ones read in half ink, the ones ahead in the border's grey. */
function bookTickClass(index: number, current: number): string {
  return cn(STRIP_TICK_CLASS, index === current ? 'bg-foreground' : index < current ? 'bg-foreground/50' : 'bg-border');
}

/**
 * The book's pages (2026-11-08). Interactive: each label a button — the dense-list floor of 32px,
 * 44px under a coarse pointer —, the list ONE Tab stop (the arrows move along the rail, Enter
 * opens). Not interactive: plain items, the current one `aria-current="page"`.
 */
function BookList({ pages, current, interactive, onSelect }: { pages: readonly { id: string; title: string }[]; current: number; interactive: boolean; onSelect: (index: number) => void }) {
  const roving = useRovingFocus(pages.length, 'vertical');
  if (!interactive) {
    return (
      <ol aria-label="Le pagine" className={LIST_CLASS}>
        {pages.map((page, index) => (
          <li key={page.id} aria-current={index === current ? 'page' : undefined} className="flex min-w-0 flex-1 items-center gap-2 desktop:flex-none">
            <span aria-hidden="true" className={bookTickClass(index, current)} />
            <span className={cn(NAME_CLASS, index === current ? 'desktop:font-medium desktop:text-foreground' : 'desktop:text-muted-foreground')}>{page.title}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol aria-label="Le pagine" className={cn(LIST_CLASS, 'desktop:gap-0.5')} {...roving.containerProps}>
      {pages.map((page, index) => {
        const isCurrent = index === current;
        return (
          <li key={page.id} className="flex min-w-0 flex-1 desktop:flex-none">
            <button
              type="button"
              {...roving.itemProps(index)}
              // The Tab stop is the page on screen, not the last one the arrows visited: Tab into the rail lands where the reader is.
              tabIndex={isCurrent ? 0 : -1}
              aria-current={isCurrent ? 'page' : undefined}
              onClick={() => onSelect(index)}
              className={cn(
                'flex w-full min-w-0 items-center gap-2 rounded-md text-left min-h-8 [@media(pointer:coarse)]:min-h-11',
                'outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
            >
              <span aria-hidden="true" className={bookTickClass(index, current)} />
              <span className={NAME_CLASS}>{page.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** ONE height below `desktop:` for both modes: the card does not move when the run replaces the path (2026-11-07). */
const STRIP_CLASS = 'h-6 desktop:h-auto';

export function PathRail(props: PathRailProps) {
  if (props.mode === 'run') {
    // A div, not a landmark: the list inside is `aria-hidden`, and a «Dove sei» navigation with nothing to read would still be listed (2026-11-07).
    return (
      <div className={STRIP_CLASS}>
        <RunList stages={props.stages} />
      </div>
    );
  }
  if (props.mode === 'book') {
    return (
      <nav aria-label="Dove sei" className={cn(STRIP_CLASS, 'desktop:pt-1')}>
        <BookList pages={props.pages} current={props.current} interactive={props.interactive} onSelect={props.onSelect} />
      </nav>
    );
  }
  const interviewOn = props.interview !== undefined && props.interview.reached !== null;
  return (
    <nav aria-label="Dove sei" className={cn(STRIP_CLASS, 'desktop:pt-1')}>
      <PathList steps={props.steps} current={props.current} allDone={interviewOn} />
      {props.interview && <InterviewList total={props.interview.total} reached={props.interview.reached} />}
    </nav>
  );
}
