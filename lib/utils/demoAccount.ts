/**
 * The ONE rule that says which uid is the shared demo account.
 *
 * The demo uid is baked into the public bundle as `NEXT_PUBLIC_DEMO_USER_ID`; where it is not set
 * (a self-hosted deployment) nothing is the demo and every guard is a no-op. Three places used to
 * compare the uid by hand — `useDemoMode`, the display-name backfill in `AuthContext`, and now the
 * query persister, which must never write the demo account's data to the visitor's IndexedDB
 * (doc/guide/account-condiviso-demo.md). Pure: the env value is a parameter so a test can set it.
 */

/**
 * Whether `uid` is the demo account.
 *
 * @param uid - The uid to check (`null`/`undefined` while nobody is signed in)
 * @param demoUid - The configured demo uid; defaults to the build-time env value
 */
export function isDemoUid(
  uid: string | null | undefined,
  demoUid: string | undefined = process.env.NEXT_PUBLIC_DEMO_USER_ID,
): boolean {
  if (!demoUid || !uid) return false;
  return uid === demoUid;
}
