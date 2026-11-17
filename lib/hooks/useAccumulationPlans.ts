'use client';

/**
 * The owner's accumulation plans, read apart from the mutation hooks (`useAccumulationPlan.ts`):
 * the Allocazione page's Piano note and the Consulente's «Applica» read this one without pulling
 * the plan's service. The read service and the document conversion are imported by the query itself,
 * on demand, so neither page carries them in its first chunk. The key is persisted
 * (`PERSISTED_QUERY_PREFIXES`): on a warm load the plans are there before any read.
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';

export { selectOpenPlan } from '@/lib/utils/openAccumulationPlan';

// At module scope: the React Compiler does not lower an `import()` inside a hook.
const loadPlanRead = () => import('@/lib/services/accumulationPlanRead');

/** All of the owner's accumulation plans. */
export function useAccumulationPlans(ownerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.accumulationPlans.all(ownerId || ''),
    queryFn: async () => (await loadPlanRead()).getAccumulationPlans(ownerId!),
    enabled: !!ownerId,
  });
}
