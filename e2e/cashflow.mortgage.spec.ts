/**
 * Cashflow — a mortgage instalment that repays its property's debt, in a real browser
 * (2026-09-25, lib/utils/mortgageRepayment.ts).
 *
 * What only a browser (and the emulator) can prove: that the TAN typed on the property is saved,
 * that the expense form splits the instalment on today's debt BEFORE the save, and that the debt
 * then moves by the PRINCIPAL through the app's own paths — the rows already happened at save
 * (the one to come waits, `balancePending`), Patrimonio's «Mutuo» tile reading the interest and
 * principal that instalment paid, the delete of the whole series (only what was repaid comes
 * back), and «Collega la serie al mutuo…» for a series entered before the link existed.
 * Every step is read back from Firestore. The arithmetic belongs to Vitest
 * (`mortgageRepayment.test.ts`), and so does the server's settlement of the row that comes due
 * (`serverCashSettlement.test.ts`): a spec cannot import `lib/server` (no `@/` alias here).
 *
 * Reference plan: 200.000 € at 3,6% → an instalment of 1.012 € is 600 € of interest and 412 € of
 * principal in the first month, 598,76 € and 413,24 € in the second.
 *
 * Runs on the base seed (`test@example.com`): the primary residence `seed-home` (no debt in the
 * seed) takes a debt and a TAN for the file and gives them back in `afterAll`; the category
 * «Mutuo Fenicottero» and every row are decoys absent from the seed.
 */
import { test, expect, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const HOME_ID = 'seed-home';
const HOME_NAME = 'Abitazione principale';
const CASH_ID = 'seed-cash';
const CATEGORY_ID = 'e2e-mortgage-category';
const CATEGORY_NAME = 'Mutuo Fenicottero';
const NOTE = 'Rata Fenicottero';
const LEGACY_NOTE = 'Rata Ornitorinco';
const DEBT = 200_000;
const INSTALMENT = 1012;

test.describe.configure({ mode: 'serial' });

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

async function asset(db: FirebaseFirestore.Firestore, id: string) {
  return (await db.collection('assets').doc(id).get()).data()!;
}

/** The planted rows with `note`, oldest first. */
async function rowsWith(db: FirebaseFirestore.Firestore, note: string) {
  const rows = await db.collection('expenses').where('userId', '==', UID).where('notes', '==', note).get();
  return rows.docs.sort((a, b) => a.data().date.toMillis() - b.data().date.toMillis());
}

let cashStart = 0;

test.beforeAll(async () => {
  const db = await admin();
  cashStart = (await asset(db, CASH_ID)).quantity as number;
  await db.collection('assets').doc(HOME_ID).update({ outstandingDebt: DEBT });
  const now = new Date();
  await db.collection('expenseCategories').doc(CATEGORY_ID).set({
    userId: UID,
    name: CATEGORY_NAME,
    type: 'debt',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  });
});

test.afterAll(async () => {
  const db = await admin();
  const { FieldValue } = await import('firebase-admin/firestore');
  const planted = await db.collection('expenses').where('userId', '==', UID).where('categoryId', '==', CATEGORY_ID).get();
  for (const doc of planted.docs) await doc.ref.delete();
  await db.collection('expenseCategories').doc(CATEGORY_ID).delete();
  await db.collection('assets').doc(CASH_ID).update({ quantity: cashStart });
  await db.collection('assets').doc(HOME_ID).update({ outstandingDebt: FieldValue.delete(), debtInterestRate: FieldValue.delete() });
});

async function openNewDebt(page: Page) {
  await page.goto('/dashboard/cashflow', { waitUntil: 'load' });
  await page.getByRole('region', { name: 'Movimenti' }).waitFor({ timeout: 60_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cashflow:add-expense')));
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('radio', { name: /^Debito/ }).click();
  return dialog;
}

test('the TAN typed on the property is saved with its debt', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/dashboard/assets', { waitUntil: 'load' });
  await page.getByRole('row').filter({ hasText: HOME_NAME }).getByRole('button', { name: /^Modifica / }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('#outstandingDebt')).toHaveValue(String(DEBT), { timeout: 30_000 });
  await dialog.locator('#debtInterestRate').fill('3.6');
  await dialog.locator('button[type=submit]').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const db = await admin();
  expect(await asset(db, HOME_ID)).toMatchObject({ outstandingDebt: DEBT, debtInterestRate: 3.6 });
});

test('a mortgage series repays today\'s principal at save and leaves the next one to its date', async ({ page }) => {
  test.setTimeout(120_000);
  const dialog = await openNewDebt(page);
  await dialog.locator('#amount').fill(String(INSTALMENT));
  await dialog.locator('#categoryId').click();
  await dialog.getByRole('button', { name: CATEGORY_NAME, exact: true }).click();
  await dialog.locator('#notes').fill(NOTE);
  await dialog.locator('#linkedCashAssetId').click();
  await page.getByRole('option', { name: /^Conto Corrente/ }).click();
  await dialog.locator('#debtAssetId').click();
  await page.getByRole('option', { name: HOME_NAME, exact: true }).click();
  // The split on today's debt, before the save — the figure to check against the bank's plan.
  await expect(dialog.locator('#debtAssetId-hint')).toHaveText(
    /^Alla data della rata il debito di Abitazione principale scende della quota capitale: sul debito di oggi 412,00[\s ]*€ di 1\.?012,00[\s ]*€, il resto \(600,00[\s ]*€\) sono interessi al TAN 3,6%\.$/
  );
  await dialog.getByRole('button', { name: /Impostazioni avanzate/ }).click();
  await dialog.locator('#isRecurring').click();
  await dialog.locator('#recurringCount').fill('2');
  await dialog.locator('button[type=submit]').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const db = await admin();
  const [today, next] = await rowsWith(db, NOTE);
  expect(today.data()).toMatchObject({ type: 'debt', amount: -INSTALMENT, debtAssetId: HOME_ID, debtPrincipalRepaid: 412, debtInterestPaid: 600 });
  expect(today.data().balancePending).toBeUndefined();
  expect(next.data()).toMatchObject({ debtAssetId: HOME_ID, balancePending: true });
  expect(next.data().debtPrincipalRepaid).toBeUndefined();
  // Falsifiable: the whole instalment would read 198.988, a missed settlement 200.000.
  expect((await asset(db, HOME_ID)).outstandingDebt).toBe(DEBT - 412);
  expect((await asset(db, CASH_ID)).quantity).toBeCloseTo(cashStart - INSTALMENT, 2);
});

test('Patrimonio\'s «Mutuo» tile reads the interest and the principal the year\'s instalment paid', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/dashboard/assets', { waitUntil: 'load' });
  const tile = page.getByRole('region', { name: 'Mutuo', exact: true });
  const year = new Date().getFullYear();
  // Falsifiable: without the stored interest the tile would read the year's instalments as nothing.
  await expect(tile).toContainText(
    new RegExp(`Nel ${year} hai pagato 600,00[\\s\\u00a0]*€ di interessi e rimborsato 412,00[\\s\\u00a0]*€ di capitale, in 1 rata; al ritmo di oggi il mutuo si chiude a \\p{L}+ \\d{4}\\.`, 'u'),
    { timeout: 60_000 }
  );
  await expect(tile.getByText(`Interessi ${year}`, { exact: true })).toBeVisible();
  await expect(tile).toContainText('Interessi dalle rate collegate, da ');
  await expect(tile).toContainText('TAN 3,6%.');
  // One measured year is the KPIs: no «Per anno» table yet (anchored on the KPI just seen).
  await expect(tile.getByRole('table')).toHaveCount(0);
});

test('from the second measured year the tile lists every year, the partial ones captioned', async ({ page }) => {
  test.setTimeout(120_000);
  const db = await admin();
  const year = new Date().getFullYear();
  // An instalment settled last December (a fixture: the row as the settlement leaves it).
  const now = new Date();
  await db.collection('expenses').add({
    userId: UID,
    type: 'debt',
    categoryId: CATEGORY_ID,
    categoryName: CATEGORY_NAME,
    amount: -INSTALMENT,
    currency: 'EUR',
    date: new Date(year - 1, 11, 28, 12),
    notes: 'Rata Fenicottero di dicembre',
    debtAssetId: HOME_ID,
    debtPrincipalRepaid: 410,
    debtInterestPaid: 602,
    createdAt: now,
    updatedAt: now,
  });

  await page.goto('/dashboard/assets', { waitUntil: 'load' });
  const table = page.getByRole('region', { name: 'Mutuo', exact: true }).getByRole('table');
  await expect(table).toBeVisible({ timeout: 60_000 });
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  // Newest first; the running year is «finora», the first measured one starts at the link.
  await expect(rows.nth(0)).toContainText(`${year}finora`);
  await expect(rows.nth(0)).toContainText(/600,00[\s\u00a0]*€/);
  await expect(rows.nth(1)).toContainText(`${year - 1}da dicembre`);
  await expect(rows.nth(1)).toContainText(/602,00[\s\u00a0]*€/);
  await expect(page.getByRole('region', { name: 'Mutuo', exact: true })).toContainText(/1\.?202,00[\s\u00a0]*€ dal collegamento/);
});

test('deleting the whole series gives the debt back what each instalment repaid', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/dashboard/cashflow', { waitUntil: 'load' });
  const movimenti = page.getByRole('region', { name: 'Movimenti' });
  await movimenti.waitFor({ timeout: 60_000 });
  await movimenti.getByRole('tab', { name: 'Tabella' }).click();
  await movimenti.getByRole('table').getByRole('button', { name: `Elimina ${NOTE} o la sua serie`, exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tutta la serie' }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 30_000 });

  const db = await admin();
  await expect.poll(async () => (await rowsWith(db, NOTE)).length).toBe(0);
  // Only today's instalment had repaid anything (412 €); the pending one gives nothing back.
  expect((await asset(db, HOME_ID)).outstandingDebt).toBe(DEBT);
  expect((await asset(db, CASH_ID)).quantity).toBeCloseTo(cashStart, 2);
});

test('«Collega la serie al mutuo» links the instalments still to come and leaves the past alone', async ({ page }) => {
  test.setTimeout(120_000);
  const db = await admin();
  // A mortgage entered before the link existed: today's instalment and two to come, no property.
  const parentId = 'e2e-mortgage-legacy';
  const at = (monthsAhead: number) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setMonth(date.getMonth() + monthsAhead);
    return date;
  };
  const now = new Date();
  for (const monthsAhead of [0, 1, 2]) {
    await db.collection('expenses').add({
      userId: UID,
      type: 'debt',
      categoryId: CATEGORY_ID,
      categoryName: CATEGORY_NAME,
      amount: -INSTALMENT,
      currency: 'EUR',
      date: at(monthsAhead),
      notes: LEGACY_NOTE,
      isRecurring: true,
      recurringFrequency: 'monthly',
      recurringDay: at(0).getDate(),
      recurringParentId: parentId,
      createdAt: now,
      updatedAt: now,
    });
  }

  await page.goto('/dashboard/cashflow', { waitUntil: 'load' });
  const movimenti = page.getByRole('region', { name: 'Movimenti' });
  await movimenti.waitFor({ timeout: 60_000 });
  await movimenti.getByRole('tab', { name: 'Feed' }).click();
  await movimenti.getByRole('button', { name: new RegExp(`^${LEGACY_NOTE}, `) }).first().click();
  const detail = page.getByRole('dialog');
  await expect(detail.getByRole('button', { name: 'Collega la serie al mutuo…' })).toBeVisible();
  await detail.getByRole('button', { name: 'Collega la serie al mutuo…' }).click();

  const link = page.getByRole('dialog');
  await expect(link.getByRole('heading', { name: 'Collega la serie al mutuo', exact: true })).toBeVisible();
  await link.locator('#link-series-account').click();
  await page.getByRole('option', { name: HOME_NAME, exact: true }).click();
  await expect(link).toContainText(`ridurranno il debito di ${HOME_NAME} della loro quota capitale, ciascuna alla sua data; quella già avvenuta resta com’è.`);
  await link.getByRole('button', { name: 'Collega 2 voci' }).click();
  await expect(link).toBeHidden({ timeout: 30_000 });

  const [past, ...future] = await rowsWith(db, LEGACY_NOTE);
  expect(past.data().debtAssetId).toBeUndefined();
  for (const row of future) expect(row.data()).toMatchObject({ debtAssetId: HOME_ID, balancePending: true });
  // Nothing has come due yet: the debt has not moved.
  expect((await asset(db, HOME_ID)).outstandingDebt).toBe(DEBT);
});
