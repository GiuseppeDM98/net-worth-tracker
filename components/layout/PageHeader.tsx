import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: React.ReactNode;
  label?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  /**
   * Show a border-b separator after the description.
   * Default true (pages without tabs). Pass false when PageTabs follows —
   * the tab bar's underline provides the visual separation.
   */
  separator?: boolean;
}

export function PageHeader({
  title,
  label,
  description,
  actions,
  className,
  separator = true,
}: PageHeaderProps) {
  return (
    <div className={cn(className)}>
      {/* Mobile sticky navbar. Title sits at the bottom (items-end pb-2) to minimise
          the visual gap between it and the description text below. */}
      <div className="sticky top-0 z-20 -mx-4 px-4 h-14 flex items-end pb-2 justify-between bg-background/95 backdrop-blur-sm desktop:hidden">
        <h1 className="text-[17px] font-semibold tracking-tight truncate min-w-0">{title}</h1>
        {actions && (
          <div className="flex shrink-0 items-center gap-1.5 ml-2">{actions}</div>
        )}
      </div>

      {/* Mobile description — sits tight below the sticky bar.
          Border-b only when no tab bar follows (separator=true). */}
      {description && (
        <p
          className={cn(
            'desktop:hidden mt-1 text-sm text-muted-foreground',
            separator && 'pb-3 border-b border-border',
          )}
        >
          {description}
        </p>
      )}

      {/* Desktop: original full header */}
      <div
        className={cn(
          'hidden desktop:block',
          separator && 'pb-4 border-b border-border',
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {label && (
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">
                {label}
              </p>
            )}
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
            {description && <p className="mt-1 text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
