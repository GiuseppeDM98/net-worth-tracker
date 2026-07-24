import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { migrateAssetLedger } from '@/lib/server/assetTransactionUseCase';
import { getTradeErrorResponse } from '../errorResponse';

/**
 * POST /api/asset-transactions/migrate
 *
 * Idempotent, per-user ledger migration. Body: { userId }. A delegate may trigger it for the owner
 * (canAccess semantics — the demo user's data is migrated too so the demo UI renders coherently).
 * A second call after migration returns { alreadyMigrated: true }.
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    const body = (await request.json().catch(() => ({}))) as { userId?: unknown };
    const ownerId = typeof body.userId === 'string' ? body.userId : null;
    await assertCanAccessAccount(decodedToken, ownerId);

    const result = await migrateAssetLedger(ownerId as string);
    return NextResponse.json(result);
  } catch (error) {
    return getTradeErrorResponse(error, 'POST /api/asset-transactions/migrate');
  }
}
