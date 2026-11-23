/**
 * The Orbita costume at 1440 (DESIGN.md → The Costume Rule, doc/guide/temi.md § Il costume): on the dashboard a starry
 * ground in dark (the plain page in light), square tiles with four console corner marks, Chakra Petch uppercase on the
 * verdict and the eyebrows while a figure stays Geist Mono, the primary glow at rest in dark and the focus ring in its
 * place, an AI control that keeps its own glow, the resource bar of four figures that print the tiles' text — and, away
 * from the dashboard, the palette alone. And the font is fetched only where it paints.
 *
 * The account's `colorTheme` is written for the run and put back (`e2e/themeEgeo.ts`: the preference overrides
 * `localStorage` once signed in). Strings are the browser's own, never an authored `oklch(` (doc/guide/temi.md).
 * The Assistente's stream is faked (`e2e/assistantRegister.ts`): no request reaches a model.
 *
 * Seen red (2026-11-22) with `:not(:focus-visible)` dropped from the glow rule (the focused button kept its glow),
 * with `desktop:flex` → `md:flex` (the bar visible at 1024 — the tablet spec), with `--costume-primary-glow: none`
 * in the dark scope block, with the `font-family` of the heading rule off (no Chakra Petch face loaded).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { restoreColorTheme, settle, setAccountColorTheme, startWith, styleOf } from './themeEgeo';
import { installFakeStream, openAssistant, plantFixture, questionBlock, questionCard, removeFixture, resetFixture, send } from './assistantRegister';

const MODES = ['light', 'dark'] as const;
const CHAKRA = /^"?Chakra Petch/;
const GEIST_SANS = /^"?Geist(?! Mono)/;
const VERDICT = 'main section[style*="page-verdict"] h2';
const BAR = 'dl[aria-label="Quadro rapido"]';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.afterAll(restoreColorTheme);

/** Text with every space (U+0020, U+00A0, U+202F) removed: the unit sits in its own span, the figure's spaces differ per tile. */
const bare = (text: string | null) => (text ?? '').replace(/[   ]/g, '');

/** The statuses of every `document.fonts` face of family Chakra Petch, once the fonts are ready. */
async function chakraFaces(page: Page): Promise<Array<{ weight: string; status: string; range: string }>> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((face) => face.family.replace(/"/g, '') === 'Chakra Petch')
      .map((face) => ({ weight: face.weight, status: face.status, range: face.unicodeRange }));
  });
}

/** The computed `box-shadow` the glow token resolves to, read through a probe laid inside the scope. */
async function computedGlow(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.boxShadow = 'var(--costume-primary-glow)';
    document.querySelector('[data-costume-scope]')!.appendChild(probe);
    const value = getComputedStyle(probe).boxShadow;
    probe.remove();
    return value;
  });
}

test.describe('Orbita, signed in', () => {
  test.beforeAll(async () => {
    await setAccountColorTheme('orbita');
  });

  for (const mode of MODES) {
    test(`/dashboard · ${mode}: ground, square tiles with corner marks, the console headline`, async ({ page }) => {
      await startWith(page, 'orbita', mode);
      await page.goto('/dashboard');
      await settle(page);

      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('orbita');
      expect(await page.evaluate(() => document.documentElement.hasAttribute('data-costume'))).toBe(true);

      const ground = (await styleOf(page, '#page-main', ['background-image']))?.['background-image'] ?? '';
      if (mode === 'dark') expect(ground.match(/radial-gradient\(/g) ?? [], ground).toHaveLength(6);
      else expect(ground).toBe('none');

      const tile = await styleOf(page, '#page-main [data-tile]', ['border-top-left-radius', 'background-image']);
      expect(tile?.['border-top-left-radius']).toBe('0px');
      expect(tile?.['background-image']?.match(/linear-gradient\(/g) ?? [], tile?.['background-image']).toHaveLength(4);

      const verdict = await styleOf(page, VERDICT, ['font-family', 'text-transform', 'font-size']);
      expect(verdict?.['font-family']).toMatch(CHAKRA);
      expect(verdict?.['text-transform']).toBe('uppercase');
      expect(verdict?.['font-size']).toBe('28px');

      const band = await styleOf(page, '.costume-header-band', ['height']);
      expect(band?.height).toBe('0px');

      // The planet before the desktop label: an aria-hidden svg 22px wide holding a circle and a ring.
      const emblem = await page.locator('#page-main p.tile-eyebrow').first().locator('xpath=preceding-sibling::*[1]').evaluate((node) => ({
        tag: node.tagName.toLowerCase(),
        hidden: node.getAttribute('aria-hidden'),
        width: node.getAttribute('width'),
        circles: node.querySelectorAll('circle').length,
        ellipses: node.querySelectorAll('ellipse').length,
      }));
      expect(emblem).toEqual({ tag: 'svg', hidden: 'true', width: '22', circles: 1, ellipses: 1 });
    });
  }

  test('/dashboard/allocation · dark: the headline\'s figure is Geist Mono and not uppercased', async ({ page }) => {
    await startWith(page, 'orbita', 'dark');
    await page.goto('/dashboard/allocation');
    await settle(page);
    const headline = page.locator(VERDICT).first();
    await expect(headline).toBeVisible();
    expect((await headline.evaluate((node) => getComputedStyle(node).textTransform))).toBe('uppercase');
    const figure = headline.locator('.costume-figure').first();
    await expect(figure).toBeVisible();
    const style = await figure.evaluate((node) => ({ family: getComputedStyle(node).fontFamily, transform: getComputedStyle(node).textTransform }));
    expect(style.family).toContain('Geist Mono');
    expect(style.transform).toBe('none');
  });

  test('/dashboard/cashflow?tab=tracking · dark: «Nuova Spesa» glows at rest and shows the ring, no glow, once reached with Tab', async ({ page }) => {
    await startWith(page, 'orbita', 'dark');
    await page.goto('/dashboard/cashflow?tab=tracking');
    await settle(page);
    const button = page.getByRole('button', { name: /Nuova Spesa/ }).first();
    await expect(button).toBeVisible();
    await page.mouse.move(0, 0);

    const glow = await computedGlow(page);
    expect(glow, 'the dark scope block declares a glow').not.toBe('none');
    expect(await button.evaluate((node) => getComputedStyle(node).boxShadow)).toBe(glow);

    // Reach it with the keyboard: the ring (also a box-shadow) takes the glow's place.
    let focused = false;
    for (let i = 0; i < 120 && !focused; i++) {
      await page.keyboard.press('Tab');
      focused = await button.evaluate((node) => node === document.activeElement);
    }
    expect(focused, 'Tab reached «Nuova Spesa»').toBe(true);
    expect(await button.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
    const ring = await button.evaluate((node) => getComputedStyle(node).boxShadow);
    expect(ring).not.toBe('none');
    expect(ring).not.toBe(glow);
  });

  test('/dashboard · light: «Nuova Spesa» has no glow (the light scope block declares none)', async ({ page }) => {
    await startWith(page, 'orbita', 'light');
    await page.goto('/dashboard/cashflow?tab=tracking');
    await settle(page);
    const button = page.getByRole('button', { name: /Nuova Spesa/ }).first();
    await expect(button).toBeVisible();
    await page.mouse.move(0, 0);
    expect(await computedGlow(page)).toBe('none');
    expect(await button.evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none');
  });

  test.describe('an AI control keeps its own glow', () => {
    test.beforeAll(async () => {
      await plantFixture();
    });
    test.beforeEach(async () => {
      await resetFixture();
    });
    test.afterAll(async () => {
      await removeFixture();
    });

    test('hovering a filled «Rispondi» serves the --ai-glow colour, not the costume glow', async ({ page }) => {
      test.setTimeout(150_000);
      await startWith(page, 'orbita', 'dark');
      const question = ['Una cosa.', questionBlock({ id: 'abitudine', text: 'È una spesa abituale?', options: [{ value: 'si', label: 'Sì' }, { value: 'no', label: 'No' }] })].join('\n\n');
      await installFakeStream(page, () => question);
      await openAssistant(page);
      await send(page, 'Ho speso 20 euro');
      const card = questionCard(page, 'abitudine');
      await expect(card).toBeVisible();
      await card.getByRole('radio', { name: 'Sì' }).click();
      const respond = page.getByRole('button', { name: 'Rispondi' });
      await expect(respond).toBeEnabled();
      // The `--ai-glow` colour as the browser serialises a resolved colour (a probe painted with it).
      const aiGlowColour = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.backgroundColor = 'var(--ai-glow)';
        document.body.appendChild(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return value;
      });
      await respond.hover();
      await expect.poll(() => respond.evaluate((node) => getComputedStyle(node).boxShadow)).toContain(aiGlowColour);
      expect(await respond.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe(await computedGlow(page));
    });
  });

  test.describe('the resource bar', () => {
    /** The figure a tile prints, as the page shows it. */
    const heroText = (page: Page) => page.locator('#panoramica-patrimonio').getByText(/€/).first().textContent();
    const sintesiFirstRow = (page: Page): Locator => page.locator('section[aria-label="Sintesi patrimoniale"]').getByText('Liquidità', { exact: true }).locator('xpath=following-sibling::*[1]/*[1]');
    const cashflowRisparmio = (page: Page): Locator => page.locator('section[aria-label^="Cashflow"]').getByText('Risparmio', { exact: true }).locator('xpath=following-sibling::p[1]');
    const yearChip = (page: Page): Locator => page.locator('#panoramica-patrimonio').getByText('da inizio anno', { exact: true }).locator('xpath=preceding-sibling::span[1]');

    for (const mode of MODES) {
      test(`/dashboard · ${mode}: the four cells read what their tiles print`, async ({ page }) => {
        await startWith(page, 'orbita', mode);
        await page.goto('/dashboard');
        await settle(page);

        const bar = page.locator(BAR);
        await expect(bar).toBeVisible();
        expect(await bar.locator('dt').allTextContents()).toEqual(['Patrimonio', 'Liquidità', 'Risparmio', 'Da inizio anno']);
        const cells = bar.locator('dd');
        await expect(cells).toHaveCount(4);

        // The hero counts up from zero: read once its count has settled and equals the bar's cell.
        await expect.poll(async () => bare(await heroText(page))).toBe(bare(await cells.nth(0).textContent()));
        expect(bare(await cells.nth(1).textContent())).toBe(bare(await sintesiFirstRow(page).textContent()));
        expect(bare(await cells.nth(2).textContent())).toBe(bare(await cashflowRisparmio(page).textContent()));
        // «Da inizio anno» against the percentage inside the yearly chip's parentheses.
        const chip = bare(await yearChip(page).textContent());
        expect(bare(await cells.nth(3).textContent())).toBe(/\(([^)]*)\)/.exec(chip)![1]);
      });
    }

    test('/dashboard/history: no bar on any other page', async ({ page }) => {
      await startWith(page, 'orbita', 'dark');
      await page.goto('/dashboard/history');
      await settle(page);
      await expect(page.locator(BAR)).toHaveCount(0);
    });
  });

  test('/dashboard with Orbita: exactly the two latin Chakra Petch faces are loaded (500 and 600)', async ({ page }) => {
    await startWith(page, 'orbita', 'dark');
    await page.goto('/dashboard');
    await settle(page);
    await expect(page.locator(VERDICT)).toBeVisible();
    const faces = await chakraFaces(page);
    expect(faces.length, 'the @font-face rules are in the root CSS').toBeGreaterThan(2);
    const loaded = faces.filter((face) => face.status === 'loaded');
    expect(loaded.map((face) => face.weight).sort(), JSON.stringify(faces)).toEqual(['500', '600']);
    for (const face of loaded) expect(face.range, 'a latin face').toMatch(/^U\+0-FF,/);
    expect(faces.filter((face) => face.status !== 'loaded').every((face) => face.status === 'unloaded'), JSON.stringify(faces)).toBe(true);
  });

  test('away from Orbita: Aspetto → Default removes the costume without a reload, and the bar and the corners with it', async ({ page }) => {
    await startWith(page, 'orbita', 'dark');
    await page.goto('/dashboard/settings?tab=aspetto');
    await settle(page);
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-costume'))).toBe(true);
    await page.evaluate(() => {
      (window as unknown as { __noReload: boolean }).__noReload = true;
    });
    await page.getByRole('button', { name: /Colore 1 di 8: Default/ }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-costume'))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).not.toBe('orbita');
    // Still the same document (no reload), and the next page, reached by the sidebar, wears nothing.
    await page.getByRole('link', { name: 'Panoramica' }).first().click();
    await settle(page);
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
    await expect(page.locator(BAR)).toHaveCount(0);
    expect((await styleOf(page, '#page-main [data-tile]', ['background-image']))?.['background-image']).toBe('none');
  });
});

test.describe('the default theme loads no Chakra Petch', () => {
  test.beforeAll(async () => {
    await setAccountColorTheme('default');
  });

  test('/dashboard · default: every Chakra Petch face stays unloaded, no bar, the verdict stays Geist', async ({ page }) => {
    await startWith(page, 'default', 'dark');
    await page.goto('/dashboard');
    await settle(page);
    const faces = await chakraFaces(page);
    expect(faces.length, 'the @font-face rules are in the root CSS').toBeGreaterThan(0);
    expect(faces.every((face) => face.status === 'unloaded'), JSON.stringify(faces)).toBe(true);
    await expect(page.locator(BAR)).toHaveCount(0);
    expect((await styleOf(page, VERDICT, ['font-family']))?.['font-family']).not.toMatch(CHAKRA);
  });
});

test.describe('Orbita, signed out: the palette alone', () => {
  // Signed in, `/` and `/login` redirect to `/dashboard`.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of ['/', '/login']) {
    test(`${path} · dark: no emblem, 16px tiles on the plain page, headings in Geist, no Chakra Petch face loaded`, async ({ page }) => {
      await startWith(page, 'orbita', 'dark');
      await page.goto(path);
      await expect(page.locator('h1, h2, h3').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });

      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('orbita');
      expect(await page.locator('[data-costume-scope]').count()).toBe(0);
      // No emblem before the header label: nothing drawn right before an eyebrow.
      const emblems = await page.locator('.tile-eyebrow').evaluateAll((nodes) => nodes.filter((node) => node.previousElementSibling?.tagName.toLowerCase() === 'svg').length);
      expect(emblems).toBe(0);

      const tile = await styleOf(page, '[data-tile]', ['border-top-left-radius', 'background-image']);
      expect(tile?.['border-top-left-radius']).toBe('16px');
      expect(tile?.['background-image']).toBe('none');
      for (const selector of ['body', 'main']) {
        const ground = await styleOf(page, selector, ['background-image']);
        if (ground) expect(ground['background-image'], selector).toBe('none');
      }

      const families = await page.locator('h1, h2, h3').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fontFamily));
      expect(families.length).toBeGreaterThan(0);
      for (const family of families) expect(family).toMatch(GEIST_SANS);
      if (path === '/login') {
        // `unloaded`, not merely «not loaded»: an `error` status would mean the file was requested and failed.
        const faces = await chakraFaces(page);
        expect(faces.length, 'the @font-face rules are in the root CSS').toBeGreaterThan(0);
        expect(faces.every((face) => face.status === 'unloaded'), JSON.stringify(faces)).toBe(true);
      }
    });
  }
});
