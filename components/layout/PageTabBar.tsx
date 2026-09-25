'use client';

import type { ElementType } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type TabDef = {
  value: string;
  label: string;
  icon?: ElementType;
  /**
   * The tab holds edits the page has not saved: a dot beside the icon, and the words in the
   * tab's accessible name. A page with ONE Save over several tabs (Impostazioni) needs it, or the
   * reader cannot tell which of six tabs is holding the change.
   */
  unsaved?: boolean;
};

/** The dot of an `unsaved` tab — decoration, the name carries the words. */
function UnsavedDot() {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />;
}

const tabName = (label: string, unsaved?: boolean) => (unsaved ? `${label}, modifiche non salvate` : label);

const SPRING = { type: 'spring', stiffness: 400, damping: 35 } as const;

/**
 * The id of the panel a tab controls — the ONE place the convention lives.
 *
 * WARNING: a page that renders a `<TabsContent value="x">` under `PageTabs` must give it
 * `id={pageTabPanelId(layoutId, 'x')}`, an `aria-label` and `aria-labelledby={undefined}`.
 * Radix generates its own pair (`radix-…-trigger-x` / `…-content-x`) on the assumption that the
 * triggers are ITS triggers, and here they are not: these are plain buttons, so every panel
 * carried an `aria-labelledby` naming an element that does not exist (measured 2026-09-21). The
 * panel is named by `aria-label` rather than by pointing back at a tab, because the two bars
 * below render the same tabs twice and one of them is always `display:none` — a name taken from
 * a hidden element is no name at all.
 */
export const pageTabPanelId = (layoutId: string, value: string) => `${layoutId}-panel-${value}`;

interface PageTabBarProps {
  tabs: TabDef[];
  value: string;
  onValueChange: (v: string) => void;
  layoutId: string;
  /** Accessible name of the tablist — what the tabs switch between ("Sezioni di Cashflow"). */
  ariaLabel?: string;
  /**
   * The tab values whose panel is actually in the DOM. A page that mounts its panels lazily
   * passes its own set; omitting it means every panel is rendered.
   *
   * `aria-controls` may only name an element that exists, and a tab whose panel has never been
   * opened has none — pointing at it would trade one dangling reference for another.
   */
  renderedPanels?: ReadonlySet<string>;
  className?: string;
}

/**
 * Section tabs of a page. Below `desktop:` a centred segmented pill (active tab = icon +
 * label, the others icon only); from `desktop:` an underline bar that sits directly under the
 * compact page header and doubles as its separator — the header keeps the page title, the
 * tab keeps the section, so no title is printed twice. Every tab carries `aria-label`
 * unconditionally: the icon-only pill had no accessible name below 1440px.
 */
export function PageTabBar({ tabs, value, onValueChange, layoutId, ariaLabel, renderedPanels, className }: PageTabBarProps) {
  const panelId = (tabValue: string) =>
    !renderedPanels || renderedPanels.has(tabValue) ? pageTabPanelId(layoutId, tabValue) : undefined;
  return (
    <>
      {/* Mobile / tablet (< 1440px): Segmented Pill — active tab shows label, inactive shows icon only */}
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="desktop:hidden flex w-fit max-w-full mx-auto overflow-x-auto scrollbar-none bg-muted rounded-lg p-1 my-2"
      >
        {tabs.map(({ value: tv, label, icon: Icon, unsaved }) => {
          const isActive = value === tv;
          // Show label when active, or always when the tab has no icon
          const showLabel = isActive || !Icon;
          return (
            <motion.button
              layout="size"
              key={tv}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId(tv)}
              aria-label={tabName(label, unsaved)}
              onClick={() => onValueChange(tv)}
              transition={SPRING}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-sm font-medium whitespace-nowrap z-10',
                isActive ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {showLabel && <span>{label}</span>}
              {unsaved && <UnsavedDot />}
              {isActive && (
                <motion.div
                  layoutId={`${layoutId}-pill`}
                  className="absolute inset-0 -z-10 rounded-[6px] bg-background shadow-sm"
                  transition={SPRING}
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Desktop (≥ 1440px): underline bar, 13px labels, flush under the compact header */}
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          'hidden desktop:flex border-b border-border overflow-x-auto scrollbar-none',
          className,
        )}
      >
        {tabs.map(({ value: tv, label, icon: Icon, unsaved }) => {
          const isActive = value === tv;
          return (
            <button
              key={tv}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId(tv)}
              aria-label={tabName(label, unsaved)}
              onClick={() => onValueChange(tv)}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors whitespace-nowrap',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {label}
              {unsaved && <UnsavedDot />}
              {isActive && (
                <motion.div
                  layoutId={`${layoutId}-underline`}
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground"
                  transition={SPRING}
                />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
