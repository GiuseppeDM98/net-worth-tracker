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
 * 5. A saved expense lands in place (the owner's tour, 2026-09-29): the counter and the table
 *    follow the write with NO page skeleton in between — the save used to reread the dividends
 *    and put the skeleton over Tracciamento for the length of a call it never uses. TWO lines of
 *    `app/dashboard/cashflow/page.tsx` hold it, either alone: the tab's `loading` without
 *    `otherDataLoading`, and `handleRefresh` rereading the dividends only with their tab mounted.
 *    The falsification that turns this red removes BOTH (seen: «1 before the save, 2 after»).
 * 6. The tab reads a WINDOW of the expenses, and a new period is a new read (2026-09-30,
 *    lib/utils/expenseWindows.ts). A row saved with a date in NEXT year is outside this month's
 *    window: it shows when the period moves there — after that year was already opened once, so
 *    its window was in the cache and only the write's invalidation (`expenses.all`, the prefix of
 *    every window) can have brought the row into it. The picker's «Anni» then offers the year,
 *    which it reads off the collection's bounds. Seen red both ways: with `range` keyed outside
 *    the prefix the row never appears in the cached year; with the page reading this month's
 *    window whatever the period, the year is empty.
 *
 * Runs on the base account (`desktop` project): the assertions are structural, never amounts.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return { db: getFirestore(app) };
}

interface SkeletonCount {
  /** Every `[data-slot="skeleton"]` that appeared in `main` — the auth wait included: proof the observer runs. */
  any: number;
  /** The page's own wait, «Caricamento» — the one a save must never bring back. */
  page: number;
}

/** From the next navigation on, count the skeletons that appear in `main`, each node once. */
async function countSkeletons(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counts: SkeletonCount = { any: 0, page: 0 };
    Object.assign(window, { __skeletons: counts });
    const seen = new WeakSet<Element>();
    const check = () => {
      for (const el of Array.from(document.querySelectorAll('main [data-slot="skeleton"]'))) {
        if (!seen.has(el)) { seen.add(el); counts.any += 1; }
      }
      for (const el of Array.from(document.querySelectorAll('main [role="status"][aria-label="Caricamento"]'))) {
        if (!seen.has(el)) { seen.add(el); counts.page += 1; }
      }
    };
    // `document`, not `documentElement`: it does not exist yet when an init script runs.
    new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

const readSkeletons = (page: Page) => page.evaluate(() => (window as unknown as { __skeletons: SkeletonCount }).__skeletons);

/**
 * Delete every row of the decoy amount THROUGH THE APP (the row's two-click delete, which also gives
 * a linked account its balance back) — an earlier run that failed mid-way leaves its own behind, and
 * a REST delete would skip the reversal. Ends back on the Feed, where the test started.
 */
async function removeDecoyRows(movimenti: Locator, amount: RegExp): Promise<void> {
  await movimenti.getByRole('tab', { name: 'Tabella' }).click();
  const rows = movimenti.getByRole('table').getByRole('row').filter({ hasText: amount });
  for (let left = await rows.count(); left > 0; left = await rows.count()) {
    const row = rows.first();
    await row.getByRole('button', { name: /^Elimina / }).click();
    await row.getByRole('button', { name: /^Premi di nuovo per eliminare / }).click();
    await expect(rows).toHaveCount(left - 1);
  }
  await movimenti.getByRole('tab', { name: 'Feed' }).click();
}

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

test('a saved expense lands in place: the counter and the table follow the write, no page skeleton in between', async ({ page }) => {
  // A note no seed carries, and an amount no seed row has (every seeded amount is round).
  const DECOY = 'Ornitorinco senza skeleton';
  const AMOUNT = '123.45';
  const AMOUNT_TEXT = /123,45/;

  await countSkeletons(page);
  await page.reload({ waitUntil: 'load' });
  const movimenti = page.getByRole('region', { name: 'Movimenti' });
  await expect(movimenti).toBeVisible({ timeout: 30_000 });
  // Positive anchor: the observer does see skeletons (the auth wait at least) before the absence below means anything.
  expect((await readSkeletons(page)).any).toBeGreaterThan(0);
  // What an earlier failed run left behind goes first, so the counter and the read-back start clean.
  await removeDecoyRows(movimenti, AMOUNT_TEXT);
  const before = await readSkeletons(page);
  const total = Number((await movimenti.textContent())?.match(/(\d+) voci/)?.[1]);
  expect(total).toBeGreaterThan(0);
  const { db } = await admin();
  const planted = () => db.collection('expenses').where('userId', '==', UID).where('notes', '==', DECOY).get().then((snap) => snap.size);
  await expect.poll(planted).toBe(0);

  try {
    await page.getByRole('button', { name: 'Nuova Spesa' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /^Spesa variabile/ }).click();
    await dialog.locator('#amount').fill(AMOUNT);
    await dialog.locator('#categoryId').click();
    await dialog.getByRole('button', { name: 'Alimentari', exact: true }).click();
    await dialog.locator('#notes').fill(DECOY);
    await dialog.getByRole('button', { name: 'Crea voce' }).click();
    await expect(dialog).toBeHidden();

    // The write is real (Firestore), the counter follows it, the row is in the table — and the
    // page skeleton count is what it was: the month updated in place.
    await expect.poll(planted).toBe(1);
    await expect(movimenti).toContainText(`${total + 1} voci`);
    await movimenti.getByRole('tab', { name: 'Tabella' }).click();
    await expect(movimenti.getByRole('table').getByRole('row').filter({ hasText: AMOUNT_TEXT })).toHaveCount(1);
    const after = await readSkeletons(page);
    expect(after.page, `page skeletons: ${before.page} before the save, ${after.page} after`).toBe(before.page);

    // Removed BY THE APP (the row's two-click delete), the counter back where it was.
    await removeDecoyRows(movimenti, AMOUNT_TEXT);
    await expect(movimenti).toContainText(`${total} voci`);
    await expect.poll(planted).toBe(0);
  } finally {
    // A run that failed above still takes its row away — quietly, so the failure above stays the one reported.
    await removeDecoyRows(movimenti, AMOUNT_TEXT).catch(() => undefined);
  }
});

/** Type a whole year into the picker's range inputs: «Applica» normalises it to the year period. */
async function pickYearByRange(page: Page, year: number): Promise<void> {
  await page.getByRole('combobox', { name: /Periodo selezionato/ }).filter({ visible: true }).first().click();
  await page.locator('#period-picker-from').filter({ visible: true }).first().fill(`01/01/${year}`);
  await page.locator('#period-picker-to').filter({ visible: true }).first().fill(`31/12/${year}`);
  await page.getByRole('button', { name: 'Applica', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('combobox', { name: `Periodo selezionato: ${year}` }).filter({ visible: true }).first()).toBeVisible();
}

async function pickPreset(page: Page, label: string): Promise<void> {
  await page.getByRole('combobox', { name: /Periodo selezionato/ }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first().click();
}

test('a row dated next year shows when the period moves there: the second window is read, and the write reached it', async ({ page }) => {
  // A note and an amount no seed carries; next year, so the row is outside this month's window.
  const DECOY = 'Fenicottero della seconda finestra';
  const AMOUNT = '67.89';
  const AMOUNT_TEXT = /67,89/;
  const nextYear = new Date().getFullYear() + 1;

  const movimenti = page.getByRole('region', { name: 'Movimenti' });
  const decoyRows = movimenti.getByRole('table').getByRole('row').filter({ hasText: AMOUNT_TEXT });
  const { db } = await admin();
  const planted = () => db.collection('expenses').where('userId', '==', UID).where('notes', '==', DECOY).get().then((snap) => snap.size);

  try {
    // Next year FIRST: its window is read now and stays in the cache, so that later only the
    // invalidation can bring a new row into it. What an earlier failed run left there goes first.
    await pickYearByRange(page, nextYear);
    await expect(movimenti).toBeVisible();
    await removeDecoyRows(movimenti, AMOUNT_TEXT);
    await expect.poll(planted).toBe(0);

    // Back on this month, save the row dated next year through the form.
    await pickPreset(page, 'Questo mese');
    await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible();
    const total = Number((await movimenti.textContent())?.match(/(\d+) voci/)?.[1]);
    expect(total).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Nuova Spesa' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /^Spesa variabile/ }).click();
    await dialog.locator('#amount').fill(AMOUNT);
    await dialog.locator('#date').fill(`${nextYear}-03-15`);
    await dialog.locator('#categoryId').click();
    await dialog.getByRole('button', { name: 'Alimentari', exact: true }).click();
    await dialog.locator('#notes').fill(DECOY);
    await dialog.getByRole('button', { name: 'Crea voce' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(planted).toBe(1);

    // This month did not gain a row: the write is outside its window, and outside its period.
    await expect(movimenti).toContainText(`${total} voci`);

    // The year is now one the picker offers (the collection's newest row moved), and its window —
    // cached before the write — holds the row.
    await pickPreset(page, String(nextYear));
    await expect(page.getByRole('combobox', { name: `Periodo selezionato: ${nextYear}` }).filter({ visible: true }).first()).toBeVisible();
    await movimenti.getByRole('tab', { name: 'Tabella' }).click();
    await expect(decoyRows).toHaveCount(1);

    // Removed BY THE APP, in the period that shows it.
    await removeDecoyRows(movimenti, AMOUNT_TEXT);
    await expect.poll(planted).toBe(0);
  } finally {
    // A run that failed above still takes its row away, from the year that holds it.
    await pickYearByRange(page, nextYear).catch(() => undefined);
    await removeDecoyRows(movimenti, AMOUNT_TEXT).catch(() => undefined);
    await pickPreset(page, 'Questo mese').catch(() => undefined);
  }
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
