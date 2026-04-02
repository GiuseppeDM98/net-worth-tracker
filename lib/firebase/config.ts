import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

const firebaseConfig = useEmulator
  ? {
      apiKey: 'emulator-api-key',
      authDomain: 'localhost',
      projectId: 'demo-net-worth-tracker',
    }
  : {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);

// Connect client SDK to emulators (browser only — server uses admin SDK + env vars)
const g = globalThis as typeof globalThis & { __FIREBASE_EMULATOR_CONNECTED__?: boolean };
if (useEmulator && typeof window !== 'undefined' && !g.__FIREBASE_EMULATOR_CONNECTED__) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  g.__FIREBASE_EMULATOR_CONNECTED__ = true;
}

export default app;
