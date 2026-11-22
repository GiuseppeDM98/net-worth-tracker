/**
 * The costume's first pass on a tablet (both `tablet` projects run this file, DESIGN.md → The Costume Rule, 2026-11-22):
 * at 1024×768 a target of the icon rail follows the costume's `--radius` (Egeo 5px, Orbita 0px); at 768×1024 the
 * Cashflow phone tab takes the chip radius (Egeo its 6px, Orbita 0px); nothing overflows at either.
 *
 * The account's `colorTheme` is written for the run and put back (`e2e/themeEgeo.ts`).
 *
 * Seen red on 2026-11-22 with `TabletRail` portalled to `<body>`, out of `CostumeScope`.
 */
import { expect, test } from '@playwright/test';
import { restoreColorTheme, settle, setAccountColorTheme, startWith } from './themeEgeo';
import { COSTUMES, cornerOf, expectNoHorizontalOverflow, type Costume } from './themeCostume';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const RAIL: Record<Costume, string> = { egeo: '5px', orbita: '0px' };
const TAB: Record<Costume, string> = { egeo: '6px', orbita: '0px' };

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
}
