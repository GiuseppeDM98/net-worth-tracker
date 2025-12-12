import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp: App;

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
  // Try to use service account JSON first (recommended for Vercel)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY && process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim().length > 0) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      adminApp = initializeApp({
        credential: cert(serviceAccount),
      });
    } catch (error) {
      console.error('Error parsing FIREBASE_SERVICE_ACCOUNT_KEY:', error);
      console.warn('Firebase Admin SDK not initialized - using fallback for build');
      // Initialize with placeholder credentials for build purposes
      // The actual credentials will be properly configured in Vercel environment
      adminApp = initializeApp({
        projectId: 'build-placeholder',
      });
    }
  }
  // Fallback to individual environment variables
  else if (
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ) {
    adminApp = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    // Initialize with placeholder for build - credentials will be set in Vercel
    console.warn('Firebase Admin credentials not found - using placeholder for build');
    adminApp = initializeApp({
      projectId: 'build-placeholder',
    });
  }
} else {
  adminApp = getApps()[0];
}

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);

export default adminApp;
