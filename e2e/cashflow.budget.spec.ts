/**
 * Cashflow › Budget at 1440 — what the 2026-09-14 critique found and only a browser can pin.
 *
 * 1. The budget dialog refuses in Italian, in its reading line: an empty submit names the
 *    missing fields, marks the first `aria-invalid` and focuses it; the submit is never
 *    `disabled` (it used to be, so a keyboard reader pressed Enter on a dead button). A field
 *    edit clears the refusal. On close the focus returns to the control that opened it.
 * 2. A row's delete arms IN the row: «Conferma» in words on the button, the consequence
 *    printed in the row, the tile's live region speaking; Escape disarms and deletes nothing.
 * 3. The write is real: the created budget lands in `budgets/test-user-1` on the emulator and
 *    the deletion takes it out — asserted on the document, never on the screen alone.
 *
 * Runs on the base account (`desktop` project), which has no budgets: the spec creates its
 * own row on «Alimentari» with a decoy amount and removes it THROUGH THE APP at the end
 * (looping first, in case an earlier failed run left one behind). The verdict's figures
 * depend on the run month, so nothing here asserts an amount but the decoy.
 */

import { test, expect, type Page } from '@playwright/test';

const DECOY_AMOUNT = 123;
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';

/** The saved budget items of the base account, read from the emulator (not from the page). */
async function savedBudgetAmounts(): Promise<number[]> {
  const res = await fetch(`${FIRESTORE}/budgets/test-user-1`, { headers: { Authorization: 'Bearer owner' } });
  if (res.status === 404) return [];
  const doc = (await res.json()) as { fields?: { items?: { arrayValue?: { values?: Array<{ mapValue: { fields: { amount: { integerValue?: string; doubleValue?: number } } } }> } } } };
  return (doc.fields?.items?.arrayValue?.values ?? []).map((v) => Number(v.mapValue.fields.amount.integerValue ?? v.mapValue.fields.amount.doubleValue));
}

async function openBudget(page: Page) {
  await page.goto('/dashboard/cashflow?tab=budget');
  await expect(page.getByRole('region', { name: 'Verdetto sul budget' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Per categoria' })).toBeVisible();
}

/** Removes every «Alimentari» budget through the app's own two-click delete. */
async function removeDecoyRows(page: Page) {
  const perCategoria = page.getByRole('region', { name: 'Per categoria' });
  for (let i = 0; i < 3; i++) {
    const del = perCategoria.getByRole('button', { name: 'Elimina budget Alimentari' });
    if ((await del.count()) === 0) break;
    await del.first().click();
    await expect(perCategoria.getByRole('button', { name: /^Conferma eliminazione budget Alimentari/ })).toBeVisible();
    await perCategoria.getByRole('button', { name: /^Conferma eliminazione budget Alimentari/ }).click();
    await expect(perCategoria.getByRole('status').filter({ hasText: 'Salvato' })).toBeVisible({ timeout: 10_000 });
  }
}

test.beforeEach(async ({ page }) => {
  await openBudget(page);
  await removeDecoyRows(page);
});

test('the budget dialog refuses in the reading line, keeps its submit alive and returns the focus', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Aggiungi budget', exact: true }).first();
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Budget · Spesa · Mensile')).toBeVisible();

  const status = dialog.getByRole('status');
  await expect(status).toContainText('Scegli una categoria e il suo importo mensile');
  const submit = dialog.getByRole('button', { name: 'Aggiungi', exact: true });
  await expect(submit).toBeEnabled();

  // Empty submit: two fields named in the order the reader meets them, the first marked and focused.
  await submit.click();
  await expect(status).toHaveText('Mancano 2 campi: Categoria e Importo.');
  await expect(dialog.locator('#budget-category')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.locator('#budget-category')).toBeFocused();
  // The refusal is painted in the destructive token and at the reading's 13px: the Radix
  // description's `text-sm text-muted-foreground` used to win the merge on every modal.
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

  // An edit clears the refusal; the next submit names only what is still missing.
  await dialog.locator('#budget-amount').fill(String(DECOY_AMOUNT));
  await expect(status).toContainText('Scegli una categoria');
  await expect(dialog.locator('#budget-category')).not.toHaveAttribute('aria-invalid', 'true');
  await submit.click();
  await expect(status).toHaveText('Manca un campo: Categoria.');

  // The four radios are ONE tab stop each group: Tab from the checked «Spesa» lands on «Mensile», not on «Entrata».
  await dialog.getByRole('radio', { name: 'Spesa' }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('radio', { name: 'Mensile' })).toBeFocused();

  await dialog.locator('#budget-category').click();
  await page.getByRole('option', { name: 'Alimentari' }).click();
  await expect(status).toContainText('Scegli una categoria');
  await submit.click();
  await expect(dialog).toBeHidden();
  // The focus goes back to the control that opened the dialog (it used to land on `body`).
  await expect(opener).toBeFocused();

  // The row is in the inventory and the write landed on the emulator.
  const perCategoria = page.getByRole('region', { name: 'Per categoria' });
  const row = perCategoria.getByRole('row', { name: /Alimentari/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText(`${DECOY_AMOUNT} €`);
  await expect(perCategoria.getByRole('status').filter({ hasText: 'Salvato' })).toBeVisible({ timeout: 10_000 });
  await expect.poll(savedBudgetAmounts).toContain(DECOY_AMOUNT);

  // Delete: armed in the row, in words, with the consequence and the announcement; Escape disarms.
  await perCategoria.getByRole('button', { name: 'Elimina budget Alimentari' }).click();
  const armed = perCategoria.getByRole('button', { name: /^Conferma eliminazione budget Alimentari\. Eliminando, il budget di Alimentari sparisce; le spese restano\.$/ });
  await expect(armed).toBeVisible();
  await expect(armed).toHaveText('Conferma');
  await expect(row.getByText('Eliminando, il budget di Alimentari sparisce; le spese restano.')).toBeVisible();
  await expect(perCategoria.getByRole('button', { name: 'Modifica budget Alimentari' })).toHaveCount(0);
  await expect(perCategoria.getByRole('status').filter({ hasText: 'Premi di nuovo per eliminare il budget di Alimentari' })).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(armed).toHaveCount(0);
  await expect(perCategoria.getByRole('status').filter({ hasText: 'Eliminazione annullata' })).toHaveCount(1);
  await expect(row).toBeVisible();
  await expect.poll(savedBudgetAmounts).toContain(DECOY_AMOUNT);

  // The second press deletes, and the document no longer holds the decoy.
  await perCategoria.getByRole('button', { name: 'Elimina budget Alimentari' }).click();
  await perCategoria.getByRole('button', { name: /^Conferma eliminazione budget Alimentari/ }).click();
  await expect(row).toHaveCount(0);
  await expect(perCategoria.getByRole('status').filter({ hasText: 'Salvato' })).toBeVisible({ timeout: 10_000 });
  await expect.poll(savedBudgetAmounts).not.toContain(DECOY_AMOUNT);
});

test('every progress track tells a screen reader its real share, never a clamped 100', async ({ page }) => {
  // Create a row, then read the track's value text against the printed share.
  const opener = page.getByRole('button', { name: 'Aggiungi budget', exact: true }).first();
  await opener.click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#budget-category').click();
  await page.getByRole('option', { name: 'Alimentari' }).click();
  await dialog.locator('#budget-amount').fill(String(DECOY_AMOUNT));
  await dialog.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await expect(dialog).toBeHidden();

  const track = page.getByRole('region', { name: 'Per categoria' }).getByRole('progressbar', { name: 'Avanzamento Alimentari' }).first();
  const valueText = await track.getAttribute('aria-valuetext');
  expect(valueText, valueText ?? '').toMatch(/^\d+%/);
  const printed = await page.getByRole('region', { name: 'Per categoria' }).getByRole('row', { name: /Alimentari/ }).locator('td').nth(3).innerText();
  expect(valueText!.startsWith(printed.trim()), `${valueText} vs ${printed}`).toBe(true);

  await removeDecoyRows(page);
  await expect.poll(savedBudgetAmounts).not.toContain(DECOY_AMOUNT);
});
