import { cn } from '@/lib/utils';
import { COSTUME_PILL_RADIUS_CLASS } from '@/lib/constants/themeCostume';

interface BudgetTrackProps {
  /** spent / budget, 0-1+ (the fill clamps at 100%). */
  ratio: number;
  /**
   * scheduled / budget, 0-1+: the rows dated after today, drawn as a second, lighter fill
   * after the first — declared on the track, never merged into «spent». Omit when none.
   */
  scheduledRatio?: number;
  /** Where the calendar stands today, 0-100 — the «│» mark; omit for an income target. */
  calendarPct?: number | null;
  /** Fill colour, a theme token. */
  color: string;
  /** Accessible name of the bar ("Avanzamento Alimentari"). */
  label: string;
  /**
   * What a screen reader hears for the value («231%, oltre di 1963 €»). The visual fill clamps
   * at 100% and so does `aria-valuenow`, so without this an exceeded budget is announced as
   * full — never as over.
   */
  valueText?: string;
  className?: string;
}

/**
 * The 3px bar every budget row shares: the fill is what is used, the 1px mark is today on
 * the month (or on the year). The mark is what turns a bar into a reading — «73% at 71% of
 * the month» is legible at a glance only because the two are drawn on the same track. The
 * ceiling's track carries two fills, booked and scheduled, in the same colour at two
 * strengths: the reader sees how much of the used share is still to come.
 */
export function BudgetTrack({ ratio, scheduledRatio = 0, calendarPct, color, label, valueText, className }: BudgetTrackProps) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const scheduledPct = Math.min(100 - pct, Math.max(0, scheduledRatio * 100));
  const totalPct = Math.round((ratio + scheduledRatio) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.min(100, Math.max(0, totalPct))}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={valueText ?? `${totalPct}%`}
      aria-label={label}
      className={cn('relative flex h-[3px] w-full bg-muted', COSTUME_PILL_RADIUS_CLASS, className)}
    >
      <div className={cn('h-full', COSTUME_PILL_RADIUS_CLASS)} style={{ width: `${pct}%`, background: color }} />
      {scheduledPct > 0 && <div className="h-full rounded-r-[var(--costume-control-pill-radius,calc(infinity*1px))] opacity-40" style={{ width: `${scheduledPct}%`, background: color }} />}
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
