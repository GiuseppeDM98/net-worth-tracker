'use client';

/**
 * The account's one open accumulation plan and the month it is in — shared by the Piano's note on
 * Bilanciamento and the Accumulo tab, so the two read the same plan on the same calendar day. Reads
 * only the slim modules: the Allocazione page's first load imports it.
 *
 * `today` is stabilised to day granularity (never `new Date()` inline in a memo): a fresh Date on
 * every render would defeat the memoisation downstream.
 */
import { useMemo } from 'react';
import { selectOpenPlan, useAccumulationPlans } from '@/lib/hooks/useAccumulationPlans';
import { monthIndexOf, toMonthKey } from '@/lib/utils/planMonths';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';

export function useOpenAccumuloPlan(ownerId: string | undefined) {
  const plansQuery = useAccumulationPlans(ownerId);
  const plan = selectOpenPlan(plansQuery.data);
  const todayIso = getItalyDateIso(new Date());
  const today = useMemo(() => new Date(`${todayIso}T12:00:00`), [todayIso]);
  const currentIndex = useMemo(() => (plan ? monthIndexOf(plan, toMonthKey(today)) : 0), [plan, today]);
  return { plansQuery, plan, today, currentIndex };
}
