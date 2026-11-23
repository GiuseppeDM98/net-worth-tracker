/**
 * The costume's first pass at 1440 (DESIGN.md → The Costume Rule, doc/guide/temi.md § Il costume, 2026-11-22): what
 * floats out of the shell's DOM wears the costume (a portalled menu, a select, a popover carry `data-costume-scope`),
 * the controls take the costume's radii (Orbita squares its pills and chips, Egeo keeps them round), the sidebar's
 * labels and the wordmark wear the heading face, and each page draws its emblem — Egeo a temple on the Panoramica,
 * an amphora on Patrimonio, two waves on Cashflow; Orbita its planet on all three. Signed out, `/` and `/login`
 * carry no scope at all.
 *
 * The account's `colorTheme` is written for the run and put back (`e2e/themeEgeo.ts`). A pill's radius reads
 * `3.35544e+07px` (`calc(infinity * 1px)`), so a round one is asserted «> 1000».
 *
 * Seen red on 2026-11-22 with the spread dropped from `select.tsx`.
 *
 * The dialogs and the pages beyond the first three (2026-11-23): «Nuova Spesa» is a tile lifted off the page —
 * the tile's corner, its cap or marks, the default run's Float shadow, the title in the costume face, the
 * eyebrow's figures in the mono; Storico and FIRE draw their own Egeo emblem (a Hall of Fame bar, on the account
 * that has records: `theme.costume.hof.spec.ts`); the Compravendita's and the Consulente's scenes are tiles with a costume headline (the Consulente on a
 * PLANTED document, put back in `afterAll`: nothing is asked of a model); the book printed in Egeo is the
 * palette's; the drawdown's red is the token, through a mode switch and a theme change with no reload.
 */
import { expect, test } from '@playwright/test';
import { restoreColorTheme, settle, setAccountColorTheme, startWith, styleOf } from './themeEgeo';
import {
  AMPHORA,
  COSTUMES,
  COSTUME_FACE,
  FLAME,
  MEANDER,
  MODES,
  MONO_FACE,
  SCROLL,
  TEMPLE,
  WAVES,
  computedOf,
  cornerOf,
  desktopEmblem,
  isRoundPill,
  tokenColorIn,
  type Costume,
} from './themeCostume';
import { openReport, plant, rememberHeld, restoreHeld } from './consulenteReport';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const AXIS_PILL = 'main [role="radiogroup"][aria-label="Periodo del grafico"]';
const AXIS_INDICATOR = `${AXIS_PILL} [role="radio"][aria-checked="true"] > span:first-child`;
const PATRIMONIO_CHIP = 'main section[aria-label="Patrimonio"] span.inline-flex.whitespace-nowrap';
const MENU = '[data-slot="dropdown-menu-content"]';
const POPOVER = '[data-radix-popper-content-wrapper] > [role="listbox"][aria-label="Available options"]';
const SELECT = '[data-slot="select-content"]';

/** Criterion 2's radii, light and dark alike (the scope blocks declare them once). */
const RADII: Record<Costume, { menu: string; chip: string; frame: string }> = {
  egeo: { menu: '3px', chip: '9px', frame: '4px' },
  orbita: { menu: '0px', chip: '0px', frame: '0px' },
};

const EMBLEM: Record<Costume, Record<string, string | 'planet'>> = {
  egeo: { panoramica: TEMPLE, patrimonio: AMPHORA, cashflow: WAVES },
  orbita: { panoramica: 'planet', patrimonio: 'planet', cashflow: 'planet' },
};

async function expectEmblem(page: import('@playwright/test').Page, costume: Costume, route: 'panoramica' | 'patrimonio' | 'cashflow') {
  const emblem = await desktopEmblem(page);
  const expected = EMBLEM[costume][route];
  if (expected === 'planet') expect(emblem.circles, `${route}: the planet`).toBe(1);
  else expect(emblem.paths, `${route}: the ${costume} art`).toEqual([expected]);
}

test.afterAll(restoreColorTheme);

for (const costume of COSTUMES) {
  test.describe(`${costume}, signed in`, () => {
    test.beforeAll(async () => {
      await setAccountColorTheme(costume);
    });

    for (const mode of MODES) {
      test(`/dashboard · ${mode}: the menu, the axis, the chip, the sidebar's labels, the wordmark, the emblem`, async ({ page }) => {
        await startWith(page, costume, mode);
        await page.goto('/dashboard');
        await settle(page);

        const axis = await cornerOf(page, AXIS_PILL);
        const indicator = await cornerOf(page, AXIS_INDICATOR);
        if (costume === 'orbita') {
          expect([axis, indicator]).toEqual(['0px', '0px']);
        } else {
          expect(isRoundPill(axis ?? undefined), `axis ${axis}`).toBe(true);
          expect(isRoundPill(indicator ?? undefined), `indicator ${indicator}`).toBe(true);
        }
        expect(await cornerOf(page, PATRIMONIO_CHIP)).toBe(RADII[costume].chip);

        // The sidebar's «Analisi» label: the costume face, and the very colour of a tile's eyebrow.
        const label = await styleOf(page, '[data-sidebar="group-label"]', ['font-family', 'color']);
        const eyebrow = await styleOf(page, '#page-main [data-tile] .tile-eyebrow', ['color']);
        expect(label?.['font-family']).toMatch(COSTUME_FACE[costume]);
        expect(label?.color).toBe(eyebrow?.color);

        const wordmark = await styleOf(page, '[data-sidebar="header"] .costume-wordmark', ['font-family', 'text-transform']);
        expect(wordmark?.['font-family']).toMatch(COSTUME_FACE[costume]);
        expect(wordmark?.['text-transform']).toBe(costume === 'orbita' ? 'uppercase' : 'none');

        await expectEmblem(page, costume, 'panoramica');

        await page.locator('[data-sidebar="footer"] [aria-haspopup="menu"]').click();
        const menu = page.locator(MENU);
        await expect(menu).toBeVisible();
        expect(await menu.evaluate((node) => node.hasAttribute('data-costume-scope'))).toBe(true);
        expect(await cornerOf(page, MENU)).toBe(RADII[costume].menu);
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
      });

      test(`/dashboard/assets · ${mode}: the page's emblem`, async ({ page }) => {
        await startWith(page, costume, mode);
        await page.goto('/dashboard/assets');
        await settle(page);
        await expectEmblem(page, costume, 'patrimonio');
      });

      test(`/dashboard/cashflow?tab=tracking · ${mode}: the emblem, the category popover and a select, in scope`, async ({ page }) => {
        await startWith(page, costume, mode);
        await page.goto('/dashboard/cashflow?tab=tracking');
        await settle(page);
        await expectEmblem(page, costume, 'cashflow');

        // The category filter: `MultiSelect` → `PopoverContent`, the frame radius.
        await page.locator('#page-main').getByRole('combobox').filter({ hasText: 'Tutte le categorie' }).first().click();
        const popover = page.locator(POPOVER);
        await expect(popover).toBeVisible();
        expect(await popover.evaluate((node) => node.hasAttribute('data-costume-scope'))).toBe(true);
        expect(await cornerOf(page, POPOVER)).toBe(RADII[costume].frame);
        await page.keyboard.press('Escape');
        await expect(popover).toBeHidden();

        // A Radix `Select`: the sort of the movements.
        await page.locator('#page-main [data-slot="select-trigger"]').first().click();
        const select = page.locator(SELECT);
        await expect(select).toBeVisible();
        expect(await select.evaluate((node) => node.hasAttribute('data-costume-scope'))).toBe(true);
        await page.keyboard.press('Escape');
        await expect(select).toBeHidden();
      });
    }
  });
}

// ─── The dialogs and the pages beyond the first three (2026-11-23) ───────────────────────────

const MODAL = '[data-slot="dialog-content"]';
/** Egeo's cap is one gradient, Orbita's console marks four: the tile's image layers, on a modal or a scene card. */
const FRAME_RADIUS: Record<Costume, string> = { egeo: '4px', orbita: '0px' };
/** The scene headline at 1440: the costume's own size. */
const HEADLINE_SIZE: Record<Costume, string> = { egeo: '34px', orbita: '28px' };

/** The Float shadow of the default run: a costume must leave it exactly as it is. */
let floatShadow: string | null = null;

test.describe('a modal is a tile lifted off the page', () => {
  for (const theme of ['default', ...COSTUMES] as const) {
    test(`«Nuova Spesa» · ${theme} · light: the corner, the cap or marks, the Float shadow, the title's face, the eyebrow's figures`, async ({ page }) => {
      await setAccountColorTheme(theme);
      await startWith(page, theme, 'light');
      await page.goto('/dashboard/cashflow?tab=tracking');
      await settle(page);
      await page.getByRole('button', { name: 'Nuova Spesa', exact: true }).click();
      const dialog = page.locator(MODAL);
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(400);

      // One frame per open modal, and never a tile: `data-tile` would trade the Float for the tile's shadow.
      expect(await page.locator('[data-costume-frame]').count()).toBe(1);
      expect(await dialog.evaluate((node) => node.hasAttribute('data-tile'))).toBe(false);

      const surface = await styleOf(page, MODAL, ['border-top-left-radius', 'background-image', 'box-shadow']);
      const title = await styleOf(page, `${MODAL} [data-slot="dialog-title"]`, ['font-family', 'text-transform', 'font-size']);
      // The type picker's eyebrow: «Nuova voce · Passo 1 di 2».
      const figures = page.locator(`${MODAL} p.tile-eyebrow .costume-figure`);
      await expect(figures).toHaveText(['1', '2']);
      const figure = await styleOf(page, `${MODAL} p.tile-eyebrow .costume-figure`, ['font-family']);

      expect(surface?.['box-shadow']).toContain('24px');
      expect(title?.['font-size']).toBe('20px');
      if (theme === 'default') {
        floatShadow = surface?.['box-shadow'] ?? null;
        expect(surface?.['border-top-left-radius']).toBe('16px');
        expect(surface?.['background-image']).toBe('none');
        expect(title?.['font-family']).toMatch(/^"?Geist(?! Mono)/);
      } else {
        expect(surface?.['border-top-left-radius']).toBe(FRAME_RADIUS[theme]);
        expect(surface?.['background-image']).toContain('linear-gradient');
        if (floatShadow !== null) expect(surface?.['box-shadow']).toBe(floatShadow);
        expect(title?.['font-family']).toMatch(COSTUME_FACE[theme]);
        expect(title?.['text-transform']).toBe(theme === 'orbita' ? 'uppercase' : 'none');
        expect(figure?.['font-family']).toMatch(MONO_FACE);
      }

      await dialog.getByRole('button', { name: 'Annulla' }).first().click();
      await expect(dialog).toBeHidden();
    });
  }
});

for (const costume of COSTUMES) {
  test.describe(`${costume}: the pages beyond the first three`, () => {
    test.beforeAll(async () => {
      await setAccountColorTheme(costume);
    });

    test('Storico and FIRE draw their own emblem', async ({ page }) => {
      await startWith(page, costume, 'light');
      for (const [path, art] of [['/dashboard/history', SCROLL], ['/dashboard/fire-simulations', FLAME]] as const) {
        await page.goto(path);
        await settle(page);
        const emblem = await desktopEmblem(page);
        if (costume === 'orbita') expect(emblem.circles, `${path}: the planet`).toBe(1);
        else expect(emblem.paths, `${path}: its own art`).toEqual([art]);
      }
    });

    test('Compravendita: the first screen is a tile, its headline the costume face, the eyebrow’s figures the mono', async ({ page }) => {
      await startWith(page, costume, 'light');
      await page.goto('/dashboard/assets/compravendita', { waitUntil: 'load' });
      const scene = page.getByRole('region', { name: /^Passo 1 di \d+: / });
      await expect(scene).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(600);

      const card = await scene.evaluate((node) => {
        const style = getComputedStyle(node);
        const headline = node.querySelector('h2 + p');
        const figures = [...node.querySelectorAll('h2 .costume-figure')];
        return {
          tile: node.hasAttribute('data-tile'),
          radius: style.borderTopLeftRadius,
          image: style.backgroundImage,
          headlineFace: headline ? getComputedStyle(headline).fontFamily : null,
          headlineSize: headline ? getComputedStyle(headline).fontSize : null,
          figures: figures.map((figure) => getComputedStyle(figure).fontFamily),
        };
      });
      expect(card.tile).toBe(true);
      expect(card.radius).toBe(FRAME_RADIUS[costume]);
      expect(card.image).toContain('linear-gradient');
      expect(card.headlineFace).toMatch(COSTUME_FACE[costume]);
      expect(card.headlineSize).toBe(HEADLINE_SIZE[costume]);
      expect(card.figures).toHaveLength(2);
      for (const face of card.figures) expect(face).toMatch(MONO_FACE);
      await expectEmblemArt(page, costume, AMPHORA);
    });
  });
}

/** The page header's desktop emblem: the page's Egeo art, Orbita's planet. */
async function expectEmblemArt(page: import('@playwright/test').Page, costume: Costume, art: string) {
  const emblem = await desktopEmblem(page);
  if (costume === 'orbita') expect(emblem.circles).toBe(1);
  else expect(emblem.paths).toEqual([art]);
}

test.describe('the Consulente on a planted document', () => {
  test.beforeAll(async () => {
    await rememberHeld();
    await plant('ready');
  });
  test.afterAll(restoreHeld);

  for (const costume of COSTUMES) {
    test(`${costume}: the path's scene is a tile, its headline the costume face, the scenarios' box a frame`, async ({ page }) => {
      await setAccountColorTheme(costume);
      await startWith(page, costume, 'light');
      // Over a finished report the screens open with `?rivedi=1`: nothing is asked of a model.
      await page.goto('/dashboard/allocation/consulente?rivedi=1', { waitUntil: 'load' });
      const scene = page.getByRole('region', { name: /^Passo 1 di 8: / });
      await expect(scene).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(600);
      await expectEmblemArt(page, costume, MEANDER);

      const card = await scene.evaluate((node) => {
        const style = getComputedStyle(node);
        const headline = node.querySelector('p.costume-heading');
        return {
          tile: node.hasAttribute('data-tile'),
          radius: style.borderTopLeftRadius,
          image: style.backgroundImage,
          headlineFace: headline ? getComputedStyle(headline).fontFamily : null,
          headlineSize: headline ? getComputedStyle(headline).fontSize : null,
          figures: [...node.querySelectorAll('h2 .costume-figure')].map((figure) => `${figure.textContent}:${getComputedStyle(figure).fontFamily}`),
        };
      });
      expect(card.tile).toBe(true);
      expect(card.radius).toBe(FRAME_RADIUS[costume]);
      expect(card.image).toContain('linear-gradient');
      expect(card.headlineFace).toMatch(COSTUME_FACE[costume]);
      expect(card.headlineSize).toBe(HEADLINE_SIZE[costume]);
      expect(card.figures.map((figure) => figure.split(':')[0])).toEqual(['1', '8']);
      for (const figure of card.figures) expect(figure.split(':')[1]).toMatch(MONO_FACE);

      // Step 2, the tolerance: the loss scenarios sit in a box inside the tile — a frame.
      await page.locator('#consulente-age').fill('35');
      await page.locator('#consulente-horizon').fill('20');
      await page.getByRole('button', { name: 'Avanti' }).click();
      const scenarios = page.getByRole('list', { name: 'Scenari di perdita sulla tua base' });
      await expect(scenarios).toBeVisible();
      expect(await scenarios.evaluate((node) => getComputedStyle(node).borderTopLeftRadius)).toBe(FRAME_RADIUS[costume]);
    });
  }

  test('egeo: the book on paper is the palette’s — Geist headings, no band, no emblem', async ({ page }) => {
    await setAccountColorTheme('egeo');
    await startWith(page, 'egeo', 'light');
    await openReport(page);
    await page.waitForTimeout(600);
    // On screen the costume is on: the band has its height and the header draws the meander.
    expect(await computedOf(page, '.costume-header-band', 'height')).toBe('7px');
    await expectEmblemArt(page, 'egeo', MEANDER);

    await page.emulateMedia({ media: 'print' });
    const heading = await computedOf(page, '[data-book-print] h2', 'font-family');
    expect(heading).toMatch(/^"?Geist(?! Mono)/);
    expect(await computedOf(page, '.costume-header-band', 'height')).toBe('0px');
    expect(await computedOf(page, '#page-main svg[aria-hidden="true"][width="22"]', 'display')).toBe('none');
    await page.emulateMedia({ media: 'screen' });
  });
});

test.describe('the drawdown’s red is the token', () => {
  const STOP = '#page-main linearGradient stop';

  test('egeo: var(--destructive) from the first frame, through a mode switch and back to the default theme, with no reload', async ({ page }) => {
    await setAccountColorTheme('egeo');
    await startWith(page, 'egeo', 'light');
    await page.goto('/dashboard/performance');
    await settle(page);
    await page.getByRole('button', { name: /^Dettaglio/ }).click();
    const stop = page.locator(STOP).first();
    await expect(stop).toHaveAttribute('stop-color', 'var(--destructive)', { timeout: 30_000 });

    const red = () => tokenColorIn(page, '#page-main', '--destructive');
    const painted = () => computedOf(page, STOP, 'stop-color');
    const light = await red();
    expect(await painted()).toBe(light);

    // Dark from the account menu, in place.
    await page.locator('[data-sidebar="footer"] [aria-haspopup="menu"]').click();
    await page.locator('[data-slot="dropdown-menu-content"]').getByTitle('Scuro').click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const dark = await red();
    expect(dark).not.toBe(light);
    expect(await painted()).toBe(dark);

    // Egeo → Default from Impostazioni › Aspetto, then back by the sidebar: client navigations only.
    await page.locator('[data-sidebar="footer"] [aria-haspopup="menu"]').click();
    await page.locator('[data-slot="dropdown-menu-content"]').getByRole('menuitem', { name: 'Impostazioni' }).click();
    await page.waitForURL(/\/dashboard\/settings/);
    await page.getByRole('tab', { name: 'Aspetto' }).filter({ visible: true }).first().click();
    await page.getByRole('button', { name: /^Colore \d+ di \d+: Default$/ }).click();
    // The default theme is the absence of the attribute.
    await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-theme'))).toBe(false);
    await page.locator('[data-sidebar="sidebar"]').getByRole('link', { name: 'Rendimenti' }).click();
    await page.waitForURL(/\/dashboard\/performance/);
    await settle(page);
    await page.getByRole('button', { name: /^Dettaglio/ }).click();
    await expect(page.locator(STOP).first()).toHaveAttribute('stop-color', 'var(--destructive)', { timeout: 30_000 });
    expect(await painted()).toBe(await red());
  });
});

test.describe('signed out: no scope on / and /login', () => {
  // Signed in, `/` and `/login` redirect to `/dashboard`.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const costume of COSTUMES) {
    for (const path of ['/', '/login']) {
      test(`${path} · ${costume}: no [data-costume-scope]`, async ({ page }) => {
        await startWith(page, costume, 'light');
        await page.goto(path);
        await expect(page.locator('h1, h2, h3').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
        expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(costume);
        expect(await page.locator('[data-costume-scope]').count()).toBe(0);
      });
    }
  }
});
