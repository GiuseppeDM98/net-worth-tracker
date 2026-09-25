import { cn } from '@/lib/utils';

export interface SeriesLegendItem {
  label: string;
  /** One swatch per colour the series is drawn in: a series that turns red under the baseline carries two. */
  colors: readonly string[];
}

/**
 * The square-swatch legend of a hand-written plot or a Recharts one: ONE entry per series, the
 * words in the neutral ink. Recharts' own `<Legend>` paints each label in its series colour — a
 * chart slot targets ~3:1 against a plot, not the 4.5:1 of 11px text (measured 3,64 · 4,02 ·
 * 2,62:1 on Storico, 2026-09-20) — and names its icons in English.
 *
 * `aria-hidden`: the chart's own `aria-label` carries the series, and a swatch says nothing to a
 * screen reader.
 */
export function SeriesLegend({ items, className }: Readonly<{ items: readonly SeriesLegendItem[]; className?: string }>) {
  return (
    <div className={cn('flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground', className)} aria-hidden="true">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className="flex gap-0.5">
            {item.colors.map((color) => (
              <span key={color} className="inline-block h-2 w-2 rounded-[2px]" style={{ background: color }} />
            ))}
          </span>
          {item.label}
        </span>
      ))}
    </div>
  );
}
