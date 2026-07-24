import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { deleteAllAssetTransactionsForAsset } from '@/lib/server/assetTransactionUseCase';
import { getTradeErrorResponse } from '../../errorResponse';

/**
 * DELETE /api/1-asset-transactions/by-asset/[assetId]?userId=...
 *
 * Delete EVERY trade for one asset, no replay. Only path this exists for: converting a ledger asset
 * to `pensionFund` in AssetDialog (docs/specs/2-pension-fund/04-ui-and-views.md §1.1, option 1) —
 * the asset is leaving the ledger for good, so there is nothing left to reconcile.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const { assetId } = await params;

    const ownerId = request.nextUrl.searchParams.get('userId');
    await assertCanAccessAccount(decodedToken, ownerId);

    const deletedCount = await deleteAllAssetTransactionsForAsset(ownerId as string, assetId);
    return NextResponse.json({ deletedCount });
  } catch (error) {
    return getTradeErrorResponse(error, 'DELETE /api/1-asset-transactions/by-asset/[assetId]');
  }
}
