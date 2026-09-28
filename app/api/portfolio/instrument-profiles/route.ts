import { NextRequest, NextResponse } from 'next/server';
import { assertCanAccessAccount, getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { getUserAssetsAdmin } from '@/lib/server/assetAdminRepository';
import { resolveInstrumentProfiles } from '@/lib/server/exposure/instrumentProfileService';
import { selectProfileRequests } from '@/lib/utils/exposureRequests';
import type { InstrumentProfilesResponse } from '@/types/exposure';

/**
 * GET /api/portfolio/instrument-profiles?userId=<ownerId>[&force=true]
 *
 * The Yahoo profiles of the quoted instruments in the OWNER's Allocazione portfolio — holdings,
 * sectors and family of a fund, sector and name of a stock — served from the shared per-ticker
 * cache (`lib/server/exposure/instrumentProfileService.ts`). The weighing happens in the browser,
 * on the assets the page already holds (doc/perf/PERF-00 § 4.3): this route answers only
 * `{ profiles, oldestFetchedAt }`, nothing of the user's.
 *
 * Owner-scoped: `userId` is the account whose instruments are read, and a delegated member of
 * that account gets the OWNER's profiles (the route it replaced read `decodedToken.uid`, so a
 * delegate saw their own exposure on the owner's page). `force=true` is the tile's «Aggiorna».
 *
 * Auth → validate → fetch → ownership → delegate → return (AGENTS.md § Server Layer).
 */
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = request.nextUrl.searchParams.get('userId');
    const force = request.nextUrl.searchParams.get('force') === 'true';

    await assertCanAccessAccount(decodedToken, userId);
    const ownerId = userId as string;

    const assets = await getUserAssetsAdmin(ownerId);
    const response: InstrumentProfilesResponse = await resolveInstrumentProfiles(selectProfileRequests(assets), { force });
    return NextResponse.json(response);
  } catch (error) {
    const authError = getApiAuthErrorResponse(error);
    if (authError) return authError;

    console.error('[instrument-profiles] Error resolving instrument profiles:', error);
    return NextResponse.json({ error: 'Failed to resolve instrument profiles' }, { status: 500 });
  }
}
