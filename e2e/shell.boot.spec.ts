/**
 * The dashboard shell before the login, at 1440 (in the HTML since 2026-09-28,
 * doc/guide/shell.md § Navigation). The assertions live in `shellBoot.ts`,
 * shared with the 390 twin. Seen red on 2026-09-28, one at a time: (a) with the shell put back
 * inside `ProtectedRoute`; (b) with a `typeof window` branch rendering different text on the
 * server and on the client; (c) with the <head> script removed from `app/layout.tsx`.
 */

import { test } from '@playwright/test';
import {
  expectBrowserChromeFollowsTheme,
  expectCleanHydration,
  expectCostumeScopeInDashboard,
  expectGeistSansApplied,
  expectNoCostumeScopeOutsideDashboard,
  expectRedirectWithoutSession,
  expectShellInHtml,
  expectThemeOnFirstFrame,
} from './shellBoot';

test('la risposta HTML di /dashboard porta la shell, senza JS e senza sessione', async ({ request }) => {
  await expectShellInHtml(request);
});

test('la shell idrata a 1440 senza avvisi in console', async ({ page }) => {
  await expectCleanHydration(page);
});

test('un tema salvato è già su <html> al primo frame', async ({ page }) => {
  await expectThemeOnFirstFrame(page);
});

test('theme-color, color-scheme e lo sfondo di <html> seguono il tema risolto', async ({ page }) => {
  await expectBrowserChromeFollowsTheme(page);
});

test('il testo è in Geist Sans, la faccia caricata', async ({ page }) => {
  await expectGeistSansApplied(page);
});

test('la dashboard porta un solo confine del costume', async ({ page }) => {
  await expectCostumeScopeInDashboard(page);
});

test.describe('senza sessione', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('la landing e il login non portano il confine del costume', async ({ page }) => {
    await expectNoCostumeScopeOutsideDashboard(page);
  });

  test('/dashboard rimanda a /login', async ({ page }) => {
    await expectRedirectWithoutSession(page);
  });
});
