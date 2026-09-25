import { cn } from '@/lib/utils';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';

interface PageHeaderProps {
  title: React.ReactNode;
  label?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * The compact page header (the default since the shell redesign, the only one since the last
 * propagation): on `desktop:` ONE line — eyebrow · title · description, actions on the right
 * — because on a redesigned page the real headline is the verdict in the content. It draws
 * no separator: when a tab bar follows, its underline is the separation. The eyebrow is the
 * tiles' eyebrow (10px, 0.1em) so the page has a single eyebrow voice. The mobile sticky
 * navbar is one block, and its title is what the user anchors to while scrolling.
 */
export function PageHeader({ title, label, description, actions, className }: PageHeaderProps) {
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
        {description && (
          <p className="text-sm text-muted-foreground leading-tight">{description}</p>
        )}
      </div>

      <div className="hidden desktop:flex items-center justify-between gap-4 min-h-9">
        <div className="flex items-baseline gap-3 min-w-0">
          {label && <p className={cn(TILE_EYEBROW_CLASS, 'shrink-0')}>{label}</p>}
          <h1 className="text-sm text-muted-foreground truncate">
            <span className="font-medium text-foreground">{title}</span>
            {description && <span> · {description}</span>}
          </h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
