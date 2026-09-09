/**
 * Session of the Analisi fixture account — same real-form login as auth.setup.ts.
 *
 * A separate account (see scripts/seedAnalisiE2E.mts): the base account carries
 * current-month expenses from the dev seed, which would drift every exact figure
 * the Analisi specs assert.
 */

import { test as setup, expect } from '@playwright/test';
import { ANALISI_STORAGE_STATE } from '../playwright.config';

/** Matches `scripts/seedAnalisiE2E.mts`. */
const EMAIL = 'analisi@example.com';
const PASSWORD = 'test1234';

setup('authenticate analisi user', async ({ page }) => {
  await page.goto('/login');

  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();

  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByRole('navigation').or(page.locator('main'))).toBeVisible();

  // indexedDB: true — the Firebase Web SDK parks its session there (see auth.setup.ts).
  await page.context().storageState({ path: ANALISI_STORAGE_STATE, indexedDB: true });
});
