'use client';

/**
 * AFFLUSSI — «cosa arriva dopo, che il calcolo sconta già?»: the events the backward walk
 * discounts, in one ordered rail — the pension fund re-entering at its unlock, each state
 * pension from its decorrenza — every amount AT TODAY'S VALUE (the pensions net and real, the
 * fund as it is today: growing it here would double-count what the walk already does).
 *
 * The rail is an ORDER, not a scale: the segments are equal-width and every marker prints its
 * own year, so nothing here implies a proportional time axis it does not have. Without an event
 * the tile keeps its place: the reading says what «nessun afflusso» means for the number, which
 * is the fact the reader needs, not an empty cell.
 */

import { Landmark, LockOpen } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { CoastInflowEvent } from '@/lib/utils/coastFireView';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface AfflussiTileProps {
  /** `describeCoastInflows(...)`. */
  reading: Narrative;
  events: CoastInflowEvent[];
  footer: Narrative;
  className?: string;
}

const EVENT_ICON = {
  statePension: Landmark,
  pensionFund: LockOpen,
} as const;

export function AfflussiTile({ reading, events, footer, className }: AfflussiTileProps) {
  return (
    <Tile eyebrow="Afflussi" aside="in euro di oggi" reading={reading} ariaLabel="Afflussi già considerati" className={className}>
      {events.length > 0 && (
        <ol aria-label="Afflussi già considerati" className="mt-5 grid gap-5 tablet:grid-flow-col tablet:auto-cols-fr tablet:gap-0">
          {events.map((event, index) => {
            const Icon = EVENT_ICON[event.kind];
            const isLast = index === events.length - 1;
            return (
              <li key={event.id} className="min-w-0 tablet:pr-5">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full border border-border bg-muted" />
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{event.year}</span>
                  {/* Rail segment, in flow rather than absolutely positioned: it is then centred on
                      the marker by the row itself, and it stops at the last event instead of
                      trailing off into nothing. */}
                  {!isLast && <span aria-hidden="true" className="hidden h-px flex-1 bg-border tablet:block" />}
                </div>
                <div className="mt-2 flex items-start gap-1.5 tablet:ml-[2px]">
                  <Icon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground">{event.title}</p>
                    <p className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-foreground">
                      {event.amount} <span className="font-sans text-[11px] font-normal text-muted-foreground">{event.amountCaption}</span>
                    </p>
                    {event.note && <p className="mt-0.5 text-[11px] text-muted-foreground">{event.note}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" />
    </Tile>
  );
}
