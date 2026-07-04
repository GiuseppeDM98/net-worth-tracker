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
  ownerId: string,
  reason: string
): Promise<void> {
  try {
    // Send the data-owner id so the endpoint invalidates the OWNER's summary,
    // not the caller's — a shared-account delegate mutates the owner's data.
    await authenticatedFetch('/api/dashboard/overview/invalidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ownerId, reason }),
    });
  } catch (error) {
    console.warn('[dashboardOverviewInvalidation] Failed to mark summary stale:', error);
  }
}
