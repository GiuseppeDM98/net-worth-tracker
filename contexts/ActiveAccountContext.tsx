/**
 * Active-account context — decouples "who is viewing" from "whose data is shown".
 *
 * The app historically equated the logged-in Firebase user with the owner of the
 * data (`user.uid` used everywhere). Shared accounts break that assumption:
 *
 * - viewer  = the logged-in Firebase user (`useAuth().user`) — never changes; it
 *             is the identity behind the ID token, the profile, and the theme.
 * - owner   = whose financial data is currently being viewed/edited (`ownerId`).
 *             Defaults to the viewer's own uid; can be switched to any account
 *             that granted the viewer delegated access.
 *
 * Data hooks/pages should read `ownerId` from here instead of `user.uid`. React
 * Query keys already namespace by the id they receive, so switching `ownerId`
 * yields a separate cache bucket automatically.
 */
'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getSharedAccounts } from '@/lib/services/accountAccessService';
import { AccessibleAccount } from '@/types/account';

interface ActiveAccountContextType {
  /** The logged-in user's own uid (identity behind the token). */
  viewerId: string | undefined;
  /** The account whose data is being viewed/edited (defaults to viewerId). */
  ownerId: string | undefined;
  /** True when viewing an account other than the viewer's own. */
  isSharedView: boolean;
  /** The viewer's own account plus every account shared with them. */
  accessibleAccounts: AccessibleAccount[];
  /** Switch the active account; ignored if the id is not accessible. */
  switchAccount: (ownerId: string) => void;
  /** True while shared-account discovery is in flight. */
  loading: boolean;
}

const ActiveAccountContext = createContext<ActiveAccountContextType>({
  viewerId: undefined,
  ownerId: undefined,
  isSharedView: false,
  accessibleAccounts: [],
  switchAccount: () => {},
  loading: true,
});

/**
 * Access the active-account state.
 *
 * @returns viewer/owner ids, the accessible-account list, and `switchAccount`.
 */
export const useActiveAccount = () => useContext(ActiveAccountContext);

/** localStorage key for the viewer's last-selected account (per viewer). */
function storageKey(viewerId: string): string {
  return `activeAccount:${viewerId}`;
}

function readStoredOwner(viewerId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(storageKey(viewerId));
  } catch {
    return null;
  }
}

function writeStoredOwner(viewerId: string, ownerId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(viewerId), ownerId);
  } catch {
    // Ignore quota/availability errors — persistence is a convenience, not a
    // correctness requirement (membership is always re-validated on load).
  }
}

export function ActiveAccountProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const viewerId = user?.uid;

  const [sharedAccounts, setSharedAccounts] = useState<AccessibleAccount[]>([]);
  const [ownerId, setOwnerId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  // The viewer's own account is always available and always first.
  const ownAccount = useMemo<AccessibleAccount | null>(() => {
    if (!viewerId) return null;
    return {
      ownerId: viewerId,
      email: user?.email ?? null,
      displayName: user?.displayName ?? null,
      isOwn: true,
    };
  }, [viewerId, user?.email, user?.displayName]);

  const accessibleAccounts = useMemo<AccessibleAccount[]>(() => {
    if (!ownAccount) return [];
    return [ownAccount, ...sharedAccounts];
  }, [ownAccount, sharedAccounts]);

  // Discover shared accounts whenever the viewer changes. Optimistically adopt
  // the stored selection so a delegate lands on the shared account immediately;
  // once the grant list loads we re-validate and fall back to self if the stored
  // account is no longer accessible (e.g. access was revoked).
  useEffect(() => {
    if (!viewerId) {
      setSharedAccounts([]);
      setOwnerId(undefined);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setOwnerId(readStoredOwner(viewerId) ?? viewerId);

    getSharedAccounts(viewerId)
      .then((shared) => {
        if (cancelled) return;
        setSharedAccounts(shared);

        const allowedIds = new Set([viewerId, ...shared.map((a) => a.ownerId)]);
        const stored = readStoredOwner(viewerId);
        const resolved = stored && allowedIds.has(stored) ? stored : viewerId;
        setOwnerId(resolved);
        writeStoredOwner(viewerId, resolved);
      })
      .catch((error) => {
        // Discovery failure must never lock the user out of their own account.
        console.error('[ActiveAccount] Failed to load shared accounts:', error);
        if (cancelled) return;
        setSharedAccounts([]);
        setOwnerId(viewerId);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewerId]);

  const switchAccount = useCallback(
    (nextOwnerId: string) => {
      if (!viewerId) return;
      const isAccessible = accessibleAccounts.some(
        (account) => account.ownerId === nextOwnerId
      );
      if (!isAccessible) return;
      setOwnerId(nextOwnerId);
      writeStoredOwner(viewerId, nextOwnerId);
    },
    [viewerId, accessibleAccounts]
  );

  // Expose ownerId with a synchronous fallback to the viewer's own id: once the
  // viewer is known, ownerId is never transiently undefined during the first
  // render (before the discovery effect runs). Consumers can therefore treat
  // ownerId as defined whenever a user is logged in.
  const resolvedOwnerId = ownerId ?? viewerId;

  const value = useMemo<ActiveAccountContextType>(
    () => ({
      viewerId,
      ownerId: resolvedOwnerId,
      isSharedView:
        !!resolvedOwnerId && !!viewerId && resolvedOwnerId !== viewerId,
      accessibleAccounts,
      switchAccount,
      loading,
    }),
    [viewerId, resolvedOwnerId, accessibleAccounts, switchAccount, loading]
  );

  return (
    <ActiveAccountContext.Provider value={value}>
      {children}
    </ActiveAccountContext.Provider>
  );
}
