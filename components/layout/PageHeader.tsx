import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import type { PageFreshness } from '@/lib/hooks/useFreshness';

interface PageHeaderProps {
  title: React.ReactNode;
  label?: string;
  description?: string;
  actions?: React.ReactNode;
  /**
   * The page's freshness reading (`useFreshness`): «Aggiornato alle 18:42, sto rileggendo…»
   * while the figures on screen were restored from the persisted cache and the fresh read is in
   * flight, `null` otherwise. Rendered in ONE stable `role="status"` node per width that changes
   * text and empties — never a node that appears and disappears (doc/guide/dialog.md), and never
   * a line that grows: on desktop it follows the description in the same fixed-height row, on a
   * phone it takes the description's line while it lasts. So nothing under it moves when it goes.
   */
  freshness?: PageFreshness;
  className?: string;
}

/** The live region's attributes, the same on both copies (see `freshness` above). */
const FRESHNESS_LIVE_PROPS = { role: 'status', 'aria-live': 'polite', 'aria-atomic': true, 'data-freshness': '' } as const;

/**
 * The compact page header (the default since the shell redesign, the only one since the last
 * propagation): on `desktop:` ONE line — eyebrow · title · description, actions on the right
 * — because on a redesigned page the real headline is the verdict in the content. It draws
 * no separator: when a tab bar follows, its underline is the separation. The eyebrow is the
 * tiles' eyebrow (10px, 0.1em) so the page has a single eyebrow voice. The mobile sticky
 * navbar is one block, and its title is what the user anchors to while scrolling.
 */
export function PageHeader({ title, label, description, actions, freshness, className }: PageHeaderProps) {
  const freshnessSentence = freshness?.sentence ?? null;

  return (
    // `page-header`: the page scene morphs this line into the next page's (globals.css → Page scene).
    // The STICKY box is this wrapper, not the navbar inside it: `position: sticky` travels only
    // within its containing block, and the navbar's was this div — exactly as tall as the
    // navbar, so it never stuck and «Salva» scrolled away on every page (measured on
    // Impostazioni, 2026-09-22). The wrapper's containing block is the page, so it stays for
    // the whole scroll. `-top-4` cancels `<main>`'s 16px padding below `desktop:`: a sticky
    // offset is measured from the scroller's content edge, and at `top-0` the rows scrolling
    // past would show through a 16px strip above the bar.
    <div
      className={cn('max-desktop:sticky max-desktop:-top-4 max-desktop:z-20', className)}
      style={{ viewTransitionName: 'page-header' }}
    >
      {/* Mobile navbar — title + description in one block so the header feels like a unified
          navbar. Its background is OPAQUE: it covers the rows scrolling underneath, and a 95%
          fill with a blur let their words ghost through behind the title. */}
      <div className="-mx-4 px-4 pt-1 pb-2 flex flex-col bg-background desktop:hidden">
        <div className="flex items-center justify-between">
          <h1 className="text-[17px] font-semibold tracking-tight truncate min-w-0">{title}</h1>
          {actions && (
            <div className="flex shrink-0 items-center gap-1.5 ml-2">{actions}</div>
          )}
        </div>
        {(description || freshness) && (
          // With a freshness reading the line is reserved even on a page with no description, so
          // the sentence never adds a line under the title; the description yields to it and returns.
          <p className={cn('text-sm text-muted-foreground leading-tight truncate', freshness && 'min-h-[1.25em]')}>
            {freshness && <span {...FRESHNESS_LIVE_PROPS}>{freshnessSentence ?? ''}</span>}
            {!freshnessSentence && description}
          </p>
        )}
      </div>

      <div className="hidden desktop:flex items-center justify-between gap-4 min-h-9">
        <div className="flex items-baseline gap-3 min-w-0">
          {label && <p className={cn(TILE_EYEBROW_CLASS, 'shrink-0')}>{label}</p>}
          <h1 className="text-sm text-muted-foreground truncate">
            <span className="font-medium text-foreground">{title}</span>
            {description && <span> · {description}</span>}
          </h1>
          {freshness && (
            <p {...FRESHNESS_LIVE_PROPS} className="shrink-0 text-sm text-muted-foreground">
              {freshnessSentence ? `· ${freshnessSentence}` : ''}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * The compact header's silhouette, for the auth wait of the dashboard layout: the same
 * two boxes at the same heights — the phone navbar's paddings, its title row at the 36px an action
 * button gives it, its description line; the desktop row's `min-h-9` — and no words, because the
 * words are the page's and arrive with it. Measured on 2026-09-28 before it existed: when the page
 * mounted, the tile grid moved down 56px at 1440 and 65px at 390. It carries no `page-header`
 * view-transition name (that belongs to the header replacing it) and no heading: `main h1` still
 * means «the page has mounted» (`e2e/shellBoot.ts`, `scripts/perfBenchmark.mjs`).
 */
export function PageHeaderSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="-mx-4 px-4 pt-1 pb-2 flex flex-col desktop:hidden">
        <div className="flex min-h-9 items-center">
          <Skeleton className="h-[15px] w-36" />
        </div>
        {/* An inline block inside the line: the box takes the description's own line height. */}
        <div className="text-sm leading-tight">
          <Skeleton className="inline-block h-3 w-52 align-middle" />
        </div>
      </div>
      <div className="hidden desktop:flex min-h-9 items-center">
        <Skeleton className="h-2.5 w-24" />
      </div>
    </div>
  );
}
