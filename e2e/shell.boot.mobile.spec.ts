/**
 * PERF-02 at 390 — the twin of `shell.boot.spec.ts` on the `mobile` project: the same HTML, and
 * the hydration that matters most here. On a phone `useMediaQuery` answers the server's `false`
 * during hydration while the viewport says `true`; the CSS decides the first frame
 * (`hidden desktop:flex`) and React corrects the value afterwards without an error — (b) is the
 * proof. Seen red on 2026-09-28 with the same three breaks as the desktop spec.
 */

import { test } from '@playwright/test';
import {
  expectCleanHydration,
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

test.describe('senza sessione', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/dashboard rimanda a /login', async ({ page }) => {
    await expectRedirectWithoutSession(page);
  });
});
