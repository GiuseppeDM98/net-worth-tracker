/**
 * Cashflow › Dividendi at 1440 — what the 2026-09-14 critique found and only a browser can pin.
 *
 * 1. The dividend form refuses in Italian, in its reading line: an empty submit names the four
 *    missing fields in the order the reader meets them, marks the first `aria-invalid` and
 *    focuses it; the submit is never `disabled`. The picker offers the BTP (a bond: the form
 *    used to keep equities only), fills «Cedola» as the type and today's units, and proposes the
 *    withholding at the INSTRUMENT's rate (12,5%, never the 26% constant). On close the focus
 *    returns to the control that opened it.
 * 2. The write is real: the coupon lands in `dividends` on the emulator and the deletion takes
 *    it out — asserted on the collection, never on the screen alone.
 * 3. The row's name is a button that opens the record from the keyboard; the delete arms IN
 *    the row («Conferma» in words and in the accessible name, the consequence printed in the
 *    row, the tile's live region speaking); Escape disarms and deletes nothing.
 * 4. The period axis is a radiogroup: the arrows move it, Tab leaves it after one stop.
 * 5. With nothing recorded the page shows ONE tile naming the next action, not a hero at 0 €.
 *
 * Runs on the base account (`desktop` project), which has no dividends: the spec creates its
 * own coupon on «BTP Valore 2030» with a decoy note and removes it THROUGH THE APP at the end
 * (looping first, in case an earlier failed run left one behind).
 */

import { test, expect, type Page } from '@playwright/test';

const DECOY_NOTE = 'cedola fenicottero';
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';

/** The base account's dividends carrying the decoy note, read from the emulator (not from the page). */
async function decoyDividendIds(): Promise<string[]> {
  const res = await fetch(`${FIRESTORE}/dividends?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) return [];
  const body = (await res.json()) as {
    documents?: Array<{ name: string; fields?: { userId?: { stringValue?: string }; notes?: { stringValue?: string } } }>;
  };
  return (body.documents ?? [])
    .filter((d) => d.fields?.userId?.stringValue === 'test-user-1' && d.fields?.notes?.stringValue === DECOY_NOTE)
    .map((d) => d.name.split('/').pop() as string);
}

async function openDividendi(page: Page) {
  await page.goto('/dashboard/cashflow?tab=dividends');
  await expect(page.getByRole('region', { name: 'Verdetto sui dividendi' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Pagamenti' })).toBeVisible();
}

/** Removes every BTP coupon row through the app's own two-click delete (the base account has no other dividend). */
async function removeDecoyRows(page: Page) {
  const pagamenti = page.getByRole('region', { name: 'Pagamenti' });
  for (let i = 0; i < 3; i++) {
    const del = pagamenti.getByRole('button', { name: /^Elimina la cedola di BTP del/ });
    if ((await del.count()) === 0) break;
    await del.first().click();
    const armed = pagamenti.getByRole('button', { name: /^Premi di nuovo per eliminare la cedola di BTP del/ });
    await expect(armed).toBeVisible();
    const deleted = page.waitForResponse((r) => r.url().includes('/api/dividends/') && r.request().method() === 'DELETE');
    await armed.click();
    expect((await deleted).status()).toBe(200);
    await expect(del).toHaveCount(0, { timeout: 10_000 });
  }
  await expect.poll(decoyDividendIds).toEqual([]);
}

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

test.beforeEach(async ({ page }) => {
  await openDividendi(page);
  await removeDecoyRows(page);
});

test('with nothing recorded the page names the next action instead of printing zeros', async ({ page }) => {
  const pagamenti = page.getByRole('region', { name: 'Pagamenti' });
  await expect(pagamenti).toContainText('Nessun pagamento registrato');
  await expect(pagamenti.getByRole('button', { name: 'Aggiungi dividendo', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Incasso netto del periodo' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Affidabilità' })).toHaveCount(0);
});

test('the form refuses in the reading line, proposes the instrument’s rate, writes, and the row deletes armed in place', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Aggiungi dividendo', exact: true }).first();
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Dividendi · Nuovo pagamento')).toBeVisible();

  const status = dialog.getByRole('status');
  await expect(status).toContainText('Scegli lo strumento e l’importo lordo per unità');
  const submit = dialog.getByRole('button', { name: 'Registra pagamento', exact: true });
  await expect(submit).toBeEnabled();

  // Empty submit: four fields named in the order the reader meets them, the first marked and focused.
  await submit.click();
  await expect(status).toHaveText('Mancano 4 campi: Strumento, Importo lordo, Ritenuta e Unità.');
  await expect(dialog.locator('#assetId')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.locator('#assetId')).toBeFocused();
  // The refusal is painted in the destructive token at the reading's 13px.
  const refusalStyle = await status.evaluate((el) => {
    const probe = document.createElement('span');
    probe.className = 'text-destructive';
    document.body.appendChild(probe);
    const destructive = getComputedStyle(probe).color;
    probe.remove();
    return { color: getComputedStyle(el).color, destructive, fontSize: getComputedStyle(el).fontSize };
  });
  expect(refusalStyle.color, JSON.stringify(refusalStyle)).toBe(refusalStyle.destructive);
  expect(refusalStyle.fontSize).toBe('13px');

  // The picker offers the BTP — a bond — and the choice fills what the instrument knows.
  await dialog.locator('#assetId').fill('BTP');
  await dialog.getByRole('button', { name: /BTP - BTP Valore 2030/ }).click();
  await expect(status).toContainText('Scegli lo strumento');
  await expect(dialog.locator('#assetId')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.locator('#sharesHeld')).toHaveValue('5');
  await expect(dialog.locator('#dividendType')).toHaveText('Cedola');

  // The withholding is proposed at the instrument's own rate: 12,5% of 6,50 € is 0,8125 €.
  await dialog.locator('#grossAmountPerShare').fill('6.5');
  await expect(dialog.locator('#withholdingTax')).toHaveValue('0.8125');
  await expect(dialog.getByText('proposta al 12,5%')).toBeVisible();

  await dialog.locator('#exDate').fill(isoDaysAgo(2));
  await dialog.locator('#paymentDate').fill(isoDaysAgo(1));
  await dialog.locator('#notes').fill(DECOY_NOTE);
  const created = page.waitForResponse((r) => r.url().endsWith('/api/dividends') && r.request().method() === 'POST');
  await submit.click();
  expect((await created).status()).toBe(200);
  await expect(dialog).toBeHidden();
  // The focus goes back to the control that opened the form (it used to land on `body`).
  await expect(opener).toBeFocused();
  await expect.poll(decoyDividendIds).toHaveLength(1);

  // The row is in the inventory: its name is a button, reachable and openable from the keyboard.
  const pagamenti = page.getByRole('region', { name: 'Pagamenti' });
  const rowOpen = pagamenti.getByRole('button', { name: /^Dettagli: la cedola di BTP del/ });
  await expect(rowOpen).toBeVisible();
  await expect(pagamenti.getByRole('row', { name: /BTP/ }).first()).toContainText('Cedola');
  await rowOpen.focus();
  await page.keyboard.press('Enter');
  const record = page.getByRole('dialog');
  await expect(record).toBeVisible();
  await expect(record.getByText('Dividendi · Cedola')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(record).toBeHidden();
  await expect(rowOpen).toBeFocused();

  // The axis is a radiogroup: the arrows move it, and Tab leaves it after one stop.
  const anno = page.getByRole('radio', { name: 'Anno' });
  await expect(anno).toBeChecked();
  await anno.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: '12 mesi' })).toBeChecked();
  await expect(page.getByRole('radio', { name: '12 mesi' })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(anno).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('radio', { name: '12 mesi' })).not.toBeFocused();
  await expect(page.getByRole('radio', { name: 'Storico' })).not.toBeFocused();

  // Delete: armed in the row, in words, with the consequence and the announcement; Escape disarms.
  const del = pagamenti.getByRole('button', { name: /^Elimina la cedola di BTP del/ });
  await del.click();
  const armed = pagamenti.getByRole('button', { name: /^Premi di nuovo per eliminare la cedola di BTP del/ });
  await expect(armed).toBeVisible();
  await expect(armed).toHaveText('Conferma');
  await expect(armed).toHaveAttribute('aria-pressed', 'true');
  await expect(pagamenti.getByText(/^Eliminando, la cedola del .* sparisce dal registro/)).toBeVisible();
  await expect(pagamenti.getByRole('status').filter({ hasText: /^Premi di nuovo per eliminare la cedola di BTP/ })).toBeVisible();
  await expect(pagamenti.getByRole('button', { name: /^Modifica la cedola di BTP del/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(armed).toHaveCount(0);
  await expect(del).toBeVisible();
  await expect(pagamenti.getByRole('status').filter({ hasText: 'Eliminazione annullata' })).toBeVisible();
  await expect.poll(decoyDividendIds).toHaveLength(1);

  // The second press deletes for real, and the page goes back to naming the next action.
  await del.click();
  await expect(armed).toBeVisible();
  const deleted = page.waitForResponse((r) => r.url().includes('/api/dividends/') && r.request().method() === 'DELETE');
  await armed.click();
  expect((await deleted).status()).toBe(200);
  await expect(pagamenti).toContainText('Nessun pagamento registrato', { timeout: 10_000 });
  await expect.poll(decoyDividendIds).toEqual([]);
});
