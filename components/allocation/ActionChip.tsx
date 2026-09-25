/**
 * ActionChip — compact COMPRA / VENDI / OK status badge for allocation rows.
 *
 * The `color` is a resolved, legibility-clamped color from the active theme's chart palette
 * (provided by the parent via `useActionColors()` — see that hook for why it is resolved
 * once per section, not per chip). Background and border are `color-mix` tints of the same
 * color, so the whole chip follows the theme. The directional icon + the label are the
 * primary signal; the color is reinforcement.
 */
'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACTION_CHIP_FILL_PCT, type AllocationAction } from '@/lib/utils/allocationUtils';

const ACTION_ICON: Record<AllocationAction, typeof TrendingUp> = {
  COMPRA: TrendingUp,
  VENDI: TrendingDown,
  OK: Minus,
};

export function ActionChip({
  action,
  color,
  className,
}: {
  action: AllocationAction;
  /** Resolved, legibility-clamped color from `useActionColors()`. */
  color: string;
  className?: string;
}) {
  const Icon = ACTION_ICON[action];

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
        className
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} ${ACTION_CHIP_FILL_PCT}%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 34%, transparent)`,
      }}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
      {action}
    </span>
  );
}
