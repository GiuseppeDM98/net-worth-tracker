/**
 * Session of the Centri di Costo fixture account — same real-form login as auth.setup.ts.
 *
 * A separate account (see scripts/seedCostCentersE2E.mts): the tab is opt-in, and turning it
 * on for the base account would add a fifth tab to every Cashflow spec.
 */

import { test as setup, expect } from '@playwright/test';
import { CENTRI_STORAGE_STATE } from '../playwright.config';

/** Matches `scripts/seedCostCentersE2E.mts`. */
const EMAIL = 'centri@example.com';
const PASSWORD = 'test1234';

setup('authenticate centri user', async ({ page }) => {
  await page.goto('/login');

  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();

  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByRole('navigation').or(page.locator('main'))).toBeVisible();

  // indexedDB: true — the Firebase Web SDK parks its session there (see auth.setup.ts).
  await page.context().storageState({ path: CENTRI_STORAGE_STATE, indexedDB: true });
});
