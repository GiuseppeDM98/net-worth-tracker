/**
 * Analisi at 390px — the width DESIGN.md designs against first.
 *
 * Three things only a mobile viewport can prove: the tiles stack in the declared reading order
 * with nothing scrolling sideways, the Sankey's truncation is DECLARED (the chart drops small
 * slices for legibility — silent truncation was a recorded defect), and the row-to-Scheda flow
 * works under touch at the narrow layout.
 */

import { test, expect } from '@playwright/test';

const CURRENT_YEAR = new Date().getFullYear();

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard/analisi');
  await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible({ timeout: 30_000 });
});

test('stacks the tiles in the declared order with no horizontal overflow', async ({ page }) => {
  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll('main section[aria-label]'))
      .map((section) => ({ name: section.getAttribute('aria-label')!, top: section.getBoundingClientRect().top }))
      .filter((section) => ['Periodo', 'Fuori scala', 'Spese per categoria', 'Entrate per categoria', 'Spese maggiori', 'Flusso'].includes(section.name))
      .sort((a, b) => a.top - b.top)
      .map((section) => section.name),
  );
  expect(order).toEqual(['Periodo', 'Fuori scala', 'Spese per categoria', 'Entrate per categoria', 'Spese maggiori', 'Flusso']);

  // `main` is the horizontal scroll container (AGENTS.md): measure it and every element in it.
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const limit = main.getBoundingClientRect().left + main.clientWidth + 1;
    const culprits = Array.from(main.querySelectorAll('*')).filter((el) => el.getBoundingClientRect().right > limit).length;
    return { scroll: main.scrollWidth - main.clientWidth, culprits };
  });
  expect(overflow).toEqual({ scroll: 0, culprits: 0 });
});

test('declares the mobile Sankey truncation instead of dropping slices silently', async ({ page }) => {
  await expect(page.getByText(/mostra solo le voci principali/)).toBeVisible();
});

test('opens the Scheda from a category row under touch', async ({ page }) => {
  await page.getByRole('region', { name: 'Spese per categoria' }).getByRole('button', { name: /^Casa, / }).click();

  await expect(page.getByText(`Totale · ${CURRENT_YEAR}`)).toBeVisible();
  await expect(page.getByText(`Totale · ${CURRENT_YEAR}`).locator('..').getByText(/^380,00[\s ]*€$/)).toBeVisible();
  // The per-year table renders as a flat list readable at 390px.
  await expect(page.getByText('Per anno', { exact: true })).toBeVisible();
});
