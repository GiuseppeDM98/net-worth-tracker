'use client';

import { useState, useMemo, lazy, Suspense, type ReactNode } from 'react';
import { Tag, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CATEGORY_ICONS, CATEGORY_ICON_NAMES, CATEGORY_ICONS_BY_TYPE } from '@/lib/constants/categoryIcons';
import { cn } from '@/lib/utils';
import type { LucideProps } from 'lucide-react';

type LazyIconComponent = React.LazyExoticComponent<React.ComponentType<LucideProps>>;

/**
 * Every curated category icon as a lazy component, built ONCE at module load and shared by
 * the picker, the feed, the drawer, the table and Impostazioni: ONE cache, so a name never
 * maps to two instances. `React.lazy` only registers the import thunk, so the whole set costs
 * nothing until an icon is first rendered — no chunk is requested before then. It is a map,
 * not a function, so a render can READ a component by name instead of obtaining it from a
 * call: to the React Compiler a component returned by a call during render is a new type
 * every render (`react-hooks/static-components`), even when the callee caches it.
 */
export const LAZY_CATEGORY_ICONS: Partial<Record<string, LazyIconComponent>> = Object.fromEntries(
  CATEGORY_ICON_NAMES.map((name) => [
    name,
    lazy(() =>
      import('lucide-react').then((mod) => ({
        default: (mod as unknown as Record<string, React.ComponentType<LucideProps>>)[name],
      }))
    ),
  ])
);

/**
 * Resolve a Lucide icon component by name from the curated set. Returns null for unknown
 * icon names. For a lookup INSIDE a component body prefer `CategoryIcon` below or the map
 * read `LAZY_CATEGORY_ICONS[name]`: both are property reads of a module constant.
 */
export function getLazyIcon(name: string): LazyIconComponent | null {
  return LAZY_CATEGORY_ICONS[name] ?? null;
}

interface CategoryIconProps extends LucideProps {
  /** Icon name from `CATEGORY_ICONS`; an unknown name renders the fallback. */
  name: string;
  /** Shown while the icon chunk loads, and when the name is unknown. */
  fallback: ReactNode;
}

/**
 * A category icon by name, module-level so the lazy component is read from the map during
 * render and never created there. The remaining props go to the Lucide icon as-is.
 */
export function CategoryIcon({ name, fallback, ...iconProps }: Readonly<CategoryIconProps>) {
  const Icon = LAZY_CATEGORY_ICONS[name];
  if (!Icon) return fallback;
  return (
    <Suspense fallback={fallback}>
      <Icon {...iconProps} />
    </Suspense>
  );
}

interface IconPickerPopoverProps {
  value?: string;
  onChange: (icon: string | undefined) => void;
  /** aria-label for the trigger button */
  triggerAriaLabel?: string;
  /** Additional class names for the trigger button (e.g. compact sizing) */
  triggerClassName?: string;
  /**
   * When provided, type-relevant icons are shown first in the picker.
   * All other icons remain available via search or scrolling.
   */
  expenseType?: string;
}

/**
 * A Popover-based icon picker that lets the user choose a Lucide icon
 * from a curated set of category-relevant icons.
 *
 * Accessibility:
 * - Trigger button has aria-label describing the current selection.
 * - Icon grid is a radiogroup; each button is role="radio" with aria-checked
 *   and an aria-label using the Italian label from CATEGORY_ICONS.
 * - "Rimuovi icona" button removes the selection and closes the popover.
 */
export function IconPickerPopover({
  value,
  onChange,
  triggerAriaLabel,
  triggerClassName,
  expenseType,
}: Readonly<IconPickerPopoverProps>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Base order: type-relevant icons first, then the rest (deduped).
  const orderedIconNames = useMemo(() => {
    if (!expenseType) return CATEGORY_ICON_NAMES;
    const typeIcons = (CATEGORY_ICONS_BY_TYPE[expenseType] ?? []).filter(
      (n) => CATEGORY_ICONS[n]
    );
    const typeSet = new Set(typeIcons);
    const rest = CATEGORY_ICON_NAMES.filter((n) => !typeSet.has(n));
    return [...typeIcons, ...rest];
  }, [expenseType]);

  const filteredIcons = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orderedIconNames;
    return orderedIconNames.filter((name) => {
      const label = CATEGORY_ICONS[name] ?? '';
      return label.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    });
  }, [search, orderedIconNames]);

  const currentLabel = value ? (CATEGORY_ICONS[value] ?? value) : 'Nessuna icona';
  const triggerLabel =
    triggerAriaLabel ?? `Icona categoria: ${currentLabel}. Clicca per cambiare`;

  const handleSelect = (iconName: string) => {
    onChange(iconName);
    setOpen(false);
    setSearch('');
  };

  const handleClear = () => {
    onChange(undefined);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("h-10 w-10 p-0 flex-shrink-0", triggerClassName)}
          aria-label={triggerLabel}
          title={currentLabel}
        >
          {/* Trigger preview of the current selection; an unknown name falls back to the tag. */}
          {value ? (
            <CategoryIcon
              name={value}
              fallback={<Tag className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
              className="h-4 w-4"
              aria-hidden="true"
            />
          ) : (
            <Tag className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-72 p-3"
        align="start"
        side="bottom"
      >
        <div className="space-y-3">
          {/* Search */}
          <Input
            placeholder="Cerca icona…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />

          {/* Icon grid */}
          <div
            className="grid grid-cols-8 gap-1 max-h-56 overflow-y-auto"
            role="radiogroup"
            aria-label="Seleziona icona categoria"
          >
            {filteredIcons.map((iconName) => {
              const LazyIconComponent = getLazyIcon(iconName);
              if (!LazyIconComponent) return null;
              const label = CATEGORY_ICONS[iconName] ?? iconName;
              const isSelected = value === iconName;
              return (
                <button
                  key={iconName}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`${label}${isSelected ? ' (selezionata)' : ''}`}
                  title={label}
                  onClick={() => handleSelect(iconName)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Suspense fallback={<div className="h-4 w-4" />}>
                    <LazyIconComponent className="h-4 w-4" aria-hidden="true" />
                  </Suspense>
                </button>
              );
            })}
            {filteredIcons.length === 0 && (
              <p className="col-span-8 py-4 text-center text-xs text-muted-foreground">
                Nessuna icona trovata
              </p>
            )}
          </div>

          {/* Clear button */}
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs text-muted-foreground hover:text-destructive"
              onClick={handleClear}
            >
              <X className="h-3 w-3 mr-1" aria-hidden="true" />
              Rimuovi icona
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
