'use client';

import { Tabs } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTabBar, type TabDef } from './PageTabBar';

interface PageTabsProps {
  tabs: TabDef[];
  value: string;
  onValueChange: (v: string) => void;
  layoutId: string;
  /** Accessible name of the tablist, forwarded to `PageTabBar`. */
  ariaLabel?: string;
  /** Show a loading skeleton instead of the tab bar */
  loading?: boolean;
  children: React.ReactNode;
}

export function PageTabs({ tabs, value, onValueChange, layoutId, ariaLabel, loading, children }: PageTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className="w-full">
      {loading ? (
        // Same height as the desktop underline bar (13px label + py-2.5) so nothing jumps.
        <Skeleton className="h-10 w-full rounded-none border-b border-border/50 bg-muted/30" />
      ) : (
        <PageTabBar tabs={tabs} value={value} onValueChange={onValueChange} layoutId={layoutId} ariaLabel={ariaLabel} />
      )}
      {children}
    </Tabs>
  );
}

export type { TabDef };
