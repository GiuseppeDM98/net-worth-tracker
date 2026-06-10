import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '@/lib/firebase/admin';

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
