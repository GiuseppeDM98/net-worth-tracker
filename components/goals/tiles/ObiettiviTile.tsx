'use client';

/**
 * OBIETTIVI — «a che punto è ogni obiettivo?»: every goal as a row in urgency order, the first
 * one large (36px progress) and the others compact (18px), each with its 3px track in the goal's
 * own colour, a caption with the figures and a verdict chip with the words after it. A row is a
 * button: pressing it selects the goal the Traiettoria tile draws (`aria-current`).
 *
 * The goal's colour is its identity (the Panoramica's ObiettivoTile draws the same bars) — the
 * one place a user-chosen hex is sanctioned, because two goals sharing a hue would be
 * indistinguishable in every chart that keys on it. The verdict chips take the sign tokens
 * through `VERDICT_META`; no figure on the tile does.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { GoalLine } from '@/lib/utils/goalsSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { VERDICT_META } from '@/components/goals/goalVerdictMeta';

export interface ObiettiviRow {
  line: GoalLine;
  caption: Narrative;
  status: Narrative | null;
}

interface ObiettiviTileProps {
  reading: Narrative | null;
  /** The «Nuovo obiettivo» control, rendered by the tab (it owns the dialog). */
  aside?: ReactNode;
  rows: ObiettiviRow[];
  selectedId: string | null;
  onSelect: (goalId: string) => void;
  footer: Narrative | null;
  /** Shown instead of the rows when there is no goal yet. */
  emptyCopy?: string;
  className?: string;
}

function GoalRow({ row, featured, selected, onSelect }: { row: ObiettiviRow; featured: boolean; selected: boolean; onSelect: () => void }) {
  const { line } = row;
  const verdict = VERDICT_META[line.verdict];
  const progress = line.progressPct !== null ? Math.min(100, Math.max(0, line.progressPct)) : null;
  const figure = line.progressPct !== null ? `${Math.round(line.progressPct)}%` : cachedFormatCurrencyEUR(line.currentValue, true);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        aria-label={`${line.name}, ${verdict.label}`}
        className={cn(
          'flex w-full flex-col text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset -mx-2 w-[calc(100%+16px)] rounded-md px-2 hover:bg-muted/30',
          featured ? 'gap-2.5 pb-3.5 pt-1' : 'gap-2 py-3.5',
          selected && 'bg-muted/40',
        )}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn('inline-flex min-w-0 items-center gap-2 text-[13px] text-foreground', featured && 'font-semibold')}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: line.color }} aria-hidden="true" />
            <span className="truncate">{line.name}</span>
          </span>
          <span className={cn('shrink-0 font-mono font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground', featured ? 'text-[36px]' : 'text-[18px]')}>
            {figure}
          </span>
        </span>
        {progress !== null && (
          <span
            className="block h-[3px] w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-label={`Avanzamento ${line.name}`}
          >
            <span className="block h-full rounded-full" style={{ width: `${progress}%`, background: line.color }} />
          </span>
        )}
        <NarrativeText segments={row.caption} className="text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-[1.4] text-muted-foreground">
          <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-[1.3]', verdict.chipClass)}>{verdict.label}</span>
          {row.status && <NarrativeText segments={row.status} className="inline" figureClassName="font-medium" />}
        </span>
      </button>
    </li>
  );
}

export function ObiettiviTile({ reading, aside, rows, selectedId, onSelect, footer, emptyCopy, className }: ObiettiviTileProps) {
  return (
    <Tile eyebrow="Obiettivi" aside={aside} reading={reading} ariaLabel="Obiettivi" className={className}>
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">{emptyCopy}</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border" aria-label="Obiettivi in ordine di urgenza">
          {rows.map((row, index) => (
            <GoalRow key={row.line.id} row={row} featured={index === 0} selected={row.line.id === selectedId} onSelect={() => onSelect(row.line.id)} />
          ))}
        </ul>
      )}
      {footer && <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />}
    </Tile>
  );
}
