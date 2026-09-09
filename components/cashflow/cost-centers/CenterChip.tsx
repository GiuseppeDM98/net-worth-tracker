import type { CenterChip as CenterChipModel } from '@/lib/utils/costCenterNarrative';
import { cn } from '@/lib/utils';

/**
 * The one chip a center row may carry — its lifecycle («fermo da 120 giorni»), or where it
 * stands against its ceiling. The words and the tone come from `describeCenterChip`; the
 * tone paints the semantic tokens, never a chart slot (a slot is tuned against a plot area,
 * not against the card).
 */
export function CenterChip({ chip, className }: { chip: CenterChipModel; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap rounded-md border border-border px-1.5 text-[10px] font-medium leading-4 text-muted-foreground',
        chip.tone === 'warning' && 'border-warning-foreground/40 text-warning-foreground',
        chip.tone === 'negative' && 'border-destructive/40 text-destructive',
        className,
      )}
    >
      {chip.label}
    </span>
  );
}
