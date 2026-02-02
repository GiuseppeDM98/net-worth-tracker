/**
 * Authentication Context for Net Worth Tracker
 *
 * Manages user authentication state using Firebase Auth + Firestore dual-storage pattern.
 *
 * Architecture:
 * - displayName is stored in BOTH Firebase Auth profile AND Firestore document
 *   - Google OAuth users: displayName set in Firebase Auth profile automatically
 *   - Email/password users: displayName stored in Firestore only
 *   - Fallback pattern ensures displayName is always available
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

import React, { createContext, useContext, useEffect, useState } from 'react';
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
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { User } from '@/types/assets';
import { getDefaultTargets, setSettings } from '@/lib/services/assetAllocationService';
import { waitForAuthTokenRefresh, retryFirestoreOperation } from '@/lib/utils/authHelpers';

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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        // Try to get displayName from Firebase Auth first
        let displayName = firebaseUser.displayName;

        // If displayName is not in Firebase Auth, try to get it from Firestore
        // Why dual-lookup? Google OAuth sets displayName in Firebase Auth profile,
        // but email/password registration stores it in Firestore only.
        // This fallback ensures displayName is available regardless of signup method.
        if (!displayName) {
          try {
            const userRef = doc(db, 'users', firebaseUser.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const userData = userSnap.data();
              displayName = userData.displayName || null;
            }
          } catch (error) {
            console.error('Error fetching user displayName from Firestore:', error);
          }
        }

        // Convert Firebase user to our User type
        const userData: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: displayName,
        };
        setUser(userData);
      } else {
        setUser(null);
      }
      setLoading(false);
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
    try {
      const response = await fetch('/api/auth/check-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Registrations are currently closed.');
      }
    } catch (error: any) {
      // Re-throw the error to be caught by the component
      throw new Error(error.message || 'Unable to verify registration permissions.');
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
      try {
        const response = await fetch('/api/auth/check-registration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: result.user.email }),
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
              console.log(`[CLEANUP] Deleted orphan Firestore document for user: ${result.user.uid}`);
            }

            // Delete the Firebase Auth user
            await result.user.delete();
          } catch (deleteError) {
            console.error('[CLEANUP_ERROR]', deleteError);
            // If we couldn't delete the user, sign them out
            // Prevents stuck state where user sees authenticated UI but has no permissions
            await firebaseSignOut(auth);
          }

          const error = await response.json();
          throw new Error(error.message || 'Registrations are currently closed.');
        }

        // Registration is allowed - wait for token refresh first
        console.log('[AuthContext] Google OAuth: Waiting for authentication token refresh...');
        await waitForAuthTokenRefresh(result.user);

        // Create Firestore document
        await setDoc(userRef, {
          email: result.user.email,
          displayName: result.user.displayName || '',
          createdAt: new Date(),
        });

        // Set default asset allocation (60% equity, 40% bonds)
        // Wrapped in retry logic as additional safety net for permission synchronization
        await retryFirestoreOperation(async () => {
          await setSettings(result.user.uid, {
            targets: getDefaultTargets(),
          });
        });
      } catch (error: any) {
        // Re-throw the error to be caught by the component
        throw new Error(error.message || 'Unable to verify registration permissions.');
      }
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
