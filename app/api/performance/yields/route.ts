import { NextRequest, NextResponse } from 'next/server';
import { getAllDividends } from '@/lib/services/dividendService';
import { getUserAssetsAdmin, getUserSnapshotsAdmin } from '@/lib/server/assetAdminRepository';
import { computeYieldsForPeriods } from '@/lib/utils/dividendYield';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { parseOr400, performanceYieldsRequestSchema } from '@/lib/server/validation';
import { startTiming } from '@/lib/server/serverTiming';

/**
 * POST /api/performance/yields
 *
 * Yield on Cost and current yield for every period in the body, over ONE read of the account's
 * dividends, assets and snapshots (until 2026-10-04: two routes, called once per period, each
 * reading the three collections again). A POST because the periods are a list; it writes nothing.
 *
 * Body: `{ userId, periods: [{ key, startDate, dividendEndDate, numberOfMonths }] }` — dates as ISO
 * strings, `dividendEndDate` already capped at today by the caller, `userId` the data-owner account.
 *
 * Returns `{ [key]: PerformanceYields }` (lib/utils/dividendYield.ts), with
 * `Server-Timing: auth, db, compute, total`.
 */
export async function POST(request: NextRequest) {
  const timing = startTiming();
  try {
    const decodedToken = await requireFirebaseAuth(request);

    // A body that is not JSON is a malformed request like any other: let the schema refuse it.
    const body: unknown = await request.json().catch(() => null);
    const parsed = parseOr400(performanceYieldsRequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const { userId, periods } = parsed.data;

    await assertCanAccessAccount(decodedToken, userId);
    timing.mark('auth');

    const [dividends, assets, snapshots] = await Promise.all([
      getAllDividends(userId),
      getUserAssetsAdmin(userId),
      getUserSnapshotsAdmin(userId),
    ]);
    timing.mark('db');

    const yieldsByKey = computeYieldsForPeriods({ dividends, assets, snapshots, periods });
    timing.mark('compute');

    return NextResponse.json(yieldsByKey, { headers: { 'Server-Timing': timing.toHeader() } });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('[API /performance/yields] Error calculating dividend yields:', error);
    return NextResponse.json({ error: 'Failed to calculate dividend yields' }, { status: 500 });
  }
}
