/**
 * Cashflow › Tracciamento at 390px (and 360px) — the widths DESIGN.md designs against first.
 *
 * What only a phone viewport can prove: the Movimenti tile's toolbar — period picker, «Filtri»,
 * sort — fits with nothing scrolling sideways at 390 AND at 360 (a regression guard: measured
 * green with the picker's `min-w-0` override removed on 2026-09-07, so it pins the fit, not a
 * fix), and that picker is a SECOND HANDLE on the page's one period, not a second axis:
 * choosing a preset there moves the picker under the verdict too (PR #332, 2026-09-07).
 */

import { test, expect } from '@playwright/test';

const CURRENT_YEAR = String(new Date().getFullYear());

async function measureOverflow(page: import('@playwright/test').Page) {
  // `main` is the horizontal scroll container (AGENTS.md): measure it and every element in it.
  return page.evaluate(() => {
    const main = document.querySelector('main')!;
    const limit = main.getBoundingClientRect().left + main.clientWidth + 1;
    const culprits = Array.from(main.querySelectorAll('*'))
      .filter((el) => el.getBoundingClientRect().right > limit)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`);
    return { scroll: main.scrollWidth - main.clientWidth, culprits };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard/cashflow');
  await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Movimenti' })).toBeVisible();
});

test('the Movimenti toolbar fits at 390 and at 360 with no horizontal overflow', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Movimenti' }).getByRole('combobox', { name: /^Periodo dei movimenti:/ })).toBeVisible();
  expect(await measureOverflow(page)).toEqual({ scroll: 0, culprits: [] });

  await page.setViewportSize({ width: 360, height: 780 });
  await expect(page.getByRole('region', { name: 'Movimenti' }).getByRole('combobox', { name: /^Periodo dei movimenti:/ })).toBeVisible();
  expect(await measureOverflow(page)).toEqual({ scroll: 0, culprits: [] });
});

test('the picker inside the tile drives the page’s period — one axis, two handles', async ({ page }) => {
  const pagePicker = page.getByRole('combobox', { name: /^Periodo selezionato:/ });
  const tilePicker = page.getByRole('region', { name: 'Movimenti' }).getByRole('combobox', { name: /^Periodo dei movimenti:/ });
  const before = await pagePicker.getAttribute('aria-label');
  expect(before).not.toMatch(new RegExp(`: ${CURRENT_YEAR}$`)); // the default is the month, not the year

  await tilePicker.click();
  await page.getByRole('button', { name: "Quest'anno" }).click();

  await expect(tilePicker).toHaveAttribute('aria-label', `Periodo dei movimenti: ${CURRENT_YEAR}`);
  await expect(pagePicker).toHaveAttribute('aria-label', `Periodo selezionato: ${CURRENT_YEAR}`);
});
