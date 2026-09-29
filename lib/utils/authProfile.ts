/**
 * The display name of a signed-in user, from the two places it can live.
 *
 * Google users carry it in the Firebase Auth profile; email/password users were registered with
 * it in `users/{uid}` only. `AuthContext` used to await the Firestore read before unblocking the
 * app — a round trip in front of every page, until 2026-09-28. The read is asynchronous now, and this is
 * the decision it feeds: which name to show, and whether the Auth profile should learn it so the
 * next sign-in needs no read at all.
 */

export interface AuthProfileName {
  /** `firebaseUser.displayName`: `null` for a user who never set one. */
  displayName: string | null;
}

/** The `users/{uid}` document as read: untyped, because it is user data written years ago. */
export interface UserDocumentName {
  displayName?: unknown;
}

export interface ResolvedDisplayName {
  /** The name to show, or `null` when neither source has one. */
  displayName: string | null;
  /** True when the name came from Firestore only: `updateProfile` should copy it into Auth. */
  shouldBackfillAuthProfile: boolean;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Auth wins when it has a name; the Firestore document is the fallback for the users registered
 * by email and password; a missing or blank name in both is `null`, never `''` (the shell prints
 * the email's local part in that case, `getDisplayInfo`).
 */
export function resolveDisplayName(
  authProfile: AuthProfileName,
  userDocument: UserDocumentName | null,
): ResolvedDisplayName {
  const fromAuth = nonEmpty(authProfile.displayName);
  if (fromAuth) return { displayName: fromAuth, shouldBackfillAuthProfile: false };

  const fromDocument = nonEmpty(userDocument?.displayName);
  return { displayName: fromDocument, shouldBackfillAuthProfile: fromDocument !== null };
}
