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
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { User } from '@/types/assets';
import { getDefaultTargets, setSettings } from '@/lib/services/assetAllocationService';

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
        // Convert Firebase user to our User type
        const userData: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
        };
        setUser(userData);

        // Ensure user document exists in Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          await setDoc(userRef, {
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || '',
            createdAt: new Date(),
          });

          // Set default asset allocation (60% equity, 40% bonds)
          await setSettings(firebaseUser.uid, {
            targets: getDefaultTargets(),
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    // Server-side validation: check if registration is allowed
    try {
      const response = await fetch('/api/auth/check-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Le registrazioni sono attualmente chiuse.');
      }
    } catch (error: any) {
      // Re-throw the error to be caught by the component
      throw new Error(error.message || 'Impossibile verificare i permessi di registrazione.');
    }

    const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password);

    // Create user document in Firestore
    await setDoc(doc(db, 'users', firebaseUser.uid), {
      email: firebaseUser.email,
      displayName: displayName || '',
      createdAt: new Date(),
    });

    // Set default asset allocation (60% equity, 40% bonds)
    await setSettings(firebaseUser.uid, {
      targets: getDefaultTargets(),
    });
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);

    // Check if this is a new user (first time signing in with Google)
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
          // Delete the Firebase user since registration is not allowed
          await result.user.delete();
          const error = await response.json();
          throw new Error(error.message || 'Le registrazioni sono attualmente chiuse.');
        }
      } catch (error: any) {
        // If we couldn't delete the user, sign them out
        await firebaseSignOut(auth);
        throw new Error(error.message || 'Impossibile verificare i permessi di registrazione.');
      }
    }
  };

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
