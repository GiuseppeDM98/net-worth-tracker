import { NextRequest, NextResponse } from 'next/server';
import { getDashboardOverview } from '@/lib/services/dashboardOverviewService';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';

/**
 * GET /api/dashboard/overview
 *
 * Private overview endpoint for the dashboard landing page.
 * The authenticated Firebase token is the only authoritative user identity.
 */
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const payload = await getDashboardOverview(decodedToken.uid);

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
