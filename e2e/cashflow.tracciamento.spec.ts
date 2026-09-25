/**
 * Cashflow › Tracciamento at 1440 — what the 2026-09-14 critique found and only a browser can pin.
 *
 * 1. No ranked list paints outside its tile: «Entrate per categoria» is a `col-span-3` tile whose
 *    list floors added up to 246px against 235px of room, so «89% · 9% · 2%» sat 37px past the
 *    border (neither the tile nor the list clips, so `main` measured no overflow). Measured on
 *    the list and its rows, at 1440 and at 1024.
 * 2. The expense form refuses in Italian, in the reading line: an empty submit used to print
 *    «Invalid input» under the amount and leave the status line on its idle sentence.
 * 3. The «Tabella» view: every header names its column, the figures are mono, a plain row's
 *    delete arms in the row (no timer) and Escape disarms it — nothing is deleted — and the
 *    view is remembered across a reload.
 * 4. The feed's detail is a modal of the vocabulary (2026-09-18, it was three raw `Drawer`s with
 *    a confirm NESTED in the detail): title at 20px, the delete arms in the footer, the reading
 *    gives way to the consequence in `text-destructive`, ONE dialog the whole time, and Escape
 *    disarms without closing and without deleting.
 *
 * Runs on the base account (`desktop` project): the assertions are structural, never amounts.
 */

import { test, expect, type Page } from '@playwright/test';

async function measureRankedLists(page: Page) {
  return page.evaluate(() => {
    const lists = Array.from(document.querySelectorAll<HTMLUListElement>('section[aria-label="Spese per categoria"] ul, section[aria-label="Entrate per categoria"] ul'));
    return lists.map((ul) => {
      const box = ul.getBoundingClientRect();
      const tile = ul.closest('section')!.getBoundingClientRect();
      const overflowing = Array.from(ul.querySelectorAll('li *')).filter((el) => el.getBoundingClientRect().right > tile.right + 0.5).length;
      return { name: ul.getAttribute('aria-label'), scroll: ul.scrollWidth - ul.clientWidth, past: Math.round(box.right - tile.right), overflowing };
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard/cashflow');
  await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Movimenti' })).toBeVisible();
});

test('no ranked list paints outside its tile, at 1440 and at 1024', async ({ page }) => {
  const at1440 = await measureRankedLists(page);
  expect(at1440.length).toBeGreaterThan(0);
  for (const list of at1440) expect(list, JSON.stringify(list)).toMatchObject({ scroll: 0, overflowing: 0 });

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole('region', { name: 'Movimenti' })).toBeVisible();
  for (const list of await measureRankedLists(page)) expect(list, JSON.stringify(list)).toMatchObject({ scroll: 0, overflowing: 0 });
});

test('the expense form refuses in Italian, in the reading line, and points at the first field', async ({ page }) => {
  await page.getByRole('button', { name: 'Nuova Spesa' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Nuova voce · Passo 1 di 2')).toBeVisible();
  await dialog.getByRole('radio', { name: /^Spesa variabile/ }).click();
  await expect(dialog.getByText('Nuova voce · Passo 2 di 2 · Spesa variabile')).toBeVisible();

  const status = dialog.getByRole('status');
  await expect(status).toContainText('La voce entra nelle spese del mese');
  await dialog.getByRole('button', { name: 'Crea voce' }).click();

  await expect(status).toContainText(/^Mancano 2 campi: Importo e Categoria\.$/);
  await expect(dialog.getByText('Invalid input')).toHaveCount(0);
  await expect(dialog.getByText("L'importo è obbligatorio")).toBeVisible();
  await expect(dialog.locator('#amount')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.locator('#amount')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('the Tabella view names its columns, sets its figures in mono, arms a delete in the row and is remembered', async ({ page }) => {
  const movimenti = page.getByRole('region', { name: 'Movimenti' });
  await movimenti.getByRole('tab', { name: 'Tabella' }).click();
  const table = movimenti.getByRole('table');
  await expect(table).toBeVisible();

  // Every header names its column.
  await expect(table.locator('thead th[scope="col"]')).toHaveCount(8);

  // The date and the amount are set in the mono face (the Mono Mandate).
  const firstRow = table.locator('tbody tr').first();
  for (const cell of [firstRow.locator('td').nth(0), firstRow.locator('td').nth(4)]) {
    const font = await cell.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font, font).toMatch(/Geist Mono|monospace/i);
  }

  // A plain row's delete arms in the row: «Conferma» on the button, the consequence in the row,
  // the live region speaks — and Escape disarms without deleting anything.
  const rowsBefore = await table.locator('tbody tr').count();
  const plainDelete = table.getByRole('button', { name: /^Elimina (?!.*o la sua serie$)/ }).first();
  await expect(plainDelete).toBeVisible();
  await plainDelete.click();
  const armed = table.getByRole('button', { name: /^Premi di nuovo per eliminare / });
  await expect(armed).toBeVisible();
  await expect(armed).toHaveText('Conferma');
  await expect(table.getByText(/^Eliminando, /)).toBeVisible();
  await expect(movimenti.getByRole('status').filter({ hasText: /^Premi di nuovo per eliminare / })).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(armed).toHaveCount(0);
  await expect(movimenti.getByRole('status').filter({ hasText: 'Eliminazione annullata' })).toHaveCount(1);
  // Nothing left the table: a disarmed row is still a row (the write would have refreshed the list).
  await expect(table.locator('tbody tr')).toHaveCount(rowsBefore);

  // The view survives a reload.
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByRole('region', { name: 'Movimenti' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Movimenti' }).getByRole('tab', { name: 'Tabella' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('region', { name: 'Movimenti' }).getByRole('tab', { name: 'Feed' }).click();
});

test('the feed’s detail arms its delete in the footer: one dialog, the consequence in the reading, Escape disarms', async ({ page }) => {
  const movimenti = page.getByRole('region', { name: 'Movimenti' });
  await movimenti.getByRole('tab', { name: 'Feed' }).click();
  // The seed's plain row: no series, no account — so the consequence is the unlinked sentence.
  const row = movimenti.getByRole('button', { name: /Alimentari/ }).filter({ visible: true }).first();
  await expect(row).toBeVisible();
  const rowsBefore = await movimenti.getByRole('button', { name: /Alimentari/ }).filter({ visible: true }).count();
  await row.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.getByRole('heading').first().evaluate((el) => getComputedStyle(el).fontSize)).toBe('20px');
  const reading = dialog.getByRole('status').first();
  await expect(reading).toHaveText(/^(Movimento del|In calendario per il) \d{1,2} \p{Ll}+ \d{4}/u);

  await dialog.getByRole('button', { name: /^Elimina (?!.*o la sua serie$)/ }).click();
  await expect(dialog.getByRole('button', { name: /^Premi di nuovo per eliminare / })).toBeVisible();
  await expect(reading).toHaveText(/^Eliminando, /);
  // The colour is read against a probe of the token, never a literal: the themes differ.
  const [readingColour, destructive] = await reading.evaluate((el) => {
    const probe = document.createElement('span');
    probe.className = 'text-destructive';
    document.body.appendChild(probe);
    const colours = [getComputedStyle(el).color, getComputedStyle(probe).color];
    probe.remove();
    return colours;
  });
  expect(readingColour).toBe(destructive);
  // The confirm is not a second surface: the raw drawer used to nest one here.
  await expect(page.getByRole('dialog')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Premi di nuovo per eliminare / })).toHaveCount(0);
  await expect(reading).toHaveText(/^Eliminazione annullata\. /);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(movimenti.getByRole('button', { name: /Alimentari/ }).filter({ visible: true })).toHaveCount(rowsBefore);
});
