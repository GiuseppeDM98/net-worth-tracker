/**
 * The costume's first pass at 390 (DESIGN.md → The Costume Rule, doc/guide/temi.md § Il costume, 2026-11-22): the
 * bottom pill's inactive labels on `--muted-foreground`, the pill and the «+» square under Orbita, the «Altro»
 * section label in the costume face, the account menu opened from «Altro» — a popper sheet below 769px — in scope
 * with the frame radius on its top corners, the period picker's drawer in scope with its preset chips square under
 * Orbita, nothing overflowing; and a phone turned sideways (844×390, no project has that size): the top bar's
 * wordmark and the sheet sidebar's labels wear the costume.
 *
 * The account's `colorTheme` is written for the run and put back (`e2e/themeEgeo.ts`).
 *
 * Seen red on 2026-11-22 with the spread dropped from `drawer.tsx` (the period picker) and from `sheet.tsx` (the
 * sheet sidebar); the chip case on the same day, at the retirement, with `chip.tsx` back to `rounded-full`; the
 * «Nuova Spesa» drawer (2026-11-23) with `drawer.tsx` back to its literal 10px corner.
 */
import { expect, test } from '@playwright/test';
import { restoreColorTheme, settle, setAccountColorTheme, startWith, styleOf } from './themeEgeo';
import { COSTUMES, COSTUME_FACE, MODES, cornerOf, expectNoHorizontalOverflow, isRoundPill, tokenColorIn, type Costume } from './themeCostume';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const PILL = 'nav[data-nav="pill"]';
const MENU = '[data-slot="dropdown-menu-content"]';
const FRAME: Record<Costume, string> = { egeo: '4px', orbita: '0px' };

test.afterAll(restoreColorTheme);

// 2026-11-23: at 390 «Nuova Spesa» is a drawer, opened by the pill's «+»: the costume's frame radius on its top
// corners (10px in a palette theme), the tile's cap or marks, the title in the costume face. Closed unsent.
const DRAWER = '[data-slot="drawer-content"]';
const DRAWER_RADIUS = { default: '10px', egeo: '4px', orbita: '0px' } as const;

for (const theme of ['default', ...COSTUMES] as const) {
  test(`«Nuova Spesa» at 390 · ${theme}: the drawer's corner, its frame and its title`, async ({ page }) => {
    await setAccountColorTheme(theme);
    await startWith(page, theme, 'light');
    await page.goto('/dashboard/cashflow?tab=tracking');
    await settle(page);
    await page.getByRole('button', { name: 'Aggiungi nuova voce' }).click();
    const drawer = page.locator(DRAWER);
    await expect(drawer).toBeVisible();
    await page.waitForTimeout(800);

    const surface = await styleOf(page, DRAWER, ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'background-image']);
    expect([surface?.['border-top-left-radius'], surface?.['border-top-right-radius']]).toEqual([DRAWER_RADIUS[theme], DRAWER_RADIUS[theme]]);
    expect(surface?.['border-bottom-left-radius']).toBe('0px');
    expect(await page.locator('[data-costume-frame]').count()).toBe(1);
    const title = await styleOf(page, `${DRAWER} [data-slot="drawer-title"]`, ['font-family']);
    if (theme === 'default') {
      expect(surface?.['background-image']).toBe('none');
      expect(title?.['font-family']).toMatch(/^"?Geist(?! Mono)/);
    } else {
      expect(surface?.['background-image']).toContain('linear-gradient');
      expect(title?.['font-family']).toMatch(COSTUME_FACE[theme]);
    }
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });
}

for (const costume of COSTUMES) {
  test.describe(`${costume}, signed in`, () => {
    test.beforeAll(async () => {
      await setAccountColorTheme(costume);
    });

    for (const mode of MODES) {
      test(`/dashboard/cashflow?tab=tracking · ${mode}: the pill, the «+», «Altro», its account menu, the period picker`, async ({ page }) => {
        await startWith(page, costume, mode);
        await page.goto('/dashboard/cashflow?tab=tracking');
        await settle(page);

        // An inactive label: the muted token, read where the pill paints it.
        const quiet = await styleOf(page, `${PILL} a:not([aria-current])`, ['color']);
        expect(quiet?.color).toBe(await tokenColorIn(page, PILL, '--muted-foreground'));

        const pill = await cornerOf(page, PILL);
        const plus = await cornerOf(page, 'button[aria-label="Aggiungi nuova voce"]');
        if (costume === 'orbita') expect([pill, plus]).toEqual(['0px', '0px']);
        else expect([isRoundPill(pill ?? undefined), isRoundPill(plus ?? undefined)], `${pill} · ${plus}`).toEqual([true, true]);

        // The period picker opens a vaul Drawer, portalled: in scope.
        await page.locator('#page-main').getByRole('combobox', { name: /^Periodo selezionato/ }).first().click();
        const drawer = page.locator('[data-slot="drawer-content"]', { hasText: 'Seleziona periodo' });
        await expect(drawer).toBeVisible();
        expect(await drawer.evaluate((node) => node.hasAttribute('data-costume-scope'))).toBe(true);
        // Its preset chips (`chip.tsx`) are pills: square under Orbita, round in Egeo.
        const chip = await cornerOf(page, '[data-slot="drawer-content"] button[aria-pressed]');
        if (costume === 'orbita') expect(chip).toBe('0px');
        else expect(isRoundPill(chip ?? undefined), `${chip}`).toBe(true);
        await page.keyboard.press('Escape');
        await expect(drawer).toBeHidden();

        // «Altro»: its section label in the costume face, then its account menu.
        await page.locator(PILL).getByRole('button', { name: 'Altro' }).click();
        const panel = page.getByRole('dialog', { name: 'Menu secondario' });
        await expect(panel).toBeVisible();
        const section = await styleOf(page, '[aria-label="Menu secondario"] p.tile-eyebrow', ['font-family']);
        expect(section?.['font-family']).toMatch(COSTUME_FACE[costume]);

        await panel.locator('[aria-haspopup="menu"]').click();
        const menu = page.locator(MENU);
        await expect(menu).toBeVisible();
        expect(await menu.evaluate((node) => [node.hasAttribute('data-popper-sheet'), node.hasAttribute('data-costume-scope')])).toEqual([true, true]);
        expect(await cornerOf(page, MENU)).toBe(FRAME[costume]);
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();

        await expectNoHorizontalOverflow(page);
      });
    }

    test(`/dashboard at 844×390: the top bar's wordmark and the sheet sidebar wear the costume`, async ({ page }) => {
      await page.setViewportSize({ width: 844, height: 390 });
      await startWith(page, costume, 'light');
      await page.goto('/dashboard');
      await settle(page);

      const wordmark = await styleOf(page, 'main .costume-wordmark, [data-slot="sidebar-inset"] .costume-wordmark', ['font-family', 'text-transform']);
      if (costume === 'egeo') expect(wordmark?.['font-family']).toMatch(COSTUME_FACE.egeo);
      else expect(wordmark?.['text-transform']).toBe('uppercase');

      await page.getByRole('button', { name: 'Apri il menu' }).click();
      const sheet = page.locator('[data-sidebar="sidebar"][data-mobile="true"]');
      await expect(sheet).toBeVisible();
      expect(await sheet.evaluate((node) => node.hasAttribute('data-costume-scope'))).toBe(true);
      const label = await styleOf(page, '[data-sidebar="sidebar"][data-mobile="true"] [data-sidebar="group-label"]', ['font-family', 'color']);
      expect(label?.['font-family']).toMatch(COSTUME_FACE[costume]);
      expect(label?.color).toBe(await tokenColorIn(page, '[data-sidebar="sidebar"][data-mobile="true"]', '--costume-eyebrow-color'));
      await expectNoHorizontalOverflow(page);
    });
  });
}
