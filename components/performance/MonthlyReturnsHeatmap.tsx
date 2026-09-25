'use client';

import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { MonthlyReturnHeatmapData } from '@/types/performance';
import { formatPercentage } from '@/lib/services/chartService';
import { ROVING_ITEM_ATTRIBUTE, useRovingFocus } from '@/lib/hooks/useRovingFocus';
import { cn } from '@/lib/utils';
import { MONTH_NAMES } from '@/lib/constants/months';

interface MonthlyReturnsHeatmapProps {
  data: MonthlyReturnHeatmapData[];
  className?: string;
}

const MONTH_LETTERS = ['G', 'F', 'M', 'A', 'M', 'G', 'L', 'A', 'S', 'O', 'N', 'D'];

/**
 * The three intensity steps, by the month's ABSOLUTE return in percent: under 1, under 2,5, and
 * everything from there up. The ONE source of the thresholds — the cell fill, the legend swatch and
 * the legend's labels all read it. Until 2026-09-20 the legend printed «−5% … 0 … +5%» beside
 * steps that were never at 5: a +2,6% and a +6,6% share a fill, and the key has to say so.
 */
export const HEATMAP_STEPS = [
  { below: 1, intensity: 30, positiveClass: 'bg-positive/30', negativeClass: 'bg-destructive/30' },
  { below: 2.5, intensity: 55, positiveClass: 'bg-positive/55', negativeClass: 'bg-destructive/55' },
  { below: Number.POSITIVE_INFINITY, intensity: 85, positiveClass: 'bg-positive/85', negativeClass: 'bg-destructive/85' },
] as const;

type HeatmapStep = (typeof HEATMAP_STEPS)[number];

function heatmapStepOf(value: number): HeatmapStep {
  const magnitude = Math.abs(value);
  return HEATMAP_STEPS.find((step) => magnitude < step.below) ?? HEATMAP_STEPS[HEATMAP_STEPS.length - 1];
}

/**
 * The cell's fill: the sign token at three intensities, so the heatmap follows the theme like every
 * other gain and loss on the page (raw `bg-red-*`/`bg-green-*` stayed literal on Cyberpunk, where the
 * negative colour is orange — closed 2026-08-25). A month out of the
 * period, or exactly flat, is the muted surface: neither a gain nor a loss.
 *
 * An inline fill, not a class: a CSS class cannot cross-fade from one utility to another, an inline
 * `color-mix` can — so on a period switch a cell that changes intensity or sign fades to its new
 * colour instead of flipping (`transition-colors` below). The legend's swatches never change, so
 * they take the step's static classes.
 */
export function heatmapCellStyle(value: number | null): CSSProperties {
  if (value === null || value === 0) return { backgroundColor: 'var(--muted)' };
  const token = value < 0 ? 'var(--destructive)' : 'var(--positive)';
  return { backgroundColor: `color-mix(in oklab, ${token} ${heatmapStepOf(value).intensity}%, transparent)` };
}

/** A year that enters the window fades in; one that leaves it fades out — never a jump of the grid. */
const ROW_FADE = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.22 } } as const;

function signedPercent(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatPercentage(Math.abs(value), 1)}`;
}

/** The sign token of a figure — the same three-way split as every other gain and loss on the page. */
function signClass(value: number): string {
  return value > 0 ? 'text-positive' : value < 0 ? 'text-destructive' : 'text-foreground';
}

/** One month of one year — the identity the selection, the focus and the hover all speak in. */
interface MonthRef {
  year: number;
  month: number;
}

const monthKey = (ref: MonthRef) => `${ref.year}-${ref.month}`;

/** The colour block of a cell; the gap between cells is the `td`'s padding (see the table below). */
// 44px tall below desktop: twelve columns in a 316px tile leave a cell ~21px wide, so the height is
// the only dimension a finger can be given (measured 21×28 on 2026-09-20).
const CELL_BLOCK_CLASS = 'block h-11 w-full rounded-[3px] motion-safe:transition-colors motion-safe:duration-300 desktop:h-[28px]';

/**
 * One cell per month, colour by sign and intensity, no figure inside: at a tile's width twelve
 * columns leave no room for «+1,2%». A table, because it IS one: years are rows, months are
 * columns, and a screen reader walks it that way.
 *
 * The figure is read in the line UNDER the grid (2026-09-20). Until then it lived in a native
 * `title` and a mouse-only tip: no cell was focusable, a tap showed nothing, and the tile said
 * «con il mouse» on a phone. Now every MEASURED month is a button — tap or Enter pins it, again
 * or Escape releases it, a mouse over a cell previews it — and the grid is ONE Tab stop with the
 * arrows inside it (`useRovingFocus`; 48 stops on «Storico» otherwise). An out-of-period cell is
 * no control: there is nothing to read in it. The line is a plain node, not a live region — a
 * hover that speaks would chatter, and the button's own name already carries «Aprile 2026: +6,6%».
 * The old `ChartHoverTip` went with the `title`: it said what the line says, over the first row.
 */
export function MonthlyReturnsHeatmap({ data, className }: MonthlyReturnsHeatmapProps) {
  const hintId = useId();
  const [pinned, setPinned] = useState<MonthRef | null>(null);
  const [focused, setFocused] = useState<MonthRef | null>(null);
  const [hovered, setHovered] = useState<MonthRef | null>(null);

  // The roving index is the cell's position among the MEASURED ones, in DOM order.
  const measuredKeys = data.flatMap((row) =>
    row.months.filter((m) => m.return !== null).map((m) => monthKey({ year: row.year, month: m.month })),
  );
  const rovingIndexByKey = new Map(measuredKeys.map((key, index) => [key, index]));
  const roving = useRovingFocus(measuredKeys.length);

  if (data.length === 0) return null;

  // The pointer speaks last, the keyboard next, the pin stays underneath. Looked up in `data` so a
  // month that left the period stops being read without an effect to clear it.
  const shownRef = hovered ?? focused ?? pinned;
  const shownReturn = shownRef
    ? data.find((row) => row.year === shownRef.year)?.months.find((m) => m.month === shownRef.month)?.return
    : undefined;

  /**
   * The grid's own keys. `useRovingFocus` reads a LIST (up/down step by one); here left/right step
   * by one month and up/down stay in the month's column, so those four are answered first and only
   * Home/End fall through to the hook. Its `onFocus` keeps the Tab stop on whatever gets focused.
   */
  const handleGridKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      setPinned(null);
      return;
    }
    const target = event.target as HTMLElement;
    if (!target.hasAttribute(ROVING_ITEM_ATTRIBUTE)) return;
    const horizontal = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const vertical = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (horizontal === 0 && vertical === 0) {
      roving.containerProps.onKeyDown(event);
      return;
    }
    event.preventDefault();
    const scope = vertical !== 0 ? `[${ROVING_ITEM_ATTRIBUTE}][data-month="${target.dataset.month}"]` : `[${ROVING_ITEM_ATTRIBUTE}]`;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(scope));
    const next = items[items.indexOf(target) + horizontal + vertical];
    next?.focus();
  };

  return (
    <div className={cn('relative', className)}>
      <p id={hintId} className="sr-only">
        I mesi misurati sono un solo punto di tabulazione: le frecce passano da un mese all&apos;altro, Invio fissa il mese nella riga sotto la griglia.
      </p>
      {/* No outer gutter: `border-spacing` also pads the table's edges, and the old cure (a −3px
          margin under `width: calc(100% + 6px)`) left the table 6px wider than its tile at both
          widths. The gap is each cell's own left/top padding instead, so the grid ends flush. */}
      <table className="w-full table-fixed border-separate border-spacing-0" aria-describedby={hintId}>
        <thead>
          <tr>
            <th scope="col" className="w-8 text-left font-mono text-[10px] font-normal text-muted-foreground">
              <span className="sr-only">Anno</span>
            </th>
            {MONTH_LETTERS.map((letter, i) => (
              <th key={i} scope="col" className="pl-[3px] text-center font-mono text-[10px] font-normal text-muted-foreground" aria-label={MONTH_NAMES[i]}>
                {letter}
              </th>
            ))}
          </tr>
        </thead>
        <tbody onKeyDown={handleGridKeyDown} onPointerLeave={() => setHovered(null)}>
          <AnimatePresence initial={false}>
          {data.map((row) => (
            <motion.tr key={row.year} {...ROW_FADE}>
              <th scope="row" className="pt-[3px] text-left font-mono text-[11px] font-normal tabular-nums text-muted-foreground">
                {row.year}
              </th>
              {row.months.map((m) => {
                const cell: MonthRef = { year: row.year, month: m.month };
                const key = monthKey(cell);
                const name = `${MONTH_NAMES[m.month - 1]} ${row.year}: ${m.return === null ? 'nessun dato' : signedPercent(m.return)}`;
                const isPinned = pinned !== null && monthKey(pinned) === key;
                const { onFocus: rovingFocus, ...rovingProps } = roving.itemProps(rovingIndexByKey.get(key) ?? 0);
                return (
                  <td
                    key={m.month}
                    className="p-0 pl-[3px] pt-[3px]"
                    onPointerEnter={(event) => {
                      // A finger has no hover: its reading is the pin.
                      if (event.pointerType === 'mouse') setHovered(cell);
                    }}
                  >
                    {m.return === null ? (
                      <span className={CELL_BLOCK_CLASS} style={heatmapCellStyle(null)}>
                        <span className="sr-only">{name}</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        {...rovingProps}
                        data-month={m.month}
                        aria-pressed={isPinned}
                        onClick={() => setPinned(isPinned ? null : cell)}
                        onFocus={(event) => {
                          rovingFocus();
                          // Keyboard focus reads the month; a tap's focus must not, or the second
                          // tap would release the pin and leave the line still reading it.
                          if (event.currentTarget.matches(':focus-visible')) setFocused(cell);
                        }}
                        onBlur={() => setFocused(null)}
                        className={cn(
                          CELL_BLOCK_CLASS,
                          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card',
                          isPinned && 'ring-2 ring-foreground ring-offset-1 ring-offset-card',
                        )}
                        style={heatmapCellStyle(m.return)}
                      >
                        <span className="sr-only">{name}</span>
                      </button>
                    )}
                  </td>
                );
              })}
            </motion.tr>
          ))}
          </AnimatePresence>
        </tbody>
      </table>
      {/* The reading: always there, so the grid never moves when a month is picked. */}
      <p className="mt-2.5 text-[13px] leading-[1.45] text-muted-foreground" data-heatmap-reading="">
        {shownRef && shownReturn !== undefined ? (
          <>
            <span className="text-foreground">{MONTH_NAMES[shownRef.month - 1]} {shownRef.year}</span>
            {' · '}
            {shownReturn === null ? (
              'fuori periodo'
            ) : (
              <span className={cn('font-mono tabular-nums', signClass(shownReturn))}>{signedPercent(shownReturn)}</span>
            )}
          </>
        ) : (
          'Scegli un mese per leggerne il rendimento.'
        )}
      </p>
    </div>
  );
}

const THRESHOLD_FORMAT = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

/** «<1%», «<2,5%», «≥2,5%» — each step named by its own bound, the last by the one before it. */
function heatmapStepLabel(index: number): string {
  const step = HEATMAP_STEPS[index];
  if (Number.isFinite(step.below)) return `<${THRESHOLD_FORMAT.format(step.below)}%`;
  return `≥${THRESHOLD_FORMAT.format(HEATMAP_STEPS[index - 1].below)}%`;
}

/**
 * The legend under the grid: one entry per step — its loss and its gain swatch, then the bound the
 * step ends at, read from `HEATMAP_STEPS` so the key cannot drift from the fills — and the «out of
 * period» surface. The bounds are magnitudes: the pair of swatches says «either sign».
 */
export function HeatmapLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground', className)} aria-hidden="true">
      {HEATMAP_STEPS.map((step, index) => (
        <span key={step.intensity} className="flex items-center gap-1 whitespace-nowrap">
          <span className={cn('inline-block h-2 w-2 rounded-[2px]', step.negativeClass)} />
          <span className={cn('inline-block h-2 w-2 rounded-[2px]', step.positiveClass)} />
          <span className="font-mono tabular-nums">{heatmapStepLabel(index)}</span>
        </span>
      ))}
      <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
        <span className="inline-block h-2 w-2 rounded-[2px] bg-muted" />
        fuori periodo
      </span>
    </div>
  );
}
