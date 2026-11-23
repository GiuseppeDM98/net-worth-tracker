'use client';

/**
 * The median of the monthly savings over the last full months — the instalment the plan's path
 * and Accumulo's empty tile suggest (owner, 2026-11-12: the MEDIAN of the last twelve months, never the
 * year's savings divided by 12, which one bonus month inflates).
 *
 * The figure is the cashflow block's (`buildCashflowBlock`: the same median the Consulente and the
 * Assistente read), on FIRE's `recent` window (January of last year → this December, `fireWindows`),
 * which always holds the twelve full months before this one — so after FIRE the expenses read
 * nothing new. Read only while a caller is on screen (`enabled`).
 */
import { useState } from 'react';
import { useExpensesInRange } from '@/lib/hooks/useExpenses';
import { useSettings } from '@/lib/hooks/useSettings';
import { calculateAssetValue } from '@/lib/services/assetService';
import { buildCashflowBlock } from '@/lib/utils/cashflowBlock';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { fireWindows } from '@/lib/utils/expenseWindows';
import type { Asset } from '@/types/assets';

export interface MonthlySavingsMedian { medianEur: number; months: number }

/**
 * undefined = still reading; null = no suggestion (fewer than CASHFLOW_BLOCK_MIN_MEDIAN_MONTHS months of data, or
 * the read failed: the path stays usable, the field empty).
 */
export function useMonthlySavingsMedian(
  ownerId: string,
  assets: Asset[],
  options: { enabled: boolean },
): MonthlySavingsMedian | null | undefined {
  // The mount's clock: the window and the block's «today» never drift while the screen is open.
  const [readAt] = useState(() => new Date());
  const settingsQuery = useSettings(ownerId);
  const expensesQuery = useExpensesInRange(ownerId, fireWindows(readAt, null).recent, { enabled: options.enabled });
  if (!options.enabled) return undefined;
  if (expensesQuery.isError || settingsQuery.isError) return null;
  if (!expensesQuery.data || settingsQuery.data === undefined) return undefined;
  const block = buildCashflowBlock(expensesQuery.data, { todayIso: getItalyDateIso(readAt), categories: [], assets,
    settings: settingsQuery.data ?? null, assetValueOf: calculateAssetValue });
  // The median spans 3 to 12 months (lib/utils/cashflowBlock.ts, `CASHFLOW_BLOCK_MIN_MEDIAN_MONTHS`): the sentence names how many.
  return block.volatility ? { medianEur: block.volatility.savings.median, months: block.windows.medianMonths } : null;
}
