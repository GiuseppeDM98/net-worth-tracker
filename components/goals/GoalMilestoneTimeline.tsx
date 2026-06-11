/**
 * GoalMilestoneTimeline (B4) — the order in which goals will be reached.
 *
 * A vertical, flat timeline sequencing goals by their projected completion date (falling back
 * to the target date when no contribution drives a projection). Already-reached goals lead as
 * completed. Motivational framing on data already derived — answers "what comes next, and when".
 *
 * Renders null unless there are at least two datable entries (otherwise it isn't a sequence).
 */

'use client';

import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { GoalRow } from '@/lib/utils/goalTrajectory';
import { formatShortMonthYear, VERDICT_META } from './goalVerdictMeta';

interface TimelineEntry {
  id: string;
  name: string;
  color: string;
  done: boolean;
  /** Epoch ms for ordering; null when done. */
  ts: number | null;
  dateLabel: string | null;
  isProjection: boolean;
}

export function GoalMilestoneTimeline({ rows }: { rows: GoalRow[] }) {
  const entries = useMemo<TimelineEntry[]>(() => {
    const out: TimelineEntry[] = [];
    for (const { goal, trajectory } of rows) {
      if (trajectory.verdict === 'reached') {
        out.push({ id: goal.id, name: goal.name, color: goal.color, done: true, ts: null, dateLabel: null, isProjection: false });
        continue;
      }
      // Prefer the projected completion; fall back to the explicit target date.
      let ts: number | null = trajectory.projectedDate ? trajectory.projectedDate.getTime() : null;
      let isProjection = ts != null;
      if (ts == null && goal.targetDate) {
        ts = new Date(goal.targetDate).getTime();
        isProjection = false;
      }
      if (ts == null) continue; // open-ended / unreachable — not on the timeline
      out.push({
        id: goal.id,
        name: goal.name,
        color: goal.color,
        done: false,
        ts,
        dateLabel: formatShortMonthYear(new Date(ts)),
        isProjection,
      });
    }
    // Completed first, then chronological.
    return out.sort((a, b) => {
      if (a.done !== b.done) return a.done ? -1 : 1;
      return (a.ts ?? 0) - (b.ts ?? 0);
    });
  }, [rows]);

  if (entries.length < 2) return null;

  return (
    <Card className="overflow-hidden py-0">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-sm font-semibold text-foreground">Ordine di raggiungimento</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Quando raggiungerai ogni obiettivo al ritmo attuale
        </p>
      </div>
      <ol className="px-6 py-2">
        {entries.map((e, i) => {
          const last = i === entries.length - 1;
          return (
            <li key={e.id} className="relative flex gap-4 pb-5 last:pb-2">
              {/* Connector line */}
              {!last && (
                <span
                  className="absolute left-[7px] top-5 h-full w-px bg-border"
                  aria-hidden="true"
                />
              )}
              {/* Node */}
              <span className="relative z-[1] mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {e.done ? (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-positive/15">
                    <Check className="h-2.5 w-2.5 text-positive" />
                  </span>
                ) : (
                  <span
                    className="h-3 w-3 rounded-full ring-2 ring-card"
                    style={{ backgroundColor: e.color }}
                  />
                )}
              </span>
              {/* Body */}
              <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-foreground" title={e.name}>
                  {e.name}
                </span>
                <span className="shrink-0 text-right">
                  {e.done ? (
                    <span className="text-xs font-medium text-positive">
                      {VERDICT_META.reached.label}
                    </span>
                  ) : (
                    <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                      {e.dateLabel}
                      {!e.isProjection && (
                        <span className="ml-1 font-sans text-[10px] text-muted-foreground">
                          (scadenza)
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
