'use client';

/**
 * What the six Impostazioni views share (2026-10-08): the panel each one renders, the
 * control transition class, the declaration row of the read-only tiles, the percentage label.
 * Each view is a module-level component controlled by the page's draft (lib/utils/settingsDraft.ts):
 * it receives its slice, emits a patch, keeps no form state — Radix unmounts an inactive panel,
 * and a view holding its own fields would lose them at the first tab change.
 */

import { TabsContent } from '@/components/ui/tabs';
import { pageTabPanelId } from '@/components/layout/PageTabBar';
import { cn } from '@/lib/utils';
import { formatPercentage } from '@/lib/services/chartService';
import type { SettingsTabId } from '@/lib/utils/settingsDraft';

/**
 * A try/catch/finally at module level, for the page's and the views' async handlers: the React
 * Compiler refuses a `finally`, a `throw` and any conditional expression inside a component's own
 * try block, and these handlers have all three. `work` is the try block (its `return` is the
 * handler's), `onError` the catch, `onSettled` the finally — same order, same propagation.
 */
export async function runGuarded<T>(
  work: () => Promise<T>,
  onError: (error: unknown) => T,
  onSettled?: () => void,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    return onError(error);
  } finally {
    onSettled?.();
  }
}

/** The `layoutId` of the page's tab pill — the panel ids derive from it. */
export const SETTINGS_TABS_LAYOUT_ID = 'settings-tab-pill';

export const INTERACTIVE_CONTROL_CLASS =
  'motion-safe:transition-[border-color,box-shadow,background-color,color] motion-safe:duration-150 motion-reduce:transition-none';

/** A percentage with only the decimals the value carries (100 → «100%», 3,5 → «3,5%»). */
export const pctLabel = (value: number): string => formatPercentage(value, value % 1 === 0 ? 0 : 1);

/** Label · mono value row of a read-only declaration tile (Parametri del piano, Assistente, BTP Italia). */
export function DeclarationRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={cn('text-[13px] font-semibold', mono && 'font-mono tabular-nums')}>{value}</span>
    </div>
  );
}

interface SettingsTabPanelProps {
  tab: SettingsTabId;
  /** The panel's accessible name — the label of its tab. */
  label: string;
  children: React.ReactNode;
}

/**
 * One tab's panel: the Radix content with the page's panel id and the 12-column tile grid every
 * tab lays its tiles on. Radix names a Content after ITS trigger; the page's triggers are plain
 * buttons, so the generated reference points at nothing — the name is the label.
 */
export function SettingsTabPanel({ tab, label, children }: SettingsTabPanelProps) {
  return (
    <TabsContent
      value={tab}
      id={pageTabPanelId(SETTINGS_TABS_LAYOUT_ID, tab)}
      aria-label={label}
      aria-labelledby={undefined}
      className="mt-4"
    >
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">{children}</div>
    </TabsContent>
  );
}
