'use client';

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import {
  AssistantMode,
  AssistantMonthContextBundle,
  AssistantMonthSelectorValue,
} from '@/types/assistant';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';

/**
 * The test-snapshot preference as a query-string suffix. The page reads the memory at mount and
 * passes the preference on, so the route does not read the memory document again; while the
 * memory has not answered yet (`undefined`) nothing is sent and the route reads it itself.
 *
 * It is deliberately NOT part of the query keys: the value is the stored one either way, and a key
 * that changed when the memory lands would fetch every context twice.
 */
function includeDummyParam(includeDummySnapshots: boolean | undefined): string {
  return includeDummySnapshots === undefined ? '' : `&includeDummy=${includeDummySnapshots}`;
}

/**
 * Fetches the numeric context bundle for a given month synchronously (no streaming).
 * Used to repopulate the context panel when an existing month_analysis thread is opened
 * and no active SSE bundle is present in component state.
 *
 * staleTime is 5 minutes: past-month data rarely changes, so we avoid redundant
 * Firestore reads when the user switches back to a thread they just viewed.
 */
async function fetchMonthContext(
  userId: string,
  year: number,
  month: number,
  includeDummySnapshots: boolean | undefined
): Promise<AssistantMonthContextBundle> {
  const response = await authenticatedFetch(
    `/api/ai/assistant/context?userId=${encodeURIComponent(userId)}&year=${year}&month=${month}${includeDummyParam(includeDummySnapshots)}`
  );

  if (!response.ok) {
    const errorResponse = await response.json().catch(() => null);
    throw new Error(errorResponse?.error ?? 'Impossibile caricare il contesto mensile');
  }

  const contextResponse = await response.json();
  return contextResponse.bundle as AssistantMonthContextBundle;
}

async function fetchYearContext(
  userId: string,
  year: number,
  includeDummySnapshots: boolean | undefined
): Promise<AssistantMonthContextBundle> {
  const response = await authenticatedFetch(
    `/api/ai/assistant/context?userId=${encodeURIComponent(userId)}&mode=year_analysis&year=${year}${includeDummyParam(includeDummySnapshots)}`
  );

  if (!response.ok) {
    const errorResponse = await response.json().catch(() => null);
    throw new Error(errorResponse?.error ?? 'Impossibile caricare il contesto annuale');
  }

  const contextResponse = await response.json();
  return contextResponse.bundle as AssistantMonthContextBundle;
}

async function fetchYtdContext(userId: string, includeDummySnapshots: boolean | undefined): Promise<AssistantMonthContextBundle> {
  const response = await authenticatedFetch(
    `/api/ai/assistant/context?userId=${encodeURIComponent(userId)}&mode=ytd_analysis${includeDummyParam(includeDummySnapshots)}`
  );

  if (!response.ok) {
    const errorResponse = await response.json().catch(() => null);
    throw new Error(errorResponse?.error ?? 'Impossibile caricare il contesto YTD');
  }

  const contextResponse = await response.json();
  return contextResponse.bundle as AssistantMonthContextBundle;
}

async function fetchHistoryContext(userId: string, includeDummySnapshots: boolean | undefined): Promise<AssistantMonthContextBundle> {
  const response = await authenticatedFetch(
    `/api/ai/assistant/context?userId=${encodeURIComponent(userId)}&mode=history_analysis${includeDummyParam(includeDummySnapshots)}`
  );

  if (!response.ok) {
    const errorResponse = await response.json().catch(() => null);
    throw new Error(errorResponse?.error ?? 'Impossibile caricare il contesto storico');
  }

  const contextResponse = await response.json();
  return contextResponse.bundle as AssistantMonthContextBundle;
}

// ─── Month context hook ───────────────────────────────────────────────────────

function useAssistantMonthContext(
  userId: string | undefined,
  month: AssistantMonthSelectorValue | null,
  includeDummySnapshots: boolean | undefined
): UseQueryResult<AssistantMonthContextBundle> {
  const enabled = !!userId && month !== null;

  return useQuery({
    queryKey: enabled
      ? queryKeys.assistant.context(userId!, month!.year, month!.month)
      : ['assistant', 'context', 'disabled'],
    queryFn: () => fetchMonthContext(userId!, month!.year, month!.month, includeDummySnapshots),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Year context hook ────────────────────────────────────────────────────────

function useAssistantYearContext(
  userId: string | undefined,
  year: number | null,
  includeDummySnapshots: boolean | undefined
): UseQueryResult<AssistantMonthContextBundle> {
  const enabled = !!userId && year !== null;

  return useQuery({
    queryKey: enabled
      ? queryKeys.assistant.contextYear(userId!, year!)
      : ['assistant', 'context', 'disabled'],
    queryFn: () => fetchYearContext(userId!, year!, includeDummySnapshots),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── YTD context hook ─────────────────────────────────────────────────────────

function useAssistantYtdContext(
  userId: string | undefined,
  currentYear: number | null,
  includeDummySnapshots: boolean | undefined
): UseQueryResult<AssistantMonthContextBundle> {
  const enabled = !!userId && currentYear !== null;

  return useQuery({
    queryKey: enabled
      ? queryKeys.assistant.contextYtd(userId!, currentYear!)
      : ['assistant', 'context', 'disabled'],
    queryFn: () => fetchYtdContext(userId!, includeDummySnapshots),
    enabled,
    // YTD data changes frequently — shorter stale time
    staleTime: 2 * 60 * 1000,
  });
}

// ─── History context hook ─────────────────────────────────────────────────────

function useAssistantHistoryContext(
  userId: string | undefined,
  startYear: number | null,
  includeDummySnapshots: boolean | undefined
): UseQueryResult<AssistantMonthContextBundle> {
  const enabled = !!userId && startYear !== null;

  return useQuery({
    queryKey: enabled
      ? queryKeys.assistant.contextHistory(userId!, startYear!)
      : ['assistant', 'context', 'disabled'],
    queryFn: () => fetchHistoryContext(userId!, includeDummySnapshots),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Generic period context hook ─────────────────────────────────────────────

/**
 * Dispatches to the correct context hook based on mode and thread pins.
 * Used in AssistantPageClient to repopulate the context panel on thread open.
 * `includeDummySnapshots` is the preference the page already holds, `undefined` until its memory
 * has answered (see `includeDummyParam`).
 */
export function useAssistantPeriodContext(
  userId: string | undefined,
  mode: AssistantMode,
  pinnedMonth: AssistantMonthSelectorValue | null,
  pinnedYear: number | null,
  currentYear: number,
  historyStartYear: number | null,
  enabled: boolean,
  includeDummySnapshots: boolean | undefined
): UseQueryResult<AssistantMonthContextBundle> {
  const monthEnabled = enabled && mode === 'month_analysis' && pinnedMonth !== null;
  const yearEnabled = enabled && mode === 'year_analysis' && pinnedYear !== null;
  const ytdEnabled = enabled && mode === 'ytd_analysis';
  const historyEnabled = enabled && mode === 'history_analysis';

  const monthResult = useAssistantMonthContext(
    monthEnabled ? userId : undefined,
    monthEnabled ? pinnedMonth : null,
    includeDummySnapshots
  );
  const yearResult = useAssistantYearContext(
    yearEnabled ? userId : undefined,
    yearEnabled ? pinnedYear : null,
    includeDummySnapshots
  );
  const ytdResult = useAssistantYtdContext(
    ytdEnabled ? userId : undefined,
    ytdEnabled ? currentYear : null,
    includeDummySnapshots
  );
  const historyResult = useAssistantHistoryContext(
    historyEnabled ? userId : undefined,
    historyEnabled ? historyStartYear : null,
    includeDummySnapshots
  );

  // Return the result for the active mode
  if (mode === 'month_analysis') return monthResult;
  if (mode === 'year_analysis') return yearResult;
  if (mode === 'ytd_analysis') return ytdResult;
  if (mode === 'history_analysis') return historyResult;

  // chat mode: falls back to month result (may be disabled)
  return monthResult;
}
