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
 */
import { expect, test } from '@playwright/test';
import { restoreColorTheme, settle, setAccountColorTheme, startWith, styleOf } from './themeEgeo';
import { AMPHORA, COSTUMES, COSTUME_FACE, MODES, TEMPLE, WAVES, cornerOf, desktopEmblem, isRoundPill, type Costume } from './themeCostume';

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
