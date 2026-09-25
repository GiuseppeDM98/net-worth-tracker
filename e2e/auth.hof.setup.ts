/**
 * Session of the Hall of Fame fixture account — same real-form login as auth.setup.ts.
 *
 * A separate account (see scripts/seedHallOfFameE2E.mts): a ranking is worth a browser only
 * with a history behind it, and 47 snapshots on the base account would move every other spec.
 */

import { test as setup, expect } from '@playwright/test';
import { HOF_STORAGE_STATE } from '../playwright.config';

/** Matches `scripts/seedHallOfFameE2E.mts`. */
const EMAIL = 'hof@example.com';
const PASSWORD = 'test1234';

setup('authenticate hof user', async ({ page }) => {
  await page.goto('/login');

  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();

  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByRole('navigation').or(page.locator('main'))).toBeVisible();

  // indexedDB: true — the Firebase Web SDK parks its session there (see auth.setup.ts).
  await page.context().storageState({ path: HOF_STORAGE_STATE, indexedDB: true });
});
