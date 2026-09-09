'use client';

/**
 * MILESTONE — «in che ordine arrivo?»: the goals with a target as a rail, the reached ones first
 * with a check, then the projected arrivals in order, then the goals the current pace never
 * reaches. A late goal keeps its projected date and carries the lateness under the row — the
 * deadline is never drawn as an arrival. The dot is the goal's identity colour.
 */

import { Check } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { MilestoneEntry } from '@/lib/utils/goalsSummary';
import { formatGoalDate } from '@/lib/utils/goalsNarrative';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { VERDICT_META } from '@/components/goals/goalVerdictMeta';

export interface MilestoneRow {
  entry: MilestoneEntry;
  /** The note under the row (the lateness, «mai, al ritmo attuale»), null when in time. */
  note: string | null;
}

interface MilestoneTileProps {
  reading: Narrative;
  aside: string;
  rows: MilestoneRow[];
  footer: Narrative;
  className?: string;
}

export function MilestoneTile({ reading, aside, rows, footer, className }: MilestoneTileProps) {
  return (
    <Tile eyebrow="Milestone" aside={aside} reading={reading} ariaLabel="Milestone" className={className}>
      {rows.length > 0 && (
        <ol className="mt-3.5 flex flex-col" aria-label="Ordine di raggiungimento">
          {rows.map(({ entry, note }, index) => {
            const last = index === rows.length - 1;
            return (
              <li key={entry.goalId} className={cn('relative flex gap-3.5', !last && 'pb-4')}>
                {!last && <span className="absolute bottom-0 left-[6px] top-[18px] w-px bg-border" aria-hidden="true" />}
                {entry.kind === 'reached' ? (
                  <span className="relative z-[1] mt-[3px] inline-flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-full bg-positive/15" aria-hidden="true">
                    <Check className="h-2.5 w-2.5 text-positive" strokeWidth={3} />
                  </span>
                ) : (
                  <span
                    className={cn('relative z-[1] mt-1 inline-block h-[11px] w-[11px] shrink-0 rounded-full border border-card', entry.kind === 'never' && 'opacity-50')}
                    style={{ background: entry.color }}
                    aria-hidden="true"
                  />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] text-foreground">{entry.name}</span>
                    {entry.kind === 'reached' ? (
                      <span className="shrink-0 text-[12px] font-medium text-positive">{VERDICT_META.reached.label}</span>
                    ) : entry.kind === 'dated' && entry.date ? (
                      <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-foreground">{formatGoalDate(entry.date, 'short')}</span>
                    ) : (
                      <span className="shrink-0 text-[12px] text-muted-foreground">—</span>
                    )}
                  </span>
                  {note && <span className="text-[11px] leading-[1.4] text-muted-foreground">{note}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
    </Tile>
  );
}
