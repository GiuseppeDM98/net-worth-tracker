'use client';

import { Tabs } from '@/components/ui/tabs';
import { PageTabBar, type TabDef } from './PageTabBar';

interface PageTabsProps {
  tabs: TabDef[];
  value: string;
  onValueChange: (v: string) => void;
  layoutId: string;
  /** Show a loading skeleton instead of the tab bar */
  loading?: boolean;
  children: React.ReactNode;
}

export function PageTabs({ tabs, value, onValueChange, layoutId, loading, children }: PageTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className="w-full">
      {loading ? (
        <div className="h-12 w-full border-b border-border/50 bg-muted/30 animate-pulse mb-6" />
      ) : (
        <PageTabBar tabs={tabs} value={value} onValueChange={onValueChange} layoutId={layoutId} />
      )}
      {children}
    </Tabs>
  );
}

export type { TabDef };
