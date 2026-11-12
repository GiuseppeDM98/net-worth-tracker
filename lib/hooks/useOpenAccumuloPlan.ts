'use client';

/**
 * The account's one open accumulation plan and the month it is in — shared by Allocazione's
 * Bilanciamento verdict (the clause that names the month's installment) and the Accumulo tab, so
 * the two read the same plan on the same calendar day.
 *
 * `today` is stabilised to day granularity (never `new Date()` inline in a memo): a fresh Date on
 * every render would defeat the memoisation downstream.
 */
import { useMemo } from 'react';
import { selectOpenPlan, useAccumulationPlans } from '@/lib/hooks/useAccumulationPlan';
import { monthIndexOf, toMonthKey } from '@/lib/utils/accumulationPlanUtils';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';

export function useOpenAccumuloPlan(ownerId: string | undefined) {
  const plansQuery = useAccumulationPlans(ownerId);
  const plan = selectOpenPlan(plansQuery.data);
  const todayIso = getItalyDateIso(new Date());
  const today = useMemo(() => new Date(`${todayIso}T12:00:00`), [todayIso]);
  const currentIndex = useMemo(() => (plan ? monthIndexOf(plan, toMonthKey(today)) : 0), [plan, today]);
  return { plansQuery, plan, today, currentIndex };
}
