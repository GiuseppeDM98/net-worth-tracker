/**
 * Cashflow — the fee of a row, in a real browser (2026-09-25 on a transfer, lib/utils/expenseFee.ts;
 * on any row and on every occurrence of a series since 2026-10-10), and a transfer that lands on a
 * property (a deposit on a house, 2026-10-10): a plain spesa and a two-row series take a fee each,
 * the fixture plants «Casa Tarsio» at price 1 (the shape a transfer can land on).
 *
 * What only a browser can prove here: that the setting chosen in Impostazioni › Spese survives a
 * hard reload (the half of the round trip `settingsRoundTrip` cannot see), that without it the
 * form's «Commissione» is off and links there, and that the fee lives the whole life of its
 * transfer through the app's own paths — created with it in one batch, edited from it, cleared,
 * re-created, and deleted with it — each step read back from Firestore, balances included. The
 * arithmetic of the plans belongs to Vitest (`expenseFee.test.ts`).
 *
 * Runs on the base seed (`test@example.com`, «Conto Corrente» = `seed-cash`). It plants a second
 * account «Conto Fenicottero» and a spending category «Commissioni Ornitorinco» (decoys absent
 * from the seed), and RESTORES the WHOLE settings document it read, which other fixtures also write
 * (AGENTS.md → a spec that edits a shared document restores, never deletes): «Salva» rewrites every
 * field the page holds, the allocation `targets` included — the page drops the seed's sub-targets,
 * and on 2026-09-25 restoring only the two fee fields left Allocazione's spec with no class to open.
 */
import { test, expect, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const ORIGIN_ID = 'seed-cash';
const DEST_ID = 'e2e-fee-dest';
const DEST_NAME = 'Conto Fenicottero';
const FEE_CATEGORY_ID = 'e2e-fee-category';
const FEE_CATEGORY_NAME = 'Commissioni Ornitorinco';
const NOTE = 'Giro Fenicottero';
const SPESA_NOTE = 'Bonifico Ornitorinco';
const SERIES_NOTE = 'Rata Tarsio';
const DEPOSIT_NOTE = 'Caparra Tarsio';
const HOUSE_ID = 'e2e-fee-house';
const HOUSE_NAME = 'Casa Tarsio';
const AMOUNT = 137.29;
const DEST_START = 1000;

test.describe.configure({ mode: 'serial' });

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

async function quantityOf(db: FirebaseFirestore.Firestore, assetId: string): Promise<number> {
  return (await db.collection('assets').doc(assetId).get()).data()!.quantity as number;
}

/** The planted transfer and the fee row it points at (null when it points at none). */
async function plantedPair(db: FirebaseFirestore.Firestore) {
  const rows = await db.collection('expenses').where('userId', '==', UID).where('notes', '==', NOTE).get();
  const transfer = rows.docs[0] ?? null;
  const feeId = transfer?.data().transferFeeExpenseId as string | undefined;
  const fee = feeId ? await db.collection('expenses').doc(feeId).get() : null;
  return { count: rows.size, transfer, fee: fee?.exists ? fee : null, feeId };
}

async function openTable(page: Page) {
  await page.goto('/dashboard/cashflow', { waitUntil: 'load' });
  const movimenti = page.getByRole('region', { name: 'Movimenti' });
  await movimenti.waitFor({ timeout: 60_000 });
  await movimenti.getByRole('tab', { name: 'Tabella' }).click();
  return movimenti.getByRole('table');
}

async function openNewTransfer(page: Page) {
  await page.goto('/dashboard/cashflow', { waitUntil: 'load' });
  await page.getByRole('region', { name: 'Movimenti' }).waitFor({ timeout: 60_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cashflow:add-expense')));
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('radio', { name: /^Trasferimento/ }).click();
  return dialog;
}

/** Opens the planted transfer's edit form from the Tabella view and waits for its fee to be read. */
async function editPlanted(page: Page) {
  const table = await openTable(page);
  await table.getByRole('button', { name: `Modifica ${NOTE}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Modifica trasferimento', exact: true })).toBeVisible();
  await expect(dialog.locator('#fee-hint')).not.toHaveText(/Sto leggendo/);
  return dialog;
}

let originStart = 0;
let savedSettings: FirebaseFirestore.DocumentData = {};

test.beforeAll(async () => {
  const db = await admin();
  originStart = await quantityOf(db, ORIGIN_ID);
  savedSettings = (await db.collection('assetAllocationTargets').doc(UID).get()).data() ?? {};
  const { FieldValue } = await import('firebase-admin/firestore');
  // Start from «no category chosen», whatever an interrupted run left behind.
  await db.collection('assetAllocationTargets').doc(UID).update({ transferFeeCategoryId: FieldValue.delete(), transferFeeSubCategoryId: FieldValue.delete() });
  const now = new Date();
  await db.collection('assets').doc(DEST_ID).set({
    userId: UID,
    ticker: 'CASH2',
    name: DEST_NAME,
    type: 'cash',
    assetClass: 'cash',
    currency: 'EUR',
    quantity: DEST_START,
    currentPrice: 1,
    subCategory: 'Conto Corrente',
    lastPriceUpdate: now,
    createdAt: now,
    updatedAt: now,
  });
  await db.collection('expenseCategories').doc(FEE_CATEGORY_ID).set({
    userId: UID,
    name: FEE_CATEGORY_NAME,
    type: 'variable',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  });
  // A future house with no value yet, the way the form creates one: value in `quantity` at price 1.
  await db.collection('assets').doc(HOUSE_ID).set({
    userId: UID,
    ticker: '',
    name: HOUSE_NAME,
    type: 'realestate',
    assetClass: 'realestate',
    currency: 'EUR',
    quantity: 0,
    currentPrice: 1,
    isLiquid: false,
    autoUpdatePrice: false,
    allocationRole: 'excluded',
    lastPriceUpdate: now,
    createdAt: now,
    updatedAt: now,
  });
});

test.afterAll(async () => {
  const db = await admin();
  const planted = await db.collection('expenses').where('userId', '==', UID).where('notes', 'in', [NOTE, SPESA_NOTE, SERIES_NOTE, DEPOSIT_NOTE, `Commissione sul trasferimento a ${DEST_NAME}`]).get();
  for (const doc of planted.docs) await doc.ref.delete();
  const fees = await db.collection('expenses').where('userId', '==', UID).where('categoryId', '==', FEE_CATEGORY_ID).get();
  for (const doc of fees.docs) await doc.ref.delete();
  await db.collection('assets').doc(DEST_ID).delete();
  await db.collection('assets').doc(HOUSE_ID).delete();
  await db.collection('expenseCategories').doc(FEE_CATEGORY_ID).delete();
  await db.collection('assets').doc(ORIGIN_ID).update({ quantity: originStart });
  // The document as it was read, whole: «Salva» rewrote every field the page holds.
  await db.collection('assetAllocationTargets').doc(UID).set(savedSettings);
});

test('without a fee category the field is off and links Impostazioni; the category chosen there survives a reload', async ({ page }) => {
  test.setTimeout(120_000);
  const dialog = await openNewTransfer(page);
  await expect(dialog.locator('#fee')).toBeDisabled();
  const link = dialog.getByRole('link', { name: 'Impostazioni › Spese' });
  await expect(link).toHaveAttribute('href', '/dashboard/settings?tab=spese');

  await page.goto('/dashboard/settings?tab=spese', { waitUntil: 'load' });
  const tile = page.getByRole('region', { name: 'Commissioni bancarie' });
  await expect(tile).toContainText('Senza una categoria, il campo «Commissione» del form spesa resta spento.', { timeout: 60_000 });
  await tile.getByRole('combobox', { name: 'Categoria delle commissioni bancarie', exact: true }).click();
  await page.getByRole('option', { name: FEE_CATEGORY_NAME, exact: true }).click();
  await page.locator('button:visible', { hasText: /^Salva$/ }).first().click();
  await expect(page.getByText('Impostazioni salvate')).toBeVisible({ timeout: 30_000 });

  // Only a hard reload proves the READ half of the round trip (doc/guide/impostazioni.md).
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByRole('region', { name: 'Commissioni bancarie' })).toContainText(
    `La commissione scritta su una voce diventa una spesa in ${FEE_CATEGORY_NAME}, addebitata sul suo conto alla sua data; su una serie, una per ogni voce.`,
    { timeout: 60_000 }
  );
  const db = await admin();
  expect((await db.collection('assetAllocationTargets').doc(UID).get()).data()!.transferFeeCategoryId).toBe(FEE_CATEGORY_ID);
});

test('a transfer with a fee writes two linked rows and debits the origin by both', async ({ page }) => {
  test.setTimeout(120_000);
  const dialog = await openNewTransfer(page);
  await dialog.locator('#amount').fill(String(AMOUNT));
  await dialog.locator('#notes').fill(NOTE);
  await dialog.locator('#linkedCashAssetId').click();
  await page.getByRole('option', { name: /^Conto Corrente/ }).click();
  await dialog.locator('#transferCashAssetId').click();
  await page.getByRole('option', { name: new RegExp(`^${DEST_NAME}`) }).click();
  await expect(dialog.locator('#fee')).toBeEnabled();
  await dialog.locator('#fee').fill('1.5');
  await expect(dialog.locator('#fee-hint')).toHaveText(
    new RegExp(`^Dal conto di origine escono 1,50[\\s\\u00a0]*€ in più: una spesa in ${FEE_CATEGORY_NAME} alla data del trasferimento\\.$`)
  );
  await dialog.locator('button[type=submit]').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const db = await admin();
  const { count, transfer, fee } = await plantedPair(db);
  expect(count).toBe(1);
  expect(transfer!.data()).toMatchObject({ type: 'transfer', amount: AMOUNT, linkedCashAssetId: ORIGIN_ID, transferCashAssetId: DEST_ID });
  expect(fee).not.toBeNull();
  expect(fee!.data()).toMatchObject({
    type: 'variable',
    amount: -1.5,
    categoryId: FEE_CATEGORY_ID,
    categoryName: FEE_CATEGORY_NAME,
    linkedCashAssetId: ORIGIN_ID,
    feeOfTransferId: transfer!.id,
    notes: `Commissione sul trasferimento a ${DEST_NAME}`,
  });
  expect(fee!.data()!.balancePending).toBeUndefined();
  expect(fee!.data()!.date.toMillis()).toBe(transfer!.data().date.toMillis());
  // Falsifiable: a fee left out of the settlement reads originStart − 137,29.
  expect(await quantityOf(db, ORIGIN_ID)).toBeCloseTo(originStart - AMOUNT - 1.5, 2);
  expect(await quantityOf(db, DEST_ID)).toBeCloseTo(DEST_START + AMOUNT, 2);
});

test('the fee is edited from its transfer: changed, cleared, then typed again', async ({ page }) => {
  test.setTimeout(150_000);
  const db = await admin();

  // Changed: the same row, the new amount, the origin debited by the difference.
  let dialog = await editPlanted(page);
  await expect(dialog.locator('#fee')).toHaveValue('1.5');
  await dialog.locator('#fee').fill('2');
  await dialog.locator('button[type=submit]').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const changed = await plantedPair(db);
  expect(changed.fee!.data()!.amount).toBe(-2);
  expect(await quantityOf(db, ORIGIN_ID)).toBeCloseTo(originStart - AMOUNT - 2, 2);

  // Cleared: the fee row deleted, the pointer gone, the origin given back what the fee paid.
  dialog = await editPlanted(page);
  await dialog.locator('#fee').fill('');
  await expect(dialog.locator('#fee-hint')).toHaveText(/^Svuotata, la commissione di 2,00[\s ]*€ viene eliminata/);
  await dialog.locator('button[type=submit]').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const cleared = await plantedPair(db);
  expect(cleared.feeId).toBeUndefined();
  expect((await db.collection('expenses').doc(changed.fee!.id).get()).exists).toBe(false);
  expect(await quantityOf(db, ORIGIN_ID)).toBeCloseTo(originStart - AMOUNT, 2);

  // Typed again on the saved transfer: a new fee row, linked both ways.
  dialog = await editPlanted(page);
  await dialog.locator('#fee').fill('3');
  await dialog.locator('button[type=submit]').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const recreated = await plantedPair(db);
  expect(recreated.fee!.data()).toMatchObject({ amount: -3, feeOfTransferId: recreated.transfer!.id, linkedCashAssetId: ORIGIN_ID });
  expect(await quantityOf(db, ORIGIN_ID)).toBeCloseTo(originStart - AMOUNT - 3, 2);
});

test('a plain spesa takes a fee too: two linked rows on the same account, the note naming the category', async ({ page }) => {
  test.setTimeout(120_000);
  const db = await admin();
  const originBefore = await quantityOf(db, ORIGIN_ID);
  await page.goto('/dashboard/cashflow', { waitUntil: 'load' });
  await page.getByRole('region', { name: 'Movimenti' }).waitFor({ timeout: 60_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cashflow:add-expense')));
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('radio', { name: /^Spesa variabile/ }).click();
  await dialog.locator('#amount').fill('80');
  await dialog.locator('#categoryId').click();
  await dialog.getByRole('button', { name: FEE_CATEGORY_NAME, exact: true }).click();
  await dialog.locator('#notes').fill(SPESA_NOTE);
  await dialog.locator('#linkedCashAssetId').click();
  await page.getByRole('option', { name: /^Conto Corrente/ }).click();
  await dialog.locator('#fee').fill('0.5');
  await expect(dialog.locator('#fee-hint')).toHaveText(
    new RegExp(`^Dal conto collegato escono 0,50[\\s\\u00a0]*€ in più: una spesa in ${FEE_CATEGORY_NAME} alla data della voce\\.$`)
  );
  await dialog.locator('button[type=submit]').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const rows = await db.collection('expenses').where('userId', '==', UID).where('notes', '==', SPESA_NOTE).get();
  expect(rows.size).toBe(1);
  const spesa = rows.docs[0];
  const fee = await db.collection('expenses').doc(spesa.data().transferFeeExpenseId as string).get();
  expect(fee.data()).toMatchObject({ type: 'variable', amount: -0.5, feeOfTransferId: spesa.id, linkedCashAssetId: ORIGIN_ID, notes: `Commissione su ${SPESA_NOTE}` });
  // Falsifiable: a fee left out of the settlement reads originBefore − 80.
  expect(await quantityOf(db, ORIGIN_ID)).toBeCloseTo(originBefore - 80 - 0.5, 2);

  // Deleted from the table: the fee goes with the spesa, and the account gets both back.
  const table = await openTable(page);
  await table.getByRole('button', { name: `Elimina ${SPESA_NOTE}`, exact: true }).click();
  await table.getByRole('button', { name: `Premi di nuovo per eliminare ${SPESA_NOTE}`, exact: true }).click();
  await expect(table.getByRole('button', { name: `Elimina ${SPESA_NOTE}`, exact: true })).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => (await db.collection('expenses').doc(fee.id).get()).exists).toBe(false);
  await expect.poll(async () => quantityOf(db, ORIGIN_ID)).toBeCloseTo(originBefore, 2);
});

test('a two-row series takes a fee on each occurrence, and deleting the series takes both fees with it', async ({ page }) => {
  test.setTimeout(150_000);
  const db = await admin();
  const originBefore = await quantityOf(db, ORIGIN_ID);
  await page.goto('/dashboard/cashflow', { waitUntil: 'load' });
  await page.getByRole('region', { name: 'Movimenti' }).waitFor({ timeout: 60_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cashflow:add-expense')));
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('radio', { name: /^Spesa variabile/ }).click();
  await dialog.locator('#amount').fill('60');
  await dialog.locator('#categoryId').click();
  await dialog.getByRole('button', { name: FEE_CATEGORY_NAME, exact: true }).click();
  await dialog.locator('#notes').fill(SERIES_NOTE);
  await dialog.locator('#linkedCashAssetId').click();
  await page.getByRole('option', { name: /^Conto Corrente/ }).click();
  await dialog.getByRole('button', { name: /Impostazioni avanzate/ }).click();
  await dialog.locator('#isRecurring').click();
  await dialog.locator('#recurringCount').fill('2');
  await dialog.locator('#fee').fill('2');
  await expect(dialog.locator('#fee-hint')).toHaveText(/^Su ogni voce della serie escono 2,00[\s ]*€ in più dal conto collegato/);
  await dialog.locator('button[type=submit]').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const rows = await db.collection('expenses').where('userId', '==', UID).where('notes', '==', SERIES_NOTE).get();
  expect(rows.size).toBe(2);
  const feeIds = rows.docs.map((row) => row.data().transferFeeExpenseId as string);
  expect(new Set(feeIds).size).toBe(2);
  for (const row of rows.docs) {
    const fee = await db.collection('expenses').doc(row.data().transferFeeExpenseId as string).get();
    expect(fee.data()).toMatchObject({ amount: -2, feeOfTransferId: row.id, linkedCashAssetId: ORIGIN_ID });
    expect(fee.data()!.date.toMillis()).toBe(row.data().date.toMillis());
    expect(fee.data()!.balancePending).toBe(row.data().balancePending);
  }
  // Today's occurrence and its fee moved the account; next month's pair waits.
  expect(await quantityOf(db, ORIGIN_ID)).toBeCloseTo(originBefore - 60 - 2, 2);

  const table = await openTable(page);
  await table.getByRole('button', { name: `Elimina ${SERIES_NOTE} o la sua serie`, exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tutta la serie' }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 30_000 });
  await expect.poll(async () => (await db.collection('expenses').where('userId', '==', UID).where('notes', '==', SERIES_NOTE).get()).size).toBe(0);
  for (const feeId of feeIds) expect((await db.collection('expenses').doc(feeId).get()).exists).toBe(false);
  await expect.poll(async () => quantityOf(db, ORIGIN_ID)).toBeCloseTo(originBefore, 2);
});

test('a transfer can land on a property: the account falls and the house\'s value rises by the deposit', async ({ page }) => {
  test.setTimeout(120_000);
  const db = await admin();
  const originBefore = await quantityOf(db, ORIGIN_ID);
  const dialog = await openNewTransfer(page);
  await dialog.locator('#amount').fill('15000');
  await dialog.locator('#notes').fill(DEPOSIT_NOTE);
  await dialog.locator('#linkedCashAssetId').click();
  await page.getByRole('option', { name: /^Conto Corrente/ }).click();
  await dialog.locator('#transferCashAssetId').click();
  await page.getByRole('option', { name: HOUSE_NAME, exact: true }).click();
  await expect(dialog.locator('#transferCashAssetId-hint')).toContainText('una caparra o un acconto non è una spesa');
  await dialog.locator('button[type=submit]').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const rows = await db.collection('expenses').where('userId', '==', UID).where('notes', '==', DEPOSIT_NOTE).get();
  expect(rows.size).toBe(1);
  expect(rows.docs[0].data()).toMatchObject({ type: 'transfer', amount: 15000, linkedCashAssetId: ORIGIN_ID, transferCashAssetId: HOUSE_ID });
  // Falsifiable: a destination skipped by the settlement leaves the house at 0.
  expect(await quantityOf(db, HOUSE_ID)).toBeCloseTo(15000, 2);
  expect(await quantityOf(db, ORIGIN_ID)).toBeCloseTo(originBefore - 15000, 2);

  // Deleted: both sides come back.
  const table = await openTable(page);
  await table.getByRole('button', { name: `Elimina ${DEPOSIT_NOTE}`, exact: true }).click();
  await table.getByRole('button', { name: `Premi di nuovo per eliminare ${DEPOSIT_NOTE}`, exact: true }).click();
  await expect(table.getByRole('button', { name: `Elimina ${DEPOSIT_NOTE}`, exact: true })).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => quantityOf(db, HOUSE_ID)).toBeCloseTo(0, 2);
  await expect.poll(async () => quantityOf(db, ORIGIN_ID)).toBeCloseTo(originBefore, 2);
});

test('deleting the transfer says the fee goes too, and takes it with the balances', async ({ page }) => {
  test.setTimeout(120_000);
  const db = await admin();
  const { fee } = await plantedPair(db);
  expect(fee).not.toBeNull();

  const table = await openTable(page);
  await table.getByRole('button', { name: `Elimina ${NOTE}`, exact: true }).click();
  await expect(table.getByText('Eliminando, i due conti tornano come prima del trasferimento, e la sua commissione con lui.')).toBeVisible();
  await table.getByRole('button', { name: `Premi di nuovo per eliminare ${NOTE}`, exact: true }).click();
  await expect(table.getByRole('button', { name: `Elimina ${NOTE}`, exact: true })).toHaveCount(0, { timeout: 30_000 });

  const after = await plantedPair(db);
  expect(after.count).toBe(0);
  expect((await db.collection('expenses').doc(fee!.id).get()).exists).toBe(false);
  expect(await quantityOf(db, ORIGIN_ID)).toBeCloseTo(originStart, 2);
  expect(await quantityOf(db, DEST_ID)).toBeCloseTo(DEST_START, 2);
});
