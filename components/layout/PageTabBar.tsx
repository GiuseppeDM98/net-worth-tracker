'use client';

import type { ElementType } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type TabDef = {
  value: string;
  label: string;
  shortLabel?: string;
  icon?: ElementType;
};

const SPRING = { type: 'spring', stiffness: 400, damping: 35 } as const;

interface PageTabBarProps {
  tabs: TabDef[];
  value: string;
  onValueChange: (v: string) => void;
  layoutId: string;
  className?: string;
}

export function PageTabBar({ tabs, value, onValueChange, layoutId, className }: PageTabBarProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex border-b border-border mb-6 overflow-x-auto scrollbar-none',
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
            onClick={() => onValueChange(tv)}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
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
  );
}
