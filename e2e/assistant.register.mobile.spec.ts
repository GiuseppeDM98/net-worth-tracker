/**
 * Assistente › Registra at 390px, on the base account (2026-11, doc/guide/assistente.md).
 *
 * WHY IT EXISTS: what only a layout engine knows about the card on a phone — its three buttons are
 * thumb targets that WRAP instead of pushing the page sideways, nothing in `main` crosses its right
 * edge with a card on screen, and «Conferma» writes the row from here too.
 *
 * The stream is ALWAYS faked (`e2e/assistantRegister.ts`): no request reaches a model.
 */

import { test, expect } from '@playwright/test';
import {
  ACCOUNT_ID, ACCOUNT_START, FOOD_ID, admin, card, enterRegister, expectDecoyUntouched, installFakeStream, openAssistant,
  plantFixture, proposalBlock, quantityOf, removeFixture, resetFixture, send, writtenRows,
} from './assistantRegister';

test.beforeAll(async () => {
  await plantFixture();
});
test.beforeEach(async () => {
  await resetFixture();
});
test.afterAll(async () => {
  await expectDecoyUntouched();
  await removeFixture();
});

test('the card’s three buttons are 44px targets inside the card, nothing overflows, and «Conferma» writes the row', async ({ page }) => {
  test.setTimeout(120_000);
  await installFakeStream(
    page,
    () => `Ti propongo questa riga.\n\n${proposalBlock({ amount: 103, note: 'Supermercato di quartiere', reason: 'Come le ultime spese al supermercato, tutte in Cibo › Spesa.' })}`,
  );
  await openAssistant(page);
  await enterRegister(page);
  await send(page, 'Ciao, ho fatto spesa per 103 euro, per favore segnalo');

  const proposed = card(page, 'expense:0');
  await expect(proposed).toContainText(/Spesa · 103,00\s€ · Cibo › Spesa · oggi · Conto principale/);
  // The card's entrance is a translate: measure once it has settled.
  await page.waitForTimeout(600);

  const cardBox = (await proposed.boundingBox())!;
  for (const name of ['Conferma', 'Modifica', 'Ignora']) {
    const box = (await proposed.getByRole('button', { name }).boundingBox())!;
    expect(box.height, `«${name}» is a thumb target`).toBeGreaterThanOrEqual(43.5);
    expect(box.x, `«${name}» starts inside the card`).toBeGreaterThanOrEqual(cardBox.x);
    expect(box.x + box.width, `«${name}» ends inside the card`).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
  }

  // The repo's overflow guard, with the card on screen (as e2e/fire.mobile.spec.ts).
  const measurement = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('no <main> in the dashboard shell');
    const limit = main.getBoundingClientRect().left + main.clientWidth;
    const offenders = Array.from(main.querySelectorAll('*'))
      .filter((el) => !el.closest('.sr-only') && !el.closest('.overflow-x-auto'))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return (rect.width > 0 || rect.height > 0) && rect.right > limit + 1;
      })
      .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`)
      .slice(0, 5);
    return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, offenders };
  });
  expect(measurement.offenders, `elements past the right edge of main (${measurement.clientWidth}px)`).toEqual([]);
  expect(measurement.scrollWidth).toBe(measurement.clientWidth);

  await proposed.getByRole('button', { name: 'Conferma' }).click();
  await expect(proposed.getByText('Registrata')).toBeVisible({ timeout: 30_000 });
  const db = await admin();
  const rows = await writtenRows(db);
  expect(rows).toHaveLength(1);
  expect(rows[0].data()).toMatchObject({ amount: -103, categoryId: FOOD_ID, linkedCashAssetId: ACCOUNT_ID });
  expect(await quantityOf(db, ACCOUNT_ID)).toBeCloseTo(ACCOUNT_START - 103, 2);

  // «apri in Cashflow» on a phone: Movimenti is a closed row there, and it opens ON the row.
  await proposed.getByRole('link', { name: 'apri in Cashflow' }).click();
  await page.waitForURL(new RegExp(`row=${rows[0].id}`), { timeout: 60_000 });
  const feedRow = page.locator(`button[data-expense-id="${rows[0].id}"]`).filter({ visible: true });
  await expect(feedRow).toBeVisible({ timeout: 60_000 });
  await expect(feedRow).toHaveAttribute('data-linked-row', 'true');
  await expect(feedRow).toBeInViewport();
});
