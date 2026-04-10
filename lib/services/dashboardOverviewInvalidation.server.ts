import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import {
  DASHBOARD_OVERVIEW_SOURCE_VERSION,
  DASHBOARD_OVERVIEW_SUMMARY_COLLECTION,
} from '@/lib/services/dashboardOverviewConstants';

/**
 * Server-side counterpart for overview summary invalidation.
 *
 * Routes that use the Admin SDK bypass Firestore security rules, so they must mark
 * the materialized summary stale explicitly when they change overview-relevant data.
 */
export async function invalidateDashboardOverviewSummaryServer(
  userId: string,
  reason: string
): Promise<void> {
  try {
    await adminDb.collection(DASHBOARD_OVERVIEW_SUMMARY_COLLECTION).doc(userId).set(
      {
        userId,
        sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
        invalidatedAt: Timestamp.now(),
        lastInvalidationReason: reason,
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('[dashboardOverviewInvalidationServer] Failed to mark summary stale:', error);
  }
}
