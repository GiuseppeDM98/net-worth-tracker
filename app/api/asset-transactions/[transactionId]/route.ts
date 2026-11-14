import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { assetTransactionUpdateSchema, parseOr400, tradeVersionSchema } from '@/lib/server/validation';
import {
  updateAssetTransaction,
  deleteAssetTransaction,
} from '@/lib/server/assetTransactionUseCase';
import { getTradeErrorResponse } from '../errorResponse';

/**
 * PUT /api/asset-transactions/[transactionId]
 *
 * Edit a trade. Body: { userId, updates: Partial<AssetTransactionFormData>, expectedUpdatedAt? }.
 * The whole replay is re-validated, so an edit that makes a LATER sell over-sell is rejected here
 * (422), not silently. `expectedUpdatedAt` (ISO) is the version the form was drawn from: a trade
 * changed since answers 409, one deleted since 404.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const { transactionId } = await params;

    const body = (await request.json().catch(() => ({}))) as {
      userId?: unknown;
      updates?: unknown;
      expectedUpdatedAt?: unknown;
    };
    const ownerId = typeof body.userId === 'string' ? body.userId : null;
    await assertCanAccessAccount(decodedToken, ownerId);

    const parsed = parseOr400(assetTransactionUpdateSchema, body.updates ?? {});
    if (!parsed.ok) return parsed.response;
    const version = parseOr400(tradeVersionSchema, body.expectedUpdatedAt);
    if (!version.ok) return version.response;

    const result = await updateAssetTransaction(ownerId as string, transactionId, parsed.data, version.data);
    return NextResponse.json(result);
  } catch (error) {
    return getTradeErrorResponse(error, 'PUT /api/asset-transactions/[transactionId]');
  }
}

/**
 * DELETE /api/asset-transactions/[transactionId]?userId=...&expectedUpdatedAt=...
 *
 * Delete a trade (never a baseline). Reverses any linked cash settlement in the same transaction.
 * `expectedUpdatedAt` (ISO) is the version the row's button was drawn from, as in PUT.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const { transactionId } = await params;

    const ownerId = request.nextUrl.searchParams.get('userId');
    await assertCanAccessAccount(decodedToken, ownerId);

    const version = parseOr400(
      tradeVersionSchema,
      request.nextUrl.searchParams.get('expectedUpdatedAt') ?? undefined
    );
    if (!version.ok) return version.response;

    const result = await deleteAssetTransaction(ownerId as string, transactionId, version.data);
    return NextResponse.json(result);
  } catch (error) {
    return getTradeErrorResponse(error, 'DELETE /api/asset-transactions/[transactionId]');
  }
}
