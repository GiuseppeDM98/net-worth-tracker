/**
 * Previdenza at 390px — the width DESIGN.md designs against first; composed since 2026-10-15
 * (since 2026-10-15; the rules in doc/guide/previdenza.md § Composizione mobile and DESIGN.md →
 * Small-Screen Composition).
 *
 * The desktop spec proves the grid switch happens; this one proves the phone's composition: the
 * verdict at 24px with the year axis INSIDE it, under the title; with ONE contributor measured
 * (the base fixture, `scripts/seedPensionE2E.mts`: Marco, RAL 35.000) no sentence under the title
 * but the strip of THREE causes — «Mercato da …», «Datore nel …», «Fisco nel …, circa» — and the
 * whole sentence behind «Il perché · le tre cause»; the hero at 44px, the rows closed in the DOM's
 * order; the ledger's delete targets at 44px once its row is open; no element wider than `main`.
 *
 * Seen red on 2026-10-15, one behaviour at a time: the selector returning two cells (the Fisco cell
 * dropped: the count); `leadLength` left `undefined` (the sentence visible under the title); the
 * axis left beside the verdict (outside its region).
 */

import { test, expect, type Page } from '@playwright/test';
import { atRest } from './atRest';

/** `Intl` puts a non-breaking space before the €; anchoring avoids a partial match too. */
const FUND_VALUE = /^29\.800,00[\s ]*€$/;
const ROW_IDS = ['prev-rendimento', 'prev-anno-fiscale', 'prev-versato', 'prev-versamenti'] as const;

const trigger = (page: Page, id: string) => page.locator(`#${id}-trigger`);
const verdictOf = (page: Page) => page.getByRole('region', { name: 'Verdetto sul fondo pensione' });

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard/pension');
  await expect(page.getByRole('region', { name: 'Il fondo oggi' }).getByText(FUND_VALUE)).toBeVisible({ timeout: 30_000 });
});

test('stacks THE tile and the closed rows in the DOM order, the axis inside the verdict, and steps the type down', async ({ page }) => {
  const rect = async (name: string | RegExp) => (await page.getByRole('region', { name, exact: true }).boundingBox())!;
  const verdict = await rect('Verdetto sul fondo pensione');
  const hero = await rect('Il fondo oggi');
  const rendimento = await rect('Rendimento del fondo');
  const annoFiscale = await rect(/^Anno fiscale 20[0-9][0-9]$/);
  const versato = await rect(/^Versato nel 20[0-9][0-9]$/);
  const versamenti = await rect(/^Versamenti 20[0-9][0-9]$/);

  // One column: each tile starts where the previous one ends, at the same x — the rows closed.
  expect(hero.y).toBeGreaterThan(verdict.y + verdict.height - 1);
  expect(rendimento.y).toBeGreaterThan(hero.y + hero.height - 1);
  expect(annoFiscale.y).toBeGreaterThan(rendimento.y + rendimento.height - 1);
  expect(versato.y).toBeGreaterThan(annoFiscale.y + annoFiscale.height - 1);
  expect(versamenti.y).toBeGreaterThan(versato.y + versato.height - 1);
  expect(Math.abs(rendimento.x - hero.x)).toBeLessThan(2);
  for (const id of ROW_IDS) await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'false');

  // The axis is in the verdict's section, between the title and the strip (DESIGN.md → Page Verdict);
  // one visible radiogroup (the desktop copy is mounted hidden).
  const axis = (await page.getByRole('radiogroup', { name: 'Anno fiscale' }).boundingBox())!;
  expect(axis.y).toBeGreaterThan(verdict.y);
  expect(axis.y + axis.height).toBeLessThan(verdict.y + verdict.height + 1);
  expect(axis.y).toBeLessThan(hero.y);

  const fontSize = async (locator: ReturnType<typeof page.getByText>) => locator.first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await fontSize(verdictOf(page).getByRole('heading'))).toBe(24);
  expect(await fontSize(page.getByRole('region', { name: 'Il fondo oggi' }).getByText(FUND_VALUE))).toBe(44);
});

test('with one contributor measured: title only, three causes in the strip, the sentence behind «Il perché»', async ({ page }) => {
  const verdict = verdictOf(page);
  const cells = page.getByRole('list', { name: 'Le cifre del verdetto' }).getByRole('button');
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(0)).toContainText(/^Mercato da [a-z]{3} \d{4}/);
  await expect(cells.nth(0)).toHaveAccessibleName(/, apre Rendimento$/);
  await expect(cells.nth(1)).toContainText(/^Datore nel \d{4}/);
  await expect(cells.nth(1)).toHaveAccessibleName(/, apre Versato$/);
  await expect(cells.nth(2)).toContainText(/^Fisco nel \d{4}, circa/);
  await expect(cells.nth(2)).toHaveAccessibleName(/, apre Anno fiscale$/);
  for (let i = 0; i < 3; i++) expect((await cells.nth(i).boundingBox())!.height, `cell ${i}`).toBeGreaterThanOrEqual(44);

  // Title only (one contributor; The Binding-Clause Rule): the sentence is in the DOM and hidden until «Il perché».
  const sentence = verdict.getByText(/Il fondo di Marco vale/);
  await expect(sentence).toBeHidden();
  const perche = verdict.getByRole('button', { name: /^Il perché/ });
  await expect(perche).toHaveText(/Il perché · le tre cause/);
  await perche.click();
  await expect(sentence).toBeVisible();
  await expect(verdict).toContainText(/il mercato ha reso [+−]\d+,\d\d% \(TWR\)/);

  // A cell opens its row and hands it the focus.
  await cells.nth(0).click();
  await expect(trigger(page, 'prev-rendimento')).toHaveAttribute('aria-expanded', 'true');
  await expect(trigger(page, 'prev-rendimento')).toBeFocused();
});

test('never lets the page scroll sideways, measured on the elements, rows open', async ({ page }) => {
  await page.getByRole('button', { name: 'Apri tutte' }).click();
  await atRest(page);
  // `main` is the horizontal scroll container of the shell; and a width total alone hides the
  // culprit, so every offender is named (AGENTS.md → Tailwind Breakpoints and Responsive Layout).
  const result = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const limit = main.getBoundingClientRect().left + main.clientWidth;
    const offenders: string[] = [];
    for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
      if (el.closest('.sr-only') || el.closest('.overflow-x-auto')) continue;
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

test('keeps the ledger rows and their delete targets at 44px, once the row is open', async ({ page }) => {
  // Below `desktop:` Versamenti is a closed row with an empty panel: it is opened before reading inside.
  await trigger(page, 'prev-versamenti').click();
  const versamenti = page.getByRole('region', { name: /^Versamenti 20[0-9][0-9]$/ });
  const deletes = versamenti.getByRole('button', { name: /^Elimina versamento/ }).filter({ visible: true });
  await expect(deletes).toHaveCount(3);
  const box = (await deletes.first().boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
});
