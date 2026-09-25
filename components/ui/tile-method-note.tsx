import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TILE_FOOTER_ACTION_CLASS } from '@/components/ui/tile';

interface TileMethodNoteProps {
  /** The ONE line that stays on the tile: what the figures are, not how each is computed. */
  summary?: ReactNode;
  /** The popover's heading — the tile's subject («Driver della crescita»), so the trigger's name is unique on the page. */
  subject: string;
  /** The method, as paragraphs; rendered only when the reader asks for it. */
  children: ReactNode;
  className?: string;
}

/**
 * A tile's footer reduced to one line, with the method behind «Come si calcola».
 *
 * A methodological note is help, and help printed on every tile at all times stops being read:
 * Storico's footers ran to nine lines at 95–130 characters each (critique of 2026-09-20, the
 * detector's four `line-length` hits). The line that stays says what the figures ARE; how each
 * is computed is one press away, in a popover whose measure is a readable 40–50 characters.
 *
 * The trigger is a text action at the footer's size with the footer action's target (32px on a
 * pointer, 44px on touch), named after its subject because a page carries several.
 */
export function TileMethodNote({ summary, subject, children, className }: Readonly<TileMethodNoteProps>) {
  return (
    <p className={cn('mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground', className)}>
      {summary}
      {summary ? ' ' : null}
      <Popover>
        <PopoverTrigger className={cn(TILE_FOOTER_ACTION_CLASS, 'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')} aria-label={`Come si calcola: ${subject}`}>
          Come si calcola
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] text-[13px] leading-[1.5]">
          <span className="block font-semibold text-foreground">{subject}</span>
          <span className="mt-1.5 flex flex-col gap-2 text-muted-foreground">{children}</span>
        </PopoverContent>
      </Popover>
    </p>
  );
}
