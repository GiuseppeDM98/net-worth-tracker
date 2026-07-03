import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { ACCOUNT_ACCESS_COLLECTION } from '@/types/account';

class ApiAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiAuthError';
    this.status = status;
  }
}

/**
 * Verify the Firebase ID token attached to a private API request.
 *
 * Why this exists:
 * - App Router route handlers use the Admin SDK, which bypasses Firestore rules
 * - Any route that trusts client-provided userId/resource IDs must authenticate first
 * - Centralizing this avoids slightly different auth checks across handlers
 */
export async function requireFirebaseAuth(
  request: NextRequest
): Promise<DecodedIdToken> {
  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    throw new ApiAuthError(401, 'Missing Authorization bearer token');
  }

  const idToken = authorization.slice('Bearer '.length).trim();

  if (!idToken) {
    throw new ApiAuthError(401, 'Missing Firebase ID token');
  }

  try {
    return await adminAuth.verifyIdToken(idToken);
  } catch (error) {
    console.error('[apiAuth] Failed to verify Firebase ID token:', error);
    throw new ApiAuthError(401, 'Invalid or expired Firebase ID token');
  }
}

/**
 * Enforce that the authenticated Firebase user matches the target userId.
 *
 * This closes the class of bugs where the client can swap userId in query/body
 * while still sending a valid token for a different account.
 */
export function assertSameUser(
  decodedToken: DecodedIdToken,
  requestedUserId: string | null | undefined
): void {
  if (!requestedUserId) {
    throw new ApiAuthError(400, 'User ID is required');
  }

  if (decodedToken.uid !== requestedUserId) {
    throw new ApiAuthError(403, 'Authenticated user does not match requested user');
  }
}

/**
 * Enforce that the authenticated user may act on `ownerUserId`'s account —
 * either because they ARE the owner, or because the owner granted them
 * delegated access (shared account).
 *
 * This is the delegation-aware replacement for `assertSameUser` on any route
 * whose data is scoped to a data-owner rather than the caller. Membership is
 * read from `account-access/{ownerUserId}.memberUids`.
 *
 * Performance: the self case (caller === owner) returns immediately WITHOUT a
 * Firestore read, so the common path costs nothing; the read happens only when
 * a delegate is acting on someone else's account.
 *
 * @throws ApiAuthError(400) if ownerUserId is missing
 * @throws ApiAuthError(403) if the caller is neither the owner nor a member
 */
export async function assertCanAccessAccount(
  decodedToken: DecodedIdToken,
  ownerUserId: string | null | undefined
): Promise<void> {
  if (!ownerUserId) {
    throw new ApiAuthError(400, 'User ID is required');
  }

  // Owner acting on their own account: no membership lookup needed.
  if (decodedToken.uid === ownerUserId) {
    return;
  }

  const accessSnap = await adminDb
    .collection(ACCOUNT_ACCESS_COLLECTION)
    .doc(ownerUserId)
    .get();

  const memberUids: unknown = accessSnap.exists
    ? accessSnap.data()?.memberUids
    : undefined;

  const isMember =
    Array.isArray(memberUids) && memberUids.includes(decodedToken.uid);

  if (!isMember) {
    throw new ApiAuthError(
      403,
      'Authenticated user does not have access to requested account'
    );
  }
}

/**
 * Enforce resource ownership after loading a document through the Admin SDK.
 */
export function assertResourceOwner(
  decodedToken: DecodedIdToken,
  ownerUserId: string | null | undefined
): void {
  if (!ownerUserId) {
    throw new ApiAuthError(403, 'Resource owner is missing');
  }

  if (decodedToken.uid !== ownerUserId) {
    throw new ApiAuthError(403, 'Resource does not belong to authenticated user');
  }
}

/**
 * Constant-time comparison for the shared cron secret.
 *
 * Hashing both sides first makes timingSafeEqual usable with inputs of
 * different lengths (it throws on length mismatch) without leaking length.
 * Returns false when the env secret is not configured: a missing secret
 * must never mean "open access".
 */
export function verifyCronSecret(provided: string | null | undefined): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) {
    return false;
  }
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export function getApiAuthErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof ApiAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return null;
}
