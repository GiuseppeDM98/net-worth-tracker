/**
 * Sign in as the degraded-scenario account and park its session.
 *
 * Gemello di `auth.setup.ts` per il secondo utente. Esiste come progetto a sé perché gli scenari
 * degradati riscrivono snapshot e versamenti: tenerli su un account separato è ciò che impedisce
 * alle altre spec di dipendere dall'ordine di esecuzione.
 *
 * L'utente viene creato da `global-setup.ts`, che semina uno scenario degradato prima che questo
 * progetto giri — qui si assume solo che esista.
 */

import { test as setup, expect } from '@playwright/test';
import { DEGRADED_STORAGE_STATE } from '../playwright.config';

/** Matches `scripts/seedPensionE2E.mts` → DEGRADED_EMAIL. */
const DEGRADED_EMAIL = 'degraded@example.com';
const TEST_PASSWORD = 'test1234';

setup('authenticate degraded account', async ({ page }) => {
  await page.goto('/login');

  await page.locator('#email').fill(DEGRADED_EMAIL);
  await page.locator('#password').fill(TEST_PASSWORD);
  // `exact` matters: the page also has an "Accedi con Google" button.
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();

  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  // The profile in the sidebar footer, not `navigation`/`main`: those are in the HTML before the
  // login since 2026-09-28 (see auth.setup.ts).
  await expect(page.locator('[data-sidebar="footer"]')).toContainText(DEGRADED_EMAIL);

  // `indexedDB: true` for the same reason as auth.setup.ts: the Firebase Web SDK keeps its session
  // there, and the default capture produces a state file that lands every spec back on /login.
  await page.context().storageState({ path: DEGRADED_STORAGE_STATE, indexedDB: true });
});
