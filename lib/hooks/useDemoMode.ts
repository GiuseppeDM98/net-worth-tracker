import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns true when the currently signed-in user is the shared demo account.
 * Detection is purely client-side: the demo user UID is baked into the public
 * bundle via NEXT_PUBLIC_DEMO_USER_ID at build time.
 *
 * When NEXT_PUBLIC_DEMO_USER_ID is not set (normal self-hosted deployments),
 * this always returns false so demo guards are no-ops.
 */
export function useDemoMode(): boolean {
  const { user } = useAuth();
  const demoUid = process.env.NEXT_PUBLIC_DEMO_USER_ID;
  if (!demoUid || !user) return false;
  return user.uid === demoUid;
}
