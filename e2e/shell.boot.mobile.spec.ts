/**
 * The dashboard shell before the login, at 390 — the twin of `shell.boot.spec.ts` on the `mobile`
 * project: the same HTML, and
 * the hydration that matters most here. On a phone `useMediaQuery` answers the server's `false`
 * during hydration while the viewport says `true`; the CSS decides the first frame
 * (`hidden desktop:block`) and React corrects the value afterwards without an error — (b) is the
 * proof. Seen red on 2026-09-28 with the same three breaks as the desktop spec.
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

test('la risposta HTML di /dashboard porta la shell, bottom nav compresa', async ({ request }) => {
  await expectShellInHtml(request);
});

test('la shell idrata a 390 senza avvisi in console', async ({ page }) => {
  await expectCleanHydration(page);
});

test('un tema salvato è già su <html> al primo frame, a 390', async ({ page }) => {
  await expectThemeOnFirstFrame(page);
});

test('theme-color, color-scheme e lo sfondo di <html> seguono il tema risolto, a 390', async ({ page }) => {
  await expectBrowserChromeFollowsTheme(page);
});

test('il testo è in Geist Sans, la faccia caricata, a 390', async ({ page }) => {
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
