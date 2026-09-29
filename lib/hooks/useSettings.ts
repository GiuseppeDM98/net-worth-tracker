'use client';

/**
 * React Query hook for the owner's settings document (`assetAllocationTargets/{uid}`).
 *
 * THE ONE READER of `getSettings` outside the service layer (2026-09-29): every page and
 * component that needs a setting — Storico's floor year, Analisi's roles flag, the FIRE tabs, the
 * expense form's default accounts, Previdenza, the asset form's family members — reads this hook,
 * so the document is read ONCE per session and every writer (`setSettings`, the seven places of
 * doc/guide/impostazioni.md § Settings — the FIVE places) invalidates `queryKeys.settings.all`.
 *
 * No local `staleTime`: the global five minutes apply, and a write invalidates. `placeholderData`
 * never `initialData` (AGENTS.md § React Query and Derived State).
 */

import { queryOptions, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getSettings } from '@/lib/services/assetAllocationService';
import type { AssetAllocationSettings } from '@/types/assets';

/**
 * The owner's settings, `null` when the document does not exist yet.
 *
 * `options.enabled` lets a dialog read only while open (`AssetDialog`: a closed dialog mounted on
 * the page must not read); read `isLoading`, not `isPending`, on a disabled query.
 *
 * @param ownerId - Whose settings (`useActiveAccount().ownerId`, never the viewer's uid)
 */
export function useSettings(ownerId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    ...settingsQueryOptions(ownerId || ''),
    enabled: !!ownerId && (options?.enabled ?? true),
  });
}

/** The settings query as options, for an imperative `queryClient.fetchQuery` on the hook's own cache. */
export function settingsQueryOptions(ownerId: string) {
  return queryOptions<AssetAllocationSettings | null>({
    queryKey: queryKeys.settings.all(ownerId),
    queryFn: () => getSettings(ownerId),
  });
}
