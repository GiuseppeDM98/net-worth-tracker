/**
 * Previdenza at 390px — the width DESIGN.md designs against first.
 *
 * The desktop spec proves the grid switch happens; this one proves the base layout it starts
 * from is intact: one column in the phone's order, the verdict at 24px, the hero at 44px, the year
 * axis UNDER the verdict, and no element wider than `main`.
 */

import { test, expect } from '@playwright/test';

/** `Intl` puts a non-breaking space before the €; anchoring avoids a partial match too. */
const FUND_VALUE = /^29\.800,00[\s ]*€$/;

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard/pension');
  await expect(page.getByRole('region', { name: 'Il fondo oggi' }).getByText(FUND_VALUE)).toBeVisible({ timeout: 30_000 });
});

test('stacks the tiles in the phone order and steps the type down', async ({ page }) => {
  const rect = async (name: string) => (await page.getByRole('region', { name, exact: true }).boundingBox())!;
  const verdict = await rect('Verdetto sul fondo pensione');
  const hero = await rect('Il fondo oggi');
  const rendimento = await rect('Rendimento del fondo');
  const annoFiscale = await rect('Anno fiscale');
  const versato = await rect('Versato per natura');
  const versamenti = await rect('Versamenti');

  // One column: each tile starts where the previous one ends, at the same x.
  expect(hero.y).toBeGreaterThan(verdict.y + verdict.height - 1);
  expect(rendimento.y).toBeGreaterThan(hero.y + hero.height - 1);
  expect(annoFiscale.y).toBeGreaterThan(rendimento.y + rendimento.height - 1);
  expect(versato.y).toBeGreaterThan(annoFiscale.y + annoFiscale.height - 1);
  expect(versamenti.y).toBeGreaterThan(versato.y + versato.height - 1);
  expect(Math.abs(rendimento.x - hero.x)).toBeLessThan(2);

  // The axis moves under the verdict below `desktop:`.
  const axis = (await page.getByRole('tablist', { name: 'Anno fiscale' }).boundingBox())!;
  expect(axis.y).toBeGreaterThan(verdict.y + verdict.height - 1);
  expect(axis.y).toBeLessThan(hero.y);

  const fontSize = async (locator: ReturnType<typeof page.getByText>) => locator.first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await fontSize(page.getByRole('region', { name: 'Verdetto sul fondo pensione' }).getByRole('heading'))).toBe(24);
  expect(await fontSize(page.getByRole('region', { name: 'Il fondo oggi' }).getByText(FUND_VALUE))).toBe(44);
});

test('never lets the page scroll sideways, measured on the elements', async ({ page }) => {
  // `main` is the horizontal scroll container of the shell; and a width total alone hides the
  // culprit, so every offender is named (AGENTS.md → Tailwind Breakpoints and Responsive Layout).
  const result = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const limit = main.getBoundingClientRect().left + main.clientWidth;
    const offenders: string[] = [];
    for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > limit + 1) {
        offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(rect.right)}`);
      }
      if (offenders.length > 10) break;
    }
    return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, offenders };
  });

  expect(result.offenders).toEqual([]);
  expect(result.scrollWidth).toBe(result.clientWidth);
});

test('keeps the ledger rows and their delete targets at 44px', async ({ page }) => {
  const versamenti = page.getByRole('region', { name: 'Versamenti', exact: true });
  const deletes = versamenti.getByRole('button', { name: /^Elimina versamento/ }).filter({ visible: true });
  await expect(deletes).toHaveCount(3);
  const box = (await deletes.first().boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
});
