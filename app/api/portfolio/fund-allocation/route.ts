import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { resolveInstrumentProfiles } from '@/lib/server/exposure/instrumentProfileService';
import { startTiming } from '@/lib/server/serverTiming';
import { fundAllocationQuerySchema, parseOr400 } from '@/lib/server/validation';
import type { FundAllocationsResponse, InstrumentFundAllocation } from '@/types/exposure';

/**
 * GET /api/portfolio/fund-allocation?isins=<ISIN,…>&tickers=<ticker,…>
 *
 * The PUBLISHED asset mix of the funds asked for — Yahoo's `topHoldings` buckets
 * (`stockPosition`, `bondPosition`, `cashPosition`, …), served from the shared per-ticker cache
 * (`instrument-profile-cache/{ISIN}`). `lib/utils/fundComposition.ts` turns the answer into
 * `Asset.composition`, so an ETF/fund with a hybrid mix is split across classes in «Composizione»
 * instead of sitting on one class until someone types the split by hand.
 *
 * Two identity forms, each a bounded list: an ISIN (what a fund house publishes and the ETF form
 * types) and a ticker (the Bloomberg code a broker file carries — `GRID IM` → `GRID.MI` — which
 * an import has and an ISIN it does not). A GESTITO fund named without any code has neither and
 * is simply absent from the answer, never guessed.
 *
 * Authenticated but NOT owner-scoped: the answer is Yahoo's, identical for every account, and the
 * cache document holds nothing of a user's (AGENTS.md § Caching — global shared cache). The route
 * reads no asset, so there is no ownership to assert; it is deliberately not a Yahoo proxy either
 * — each query is a bounded list of real instruments (`fundAllocationQuerySchema`).
 *
 * Answers with `Server-Timing: auth, db, yahoo, compute, total, hits, fetched, source`, the same
 * reading the instrument-profiles route gives.
 */
export async function GET(request: NextRequest) {
  const timing = startTiming();
  try {
    await requireFirebaseAuth(request);
    timing.mark('auth');

    const parsed = parseOr400(fundAllocationQuerySchema, {
      isins: request.nextUrl.searchParams.get('isins') ?? '',
      tickers: request.nextUrl.searchParams.get('tickers') ?? '',
    });
    if (!parsed.ok) return parsed.response;

    const { response, counts } = await resolveInstrumentProfiles(
      [
        ...parsed.data.isins.map((ticker) => ({ ticker, module: 'fund' as const })),
        ...parsed.data.tickers.map((ticker) => ({ ticker, module: 'fund' as const })),
      ],
      { timing, requireAllocation: true },
    );

    const allocations: Record<string, InstrumentFundAllocation> = {};
    for (const [ticker, profile] of Object.entries(response.profiles)) {
      if (profile.fund?.allocation) allocations[ticker] = profile.fund.allocation;
    }

    const body: FundAllocationsResponse = {
      allocations,
      oldestFetchedAt: response.oldestFetchedAt,
    };
    timing.mark('compute');
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

    console.error('[fund-allocation] Error resolving fund allocations:', error);
    return NextResponse.json({ error: 'Failed to resolve fund allocations' }, { status: 500 });
  }
}
