import { cn } from '@/lib/utils';

interface BudgetTrackProps {
  /** spent / budget, 0-1+ (the fill clamps at 100%). */
  ratio: number;
  /** Where the calendar stands today, 0-100 — the «│» mark; omit for an income target. */
  calendarPct?: number | null;
  /** Fill colour, a theme token. */
  color: string;
  /** Accessible name of the bar ("Avanzamento Alimentari"). */
  label: string;
  className?: string;
}

/**
 * The 3px bar every budget row shares: the fill is what is used, the 1px mark is today on
 * the month (or on the year). The mark is what turns a bar into a reading — «73% at 71% of
 * the month» is legible at a glance only because the two are drawn on the same track.
 */
export function BudgetTrack({ ratio, calendarPct, color, label, className }: BudgetTrackProps) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('relative h-[3px] w-full rounded-full bg-muted', className)}
    >
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      {calendarPct != null && (
        <div
          aria-hidden="true"
          className="absolute -top-[3px] -bottom-[3px] w-px bg-muted-foreground"
          style={{ left: `${Math.min(100, Math.max(0, calendarPct))}%` }}
        />
      )}
    </div>
  );
}
