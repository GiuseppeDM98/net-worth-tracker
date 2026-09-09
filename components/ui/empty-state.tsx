import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** The absence in ONE sentence: what is not there, and what would put it there. */
  message: string;
  /**
   * At most one action, and only on the surface that OWNS the missing thing. A second tile that
   * would ask for the same thing states the absence and stays silent — a page repeating «Aggiungi
   * il primo strumento» in four cells is asking four times for one thing.
   */
  action?: ReactNode;
  className?: string;
}

/**
 * «Nothing is recorded» — the first of the three names of an absence
 * (DESIGN.md → **The Absence-Has-Three-Names Rule**).
 *
 * It is the tile's own reading line, in `text-muted-foreground`: the eyebrow above it is the
 * tile's, so the question stays visible exactly when there is no answer, and the tile keeps the
 * height and the alignment it has when it answers — the grid does not reflow when the data
 * arrives. It carries NO figure, because there is none; a zero here would be the second name,
 * which is a different fact.
 *
 * Superseded on 2026-09-01: the centred 64–104px illustration with a perpetual 6px float. It was
 * the largest element of a tile that carried no information, it dropped the eyebrow precisely
 * when the tile could not answer, and it was the one endless animation in the product.
 */
export function EmptyState({ message, action, className }: Readonly<EmptyStateProps>) {
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <p className="text-[13px] leading-[1.45] text-muted-foreground">{message}</p>
      {action && <div className="mt-3.5">{action}</div>}
    </div>
  );
}
