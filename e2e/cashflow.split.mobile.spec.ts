/**
 * Cashflow › Divisione at 390 — what the phone layout must hold.
 *
 * The desktop spec owns the geometry of the two-column row and the honesty of the figures; here
 * the questions are the ones only a narrow, coarse-pointer viewport asks: does anything run off
 * the side, and can a thumb hit the tab's only control. The picker measured 190×36 on 2026-09-21,
 * eight pixels under the floor, with `pointer: coarse` confirmed live.
 *
 * Account and arithmetic: `scripts/seedSplitE2E.mts`.
 */

import { test, expect } from '@playwright/test';

/** The house floor for a touch target (PRODUCT.md → Accessibility & Inclusion). */
const TOUCH_FLOOR = 44;

test.describe('Cashflow › Divisione (phone)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/cashflow?tab=split');
    await expect(page.getByRole('heading', { name: 'In comune' })).toBeVisible({ timeout: 45_000 });
  });

  test('the period picker is a thumb-sized target', async ({ page }) => {
    // The branch under test only exists under a coarse pointer: prove it is the live one, or a
    // green here would say nothing about a phone.
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

    const picker = page.getByRole('combobox', { name: /Periodo selezionato/ });
    const box = await picker.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(TOUCH_FLOOR);
  });

  test('the month arrows inside the picker are thumb-sized too', async ({ page }) => {
    await page.getByRole('combobox', { name: /Periodo selezionato/ }).click();

    for (const name of ['Mese precedente', 'Mese successivo']) {
      const arrow = page.getByRole('button', { name, exact: true });
      await expect(arrow).toBeVisible();
      const box = await arrow.boundingBox();
      expect(box!.width, name).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      expect(box!.height, name).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    }
  });

  test('nothing runs off the side', async ({ page }) => {
    // `main` is the horizontal scroll container, not the document: a non-visible `overflow-y`
    // computes `overflow-x` to auto, so `document.scrollWidth` reads 0 while the page slides.
    const measured = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const rightEdge = main.getBoundingClientRect().left + main.clientWidth;
      const offenders = [...main.querySelectorAll('*')]
        // A visually hidden table is clipped to 1px but its cells keep their rectangles.
        .filter((el) => !el.closest('.sr-only'))
        .filter((el) => el.getBoundingClientRect().right > rightEdge + 0.5)
        .map((el) => el.className?.toString?.().slice(0, 60) ?? el.tagName);
      return { scrolls: main.scrollWidth !== main.clientWidth, offenders };
    });

    expect(measured.offenders).toEqual([]);
    expect(measured.scrolls).toBe(false);
  });

  test('the people stack, one above the other, full width', async ({ page }) => {
    const ghiandaia = await page.getByRole('region', { name: 'Quanto resta a Ghiandaia' }).boundingBox();
    const tarsio = await page.getByRole('region', { name: 'Quanto resta a Tarsio' }).boundingBox();

    expect(tarsio!.y).toBeGreaterThan(ghiandaia!.y + ghiandaia!.height - 2);
    expect(Math.abs(ghiandaia!.width - tarsio!.width)).toBeLessThan(2);
  });
});
