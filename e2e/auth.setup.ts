/**
 * Sign in once and park the session, so every spec starts already authenticated.
 *
 * Runs as its own Playwright project that the others declare as a dependency; the resulting
 * `storageState` carries the Firebase Auth session out of IndexedDB and localStorage.
 *
 * It logs in through the real form rather than injecting a token: it is the one flow every other
 * spec depends on, so it is worth exercising for real — and a broken login should fail here, once,
 * with a clear name, instead of failing every spec at the first assertion.
 */

import { test as setup, expect } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';
import { stripPersistedQueryCache } from './persistedCache';

/** Matches `scripts/seedEmulator.ts` / `scripts/seedPensionE2E.mts`. */
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'test1234';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');

  await page.locator('#email').fill(TEST_EMAIL);
  await page.locator('#password').fill(TEST_PASSWORD);
  // `exact` matters: the page also has an "Accedi con Google" button.
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();

  // The redirect is the only reliable signal that Firebase accepted the credentials.
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  // Then the profile in the sidebar footer: since 2026-09-28 `navigation` and `main` are in the HTML
  // before Firebase has said who is signed in, so they would declare the session ready too early.
  // The footer prints the account's email once `onAuthStateChanged` has answered (1440 viewport:
  // the sidebar is a fixed column only from `desktop:`).
  await expect(page.locator('[data-sidebar="footer"]')).toContainText(TEST_EMAIL);

  // `indexedDB: true` is not optional here: the Firebase Web SDK persists its session in IndexedDB,
  // so the default cookie+localStorage capture produces a state file that silently lands every
  // later spec back on the login page.
  await page.context().storageState({ path: STORAGE_STATE, indexedDB: true });
  // The capture also took the persisted React Query cache: out of the state file, so
  // every spec starts with an empty cache and shows what a first visit shows (e2e/persistedCache.ts).
  stripPersistedQueryCache(STORAGE_STATE);
});
