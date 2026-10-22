import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { resolveFundIdentities } from '@/lib/server/eodhd/fundIdentityService';
import { startTiming } from '@/lib/server/serverTiming';
import { fundIdentityQuerySchema, parseOr400 } from '@/lib/server/validation';

/**
 * GET /api/portfolio/fund-identity?names=<product name>|<product name>
 *
 * Which fund a broker's product NAME is — the ISIN, EODHD's own name for that share class and its
 * currency — for a file that names a fund and gives no code at all (the Azimut «Gestito» sheet).
 * The judgement is `matchFundIdentity`'s: a single candidate that agrees on every part of the
 * name, else `none`/`ambiguous` and NO pick. The answer is served from the shared
 * `fund-identity-cache/{normalised name}` (`lib/server/eodhd/fundIdentityService.ts`), one EODHD
 * call per distinct name.
 *
 * Authenticated but NOT owner-scoped: the answer is EODHD's, identical for every account, and the
 * cache document holds nothing of a user's (AGENTS.md § Caching — global shared cache). The route
 * reads no asset, so there is no ownership to assert; it is not an EODHD proxy either — each query
 * is a bounded list of real product names (`fundIdentityQuerySchema`).
 *
 * Answers with `Server-Timing: auth, db, eodhd, compute, total, hits, fetched, unavailable,
 * source`.
 */
export async function GET(request: NextRequest) {
  const timing = startTiming();
  try {
    await requireFirebaseAuth(request);
    timing.mark('auth');

    const parsed = parseOr400(fundIdentityQuerySchema, {
      names: request.nextUrl.searchParams.get('names') ?? '',
    });
    if (!parsed.ok) return parsed.response;

    const { response, counts } = await resolveFundIdentities(parsed.data, { timing });

    timing.mark('compute');
    return NextResponse.json(response, {
      headers: {
        'Server-Timing': timing.toHeader({
          hits: String(counts.hits),
          fetched: String(counts.fetched),
          unavailable: String(counts.unavailable),
          source: counts.fetched > 0 ? 'eodhd' : 'cache',
        }),
      },
    });
  } catch (error) {
    const authError = getApiAuthErrorResponse(error);
    if (authError) return authError;

    console.error('[fund-identity] Error resolving fund identities:', error);
    return NextResponse.json({ error: 'Failed to resolve fund identities' }, { status: 500 });
  }
}
