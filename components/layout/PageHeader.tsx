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
    <div className={className}>
      {/* Mobile sticky navbar — title + description in one block so the header
          feels like a unified navbar. */}
      <div className="sticky top-0 z-20 -mx-4 px-4 pt-1 pb-2 flex flex-col bg-background/95 backdrop-blur-sm desktop:hidden">
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
