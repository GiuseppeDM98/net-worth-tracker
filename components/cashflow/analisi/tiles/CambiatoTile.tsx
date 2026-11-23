'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { CategoryChanges } from '@/lib/utils/analisiSummary';
import type { EntitySearchTarget } from '@/lib/utils/entitySearch';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { useRovingFocus } from '@/lib/hooks/useRovingFocus';
import { cn } from '@/lib/utils';
import { Tile, type TileCollapse } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { COSTUME_PILL_RADIUS_CLASS } from '@/lib/constants/themeCostume';

interface CambiatoTileProps {
  /** AnalisiTab's `comparisonPhrase` («su 2025»), or the anomaly month without a comparison; the same words closed. */
  aside: string;
  /** `describeCategoryChanges`, or the anomaly sentence alone without a comparison. */
  reading: Narrative | null;
  /** The movers against the Periodo's baseline; null without a comparison. */
  changes: CategoryChanges | null;
  /** `describeChangesAnomalies` under the rows; null when it is the reading or there is none. */
  anomaliesReading: Narrative | null;
  /** `describeChangesFooter(changes, inPeriod)`; absent without a comparison. */
  footer?: string;
  onSelect: (target: EntitySearchTarget) => void;
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  className?: string;
}

const STATUS_CAPTION = { new: 'nuova', gone: 'cessata' } as const;

/** A spending rise is a loss (The Sign-Color Token Rule): the bar and the euro share one sign class. */
const riseOrFall = (delta: number) => (delta > 0 ? 'var(--destructive)' : 'var(--positive)');
const signClass = (delta: number) => (delta > 0 ? 'text-destructive' : 'text-positive');
const signedAmount = (delta: number) => `${delta > 0 ? '+' : '−'}${cachedFormatCurrencyEUR(Math.abs(delta), true)}`;

/**
 * «Cosa è cambiato?» (2026-11-12; replaces «Fuori scala») — the spending categories that moved most
 * against the Periodo's own baseline, as bars on a track centred on zero: a rise grows right of the
 * centre line, a fall left of it. Each row opens its category's Scheda. The month's anomalies close
 * the tile as a sentence, or are its reading when there is no comparison.
 */
export function CambiatoTile({ aside, reading, changes, anomaliesReading, footer, onSelect, collapse, className }: CambiatoTileProps) {
  const rows = changes?.rows ?? [];
  const roving = useRovingFocus(rows.length);

  return (
    <Tile eyebrow="Cosa è cambiato" aside={aside} asideWhenClosed={aside} collapse={collapse} reading={reading} className={className}>
      {rows.length > 0 && (
        <ul className="mt-3 flex flex-col" aria-label="Categorie che si sono mosse" {...roving.containerProps}>
          {rows.map((row, index) => (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => onSelect({ expenseType: row.expenseType, categoryKey: row.categoryKey })}
                {...roving.itemProps(index)}
                className="flex min-h-[44px] w-full items-center gap-3 py-[7px] text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset desktop:-mx-2 desktop:min-h-0 desktop:w-[calc(100%+16px)] desktop:rounded-md desktop:px-2"
              >
                <span className="flex w-[34%] min-w-[118px] shrink-0 items-baseline gap-1.5 text-[13px] text-foreground">
                  <span className="truncate">{row.label}</span>
                  {row.status !== 'ongoing' && (
                    <>
                      {' '}
                      <span className="shrink-0 text-[11px] text-muted-foreground">{STATUS_CAPTION[row.status]}</span>
                    </>
                  )}
                </span>{' '}
                <span className={cn('relative h-2 min-w-[40px] flex-1 bg-muted', COSTUME_PILL_RADIUS_CLASS)} aria-hidden="true">
                  <span className="absolute inset-y-[-2px] left-1/2 w-px bg-border" />
                  <span
                    data-change-bar=""
                    className={cn('absolute inset-y-0', COSTUME_PILL_RADIUS_CLASS)}
                    style={{ left: `${row.bar.left}%`, width: `${row.bar.width}%`, background: riseOrFall(row.delta) }}
                  />
                </span>{' '}
                <span className={cn('w-[72px] shrink-0 text-right font-mono text-[13px] tabular-nums', signClass(row.delta))}>{signedAmount(row.delta)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {anomaliesReading && <NarrativeText segments={anomaliesReading} className="mt-3 text-[13px] leading-[1.45] text-foreground" />}
      <TileMethodNote subject="Cosa è cambiato" summary={footer}>
        <span className="block">
          Le categorie di spesa del periodo contro la stessa finestra dell&apos;anno prima: le sei che si sono mosse di più, a destra quelle cresciute, a sinistra quelle calate.
        </span>
        <span className="mt-2 block">Fuori scala: una categoria sopra la sua media dei 6 mesi precedenti di oltre il 25% e di 50 €, misurata su un mese solo.</span>
      </TileMethodNote>
    </Tile>
  );
}
