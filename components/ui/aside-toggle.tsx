import { cn } from '@/lib/utils';

export interface AsideToggleOption<T extends string> {
  value: T;
  label: string;
}

interface AsideToggleProps<T extends string> {
  options: ReadonlyArray<AsideToggleOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * The view switch that lives in a tile's aside (the Strumenti form: `h-7`, 11px outline buttons,
 * `aria-pressed`) — on the Confronto («Mensile | Per categoria») and the Dettaglio tiles. Below
 * `desktop:` the buttons grow to the 44px touch target. A `SegmentedPill` at 14px in the 10px
 * aside slot read as a second control register.
 */
export function AsideToggle<T extends string>({ options, value, onChange, ariaLabel, className }: AsideToggleProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex flex-wrap items-center gap-1', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'h-11 rounded-md border border-border px-3 text-[11px] font-medium transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:h-7 desktop:px-2.5',
              active ? 'bg-muted text-foreground' : 'text-muted-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
