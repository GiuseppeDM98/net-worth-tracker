import { NextRequest, NextResponse } from 'next/server';
import { invalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';

/**
 * POST /api/dashboard/overview/invalidate
 *
 * Private endpoint that marks the server-owned overview materialized summary as stale
 * after a client-side mutation succeeds.
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' && body.reason.trim().length > 0
      ? body.reason.trim()
      : 'client_mutation';

    await invalidateDashboardOverviewSummaryServer(decodedToken.uid, reason);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Error invalidating dashboard overview summary:', error);
    return NextResponse.json(
      { error: 'Failed to invalidate dashboard overview summary' },
      { status: 500 }
    );
  }
}
