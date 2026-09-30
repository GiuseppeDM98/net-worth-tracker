'use client';

/**
 * React Query hook for the Hall of Fame document (`hall-of-fame/{uid}`): the pre-computed rankings
 * and the notes. Read through a key so the page shows the cached document on a return visit and
 * «Aggiorna i record» invalidates instead of re-reading by hand (2026-09-29; the key is on the
 * persisted allowlist, so the document survives a reload — lib/constants/persistCache.ts).
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getHallOfFameData } from '@/lib/services/hallOfFameService';
import type { HallOfFameData } from '@/types/hall-of-fame';

/**
 * The owner's Hall of Fame document, `null` when the rankings were never computed.
 *
 * @param ownerId - Whose records (`useActiveAccount().ownerId`, never the viewer's uid)
 */
export function useHallOfFame(ownerId: string | undefined) {
  return useQuery<HallOfFameData | null>({
    queryKey: queryKeys.hallOfFame.all(ownerId || ''),
    queryFn: () => getHallOfFameData(ownerId!),
    enabled: !!ownerId,
  });
}
