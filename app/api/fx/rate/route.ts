import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { fxRateQuerySchema, parseOr400 } from '@/lib/server/validation';
import { resolveEcbRateToEur } from '@/lib/server/tradeFxService';

/**
 * GET /api/fx/rate?currency=USD&date=YYYY-MM-DD — the ECB rate the server will use for a trade on
 * that day (2026-11-23), so the trade form's preview is the figure the save will store. Frankfurter
 * is never called from the browser (doc/guide/patrimonio.md § Asset Pricing, FX and Assets).
 *
 * Signed-in only, and no account is read: a public rate, so the demo and a co-owner read it like
 * anyone signed in — no `assertCanAccessAccount`. 503 when no rate can be read.
 */
export async function GET(request: NextRequest) {
  try {
    await requireFirebaseAuth(request);
  } catch (error) {
    const authResponse = getApiAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  }

  const params = request.nextUrl.searchParams;
  const parsed = parseOr400(fxRateQuerySchema, {
    currency: params.get('currency') ?? undefined,
    date: params.get('date') ?? undefined,
  });
  if (!parsed.ok) return parsed.response;

  const ecb = await resolveEcbRateToEur(parsed.data.currency, parsed.data.date);
  if (!ecb) {
    return NextResponse.json({ error: 'Cambio non disponibile.' }, { status: 503 });
  }
  return NextResponse.json({ rate: ecb.rate, isLatest: ecb.isLatest });
}
