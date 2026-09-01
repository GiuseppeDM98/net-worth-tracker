import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { backfillAverageCostEur } from '@/lib/server/assetTransactionUseCase';
import { getTradeErrorResponse } from '../errorResponse';

/**
 * POST /api/asset-transactions/backfill-average-cost-eur
 *
 * Idempotent, per-user one-shot: projects `averageCostEur` (a EUR-denominated PMC) onto ledger
 * asset docs written before the field existed, fixing G/P for foreign-currency positions (it was
 * comparing a native-currency PMC against a EUR value). Body: { userId }. A second call after the
 * backfill returns { alreadyBackfilled: true }.
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    const body = (await request.json().catch(() => ({}))) as { userId?: unknown };
    const ownerId = typeof body.userId === 'string' ? body.userId : null;
    await assertCanAccessAccount(decodedToken, ownerId);

    const result = await backfillAverageCostEur(ownerId as string);
    return NextResponse.json(result);
  } catch (error) {
    return getTradeErrorResponse(error, 'POST /api/asset-transactions/backfill-average-cost-eur');
  }
}
