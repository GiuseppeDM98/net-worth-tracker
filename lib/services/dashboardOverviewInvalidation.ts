'use client';

import { Timestamp, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  DASHBOARD_OVERVIEW_SOURCE_VERSION,
  DASHBOARD_OVERVIEW_SUMMARY_COLLECTION,
} from '@/lib/services/dashboardOverviewConstants';

/**
 * Mark the materialized dashboard overview summary as stale after a client-side mutation.
 *
 * This helper is intentionally best-effort: overview invalidation should never make
 * the primary user action fail after the underlying Firestore write already succeeded.
 */
export async function invalidateDashboardOverviewSummary(
  userId: string,
  reason: string
): Promise<void> {
  try {
    await setDoc(
      doc(db, DASHBOARD_OVERVIEW_SUMMARY_COLLECTION, userId),
      {
        userId,
        sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
        invalidatedAt: Timestamp.now(),
        lastInvalidationReason: reason,
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('[dashboardOverviewInvalidation] Failed to mark summary stale:', error);
  }
}
