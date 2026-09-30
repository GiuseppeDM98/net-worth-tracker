/**
 * Session of the Centri di Costo fixture account — same real-form login as auth.setup.ts.
 *
 * A separate account (see scripts/seedCostCentersE2E.mts): the tab is opt-in, and turning it
 * on for the base account would add a fifth tab to every Cashflow spec.
 */

import { test as setup, expect } from '@playwright/test';
import { CENTRI_STORAGE_STATE } from '../playwright.config';
import { stripPersistedQueryCache } from './persistedCache';

/** Matches `scripts/seedCostCentersE2E.mts`. */
const EMAIL = 'centri@example.com';
const PASSWORD = 'test1234';

setup('authenticate centri user', async ({ page }) => {
  await page.goto('/login');

  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();

  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  // The profile in the sidebar footer, not `navigation`/`main`: those are in the HTML before the
  // login since 2026-09-28 (see auth.setup.ts).
  await expect(page.locator('[data-sidebar="footer"]')).toContainText(EMAIL);

  // indexedDB: true — the Firebase Web SDK parks its session there (see auth.setup.ts).
  await page.context().storageState({ path: CENTRI_STORAGE_STATE, indexedDB: true });
  // The persisted React Query cache out of the state file (PERF-03, see auth.setup.ts).
  stripPersistedQueryCache(CENTRI_STORAGE_STATE);
});
