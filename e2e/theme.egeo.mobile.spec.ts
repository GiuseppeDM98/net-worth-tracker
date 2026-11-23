/**
 * The Egeo costume at 390 (DESIGN.md → The Costume Rule): the ground, the gold cap on the tiles, the frieze
 * under the sticky header — on an OPAQUE `--background` strip, so no row shows through it —, an 18px temple
 * beside the phone's title and the verdict in Marcellus at 24px (the page-verdict's own size below 1440).
 * The account's `colorTheme` is written for the run and put back (`e2e/themeEgeo.ts`).
 *
 * Seen red (2026-11-22) with `--costume-header-band-height: 0px`.
 */
import { expect, test } from '@playwright/test';
import { restoreColorTheme, settle, setAccountColorTheme, startWith, styleOf } from './themeEgeo';

const MODES = ['light', 'dark'] as const;
const MARCELLUS = /^"?Marcellus/;

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.beforeAll(async () => {
  await setAccountColorTheme('egeo');
});
test.afterAll(restoreColorTheme);

for (const mode of MODES) {
  test(`/dashboard · ${mode}: ground, cap, frieze, temple and a 24px headline`, async ({ page }) => {
    await startWith(page, 'egeo', mode);
    await page.goto('/dashboard');
    await settle(page);

    const ground = await styleOf(page, '#page-main', ['background-image']);
    if (mode === 'light') expect(ground?.['background-image']).toMatch(/^repeating-linear-gradient/);
    else expect(ground?.['background-image']).toBe('none');

    const tile = await styleOf(page, '#page-main [data-tile], main [data-tile]', ['border-top-left-radius', 'background-image']);
    expect(tile?.['border-top-left-radius']).toBe('4px');
    expect(tile?.['background-image']).toMatch(/^linear-gradient/);

    // The band: 7px of frieze on the opaque page colour (the header is sticky below 1440).
    const band = await styleOf(page, '.costume-header-band', ['height', 'background-color']);
    expect(band?.height).toBe('7px');
    expect(band?.['background-color']).toBe((await styleOf(page, 'html', ['background-color']))?.['background-color']);

    // The temple beside the phone's title: the element right before the visible `h1`'s wrapper content.
    const emblem = await page.locator('main h1').filter({ visible: true }).first().locator('xpath=preceding-sibling::*[1]').evaluate((node) => ({
      tag: node.tagName.toLowerCase(),
      hidden: node.getAttribute('aria-hidden'),
      width: node.getAttribute('width'),
    }));
    expect(emblem).toEqual({ tag: 'svg', hidden: 'true', width: '18' });

    const verdict = await styleOf(page, 'main section[style*="page-verdict"] h2', ['font-family', 'font-size']);
    expect(verdict?.['font-family']).toMatch(MARCELLUS);
    expect(verdict?.['font-size']).toBe('24px');

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
