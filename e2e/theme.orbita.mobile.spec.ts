/**
 * The Orbita costume at 390 (DESIGN.md → The Costume Rule): square tiles with their corner marks, the verdict in
 * Chakra Petch uppercase at 24px (the page-verdict's own size below 1440), an 18px planet beside the phone's title,
 * no resource bar (it is a desktop figure: `hidden desktop:flex`) and no horizontal overflow.
 * The account's `colorTheme` is written for the run and put back (`e2e/themeEgeo.ts`).
 *
 * Seen red (2026-11-22) with `desktop:flex` → `flex` (the bar visible at 390) and with `--radius-2xl: 0rem` back to
 * the palette's 1rem (tiles rounded).
 */
import { expect, test } from '@playwright/test';
import { restoreColorTheme, settle, setAccountColorTheme, startWith, styleOf } from './themeEgeo';

const MODES = ['light', 'dark'] as const;
const CHAKRA = /^"?Chakra Petch/;

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.beforeAll(async () => {
  await setAccountColorTheme('orbita');
});
test.afterAll(restoreColorTheme);

for (const mode of MODES) {
  test(`/dashboard · ${mode}: corners, an uppercase 24px headline, an 18px planet, no bar, no overflow`, async ({ page }) => {
    await startWith(page, 'orbita', mode);
    await page.goto('/dashboard');
    await settle(page);

    const tile = await styleOf(page, '#page-main [data-tile], main [data-tile]', ['border-top-left-radius', 'background-image']);
    expect(tile?.['border-top-left-radius']).toBe('0px');
    expect(tile?.['background-image']?.match(/linear-gradient\(/g) ?? [], tile?.['background-image']).toHaveLength(4);

    const verdict = await styleOf(page, 'main section[style*="page-verdict"] h2', ['font-family', 'text-transform', 'font-size']);
    expect(verdict?.['font-family']).toMatch(CHAKRA);
    expect(verdict?.['text-transform']).toBe('uppercase');
    expect(verdict?.['font-size']).toBe('24px');

    // The planet beside the phone's title: right before the visible `h1`.
    const emblem = await page.locator('main h1').filter({ visible: true }).first().locator('xpath=preceding-sibling::*[1]').evaluate((node) => ({
      tag: node.tagName.toLowerCase(),
      hidden: node.getAttribute('aria-hidden'),
      width: node.getAttribute('width'),
      circles: node.querySelectorAll('circle').length,
      ellipses: node.querySelectorAll('ellipse').length,
    }));
    expect(emblem).toEqual({ tag: 'svg', hidden: 'true', width: '18', circles: 1, ellipses: 1 });

    // The bar is in the DOM (the theme has one) and hidden below desktop:.
    await expect(page.locator('dl[aria-label="Quadro rapido"]')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
