'use client';

import type { ElementType } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type TabDef = {
  value: string;
  label: string;
  icon?: ElementType;
};

const SPRING = { type: 'spring', stiffness: 400, damping: 35 } as const;

interface PageTabBarProps {
  tabs: TabDef[];
  value: string;
  onValueChange: (v: string) => void;
  layoutId: string;
  /** Accessible name of the tablist — what the tabs switch between ("Sezioni di Cashflow"). */
  ariaLabel?: string;
  className?: string;
}

/**
 * Section tabs of a page. Below `desktop:` a centred segmented pill (active tab = icon +
 * label, the others icon only); from `desktop:` an underline bar that sits directly under the
 * compact page header and doubles as its separator — the header keeps the page title, the
 * tab keeps the section, so no title is printed twice. Every tab carries `aria-label`
 * unconditionally: the icon-only pill had no accessible name below 1440px.
 */
export function PageTabBar({ tabs, value, onValueChange, layoutId, ariaLabel, className }: PageTabBarProps) {
  return (
    <>
      {/* Mobile / tablet (< 1440px): Segmented Pill — active tab shows label, inactive shows icon only */}
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="desktop:hidden flex w-fit max-w-full mx-auto overflow-x-auto scrollbar-none bg-muted rounded-lg p-1 my-2"
      >
        {tabs.map(({ value: tv, label, icon: Icon }) => {
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
              aria-label={label}
              onClick={() => onValueChange(tv)}
              transition={SPRING}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-sm font-medium whitespace-nowrap z-10',
                isActive ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {showLabel && <span>{label}</span>}
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
        {tabs.map(({ value: tv, label, icon: Icon }) => {
          const isActive = value === tv;
          return (
            <button
              key={tv}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={label}
              onClick={() => onValueChange(tv)}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors whitespace-nowrap',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {label}
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
