'use client';

import { useQuery } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import type { Dividend, DividendStatsPayload } from '@/types/dividend';

/**
 * The Dividendi tab's ONE request (`GET /api/dividends/stats`), read by two hooks on the same key:
 * `useDividendRegistry` hands the page the payment list, `useDividendStats` hands the tab the
 * server-measured half. Until 2026-10-05 the list was a second request (`/api/dividends`) and a
 * second read of the collection at every opening.
 */
interface DividendTabAnswer {
  /** `null` when the server read the registry but could not measure it (a failed input or computation). */
  stats: DividendStatsPayload | null;
  /** The owner's whole registry. Dates arrive as ISO strings: every reader converts with `toDate`. */
  dividends: Dividend[];
}

/** The key both hooks read and every dividend write invalidates (`app/dashboard/cashflow/page.tsx`). */
export function dividendStatsQueryKey(ownerId: string | null | undefined) {
  return ['dividend-stats', ownerId ?? ''] as const;
}

async function fetchDividendTab(ownerId: string): Promise<DividendTabAnswer> {
  const response = await authenticatedFetch(`/api/dividends/stats?userId=${ownerId}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || 'Errore nel caricamento dei dividendi');
  }
  const data = await response.json();
  return { stats: data.stats ?? null, dividends: data.dividends ?? [] };
}

function dividendTabQueryOptions(ownerId: string | null | undefined, enabled: boolean) {
  return {
    queryKey: dividendStatsQueryKey(ownerId),
    enabled: Boolean(ownerId) && enabled,
    queryFn: () => fetchDividendTab(ownerId as string),
    // Reread at every opening of the tab, behind the cached answer: dividends are also written
    // where nothing invalidates this key (the coupon scheduler on Patrimonio, the daily cron), and
    // while the list lived in the page's own state it was read again at every mount.
    staleTime: 0,
  };
}

// Module-level selectors: a stable reference keeps React Query from re-running them every render.
const selectStats = (answer: DividendTabAnswer) => answer.stats;
const selectRegistry = (answer: DividendTabAnswer) => answer.dividends;

/**
 * The server-measured half of the Dividendi tab: yield on cost, current yield, DPS growth and
 * per-instrument total return — everything the browser cannot derive from the dividend list
 * because it needs the cost-basis engines and the trade ledger.
 *
 * WHY NO DATE BOUNDS. Before the 2026-08-23 redesign this was fetched with the period's
 * `startDate`/`endDate` and refetched on every switch of the axis. Those bounds only ever
 * narrowed `periodStats` — a block the tab now derives in memory (dividendAnalytics) — while
 * YOC and current yield are TTM by construction and DPS growth and total return are all-time.
 * Passing them therefore bought nothing and cost a refetch per click, and it let a period
 * change silently move figures that are not on the period axis. One query per owner, cached.
 *
 * The Rendimento tile says so on the surface (`describeYieldFooter`): a tile measured on a
 * window other than the picker's must name its own window.
 *
 * `isError` is also true when the answer came back with the registry but without the measures
 * (`stats: null`): the tab says so in place of the Dettaglio and inside Rendimento, under a list
 * it can still draw.
 */
export function useDividendStats(ownerId: string | null | undefined, enabled = true) {
  const query = useQuery({ ...dividendTabQueryOptions(ownerId, enabled), select: selectStats });
  return {
    data: query.data ?? undefined,
    isLoading: query.isLoading,
    isError: query.isError || query.data === null,
  };
}

/** The owner's payment list, from the same answer as the measures. Read only where the tab is mounted. */
export function useDividendRegistry(ownerId: string | null | undefined, enabled = true) {
  return useQuery({ ...dividendTabQueryOptions(ownerId, enabled), select: selectRegistry });
}
