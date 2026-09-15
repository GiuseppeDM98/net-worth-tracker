/**
 * Cashflow › Dividendi on a phone — what the 2026-09-14 critique measured at 390 and only a
 * browser can pin:
 *
 * 1. An ANNOUNCED payment is said in words, not by the colour of its number: the row carries the
 *    «Attesa» chip, the list closes on «Annunciate · 1 voce» beside «Incassate», and the
 *    calendar's cell prints «attesa» under the amount (WCAG 1.4.1).
 * 2. The touch targets: the period radios, the two filter selects, the «+» and the calendar's
 *    arrows are at least 44px tall on touch; `main` never scrolls sideways.
 * 3. The form is a drawer here and refuses in its reading line exactly like the dialog.
 *
 * Base account, `mobile` project (390×844, touch). The spec creates its own coupon on «BTP
 * Valore 2030», dated twenty days ahead so it is announced, with a decoy note. A phone has no
 * delete for a payment (the record drawer edits, the table's armed delete is desktop-only), so
 * the fixture is removed through the emulator's REST API — the one place this file does not
 * go through the app — before and after the test.
 */

import { test, expect, type Locator } from '@playwright/test';

const DECOY_NOTE = 'cedola ornitorinco';
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
const AUTH = { Authorization: 'Bearer owner' };

async function decoyDividendIds(): Promise<string[]> {
  const res = await fetch(`${FIRESTORE}/dividends?pageSize=300`, { headers: AUTH });
  if (!res.ok) return [];
  const body = (await res.json()) as {
    documents?: Array<{ name: string; fields?: { userId?: { stringValue?: string }; notes?: { stringValue?: string } } }>;
  };
  return (body.documents ?? [])
    .filter((d) => d.fields?.userId?.stringValue === 'test-user-1' && d.fields?.notes?.stringValue === DECOY_NOTE)
    .map((d) => d.name.split('/').pop() as string);
}

async function removeDecoyDividends() {
  for (const id of await decoyDividendIds()) {
    await fetch(`${FIRESTORE}/dividends/${id}`, { method: 'DELETE', headers: AUTH });
  }
  await expect.poll(decoyDividendIds).toEqual([]);
}

async function heightOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  return box ? Math.round(box.height) : 0;
}

const isoDaysFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

test.beforeEach(async () => {
  await removeDecoyDividends();
});

test.afterEach(async () => {
  await removeDecoyDividends();
});

test('an announced coupon is chipped «Attesa» in the row, the totals and the calendar; the targets are 44px', async ({ page }) => {
  await page.goto('/dashboard/cashflow?tab=dividends');
  await expect(page.getByRole('region', { name: 'Verdetto sui dividendi' })).toBeVisible({ timeout: 30_000 });

  // The form is a drawer here, and refuses in its reading line like the dialog.
  await page.getByRole('button', { name: 'Aggiungi dividendo', exact: true }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  const status = drawer.getByRole('status');
  await drawer.getByRole('button', { name: 'Registra pagamento', exact: true }).click();
  await expect(status).toHaveText('Mancano 4 campi: Strumento, Importo lordo, Ritenuta e Unità.');

  await drawer.locator('#assetId').fill('BTP');
  await drawer.getByRole('button', { name: /BTP - BTP Valore 2030/ }).click();
  await drawer.locator('#grossAmountPerShare').fill('6.5');
  await expect(drawer.locator('#withholdingTax')).toHaveValue('0.8125');
  await drawer.locator('#exDate').fill(isoDaysFromNow(18));
  await drawer.locator('#paymentDate').fill(isoDaysFromNow(20));
  await drawer.locator('#notes').fill(DECOY_NOTE);
  const created = page.waitForResponse((r) => r.url().endsWith('/api/dividends') && r.request().method() === 'POST');
  await drawer.getByRole('button', { name: 'Registra pagamento', exact: true }).click();
  expect((await created).status()).toBe(200);
  await expect(drawer).toBeHidden();
  await expect.poll(decoyDividendIds).toHaveLength(1);

  // «Storico» holds the row whatever the month; the verdict knows something is coming.
  await page.getByRole('radio', { name: 'Storico' }).click();
  await expect(page.getByRole('region', { name: 'Verdetto sui dividendi' })).toContainText('qualcosa è in arrivo');

  const pagamenti = page.getByRole('region', { name: 'Pagamenti' });
  const row = pagamenti.getByRole('button', { name: /^Dettagli: la cedola di BTP del .*, attesa$/ });
  await row.scrollIntoViewIfNeeded();
  await expect(row).toBeVisible();
  await expect(row.getByText('Attesa', { exact: true })).toBeVisible();
  // `dt`: the desktop `tfoot` is in the DOM too, hidden, and says the same words.
  await expect(pagamenti.locator('dt', { hasText: 'Annunciate · 1 voce' })).toBeVisible();
  await expect(pagamenti.locator('dt', { hasText: /^Incassate ·/ })).toHaveCount(0);
  expect(await heightOf(row)).toBeGreaterThanOrEqual(44);

  // Touch targets, and the page never scrolls sideways.
  for (const radio of await page.getByRole('radio').all()) expect(await heightOf(radio)).toBeGreaterThanOrEqual(44);
  expect(await heightOf(page.getByRole('button', { name: 'Aggiungi dividendo', exact: true }))).toBeGreaterThanOrEqual(44);
  expect(await heightOf(pagamenti.getByRole('combobox', { name: 'Filtra per strumento' }))).toBeGreaterThanOrEqual(44);
  expect(await heightOf(pagamenti.getByRole('combobox', { name: 'Filtra per tipo' }))).toBeGreaterThanOrEqual(44);
  expect(await heightOf(pagamenti.getByRole('button', { name: 'Scarica dividendi storici per gli strumenti con ISIN' }))).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main');
    return main ? main.scrollWidth - main.clientWidth : -1;
  });
  expect(overflow).toBe(0);

  // The calendar says it too: the cell is named «in attesa» and prints the word under the amount.
  await pagamenti.getByRole('tab', { name: 'Calendario' }).click();
  const grid = pagamenti.getByRole('grid', { name: 'Calendario pagamenti dividendi' });
  await expect(grid).toBeVisible();
  // Browse to the coupon's month when it falls into the next one.
  const next = pagamenti.getByRole('button', { name: 'Mese successivo' });
  for (let i = 0; i < 2; i++) {
    if ((await grid.getByRole('gridcell', { name: /in attesa/ }).count()) > 0) break;
    await next.click();
  }
  const cell = grid.getByRole('gridcell', { name: /in attesa/ });
  await expect(cell).toBeVisible();
  await expect(cell).toContainText('attesa');
  expect(await heightOf(next)).toBeGreaterThanOrEqual(44);
});
