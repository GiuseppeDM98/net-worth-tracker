/**
 * The Panoramica at 1440 after the phone composition (2026-10-11): the page of before,
 * plus three declared additions — the year's euro in brackets after its percentage, the calendar
 * as a caption under the figures that contain it, a zero printed without a sign — and the
 * `order-*` utilities gone. No row trigger in the grid, the strip and «Il resto della pagina» not
 * shown, no «Il perché», the chips and the «Mercato:» digest in THE tile, the sentence whole in
 * ONE `<p>`. The overview response is patched on the wire (`e2e/overviewFixture.ts`), nothing is
 * written.
 *
 * Seen red on 2026-10-11 with `useCompactLayout` answering `true` at every width (seven triggers
 * in the grid, the strip visible, the sentence in a `div`) and with the caption gated on
 * `sections.compact` (no «già in calendario» at 1440).
 */

import { test, expect } from '@playwright/test';
import { BASE_EXPENSE_STATS, openOverview, patchOverview } from './overviewFixture';

test('is the page of every width at 1440: no rows, no strip, the chips and the digest, one paragraph with the calendar under the figures', async ({ page }) => {
  await patchOverview(page);
  await openOverview(page);

  await expect(page.locator('main [id$="-trigger"]')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Le cifre del verdetto' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 2, name: 'Il resto della pagina' })).toBeHidden();
  await expect(page.getByRole('button', { name: /^Il perché/ })).toHaveCount(0);

  const verdict = page.getByRole('region', { name: 'Verdetto del mese' });
  const paragraphs = verdict.locator('p');
  await expect(paragraphs).toHaveCount(1);
  await expect(paragraphs).toContainText(/Il patrimonio vale 190\.000,00\s?€: \+3000,00\s?€ \(\+1,60%\) su \p{Ll}+, \+15,00% da inizio anno \(\+25\.000,00\s?€\)\./u);
  await expect(paragraphs).toContainText(/dal mercato/);

  // THE tile keeps every block at 1440.
  const theTile = page.getByRole('region', { name: 'Patrimonio' });
  await expect(theTile.getByText('questo mese')).toBeVisible();
  await expect(theTile.getByText('da inizio anno')).toBeVisible();
  await expect(theTile.getByText('Mercato:')).toBeVisible();

  // The calendar under the figures that contain it, at this width too (The Scheduled-Is-Not-Spent Rule).
  const cashflow = page.getByRole('region', { name: /^Cashflow/ });
  await expect(cashflow).toContainText(/di cui 350\s?€ già in calendario, entro il \d{2}/);
  const expenses = page.getByRole('region', { name: 'Spese per categoria' });
  await expect(expenses).toContainText(/di cui 350\s?€ già in calendario/);
  await expect(page.getByRole('region', { name: 'Entrate per categoria' })).not.toContainText('già in calendario');

  // No `order-*` left in the grid.
  expect(
    await page.evaluate(() =>
      [...document.querySelector('main')!.querySelectorAll('*')].flatMap((el) => [...el.classList]).filter((name) => /^(?:[a-z-]+:)*order-/.test(name)),
    ),
  ).toEqual([]);
});

test('prints a zero variation without a sign, at 1440 too', async ({ page }) => {
  await patchOverview(page, { variations: { monthly: { value: -0.004, percentage: 0 }, yearly: { value: 0, percentage: 0 } } });
  await openOverview(page);
  const paragraph = page.getByRole('region', { name: 'Verdetto del mese' }).locator('p');
  await expect(paragraph).toContainText(/: 0,00\s?€ \(0,00%\) su \p{Ll}+, 0,00% da inizio anno \(0,00\s?€\)\./u);
  await expect(paragraph).not.toContainText(/[+−-]0,00/);
});

// The savings floor (owner, 2026-11-12): 3 € in and 500 € out so far, a salary of 2600 € still in
// the calendar — the lived part is said in signed euros, then how the calendar closes the month,
// never «−16567% delle entrate finora». Seen red on 2026-11-14 with the no-income/deficit branch of
// `describeSavedSoFar` removed.
test('says a deficit beyond the savings floor in euros, with how the calendar closes the month', async ({ page }) => {
  await patchOverview(page, {
    expenseStats: {
      ...BASE_EXPENSE_STATS,
      currentMonth: { income: 2603, expenses: 500, net: 2103, expensesScheduled: 0, incomeScheduled: 2600 },
    },
  });
  await openOverview(page);
  const paragraph = page.getByRole('region', { name: 'Verdetto del mese' }).locator('p');
  await expect(paragraph).toContainText(
    /Finora hai messo da parte −497\s?€: le spese superano le entrate; con il calendario \(2600\s?€ di entrate\) il mese chiude all'81%/,
  );
  await expect(paragraph).not.toContainText('delle entrate finora');
});
