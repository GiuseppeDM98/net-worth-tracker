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
  month: number
): Promise<AssistantMonthContextBundle> {
  const response = await authenticatedFetch(
    `/api/ai/assistant/context?userId=${encodeURIComponent(userId)}&year=${year}&month=${month}`
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? 'Impossibile caricare il contesto mensile');
  }

  const payload = await response.json();
  return payload.bundle as AssistantMonthContextBundle;
}

async function fetchYearContext(userId: string, year: number): Promise<AssistantMonthContextBundle> {
  const response = await authenticatedFetch(
    `/api/ai/assistant/context?userId=${encodeURIComponent(userId)}&mode=year_analysis&year=${year}`
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? 'Impossibile caricare il contesto annuale');
  }

  const payload = await response.json();
  return payload.bundle as AssistantMonthContextBundle;
}

async function fetchYtdContext(userId: string, currentYear: number): Promise<AssistantMonthContextBundle> {
  const response = await authenticatedFetch(
    `/api/ai/assistant/context?userId=${encodeURIComponent(userId)}&mode=ytd_analysis`
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? 'Impossibile caricare il contesto YTD');
  }

  const payload = await response.json();
  return payload.bundle as AssistantMonthContextBundle;
}

async function fetchHistoryContext(userId: string, startYear: number): Promise<AssistantMonthContextBundle> {
  const response = await authenticatedFetch(
    `/api/ai/assistant/context?userId=${encodeURIComponent(userId)}&mode=history_analysis`
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? 'Impossibile caricare il contesto storico');
  }

  const payload = await response.json();
  return payload.bundle as AssistantMonthContextBundle;
}

// ─── Month context hook ───────────────────────────────────────────────────────

export function useAssistantMonthContext(
  userId: string | undefined,
  month: AssistantMonthSelectorValue | null
): UseQueryResult<AssistantMonthContextBundle> {
  const enabled = !!userId && month !== null;

  return useQuery({
    queryKey: enabled
      ? queryKeys.assistant.context(userId!, month!.year, month!.month)
      : ['assistant', 'context', 'disabled'],
    queryFn: () => fetchMonthContext(userId!, month!.year, month!.month),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Year context hook ────────────────────────────────────────────────────────

export function useAssistantYearContext(
  userId: string | undefined,
  year: number | null
): UseQueryResult<AssistantMonthContextBundle> {
  const enabled = !!userId && year !== null;

  return useQuery({
    queryKey: enabled
      ? queryKeys.assistant.contextYear(userId!, year!)
      : ['assistant', 'context', 'disabled'],
    queryFn: () => fetchYearContext(userId!, year!),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── YTD context hook ─────────────────────────────────────────────────────────

export function useAssistantYtdContext(
  userId: string | undefined,
  currentYear: number | null
): UseQueryResult<AssistantMonthContextBundle> {
  const enabled = !!userId && currentYear !== null;

  return useQuery({
    queryKey: enabled
      ? queryKeys.assistant.contextYtd(userId!, currentYear!)
      : ['assistant', 'context', 'disabled'],
    queryFn: () => fetchYtdContext(userId!, currentYear!),
    enabled,
    // YTD data changes frequently — shorter stale time
    staleTime: 2 * 60 * 1000,
  });
}

// ─── History context hook ─────────────────────────────────────────────────────

export function useAssistantHistoryContext(
  userId: string | undefined,
  startYear: number | null
): UseQueryResult<AssistantMonthContextBundle> {
  const enabled = !!userId && startYear !== null;

  return useQuery({
    queryKey: enabled
      ? queryKeys.assistant.contextHistory(userId!, startYear!)
      : ['assistant', 'context', 'disabled'],
    queryFn: () => fetchHistoryContext(userId!, startYear!),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Generic period context hook ─────────────────────────────────────────────

/**
 * Dispatches to the correct context hook based on mode and thread pins.
 * Used in AssistantPageClient to repopulate the context panel on thread open.
 */
export function useAssistantPeriodContext(
  userId: string | undefined,
  mode: AssistantMode,
  pinnedMonth: AssistantMonthSelectorValue | null,
  pinnedYear: number | null,
  currentYear: number,
  historyStartYear: number | null,
  enabled: boolean
): UseQueryResult<AssistantMonthContextBundle> {
  const monthEnabled = enabled && mode === 'month_analysis' && pinnedMonth !== null;
  const yearEnabled = enabled && mode === 'year_analysis' && pinnedYear !== null;
  const ytdEnabled = enabled && mode === 'ytd_analysis';
  const historyEnabled = enabled && mode === 'history_analysis';

  const monthResult = useAssistantMonthContext(
    monthEnabled ? userId : undefined,
    monthEnabled ? pinnedMonth : null
  );
  const yearResult = useAssistantYearContext(
    yearEnabled ? userId : undefined,
    yearEnabled ? pinnedYear : null
  );
  const ytdResult = useAssistantYtdContext(
    ytdEnabled ? userId : undefined,
    ytdEnabled ? currentYear : null
  );
  const historyResult = useAssistantHistoryContext(
    historyEnabled ? userId : undefined,
    historyEnabled ? historyStartYear : null
  );

  // Return the result for the active mode
  if (mode === 'month_analysis') return monthResult;
  if (mode === 'year_analysis') return yearResult;
  if (mode === 'ytd_analysis') return ytdResult;
  if (mode === 'history_analysis') return historyResult;

  // chat mode: falls back to month result (may be disabled)
  return monthResult;
}
