'use client';

import { authenticatedFetch } from '@/lib/utils/authFetch';

/**
 * Mark the materialized dashboard overview summary as stale after a client-side mutation.
 *
 * The summary document is server-owned, so client-side mutations must go through
 * a private API route rather than writing the materialized collection directly.
 *
 * This helper is intentionally best-effort: overview invalidation should never make
 * the primary user action fail after the underlying Firestore write already succeeded.
 */
export async function invalidateDashboardOverviewSummary(
  _userId: string,
  reason: string
): Promise<void> {
  try {
    await authenticatedFetch('/api/dashboard/overview/invalidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    });
  } catch (error) {
    console.warn('[dashboardOverviewInvalidation] Failed to mark summary stale:', error);
  }
}
