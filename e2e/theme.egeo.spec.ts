/**
 * The Egeo costume at 1440 (DESIGN.md → The Costume Rule, doc/guide/temi.md § Il costume): on the dashboard
 * a marble ground (stripes in light, the plain page in dark), 4px tiles with a gold cap, Marcellus on the
 * verdict and the eyebrows while a figure stays Geist Mono, a 7px frieze under the header and the temple beside
 * the page's label; outside the dashboard the palette alone. And the font is fetched only where it paints.
 *
 * The account's `colorTheme` is written for the run and put back (`e2e/themeEgeo.ts`: the preference overrides
 * `localStorage` once signed in). Strings are the browser's own (`rgb(…)`, `Marcellus, …`), never an authored
 * `oklch(` (doc/guide/temi.md: the token you author is not the token the browser returns).
 *
 * Seen red (2026-11-22) with `var(--font-marcellus)` first in `@theme inline`'s `--font-sans` (a face `loaded`
 * with the default theme), and with the band's height token at 0px.
 */
import { expect, test, type Page } from '@playwright/test';
import { restoreColorTheme, settle, setAccountColorTheme, startWith, styleOf } from './themeEgeo';

const MODES = ['light', 'dark'] as const;
const MARCELLUS = /^"?Marcellus/;

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.afterAll(restoreColorTheme);

/** The statuses of every `document.fonts` face of family Marcellus, once the fonts are ready. */
async function marcellusStatuses(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((face) => face.family.replace(/"/g, '') === 'Marcellus').map((face) => face.status);
  });
}

test.describe('Egeo, signed in', () => {
  test.beforeAll(async () => {
    await setAccountColorTheme('egeo');
  });

  for (const mode of MODES) {
    test(`/dashboard · ${mode}: ground, tile, verdict, frieze and temple`, async ({ page }) => {
      await startWith(page, 'egeo', mode);
      await page.goto('/dashboard');
      await settle(page);

      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('egeo');
      expect(await page.evaluate(() => document.documentElement.hasAttribute('data-costume'))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(mode === 'dark');

      const ground = await styleOf(page, '#page-main', ['background-image']);
      if (mode === 'light') expect(ground?.['background-image']).toMatch(/^repeating-linear-gradient/);
      else expect(ground?.['background-image']).toBe('none');

      const tile = await styleOf(page, '#page-main [data-tile]', ['border-top-left-radius', 'background-image']);
      expect(tile?.['border-top-left-radius']).toBe('4px');
      expect(tile?.['background-image']).toMatch(/^linear-gradient/);

      const verdict = await styleOf(page, 'main section[style*="page-verdict"] h2', ['font-family', 'font-size']);
      expect(verdict?.['font-family']).toMatch(MARCELLUS);
      expect(verdict?.['font-size']).toBe('34px');

      const band = await styleOf(page, '.costume-header-band', ['height']);
      expect(band?.height).toBe('7px');

      // The desktop label's temple: the element right before the label's eyebrow, 22px wide.
      const emblem = await page.locator('#page-main p.tile-eyebrow').first().locator('xpath=preceding-sibling::*[1]').evaluate((node) => ({
        tag: node.tagName.toLowerCase(),
        hidden: node.getAttribute('aria-hidden'),
        width: node.getAttribute('width'),
      }));
      expect(emblem).toEqual({ tag: 'svg', hidden: 'true', width: '22' });
    });

    test(`/dashboard/cashflow?tab=tracking · ${mode}: the Periodo eyebrow in Marcellus, its year in the mono`, async ({ page }) => {
      await startWith(page, 'egeo', mode);
      await page.goto('/dashboard/cashflow?tab=tracking');
      await settle(page);

      const eyebrow = page.locator('.tile-eyebrow', { hasText: /^Cashflow · / }).first();
      await expect(eyebrow).toBeVisible();
      expect((await eyebrow.evaluate((node) => getComputedStyle(node).fontFamily))).toMatch(MARCELLUS);
      const figure = eyebrow.locator('.costume-figure');
      await expect(figure).toHaveCount(1);
      expect(await figure.evaluate((node) => getComputedStyle(node).fontFamily)).toContain('Geist Mono');

      const tile = await styleOf(page, '#page-main [data-tile]', ['border-top-left-radius', 'background-image']);
      expect(tile?.['border-top-left-radius']).toBe('4px');
      expect(tile?.['background-image']).toMatch(/^linear-gradient/);
    });
  }

  test('/dashboard with Egeo: a Marcellus face is loaded', async ({ page }) => {
    await startWith(page, 'egeo', 'light');
    await page.goto('/dashboard');
    await settle(page);
    await expect(page.locator('main section[style*="page-verdict"] h2')).toBeVisible();
    expect(await marcellusStatuses(page)).toContain('loaded');
  });
});

test.describe('the default theme loads no Marcellus', () => {
  test.beforeAll(async () => {
    await setAccountColorTheme('default');
  });

  test('/dashboard · default: every Marcellus face stays unloaded, the verdict stays Geist', async ({ page }) => {
    await startWith(page, 'default', 'light');
    await page.goto('/dashboard');
    await settle(page);
    const statuses = await marcellusStatuses(page);
    expect(statuses.length, 'the @font-face rules are in the root CSS').toBeGreaterThan(0);
    expect(statuses.every((status) => status === 'unloaded'), statuses.join(',')).toBe(true);
    const verdict = await styleOf(page, 'main section[style*="page-verdict"] h2', ['font-family']);
    expect(verdict?.['font-family']).not.toMatch(MARCELLUS);
  });
});

test.describe('Egeo, signed out: the palette alone', () => {
  // Signed in, `/` and `/login` redirect to `/dashboard`.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const mode of MODES) {
    for (const path of ['/', '/login']) {
      test(`${path} · ${mode}: no frieze, no temple, headings in Geist, the palette applied`, async ({ page, browser }) => {
        // What `/dashboard`'s `html` paints in the same mode, read signed in on a second context.
        const signedIn = await browser.newContext({ storageState: 'e2e/.auth/user.json', viewport: { width: 1440, height: 900 } });
        const reference = await signedIn.newPage();
        await setAccountColorTheme('egeo');
        await startWith(reference, 'egeo', mode);
        await reference.goto('/dashboard');
        await settle(reference);
        const expected = (await styleOf(reference, 'html', ['background-color']))?.['background-color'];
        await signedIn.close();

        await startWith(page, 'egeo', mode);
        await page.goto(path);
        // PageHeader draws its h1 twice (phone navbar, desktop row) and /login has none: the first visible heading.
        await expect(page.locator('h1, h2, h3').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });

        expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('egeo');
        expect(await page.locator('[data-costume-scope]').count()).toBe(0);
        const bands = await page.locator('.costume-header-band').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).height));
        expect(bands.every((height) => height === '0px'), bands.join(',')).toBe(true);
        const families = await page.locator('h1, h2, h3').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fontFamily));
        expect(families.length).toBeGreaterThan(0);
        for (const family of families) expect(family).not.toMatch(MARCELLUS);
        expect((await styleOf(page, 'body', ['background-color']))?.['background-color']).toBe(expected);
        if (path === '/login') expect(await marcellusStatuses(page)).not.toContain('loaded');
      });
    }
  }
});
