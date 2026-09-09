'use client';

import { ChevronRight } from 'lucide-react';
import type { AssistantMemoryDocument, AssistantMemoryItem } from '@/types/assistant';
import { describeGoalProgress, describeMemory, type GoalProgressReading } from '@/lib/utils/assistantNarrative';
import { Tile } from '@/components/ui/tile';
import { cn } from '@/lib/utils';

interface MemoriaTileProps {
  memory: AssistantMemoryDocument | undefined;
  /** Opens the Memoria sheet — the one place where items are managed. */
  onOpenMemory: () => void;
}

/** How many of the other facts the footer previews before the count takes over. */
const FACTS_PREVIEW = 3;

const PROGRESS_CLASS: Record<GoalProgressReading['kind'], string> = {
  reached: 'text-[11px] font-medium text-positive',
  progress: 'font-mono text-[11px] tabular-nums text-muted-foreground',
  untracked: 'text-[11px] text-muted-foreground/70',
};

/** One active goal as a flat row: the text, then how it stood at the last check. */
function GoalRow({ goal }: { goal: AssistantMemoryItem }) {
  const progress = describeGoalProgress(goal.lastEvaluationResult);
  return (
    <li className="flex items-center justify-between gap-3 py-[9px]">
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground" title={goal.text}>
        {goal.text}
      </span>
      <span className={cn('shrink-0', PROGRESS_CLASS[progress.kind])}>{progress.text}</span>
    </li>
  );
}

/**
 * «Cosa sa di te» — the companion's extract of the memory: every active goal with its last
 * evaluation (computed server-side against the current month; the row recomputes nothing) and
 * a preview of the other facts. Read-only by design: managing items stays in the sheet.
 */
export function MemoriaTile({ memory, onOpenMemory }: MemoriaTileProps) {
  const activeItems = (memory?.items ?? []).filter((item) => item.status === 'active');
  const goals = activeItems.filter((item) => item.category === 'goal');
  const others = activeItems.filter((item) => item.category !== 'goal');
  const reached = goals.filter((goal) => goal.lastEvaluationResult?.matched).length;

  const aside =
    activeItems.length === 0
      ? undefined
      : [goals.length > 0 && `${goals.length} ${goals.length === 1 ? 'obiettivo' : 'obiettivi'}`, others.length > 0 && `${others.length} ${others.length === 1 ? 'fatto' : 'fatti'}`]
          .filter(Boolean)
          .join(' · ');

  return (
    <Tile
      eyebrow="Cosa sa di te"
      aside={aside}
      reading={describeMemory({ activeGoals: goals.length, reachedGoals: reached, otherFacts: others.length })}
    >
      {goals.length > 0 && (
        <ul className="mt-3 divide-y divide-border" aria-label="Obiettivi attivi">
          {goals.map((goal) => (
            <GoalRow key={goal.id} goal={goal} />
          ))}
        </ul>
      )}

      {activeItems.length > 0 && (
        <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-border pt-3.5">
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            {others.length > 0
              ? `${others
                  .slice(0, FACTS_PREVIEW)
                  .map((item) => item.text)
                  .join(' · ')}${others.length > FACTS_PREVIEW ? ` · +${others.length - FACTS_PREVIEW}` : ''}`
              : 'Nessun altro fatto oltre agli obiettivi'}
          </span>
          <button
            type="button"
            onClick={onOpenMemory}
            className="inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:min-h-0"
          >
            Apri memoria
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}
    </Tile>
  );
}
