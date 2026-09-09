/**
 * Token-driven presentation metadata for goal verdicts and priorities.
 *
 * Everything here routes through semantic tokens so it holds across themes and modes: raw
 * `text-red-600 / bg-amber-50 / text-emerald-400` classes diverged from the theme's
 * `--destructive` / `--positive` on the named themes. The verdict labels are the chips of the
 * Obiettivi and Milestone tiles; the words of the page live in `lib/utils/goalsNarrative.ts`.
 */

import { GoalVerdict } from '@/lib/utils/goalTrajectory';
import { GoalPriority } from '@/types/goals';

export interface VerdictMeta {
  label: string;
  /** Tailwind classes for a chip (text + tinted bg), all token-based. */
  chipClass: string;
}

export const VERDICT_META: Record<GoalVerdict, VerdictMeta> = {
  reached: { label: 'Raggiunto', chipClass: 'text-positive bg-positive/10' },
  onTrack: { label: 'In rotta', chipClass: 'text-positive bg-positive/10' },
  offTrack: { label: 'In ritardo', chipClass: 'text-destructive bg-destructive/10' },
  noDeadline: { label: 'Senza scadenza', chipClass: 'text-muted-foreground bg-muted' },
  noTarget: { label: 'Aperto', chipClass: 'text-muted-foreground bg-muted' },
};

interface PriorityMeta {
  label: string;
  chipClass: string;
}

export const PRIORITY_META: Record<GoalPriority, PriorityMeta> = {
  alta: { label: 'Alta', chipClass: 'text-destructive bg-destructive/10' },
  // The semantic amber PAIR, not a chart slot tinted with itself: --warning is the surface
  // and --warning-foreground its text arm, and they are designed to clear 4.5:1 together
  // (6.72 light / 9.94 dark). A chart slot tinted at 10% behind its own hue does not.
  media: { label: 'Media', chipClass: 'text-warning-foreground bg-warning' },
  bassa: { label: 'Bassa', chipClass: 'text-positive bg-positive/10' },
};
