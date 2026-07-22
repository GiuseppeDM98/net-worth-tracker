import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { assetTransactionDataSchema, parseOr400 } from '@/lib/server/validation';
import { createAssetTransaction } from '@/lib/server/assetTransactionUseCase';
import { getTradeErrorResponse } from './errorResponse';

/**
 * POST /api/1-asset-transactions
 *
 * Create one trade in the asset ledger. Body: { userId, transaction: AssetTransactionFormData }.
 * Writes are Admin-API-only because a trade must atomically rewrite the asset's derived fields from
 * a full replay of its trades (docs/specs/1-asset-transactions/03-service-and-api.md).
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    // Empty/invalid JSON must not throw before the auth+validation checks run.
    const body = (await request.json().catch(() => ({}))) as { userId?: unknown; transaction?: unknown };
    const ownerId = typeof body.userId === 'string' ? body.userId : null;

    // Delegation-aware: a shared-account member can register trades for the owner.
    await assertCanAccessAccount(decodedToken, ownerId);

    const parsed = parseOr400(assetTransactionDataSchema, body.transaction);
    if (!parsed.ok) return parsed.response;

    const result = await createAssetTransaction(ownerId as string, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return getTradeErrorResponse(error, 'POST /api/1-asset-transactions');
  }
}
