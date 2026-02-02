/**
 * Authentication Helpers
 *
 * Utilities for handling Firebase Auth token refresh and Firestore permission synchronization.
 *
 * Problem: After createUserWithEmailAndPassword() or signInWithPopup(), the Auth user
 * is created immediately but the ID token refresh happens asynchronously (100-500ms).
 * Firestore security rules evaluate request.auth which may be null/stale, causing
 * PERMISSION_DENIED errors when writing to collections immediately after registration.
 *
 * Solution: This module provides:
 * 1. waitForAuthTokenRefresh(): Forces immediate token refresh with retry logic
 * 2. retryFirestoreOperation(): Wrapper for Firestore operations with exponential backoff
 */

import { User as FirebaseUser } from 'firebase/auth';

/**
 * Delay execution for a specified number of milliseconds
 *
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after the delay
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for Firebase Auth token refresh and ensure Firestore permissions are synchronized
 *
 * Problem: After createUserWithEmailAndPassword() or signInWithPopup(), the Auth user
 * is created immediately but the ID token refresh happens asynchronously (100-500ms).
 * Firestore security rules evaluate request.auth which may be null/stale, causing
 * PERMISSION_DENIED errors when writing to collections immediately after registration.
 *
 * Solution: This function:
 * 1. Forces an immediate token refresh with getIdToken(true)
 * 2. Implements exponential backoff retry if token refresh is delayed
 * 3. Ensures Firestore operations have valid auth context
 *
 * Configuration:
 * - Initial retry delay: 100ms (fast path for most cases)
 * - Max retries: 5 (total max wait: 100+200+400+800+1600 = 3100ms)
 * - Exponential backoff factor: 2x
 *
 * @param firebaseUser - Firebase Auth user object
 * @returns Promise<void> - Resolves when token is refreshed and ready for Firestore operations
 * @throws Error if token refresh fails after all retries
 */
export async function waitForAuthTokenRefresh(
  firebaseUser: FirebaseUser
): Promise<void> {
  const MAX_RETRIES = 5;
  const INITIAL_DELAY_MS = 100;
  const BACKOFF_FACTOR = 2;

  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      // Force token refresh (true = force refresh even if not expired)
      const token = await firebaseUser.getIdToken(true);

      if (token) {
        console.log(
          `[AuthHelpers] Token refresh successful after ${attempt} retries`
        );
        return; // Success - token is refreshed
      }
    } catch (error) {
      console.warn(
        `[AuthHelpers] Token refresh attempt ${attempt + 1} failed:`,
        error
      );
    }

    // If we haven't succeeded yet, wait before retrying
    if (attempt < MAX_RETRIES - 1) {
      const delayMs = INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt);
      console.log(`[AuthHelpers] Retrying token refresh in ${delayMs}ms...`);
      await delay(delayMs);
    }

    attempt++;
  }

  // If we've exhausted all retries, throw an error
  throw new Error(
    'Failed to refresh authentication token after multiple attempts. Please try again.'
  );
}

/**
 * Execute a Firestore operation with automatic retry on PERMISSION_DENIED errors
 *
 * This is a safety net for cases where token refresh is delayed beyond our control.
 * It specifically retries operations that fail with PERMISSION_DENIED errors.
 *
 * Use case: Wrapping setSettings() calls during user registration to handle
 * race conditions between Auth token refresh and Firestore security rules evaluation.
 *
 * Configuration:
 * - Initial retry delay: 200ms
 * - Max retries: 3 (total max wait: 200+400+800 = 1400ms)
 * - Exponential backoff factor: 2x
 *
 * @param operation - Async function that performs the Firestore operation
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise<T> - Result of the operation
 * @throws Error if operation fails after all retries
 */
export async function retryFirestoreOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  const INITIAL_DELAY_MS = 200;
  const BACKOFF_FACTOR = 2;

  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const result = await operation();
      if (attempt > 0) {
        console.log(
          `[AuthHelpers] Firestore operation succeeded after ${attempt} retries`
        );
      }
      return result;
    } catch (error: any) {
      // Check for Firebase permission errors in multiple formats
      const isPermissionDenied =
        error?.code === 'permission-denied' ||
        error?.message?.includes('PERMISSION_DENIED') ||
        error?.message?.includes('Missing or insufficient permissions');

      // Only retry on permission errors, otherwise re-throw immediately
      if (!isPermissionDenied) {
        console.error('[AuthHelpers] Non-permission error, not retrying:', error);
        throw error;
      }

      console.warn(
        `[AuthHelpers] Firestore operation attempt ${attempt + 1} failed with PERMISSION_DENIED`
      );

      // If we've exhausted retries, throw the error
      if (attempt >= maxRetries - 1) {
        throw new Error(
          'Failed to complete registration. Please try again or contact support if the problem persists.'
        );
      }

      // Wait before retrying with exponential backoff
      const delayMs = INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt);
      console.log(`[AuthHelpers] Retrying Firestore operation in ${delayMs}ms...`);
      await delay(delayMs);

      attempt++;
    }
  }

  throw new Error('Unexpected error in retryFirestoreOperation');
}
