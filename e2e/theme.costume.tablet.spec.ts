/**
 * The costume's first pass on a tablet (both `tablet` projects run this file, DESIGN.md → The Costume Rule, 2026-11-22):
 * at 1024×768 a target of the icon rail follows the costume's `--radius` (Egeo 5px, Orbita 0px); at 768×1024 the
 * Cashflow phone tab takes the chip radius (Egeo its 6px, Orbita 0px); nothing overflows at either.
 *
 * The account's `colorTheme` is written for the run and put back (`e2e/themeEgeo.ts`).
 *
 * Seen red on 2026-11-22 with `TabletRail` portalled to `<body>`, out of `CostumeScope`. The modal case
 * (2026-11-23): in landscape with `data-costume-frame` dropped from `dialog.tsx`, in portrait with `drawer.tsx`
 * back to its literal 10px corner.
 */
import { expect, test } from '@playwright/test';
import { restoreColorTheme, settle, setAccountColorTheme, startWith } from './themeEgeo';
import { COSTUMES, cornerOf, expectNoHorizontalOverflow, type Costume } from './themeCostume';
import { atRest } from './atRest';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const RAIL: Record<Costume, string> = { egeo: '5px', orbita: '0px' };
const TAB: Record<Costume, string> = { egeo: '6px', orbita: '0px' };
const FRAME: Record<Costume, string> = { egeo: '4px', orbita: '0px' };

test.afterAll(restoreColorTheme);

for (const costume of COSTUMES) {
  test(`${costume}: the rail's target in landscape, the Cashflow tab in portrait, no overflow`, async ({ page }) => {
    await setAccountColorTheme(costume);
    await startWith(page, costume, 'light');
    await page.goto('/dashboard/cashflow?tab=tracking');
    await settle(page);

    const { width } = page.viewportSize()!;
    if (width > 900) {
      expect(await cornerOf(page, 'nav[data-nav="rail"] a')).toBe(RAIL[costume]);
    } else {
      expect(await cornerOf(page, 'main [role="tablist"][class*="desktop:hidden"] > [role="tab"]')).toBe(TAB[costume]);
    }
    await expectNoHorizontalOverflow(page);
  });

  // 2026-11-23: the same form is a dialog at 1024×768 and a drawer at 768×1024 (`ResponsiveModal` turns at 769px),
  // either way a tile lifted off the page. No control opens it in landscape (the rail has no «+»), so the spec
  // dispatches the event the page's own controls dispatch. Closed unsent.
  test(`${costume}: «Nuova Spesa» wears the frame — a dialog in landscape, a drawer in portrait`, async ({ page }) => {
    await setAccountColorTheme(costume);
    await startWith(page, costume, 'light');
    await page.goto('/dashboard/cashflow?tab=tracking');
    await settle(page);

    const { width } = page.viewportSize()!;
    const slot = width > 900 ? 'dialog-content' : 'drawer-content';
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('cashflow:add-expense')));
    const modal = page.locator(`[data-slot="${slot}"]`);
    await expect(modal).toBeVisible();
    await atRest(page);

    const style = await modal.evaluate((node) => {
      const computed = getComputedStyle(node);
      return { frame: node.hasAttribute('data-costume-frame'), radius: computed.borderTopLeftRadius, image: computed.backgroundImage };
    });
    expect(style.frame).toBe(true);
    expect(style.radius).toBe(FRAME[costume]);
    expect(style.image).toContain('linear-gradient');
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });
}
