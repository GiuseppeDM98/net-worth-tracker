import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { assetTransactionUpdateSchema, parseOr400 } from '@/lib/server/validation';
import {
  updateAssetTransaction,
  deleteAssetTransaction,
} from '@/lib/server/assetTransactionUseCase';
import { getTradeErrorResponse } from '../errorResponse';

/**
 * PUT /api/1-asset-transactions/[transactionId]
 *
 * Edit a trade. Body: { userId, updates: Partial<AssetTransactionFormData> }. The whole replay is
 * re-validated, so an edit that makes a LATER sell over-sell is rejected here (422), not silently.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const { transactionId } = await params;

    const body = (await request.json().catch(() => ({}))) as { userId?: unknown; updates?: unknown };
    const ownerId = typeof body.userId === 'string' ? body.userId : null;
    await assertCanAccessAccount(decodedToken, ownerId);

    const parsed = parseOr400(assetTransactionUpdateSchema, body.updates ?? {});
    if (!parsed.ok) return parsed.response;

    const result = await updateAssetTransaction(ownerId as string, transactionId, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return getTradeErrorResponse(error, 'PUT /api/1-asset-transactions/[transactionId]');
  }
}

/**
 * DELETE /api/1-asset-transactions/[transactionId]?userId=...
 *
 * Delete a trade (never a baseline). Reverses any linked cash settlement in the same transaction.
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

    const result = await deleteAssetTransaction(ownerId as string, transactionId);
    return NextResponse.json(result);
  } catch (error) {
    return getTradeErrorResponse(error, 'DELETE /api/1-asset-transactions/[transactionId]');
  }
}
