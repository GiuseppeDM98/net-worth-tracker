'use client';

/**
 * React Query hook for the owner's cost centres (the `costCenters` collection).
 *
 * The centres ALONE: until 2026-09-29 `queryKeys.costCenters.all` carried the centres and
 * one Firestore query per centre for its rows (N+1 on rows already in `useExpenses`). The rows are
 * now grouped in memory by `groupExpensesByCostCenter` (lib/utils/costCenterUtils.ts) from the
 * expenses key, so this hook and `useExpenses` are the two reads the tab, the detail and the
 * expense form share. Every write that links or unlinks a row invalidates `costCenters.all` AND
 * `expenses.all` (doc/guide/centri-di-costo.md).
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getCostCenters } from '@/lib/services/costCenterService';
import type { CostCenter } from '@/types/costCenters';

/**
 * The owner's cost centres, creation order.
 *
 * `options.enabled` lets a form read only while open or while the feature is on.
 *
 * @param ownerId - Whose centres (`useActiveAccount().ownerId`, never the viewer's uid)
 */
export function useCostCenters(ownerId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery<CostCenter[]>({
    queryKey: queryKeys.costCenters.all(ownerId || ''),
    queryFn: () => getCostCenters(ownerId!),
    enabled: !!ownerId && (options?.enabled ?? true),
  });
}
