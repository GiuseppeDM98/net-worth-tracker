import { NextRequest, NextResponse } from 'next/server';
import { getDashboardOverview } from '@/lib/services/dashboardOverviewService';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { startTiming } from '@/lib/server/serverTiming';

// The Server-Timing `source`: short words for the DevTools column, one per freshness source.
const TIMING_SOURCE = {
  materialized_summary: 'materialized',
  live_recompute: 'recompute',
} as const;

/**
 * GET /api/dashboard/overview
 * Query params: userId (required — the data-owner account)
 *
 * Private overview endpoint for the dashboard landing page and the Patrimonio
 * hero cards. Delegation-aware: the caller may request their own overview or,
 * for a shared account, the owner's — `assertCanAccessAccount` authorizes both.
 *
 * Answers with `Server-Timing: auth, db, compute, total, source` — the only place the
 * production latency of a recompute can be read (doc/guide/panoramica.md).
 */
export async function GET(request: NextRequest) {
  const timing = startTiming();
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = request.nextUrl.searchParams.get('userId');

    await assertCanAccessAccount(decodedToken, userId);
    timing.mark('auth');
    const payload = await getDashboardOverview(userId as string, { timing });

    return NextResponse.json(payload, {
      headers: {
        'Server-Timing': timing.toHeader({ source: TIMING_SOURCE[payload.freshness.source] }),
      },
    });
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
