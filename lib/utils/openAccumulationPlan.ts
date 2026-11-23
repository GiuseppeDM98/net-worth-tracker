/**
 * The one plan the tab shows, picked from the owner's plans. A module of its own, with no other
 * import, so the Allocazione page and the Consulente can tell an open plan apart without loading the
 * document conversion or the read service (both arrive with the query, on demand).
 */
import type { AccumulationPlan } from '@/types/accumulationPlan';

/** The one plan the tab shows (at most one in draft or active per account), if there is one. */
export function selectOpenPlan(plans: AccumulationPlan[] | undefined): AccumulationPlan | undefined {
  return plans?.find((plan) => plan.status === 'draft' || plan.status === 'active');
}
