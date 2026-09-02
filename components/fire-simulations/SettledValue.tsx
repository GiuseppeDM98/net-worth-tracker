'use client';

/**
 * Count-up leaf nodes of the FIRE tab. Every preview edit (SWR, the pension lock, a scenario
 * parameter) changes the figures instantly, so they settle from their previous value rather than
 * replaying a count from zero. Leaf components isolate the per-frame re-renders from the tiles
 * around them (doc/guide/panoramica.md § Panoramica and Dashboard Data Isolation).
 */

import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { useCountUp } from '@/lib/utils/useCountUp';

const SETTLE = { fromPrevious: true, duration: 520, startDelay: 0 } as const;

export function SettledCurrencyValue({ value, className, compact = false }: { value: number | null; className?: string; compact?: boolean }) {
  const animated = useCountUp(value, SETTLE);
  const shown = animated ?? value ?? 0;
  return <span className={className}>{compact ? cachedFormatCurrencyEUR(shown, true) : formatCurrency(shown)}</span>;
}

export function SettledPercentageValue({ value, className, decimals = 1 }: { value: number | null; className?: string; decimals?: number }) {
  const animated = useCountUp(value, SETTLE);
  return <span className={className}>{formatPercentage(animated ?? value ?? 0, decimals)}</span>;
}

/** «14,9» — years with one decimal, it-IT; an em dash when unknown. */
export function SettledYearsValue({ value, className, decimals = 1 }: { value: number | null; className?: string; decimals?: number }) {
  const animated = useCountUp(value, SETTLE);
  if (value === null) return <span className={className}>—</span>;
  return (
    <span className={className}>
      {(animated ?? value).toLocaleString('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}
