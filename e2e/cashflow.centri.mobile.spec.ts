/**
 * Cashflow › Centri di Costo at 390 — what only a phone shows.
 *
 * 1. The detail LANDS like a page. The row that opens it sits below the fold, and `main` —
 *    the dashboard's scroll container, not the document — kept its offset: the detail mounted
 *    530px down its own length, with the back link, the verdict and the actions out of sight
 *    (measured on the owner's data, 2026-09-18).
 * 2. Nothing the page prints leaves `main` sideways, and every control of the detail is a
 *    44px target — «Mostra altre» was 36.
 *
 * Runs on the Centri fixture account (`centri-mobile` project — scripts/seedCostCentersE2E.mts).
 */

import { test, expect } from '@playwright/test';

test.describe('Centri di Costo — mobile', () => {
  test.setTimeout(120_000);

  test('the detail opens at the top of the page, whatever the list was scrolled to', async ({ page }) => {
    await page.goto('/dashboard/cashflow?tab=cost-centers');
    await expect(page.getByRole('region', { name: 'Verdetto sui centri di costo' })).toBeVisible({ timeout: 60_000 });

    const row = page.getByRole('region', { name: 'Centri', exact: true }).getByRole('button', { name: /^Apri Fenicottero/ });
    await row.scrollIntoViewIfNeeded();
    // Positive anchor: the defect only exists when the list IS scrolled at the moment of the tap.
    expect(await page.evaluate(() => document.querySelector('main')!.scrollTop)).toBeGreaterThan(0);
    await row.click();

    await expect(page.getByRole('region', { name: 'Verdetto su Fenicottero' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.querySelector('main')!.scrollTop)).toBe(0);
    await expect(page.getByRole('button', { name: 'Centri di costo', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Elimina centro di costo', exact: true })).toBeInViewport();
  });

  test('the detail neither overflows main nor ships a target under 44px', async ({ page }) => {
    // Ornitorinco holds 27 rows: more than one page, so «Mostra altre» — the control that was
    // 36px — is on screen. Positive anchor first: without it the 44px check asserts nothing.
    await page.goto('/dashboard/cashflow?tab=cost-centers&center=e2e-cc-ornitorinco');
    const movimenti = page.getByRole('region', { name: 'Movimenti collegati' });
    await expect(movimenti).toBeVisible({ timeout: 60_000 });
    await expect(movimenti.getByRole('button', { name: /^Mostra altre/ })).toBeVisible();

    const report = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const edge = main.getBoundingClientRect().left + main.clientWidth;
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      };
      const name = (el: Element) => el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? el.tagName;
      return {
        overflowing: [...main.querySelectorAll('*')].filter(visible).filter((el) => el.getBoundingClientRect().right > edge + 1).map(name),
        // The detail's own controls: everything under the tab bar, which belongs to the Cashflow shell.
        small: [...main.querySelectorAll('[role="tabpanel"][data-state="active"] button')]
          .filter(visible)
          .map((el) => ({ name: name(el), h: Math.round(el.getBoundingClientRect().height) }))
          .filter((target) => target.h < 44),
      };
    });
    expect(report.overflowing).toEqual([]);
    expect(report.small).toEqual([]);
  });
});
