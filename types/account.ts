/**
 * Shared-account (delegated access) domain types.
 *
 * A user (the "owner") can grant another registered user (a "member") full
 * read/write access to the owner's financial data, without sharing credentials.
 * Access is stored in the `account-access/{ownerUid}` collection: one document
 * per owner, keyed by the owner's uid so both Firestore Rules and the Admin SDK
 * can resolve it deterministically.
 *
 * Terminology used throughout the codebase:
 * - viewer: the logged-in Firebase Auth user (always their own identity)
 * - owner:  whose data is currently being viewed/edited (`ownerId`)
 */

/** Firestore collection holding delegated-access grants (doc id = owner uid). */
export const ACCOUNT_ACCESS_COLLECTION = 'account-access';

/**
 * A member granted access to an owner's account. `email`/`displayName` are
 * denormalized copies (from the member's Auth profile at grant time) kept only
 * for display in the owner's sharing settings — `uid` is the source of truth.
 */
export interface AccountMember {
  uid: string;
  email: string;
  displayName: string | null;
  addedAt: Date;
}

/**
 * The `account-access/{ownerUid}` document. `memberUids` is the flat array the
 * Firestore Rules and the `array-contains` membership query read; `members`
 * carries the display metadata for the same uids.
 *
 * `ownerEmail`/`ownerDisplayName` are denormalized copies of the owner's profile
 * so a member — who cannot read the owner's private `users/{ownerUid}` doc — can
 * still label the shared account in the switcher.
 */
export interface AccountAccess {
  ownerUid: string;
  ownerEmail: string | null;
  ownerDisplayName: string | null;
  memberUids: string[];
  members: AccountMember[];
}

/**
 * An account the current viewer may act on: always their own account plus any
 * account that has granted them membership. Drives the account switcher.
 */
export interface AccessibleAccount {
  ownerId: string;
  email: string | null;
  displayName: string | null;
  isOwn: boolean;
}
