import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COSTUME_FRAME_RADIUS_CLASS } from '@/lib/constants/themeCostume';

export interface LinkBannerProps {
  /** Destination href — passed to `next/link`. */
  href: string;
  /** Primary bold label. */
  title: string;
  /** Optional secondary description line below the title. */
  description?: string;
  /** Called when the link is clicked (e.g. to close a parent drawer). */
  onClick?: () => void;
  /** Extra classes on the root anchor element (e.g. top margin). */
  className?: string;
}

/**
 * LinkBanner — a tappable CTA row that navigates to an internal page.
 *
 * Renders a muted rounded panel with a title, optional description, and a
 * trailing chevron. Intended for "go deeper" affordances inside drawers,
 * cards, or empty states.
 *
 * @example
 * <LinkBanner
 *   href="/dashboard/analisi"
 *   title="Vai all'Analisi Cashflow"
 *   description="Sankey, trend, categorie e confronti"
 *   onClick={() => setOpen(false)}
 *   className="mt-4"
 * />
 */
export function LinkBanner({ href, title, description, onClick, className }: Readonly<LinkBannerProps>) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center justify-between bg-muted/40 px-3.5 py-2.5', COSTUME_FRAME_RADIUS_CLASS,
        'hover:bg-muted/60 transition-colors',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        {description && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" aria-hidden="true" />
    </Link>
  );
}
