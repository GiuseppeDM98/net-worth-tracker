import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import {
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { removeUndefinedDeep } from '@/lib/utils/firestoreData';
import {
  ACCOUNT_ACCESS_COLLECTION,
  AccountAccess,
  AccountMember,
} from '@/types/account';

/**
 * Account sharing (delegated access) management.
 *
 * The account being managed is ALWAYS the authenticated caller's own account
 * (`decodedToken.uid`) — there is no client-supplied owner id, so a delegate can
 * never grant themselves or others access to an account they merely view. Grants
 * live in `account-access/{ownerUid}`; writes go only through this Admin route
 * because adding a member requires resolving an email to a Firebase uid.
 */

/** Shape returned to the client (addedAt serialized to ISO for JSON). */
interface MemberResponse {
  uid: string;
  email: string;
  displayName: string | null;
  addedAt: string;
}

/** Convert a stored member (Firestore Timestamp/Date) to the JSON response shape. */
function toMemberResponse(member: AccountMember): MemberResponse {
  const addedAt = member.addedAt as unknown;
  // Firestore returns a Timestamp (has toDate); plain writes may return a Date.
  const date =
    addedAt && typeof (addedAt as { toDate?: unknown }).toDate === 'function'
      ? (addedAt as { toDate: () => Date }).toDate()
      : (addedAt as Date | undefined);
  return {
    uid: member.uid,
    email: member.email,
    displayName: member.displayName ?? null,
    addedAt: date instanceof Date ? date.toISOString() : new Date().toISOString(),
  };
}

/** Load the caller's account-access document, or null when no grants exist yet. */
async function loadAccountAccess(
  ownerUid: string
): Promise<AccountAccess | null> {
  const snap = await adminDb
    .collection(ACCOUNT_ACCESS_COLLECTION)
    .doc(ownerUid)
    .get();
  return snap.exists ? (snap.data() as AccountAccess) : null;
}

/**
 * GET /api/account/members
 *
 * List the members the caller has granted access to their own account.
 *
 * Response: { members: MemberResponse[] }
 */
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const access = await loadAccountAccess(decodedToken.uid);
    const members = (access?.members ?? []).map(toMemberResponse);
    return NextResponse.json({ members });
  } catch (error) {
    const authResponse = getApiAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('[account/members] GET failed:', error);
    return NextResponse.json(
      { error: 'Impossibile caricare i membri' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/account/members
 *
 * Grant a registered user full access to the caller's account, by email.
 *
 * Request body: { email: string }
 * Errors:
 *   400 - missing/invalid email, or granting to self
 *   404 - no registered user with that email (they must sign up first)
 *   409 - already a member
 * Response: { member: MemberResponse }
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const ownerUid = decodedToken.uid;

    const body = await request.json().catch(() => ({}));
    const rawEmail = typeof body?.email === 'string' ? body.email : '';
    const email = rawEmail.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "L'email è obbligatoria" },
        { status: 400 }
      );
    }

    // Resolve the email to an existing Firebase user. The person must register
    // their own account first (their email must also pass the registration
    // whitelist); we cannot grant access to a uid that does not exist.
    let memberRecord;
    try {
      memberRecord = await adminAuth.getUserByEmail(email);
    } catch {
      return NextResponse.json(
        {
          error:
            'Nessun utente registrato con questa email. La persona deve prima registrarsi.',
        },
        { status: 404 }
      );
    }

    if (memberRecord.uid === ownerUid) {
      return NextResponse.json(
        { error: 'Non puoi aggiungere te stesso' },
        { status: 400 }
      );
    }

    const existing = await loadAccountAccess(ownerUid);
    if (existing?.memberUids?.includes(memberRecord.uid)) {
      return NextResponse.json(
        { error: 'Questa persona ha già accesso al tuo account' },
        { status: 409 }
      );
    }

    const member: AccountMember = {
      uid: memberRecord.uid,
      email: memberRecord.email ?? email,
      displayName: memberRecord.displayName ?? null,
      addedAt: new Date(),
    };

    // Read-modify-write the single grant document. ownerUid + owner profile are
    // stored so the doc is self-describing and members can label the shared
    // account without reading the owner's private profile. Arrays grow by one.
    const ref = adminDb.collection(ACCOUNT_ACCESS_COLLECTION).doc(ownerUid);
    const updated: AccountAccess = {
      ownerUid,
      ownerEmail: decodedToken.email ?? existing?.ownerEmail ?? null,
      ownerDisplayName:
        (decodedToken.name as string | undefined) ??
        existing?.ownerDisplayName ??
        null,
      memberUids: [...(existing?.memberUids ?? []), member.uid],
      members: [...(existing?.members ?? []), member],
    };
    await ref.set(removeUndefinedDeep(updated));

    return NextResponse.json({ member: toMemberResponse(member) });
  } catch (error) {
    const authResponse = getApiAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('[account/members] POST failed:', error);
    return NextResponse.json(
      { error: "Impossibile aggiungere l'accesso" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/account/members?memberUid=...
 *
 * Revoke a member's access to the caller's account.
 *
 * Response: { success: true }
 */
export async function DELETE(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const ownerUid = decodedToken.uid;
    const memberUid = request.nextUrl.searchParams.get('memberUid');

    if (!memberUid) {
      return NextResponse.json(
        { error: 'memberUid è obbligatorio' },
        { status: 400 }
      );
    }

    const existing = await loadAccountAccess(ownerUid);
    if (!existing) {
      return NextResponse.json({ success: true });
    }

    const ref = adminDb.collection(ACCOUNT_ACCESS_COLLECTION).doc(ownerUid);
    await ref.update({
      memberUids: FieldValue.arrayRemove(memberUid),
      members: (existing.members ?? []).filter((m) => m.uid !== memberUid),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = getApiAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('[account/members] DELETE failed:', error);
    return NextResponse.json(
      { error: "Impossibile revocare l'accesso" },
      { status: 500 }
    );
  }
}
