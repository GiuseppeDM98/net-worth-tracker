'use client';

/**
 * What the open accumulation plan buys this month, for the Bilanciamento's Piano note. The month
 * arithmetic (`accumuloMonth.ts`, `planMonths.ts`) is imported on demand, once a plan is open, so
 * the page's first chunk carries none of it; the note paints a tick after the plans arrive.
 */
import { useEffect, useMemo, useState } from 'react';
import { selectOpenPlan, useAccumulationPlans } from '@/lib/hooks/useAccumulationPlans';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';

type AccumuloMonthModule = typeof import('@/lib/utils/accumuloMonth');
// At module scope: the React Compiler does not lower an `import()` inside a hook.
const loadAccumuloMonth = (): Promise<AccumuloMonthModule> => import('@/lib/utils/accumuloMonth');

export function usePacMonth(ownerId: string | undefined) {
  const plan = selectOpenPlan(useAccumulationPlans(ownerId).data);
  const [monthModule, setMonthModule] = useState<AccumuloMonthModule | null>(null);
  const wanted = plan?.status === 'active';
  useEffect(() => {
    if (!wanted || monthModule) return;
    let live = true;
    void loadAccumuloMonth().then((loaded) => {
      if (live) setMonthModule(loaded);
    });
    return () => {
      live = false;
    };
  }, [wanted, monthModule]);
  const todayIso = getItalyDateIso(new Date());
  const pac = useMemo(
    () => (plan && monthModule ? monthModule.summarizePacMonthOn(plan, todayIso) : null),
    [plan, monthModule, todayIso],
  );
  return { plan, pac };
}
