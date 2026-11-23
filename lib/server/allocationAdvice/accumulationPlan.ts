/**
 * The plan of accumulation as the Consulente reads it (owner, 2026-11-12): the active plan only,
 * in the shape `describeOpenPlanForAdvice` gives every reader outside the Accumulo tab — month k
 * of N, the instalment, the end month, what it buys and sells. A draft, a completed or a cancelled
 * plan read as «no active plan»; the model and its criteria are never read (the Consulente stays
 * out of them).
 *
 * The one read of the Consulente's context that never fails its caller: a failed read is logged
 * and becomes `{ read: false }`, which the PIANO DI ACCUMULO block prints as its own sentence.
 * Both Admin queries filter on `userId`, the client's shape (the Admin SDK bypasses the rules).
 */
import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import { ACCUMULATION_PLANS_COLLECTION, docToAccumulationPlan } from '@/lib/utils/accumulationPlanDoc';
import { selectOpenPlan } from '@/lib/utils/openAccumulationPlan';
import { describeOpenPlanForAdvice, type OpenPlanForAdvice } from '@/lib/utils/accumuloMonth';
import { toMonthKey } from '@/lib/utils/planMonths';

export type AccumulationPlanRead = { read: true; plan: OpenPlanForAdvice | null } | { read: false };

/** The active plan of `userId` at `now`; a failed read is logged, never a failed stage. */
export async function readAccumulationPlanForAdvice(userId: string, now: Date): Promise<AccumulationPlanRead> {
  try {
    const plans = await adminDb.collection(ACCUMULATION_PLANS_COLLECTION).where('userId', '==', userId).get();
    const open = selectOpenPlan(plans.docs.map((doc) => docToAccumulationPlan(doc.id, doc.data())));
    if (!open || open.status !== 'active') return { read: true, plan: null };
    const assets = await adminDb.collection('assets').where('userId', '==', userId).get();
    const names = new Map(assets.docs.map((doc) => [doc.id, String(doc.data().name ?? '').trim()]));
    // An instrument deleted since the plan was made keeps the position's own label.
    const labels = new Map(open.positions.map((position) => [position.buyAssetId, position.label]));
    const nameOf = (id: string) => names.get(id) || labels.get(id) || 'strumento non più in portafoglio';
    return { read: true, plan: describeOpenPlanForAdvice(open, toMonthKey(now), nameOf) };
  } catch (error) {
    console.error('[consulente] accumulation plan not read', error);
    return { read: false };
  }
}
