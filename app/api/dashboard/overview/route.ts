import { NextRequest, NextResponse } from 'next/server';
import { getDashboardOverview } from '@/lib/services/dashboardOverviewService';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';

/**
 * GET /api/dashboard/overview
 * Query params: userId (required — the data-owner account)
 *
 * Private overview endpoint for the dashboard landing page and the Patrimonio
 * hero cards. Delegation-aware: the caller may request their own overview or,
 * for a shared account, the owner's — `assertCanAccessAccount` authorizes both.
 */
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = request.nextUrl.searchParams.get('userId');

    await assertCanAccessAccount(decodedToken, userId);
    const payload = await getDashboardOverview(userId as string);

    return NextResponse.json(payload);
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Error getting dashboard overview:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard overview' },
      { status: 500 }
    );
  }
}
