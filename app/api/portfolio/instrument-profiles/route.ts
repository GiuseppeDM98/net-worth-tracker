import { NextRequest, NextResponse } from 'next/server';
import { assertCanAccessAccount, getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { getUserAssetsAdmin } from '@/lib/server/assetAdminRepository';
import { resolveInstrumentProfiles } from '@/lib/server/exposure/instrumentProfileService';
import { startTiming } from '@/lib/server/serverTiming';
import { selectProfileRequests } from '@/lib/utils/exposureRequests';
import type { InstrumentProfilesResponse } from '@/types/exposure';

/**
 * GET /api/portfolio/instrument-profiles?userId=<ownerId>[&force=true]
 *
 * The Yahoo profiles of the quoted instruments in the OWNER's Allocazione portfolio — holdings,
 * sectors and family of a fund, sector and name of a stock — served from the shared per-ticker
 * cache (`lib/server/exposure/instrumentProfileService.ts`). The weighing happens in the browser,
 * on the assets the page already holds (doc/guide/allocazione.md § Esposizione): this route answers only
 * `{ profiles, oldestFetchedAt }`, nothing of the user's.
 *
 * Owner-scoped: `userId` is the account whose instruments are read, and a delegated member of
 * that account gets the OWNER's profiles (the route it replaced read `decodedToken.uid`, so a
 * delegate saw their own exposure on the owner's page). `force=true` is the tile's «Aggiorna».
 *
 * Answers with `Server-Timing: auth, db, yahoo, total, hits, fetched, source`: `db` is
 * the assets plus the cache documents, `hits`/`fetched` count the modules served from the cache and
 * asked to Yahoo, and `source` is `cache` when every module came from the cache, `yahoo` when at
 * least one was asked — the one place a cache miss can be read in production.
 *
 * Auth → validate → fetch → ownership → delegate → return (AGENTS.md § Server Layer).
 */
export async function GET(request: NextRequest) {
  const timing = startTiming();
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = request.nextUrl.searchParams.get('userId');
    const force = request.nextUrl.searchParams.get('force') === 'true';

    await assertCanAccessAccount(decodedToken, userId);
    timing.mark('auth');
    const ownerId = userId as string;

    const assets = await getUserAssetsAdmin(ownerId);
    timing.mark('db');
    const { response, counts } = await resolveInstrumentProfiles(selectProfileRequests(assets), { force, timing });
    const body: InstrumentProfilesResponse = response;
    return NextResponse.json(body, {
      headers: {
        'Server-Timing': timing.toHeader({
          hits: String(counts.hits),
          fetched: String(counts.fetched),
          source: counts.fetched > 0 ? 'yahoo' : 'cache',
        }),
      },
    });
  } catch (error) {
    const authError = getApiAuthErrorResponse(error);
    if (authError) return authError;

    console.error('[instrument-profiles] Error resolving instrument profiles:', error);
    return NextResponse.json({ error: 'Failed to resolve instrument profiles' }, { status: 500 });
  }
}
