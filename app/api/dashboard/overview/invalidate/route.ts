import { NextRequest, NextResponse } from 'next/server';
import { invalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * POST /api/dashboard/overview/invalidate
 *
 * Private endpoint that marks the server-owned overview materialized summary as stale
 * after a client-side mutation succeeds.
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    let body: unknown = {};

    try {
      body = await request.json();
    } catch (error) {
      // Invalid or empty JSON body is non-fatal here: keep the default reason and log explicitly.
      console.warn('Failed to parse overview invalidation request body, using default reason', {
        userId: decodedToken.uid,
        operation: 'POST /api/dashboard/overview/invalidate',
        error: getErrorMessage(error),
      });
    }

    const requestBody =
      typeof body === 'object' && body !== null
        ? body as { reason?: unknown }
        : {};

    const reason = typeof requestBody.reason === 'string' && requestBody.reason.trim().length > 0
      ? requestBody.reason.trim()
      : 'client_mutation';

    await invalidateDashboardOverviewSummaryServer(decodedToken.uid, reason);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Failed to invalidate dashboard overview summary', {
      operation: 'POST /api/dashboard/overview/invalidate',
      error: getErrorMessage(error),
    });
    return NextResponse.json(
      { error: 'Failed to invalidate dashboard overview summary' },
      { status: 500 }
    );
  }
}
