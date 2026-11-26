import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  connectFirestoreEmulator,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { clientProjectId } from './emulatorProject';

// On the emulators a page served on :3100+N belongs to Playwright worker N and reads that worker's
// Firestore project (lib/firebase/emulatorProject.ts). The flag is compared HERE, as a literal the
// bundler inlines: a production build keeps the baked project whatever port serves it.
const USES_EMULATOR = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: clientProjectId(
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    USES_EMULATOR,
    typeof window === 'undefined' ? undefined : window.location.port,
  ),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase only if it hasn't been initialized yet
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function createFirestoreInstance() {
  if (typeof window === 'undefined') {
    return getFirestore(app);
  }

  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (error) {
    console.warn('[firebase] Persistent Firestore cache unavailable, falling back to memory cache:', error);

    try {
      return initializeFirestore(app, {
        localCache: memoryLocalCache(),
      });
    } catch (fallbackError) {
      console.warn('[firebase] Memory Firestore cache fallback unavailable, using default instance:', fallbackError);
      return getFirestore(app);
    }
  }
}

// Initialize Firebase services
export const auth = getAuth(app);
export const db = createFirestoreInstance();

// ── Local Emulator Suite ──────────────────────────────────────────────────────
// When NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true (set by the `dev:emulator` npm script), route Auth
// and Firestore to the local emulators instead of the cloud project. This keeps development and
// manual testing entirely off production data. Ports match firebase.json. The globalThis guard
// prevents a double-connect on Fast Refresh (connect* throws once the SDK has issued a request).
if (USES_EMULATOR) {
  const globalWithFlag = globalThis as typeof globalThis & { __firebaseEmulatorsConnected?: boolean };
  if (!globalWithFlag.__firebaseEmulatorsConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    globalWithFlag.__firebaseEmulatorsConnected = true;
    console.info('[firebase] Connected to LOCAL emulators (Auth :9099, Firestore :8080).');
  }
}
