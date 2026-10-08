/**
 * Authentication Context for Net Worth Tracker
 *
 * Manages user authentication state using Firebase Auth + Firestore dual-storage pattern.
 *
 * Architecture:
 * - displayName is stored in BOTH Firebase Auth profile AND Firestore document
 *   - Google OAuth users: displayName set in Firebase Auth profile automatically
 *   - Email/password users: displayName stored in Firestore only
 *   - The gate opens on what Auth knows (`setLoading(false)` in the `onAuthStateChanged`
 *     callback, nothing awaited, since 2026-09-28); the Firestore fallback lands afterwards and is
 *     copied into the Auth profile once, so the next sign-in needs no read (`resolveDisplayName`)
 *
 * - User creation is a two-step process:
 *   1. Create Firebase Auth user (email/password or Google OAuth)
 *   2. Create Firestore document with user data (email, displayName, createdAt)
 *   3. Set default asset allocation (60% equity, 40% bonds)
 *
 * - Registration validation:
 *   - Server-side whitelist checked via /api/auth/check-registration
 *   - For Google OAuth: validation happens AFTER signInWithPopup (Firebase limitation)
 *   - If registration denied: cleanup both Auth user AND orphan Firestore doc
 *
 * - Race condition handling:
 *   - Google OAuth can succeed but registration check fail
 *   - Must cleanup orphan Firestore documents to allow retry
 *   - See signInWithGoogle() for detailed cleanup logic
 */
'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc, deleteDoc, type DocumentReference } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { User } from '@/types/assets';
import { getDefaultTargets, setSettings } from '@/lib/services/assetAllocationService';
import { waitForAuthTokenRefresh, retryFirestoreOperation } from '@/lib/utils/authHelpers';
import { resolveDisplayName, type UserDocumentName } from '@/lib/utils/authProfile';
import { isDemoUid } from '@/lib/utils/demoAccount';

/**
 * Authentication context interface
 *
 * Provides authentication state and methods for sign in, sign up, and sign out.
 */
interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Builds an Error that carries a machine-readable `code`, the way Firebase's own errors do.
 *
 * Why it matters: the pages translate a code into an Italian sentence through
 * `describeAuthError` (lib/utils/authNarrative.ts). A plain `new Error(message)` would
 * leave them nothing to map, so the reader would get either the provider's English string
 * or a cause-free fallback.
 */
function withCode(message: string, code: string): Error & { code: string } {
  const failure = new Error(message) as Error & { code: string };
  failure.code = code;
  return failure;
}

/**
 * The displayName fallback for email/password users, run AFTER the gate has opened.
 *
 * Google users carry the name in the Auth profile; email/password users only in `users/{uid}`.
 * This read used to be awaited before `setLoading(false)` — a Firestore round trip in front of
 * every page, sidebar included, until 2026-09-28. Now it lands when it arrives (the Panoramica's greeting
 * gains the name a frame later; its `useMemo` already depends on `user?.displayName`), and the
 * Auth profile learns it once, so from the next sign-in there is nothing to read. It never
 * throws: a name that cannot be read is not a failed sign-in.
 */
async function completeDisplayName(
  firebaseUser: FirebaseUser,
  setUser: Dispatch<SetStateAction<User | null>>,
): Promise<void> {
  let userDocument: UserDocumentName | null = null;
  try {
    const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
    userDocument = userSnap.exists() ? (userSnap.data() as UserDocumentName) : null;
  } catch (error) {
    console.error('Error fetching user displayName from Firestore:', error);
    return;
  }

  const { displayName, shouldBackfillAuthProfile } = resolveDisplayName(
    { displayName: firebaseUser.displayName },
    userDocument,
  );
  if (!displayName) return;

  // Only while the same user is still signed in: a sign-out that raced this read must not
  // bring the name back onto a null user.
  setUser((current) =>
    current && current.uid === firebaseUser.uid ? { ...current, displayName } : current,
  );

  // The demo account is read-only by contract («nessuna modifica viene salvata»): its Auth
  // profile stays as it is, and the fallback simply runs again next time.
  if (!shouldBackfillAuthProfile || isDemoUid(firebaseUser.uid)) return;
  try {
    await updateProfile(firebaseUser, { displayName });
  } catch (error) {
    // Best effort: the name is already on screen, and the fallback covers the next sign-in.
    console.warn('Could not copy displayName into the Auth profile:', error);
  }
}

/**
 * The registration half of `signInWithGoogle`, for a Google user with no `users/{uid}` document:
 * check the whitelist, clean up on a refusal, create the document and the default allocation.
 * Module-level because it throws inside a try: keeps `AuthProvider` compilable by the React Compiler.
 */
async function registerGoogleUser(googleUser: FirebaseUser, userRef: DocumentReference): Promise<void> {
  try {
    const response = await fetch('/api/auth/check-registration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: googleUser.email }),
    });

    if (!response.ok) {
      // Registration is not allowed - cleanup everything
      // Why cleanup? Race condition: Firebase Auth succeeded but registration denied.
      // Without cleanup, user can't retry (Auth user exists but Firestore doesn't).
      // We must delete BOTH Auth user AND any orphan Firestore doc.
      try {
        // First, check if a Firestore document was created (race condition)
        // Another process might have created it between our check and now
        const orphanDocSnap = await getDoc(userRef);
        if (orphanDocSnap.exists()) {
          await deleteDoc(userRef);
          console.log(`[CLEANUP] Deleted orphan Firestore document for user: ${googleUser.uid}`);
        }

        // Delete the Firebase Auth user
        await googleUser.delete();
      } catch (deleteError) {
        console.error('[CLEANUP_ERROR]', deleteError);
        // If we couldn't delete the user, sign them out
        // Prevents stuck state where user sees authenticated UI but has no permissions
        await firebaseSignOut(auth);
      }

      const body = await response.json().catch(() => ({}));
      throw withCode(
        body.message || 'Registrations are currently closed.',
        typeof body.code === 'string' ? body.code : 'registration/not-allowed',
      );
    }

    // Registration is allowed - wait for token refresh first
    console.log('[AuthContext] Google OAuth: Waiting for authentication token refresh...');
    await waitForAuthTokenRefresh(googleUser);

    // Create Firestore document
    await setDoc(userRef, {
      email: googleUser.email,
      displayName: googleUser.displayName || '',
      createdAt: new Date(),
    });

    // Set default asset allocation (60% equity, 40% bonds)
    // Wrapped in retry logic as additional safety net for permission synchronization
    await retryFirestoreOperation(async () => {
      await setSettings(googleUser.uid, {
        targets: getDefaultTargets(),
      });
    });
  } catch (error: unknown) {
    // Re-throw AS IS: wrapping in a fresh Error would drop the `code` the page needs
    // to say the failure in words (see withCode above).
    throw error instanceof Error
      ? error
      : new Error('Unable to verify registration permissions.');
  }
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

/**
 * Hook to access authentication context
 *
 * Must be used within an AuthProvider component.
 * Throws error if used outside of AuthProvider to catch setup mistakes early.
 *
 * @returns AuthContextType with user state and auth methods
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      // Unblock on what Auth already knows — nothing is awaited in front of the shell. React
      // batches the two calls into ONE commit, so the sidebar's profile and the page arrive
      // together (the benchmark's auth marker counts on it, scripts/perfBenchmark.mjs).
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
      });
      setLoading(false);

      if (!firebaseUser.displayName) {
        void completeDisplayName(firebaseUser, setUser);
      }
    });

    return () => unsubscribe();
  }, []);

  /**
   * Sign in existing user with email and password
   */
  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  /**
   * Register new user with email and password
   *
   * Two-step process:
   * 1. Check registration permissions (server-side whitelist)
   * 2. Create Firebase Auth user
   * 3. Create Firestore user document
   * 4. Set default asset allocation
   */
  const signUp = async (email: string, password: string, displayName?: string) => {
    // Step 1: Check registration permissions (server-side whitelist)
    // Why check before creating user? Prevents orphan Auth users if registration denied.
    let response: Response;
    try {
      response = await fetch('/api/auth/check-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // The request never reached the route: report it in the provider's own vocabulary
      // so describeAuthError() can say "nessuna connessione" rather than falling back to
      // a cause-free sentence.
      throw withCode('Unable to verify registration permissions.', 'auth/network-request-failed');
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw withCode(
        body.message || 'Registrations are currently closed.',
        typeof body.code === 'string' ? body.code : 'registration/not-allowed',
      );
    }

    // Step 2: Create Firebase Auth user
    const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password);

    // Step 3: Wait for Auth token refresh to ensure Firestore permissions are synchronized
    // This prevents PERMISSION_DENIED errors when creating user documents
    console.log('[AuthContext] Waiting for authentication token refresh...');
    await waitForAuthTokenRefresh(firebaseUser);

    // Step 4: Update Firebase Auth profile with displayName if provided
    if (displayName) {
      await updateProfile(firebaseUser, {
        displayName: displayName,
      });
    }

    // Step 5: Create Firestore user document with metadata
    await setDoc(doc(db, 'users', firebaseUser.uid), {
      email: firebaseUser.email,
      displayName: displayName || '',
      createdAt: new Date(),
    });

    // Step 6: Set default asset allocation (60% equity, 40% bonds)
    // Wrapped in retry logic as additional safety net for permission synchronization
    await retryFirestoreOperation(async () => {
      await setSettings(firebaseUser.uid, {
        targets: getDefaultTargets(),
      });
    });
  };

  /**
   * Sign in or register with Google OAuth
   *
   * Complex flow with race condition handling:
   * 1. Trigger Google OAuth popup (Firebase limitation: cannot validate before this)
   * 2. Check if Firestore document exists (determines new vs returning user)
   * 3. For new users: validate registration permissions
   * 4. If denied: cleanup both Firebase Auth user AND any orphan Firestore doc
   * 5. If allowed: create Firestore document and set default allocation
   *
   * Why registration check happens AFTER OAuth?
   * Firebase signInWithPopup creates Auth user immediately - we can't prevent this.
   * We must cleanup if registration is denied to allow user to retry later.
   */
  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);

    // Check if this is a new user (first time signing in with Google)
    // Why check Firestore doc existence? If it doesn't exist, this is a registration.
    const userRef = doc(db, 'users', result.user.uid);
    const userSnap = await getDoc(userRef);

    // If user doesn't exist, this is a registration, so check permissions
    if (!userSnap.exists() && result.user.email) {
      await registerGoogleUser(result.user, userRef);
    }
  };

  /**
   * Sign out current user
   */
  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
