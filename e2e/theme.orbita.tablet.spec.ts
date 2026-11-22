/**
 * The Orbita costume on a tablet (768×1024 and 1024×768: the two `tablet` projects run this file): the resource
 * bar is a figure of ≥ 1440 only (`desktop:flex`), so neither stage shows it — the dl is in the DOM and hidden —,
 * while the costume's tiles and headline are worn as at any width. The account's `colorTheme` is written for the run
 * and put back (`e2e/themeEgeo.ts`).
 *
 * Seen red (2026-11-22) with `desktop:flex` → `md:flex` (the bar visible at 768 and 1024).
 */
import { expect, test } from '@playwright/test';
import { restoreColorTheme, settle, setAccountColorTheme, startWith, styleOf } from './themeEgeo';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.beforeAll(async () => {
  await setAccountColorTheme('orbita');
});
test.afterAll(restoreColorTheme);

test('/dashboard · dark: the bar is not visible, the costume is worn, nothing overflows', async ({ page }) => {
  await startWith(page, 'orbita', 'dark');
  await page.goto('/dashboard');
  await settle(page);

  await expect(page.locator('dl[aria-label="Quadro rapido"]')).toBeHidden();
  const tile = await styleOf(page, '#page-main [data-tile], main [data-tile]', ['border-top-left-radius']);
  expect(tile?.['border-top-left-radius']).toBe('0px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
