/**
 * AllocationRow — one line of the Per classe tile, plus its tick.
 *
 * The old row was a block (name, a dominant euro value, a micro line, the bar): right for a
 * page whose composition section WAS the page, wrong inside a tile where six classes and their
 * sub-categories must read as one list. Here a row is exactly ONE line — name and chip on the
 * left, then three aligned mono columns (current %, target %, gap €) — and the 3px TargetTick
 * beneath it. The euro value went away on purpose: the tile's question is «how far from the
 * target?», and the current value answers a different one (Patrimonio's).
 *
 * The columns have fixed widths so the figures align down the whole list, sub-categories
 * included; a row that cannot expand keeps a spacer where the chevron would be, so the numbers
 * never shift by 14px between an expandable class and a leaf. The gap carries the operation's
 * sign (+ there is too much, − something is missing) in the ACTION colour, never in the sign
 * tokens: a drift is neither a gain nor a loss (AGENTS.md → Layout and Color Tokens).
 *
 * The "theoretical" variant is for specific-asset TARGETS, whose current value is always 0
 * (they are not linked to real holdings). A 0% column and an empty tick there would read as
 * missing data, so that variant prints the target alone and draws no tick.
 *
 * The "untargeted" variant is its mirror — the residual «Senza sottocategoria» sleeve, which has
 * a real weight and NO target. It prints the share and the value and stops: a target column, a
 * gap and an action chip would all answer «troppo o troppo poco?», and the honest answer there
 * is «classificalo», which no chip can say. It exists so the sleeves visibly reach 100%.
 */
'use client';

import type { KeyboardEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPercentage } from '@/lib/services/chartService';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import type { AllocationData } from '@/types/assets';
import { ActionChip } from './ActionChip';
import { TargetTick } from './TargetTick';

interface AllocationRowProps {
  name: string;
  data: AllocationData;
  /** Resolved, legibility-clamped colour for this row's action (from `useActionColors()`, once per tile). */
  actionColor: string;
  /** 0 = asset class, 1 = sub-category, 2 = specific-asset target. Drives indent and scale. */
  depth?: 0 | 1 | 2;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  /** Theoretical specific-asset target (current value always 0 → the target alone, no tick). */
  theoretical?: boolean;
  /** Residual sleeve with no target (→ share and value alone, no chip, no gap, no tick). */
  untargeted?: boolean;
}

const DEPTH_PADDING: Record<0 | 1 | 2, string> = {
  0: '',
  1: 'pl-4',
  2: 'pl-8',
};

const MINUS = '−';

/** «+8085 €» over target, «−2500 €» under; «0 €» once the cents are dropped and nothing is left. */
function formatGap(differenceValue: number): string {
  const rounded = Math.round(Math.abs(differenceValue));
  if (rounded === 0) return cachedFormatCurrencyEUR(0, true);
  return `${differenceValue > 0 ? '+' : MINUS}${cachedFormatCurrencyEUR(rounded, true)}`;
}

export function AllocationRow({
  name,
  data,
  actionColor,
  depth = 0,
  expandable = false,
  expanded = false,
  onToggle,
  theoretical = false,
  untargeted = false,
}: AllocationRowProps) {
  const isInteractive = expandable && !!onToggle;
  // A class row is the tile's 13px row; everything under it steps down to 12px so depth reads
  // from the type as well as from the indent.
  const rowText = depth === 0 ? 'text-[13px]' : 'text-[12px]';

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle!();
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col justify-center py-2',
        DEPTH_PADDING[depth],
        isInteractive &&
          'min-h-[44px] cursor-pointer rounded-md transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset desktop:min-h-0',
      )}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-expanded={expandable ? expanded : undefined}
      aria-label={isInteractive ? `${expanded ? 'Comprimi' : 'Espandi'} ${name}` : undefined}
      onClick={isInteractive ? onToggle : undefined}
      onKeyDown={handleKeyDown}
    >
      {/* The figures never wrap and never squeeze the name out: below ~140px of room for it (a 390px
          phone with the tile's padding) the name and chip take the first line and the columns drop to a
          second one, right-aligned — the tick under both still reads as the row's. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <div className="flex min-w-0 flex-1 basis-[140px] items-center gap-2">
          <span className={cn('truncate font-medium', untargeted ? 'text-muted-foreground' : 'text-foreground', rowText)} title={name}>
            {name}
          </span>
          {!untargeted && <ActionChip action={data.action} color={actionColor} />}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2.5">

        {untargeted ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatPercentage(data.currentPercentage, 1)} · {cachedFormatCurrencyEUR(data.currentValue, true)} · senza target
          </span>
        ) : theoretical ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            target {formatPercentage(data.targetPercentage, 0)} · {cachedFormatCurrencyEUR(data.targetValue, true)}
          </span>
        ) : (
          <>
            <span className={cn('w-[52px] shrink-0 text-right font-mono tabular-nums text-foreground', rowText)}>
              {formatPercentage(data.currentPercentage, 1)}
            </span>
            <span className="w-[44px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatPercentage(data.targetPercentage, 0)}
            </span>
            <span
              className={cn('min-w-[76px] shrink-0 text-right font-mono tabular-nums', rowText, data.action === 'OK' && 'text-muted-foreground')}
              style={data.action !== 'OK' ? { color: actionColor } : undefined}
            >
              {formatGap(data.differenceValue)}
            </span>
          </>
        )}

        {/* The chevron, or its footprint: the columns above must not move between a class that opens and a leaf. */}
        {expandable ? (
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
              expanded && 'rotate-90',
            )}
            aria-hidden="true"
          />
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        </div>
      </div>

      {!theoretical && !untargeted && (
        <TargetTick className="mt-1" currentPercentage={data.currentPercentage} targetPercentage={data.targetPercentage} />
      )}
    </div>
  );
}
