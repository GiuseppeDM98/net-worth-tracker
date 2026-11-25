/**
 * Patrimonio · Registro operazioni — a trade's fee is a spending row of its own, out of the PMC
 * (2026-11-12, lib/utils/tradeFeeExpense.ts). Desktop 1440.
 *
 * What only a browser can prove: without a fee category the trade form's «Commissioni (€)» is off
 * and links Impostazioni › Spese; with one, a buy with a
 * fee writes ONE row in the cashflow that Tracciamento refuses to delete and whose form shows the
 * note in place of amount and date; editing the trade's fee moves the row; «Quanto costa vendere»
 * lists the fee-free PMC and the fiscal cost beside it and taxes the gain on the latter; deleting
 * the trade removes the row; the first purchase of a new instrument — in the trade form the create
 * opens (2026-11-23) — lands its fee in Tracciamento as the same locked row. Every outcome is asserted on Firestore (Admin SDK) where it is data.
 * The plan of each save belongs to Vitest (__tests__/{tradeFeeExpense,assetTransactionWriteTx}.test.ts).
 *
 * Plants its own instrument «Ornitorinco», account «Fenicottero Broker» and fee category (decoys
 * absent from the seed), names the category in the settings and RESTORES the whole settings
 * document it read (other fixtures write it too); removes everything it and the app created.
 */

import { test, expect, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const ETF_ID = 'e2e-tradefee-ornitorinco';
const ACCOUNT_ID = 'e2e-tradefee-fenicottero';
const ACCOUNT_NAME = 'Fenicottero Broker';
const FEE_CATEGORY_ID = 'e2e-tradefee-category';
const NEW_TICKER = 'ORNI-NUOVO';
const ROW_NOTE = 'Commissione su acquisto di ORNI';
const NOTE_TEXT = 'Commissione di un’operazione del registro: importo e data li tiene l’operazione, in Patrimonio, che l’ha già addebitata.';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

let savedSettings: FirebaseFirestore.DocumentData | undefined;
let plantedMeta = false;

async function feeRows(db: FirebaseFirestore.Firestore) {
  const rows = await db.collection('expenses').where('userId', '==', UID).where('categoryId', '==', FEE_CATEGORY_ID).get();
  return rows.docs.map((d) => ({ id: d.id, ...d.data() }) as { id: string; amount: number; feeOfTradeId?: string });
}

async function remove(db: FirebaseFirestore.Firestore) {
  const assets = await db.collection('assets').where('userId', '==', UID).get();
  for (const asset of assets.docs) {
    if (asset.id !== ETF_ID && asset.data().ticker !== NEW_TICKER) continue;
    const trades = await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', asset.id).get();
    for (const trade of trades.docs) await trade.ref.delete();
    await asset.ref.delete();
  }
  for (const row of await feeRows(db)) await db.collection('expenses').doc(row.id).delete();
  await db.collection('assets').doc(ACCOUNT_ID).delete();
  await db.collection('expenseCategories').doc(FEE_CATEGORY_ID).delete();
}

/** Names (or stops naming) the planted category as the fee category of Impostazioni › Spese. */
async function nameFeeCategory(db: FirebaseFirestore.Firestore, on: boolean) {
  const { FieldValue } = await import('firebase-admin/firestore');
  await db.collection('assetAllocationTargets').doc(UID).set(
    { transferFeeCategoryId: on ? FEE_CATEGORY_ID : FieldValue.delete(), transferFeeSubCategoryId: FieldValue.delete() },
    { merge: true }
  );
}

test.beforeAll(async () => {
  const db = await admin();
  await remove(db);
  savedSettings = (await db.collection('assetAllocationTargets').doc(UID).get()).data();
  const metaRef = db.collection('assetTransactionsMeta').doc(UID);
  const now = new Date();
  if (!(await metaRef.get()).exists) {
    plantedMeta = true;
    await metaRef.set({ userId: UID, migratedAt: now, baselineDate: new Date(2025, 0, 1), migratedAssetCount: 0, createdAt: now, updatedAt: now });
  }
  await db.collection('assets').doc(ETF_ID).set({
    userId: UID, ticker: 'ORNI', name: 'Ornitorinco', type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 0, currentPrice: 120, isLiquid: true, autoUpdatePrice: false, taxRate: 26, allocationRole: 'tradable',
    createdAt: now, updatedAt: now, lastPriceUpdate: now,
  });
  await db.collection('assets').doc(ACCOUNT_ID).set({
    userId: UID, ticker: '', name: ACCOUNT_NAME, type: 'cash', assetClass: 'cash', currency: 'EUR',
    quantity: 10000, currentPrice: 1, isLiquid: true, autoUpdatePrice: false, createdAt: now, updatedAt: now, lastPriceUpdate: now,
  });
  await db.collection('expenseCategories').doc(FEE_CATEGORY_ID).set({
    userId: UID, name: 'Commissioni Ornitorinco', type: 'variable', subCategories: [], createdAt: now, updatedAt: now,
  });
  await nameFeeCategory(db, false);
});

test.afterAll(async () => {
  const db = await admin();
  await remove(db);
  const settingsRef = db.collection('assetAllocationTargets').doc(UID);
  if (savedSettings) await settingsRef.set(savedSettings);
  else await settingsRef.delete();
  if (plantedMeta) await db.collection('assetTransactionsMeta').doc(UID).delete();
});

async function openPatrimonio(page: Page) {
  await page.goto('/dashboard/assets', { waitUntil: 'load' });
  const row = page.getByRole('row').filter({ hasText: 'Ornitorinco' }).first();
  await expect(row).toBeVisible({ timeout: 90_000 });
  return row;
}

async function openCashflowTable(page: Page) {
  await page.goto('/dashboard/cashflow', { waitUntil: 'load' });
  const movimenti = page.getByRole('region', { name: 'Movimenti' });
  await movimenti.waitFor({ timeout: 60_000 });
  await movimenti.getByRole('tab', { name: 'Tabella' }).click();
  return movimenti.getByRole('table');
}

test('a trade’s fee becomes a locked spending row that follows the trade, out of the PMC', async ({ page }) => {
  const db = await admin();

  // ── 1. No fee category: the field is off and links Impostazioni › Spese ──
  let row = await openPatrimonio(page);
  await row.getByRole('button', { name: 'Registra operazione su Ornitorinco' }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.locator('#trade-fees')).toBeDisabled();
  await expect(dialog.getByRole('link', { name: 'Impostazioni › Spese' })).toHaveAttribute('href', '/dashboard/settings?tab=spese');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // ── 2. With the category: a buy of 10 at 100 with a fee of 5 writes ONE row ──
  await nameFeeCategory(db, true);
  row = await openPatrimonio(page);
  await row.getByRole('button', { name: 'Registra operazione su Ornitorinco' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.locator('#trade-fees')).toBeEnabled({ timeout: 30_000 });
  await expect(dialog.locator('#trade-fees-hint')).toHaveText(/diventa una spesa in Commissioni Ornitorinco/);
  await dialog.locator('#trade-quantity').fill('10');
  await dialog.locator('#trade-price').fill('100');
  await dialog.locator('#trade-fees').fill('5');
  await dialog.getByRole('combobox', { name: 'Conto di regolamento' }).click();
  await page.getByRole('option', { name: ACCOUNT_NAME }).click();
  await dialog.getByRole('button', { name: 'Registra operazione' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });

  const [buy] = (await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', ETF_ID).get()).docs;
  let rows = await feeRows(db);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ amount: -5, feeOfTradeId: buy.id });
  expect(buy.data().feeExpenseId).toBe(rows[0].id);
  expect((await db.collection('assets').doc(ACCOUNT_ID).get()).data()?.quantity).toBe(8995); // the fee leaves once
  expect((await db.collection('assets').doc(ETF_ID).get()).data()).toMatchObject({ averageCostEur: 100, fiscalAverageCostEur: 100.5 });

  // ── 3. Tracciamento: the row's delete is refused, its form names the trade instead of amount and date ──
  const table = await openCashflowTable(page);
  const deleteButton = table.getByRole('button', { name: `Elimina ${ROW_NOTE} — Si elimina con la sua operazione, in Patrimonio` });
  await expect(deleteButton).toBeDisabled();
  await expect(deleteButton).toHaveAttribute('title', 'Si elimina con la sua operazione, in Patrimonio');
  await table.getByRole('button', { name: `Modifica ${ROW_NOTE}`, exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByText(NOTE_TEXT)).toBeVisible();
  await expect(dialog.locator('#amount')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // ── 4. «Quanto costa vendere»: the PMC without the fee, the fiscal cost with it, the gain on the latter ──
  row = await openPatrimonio(page);
  await row.getByRole('button', { name: 'Calcola plusvalenze di Ornitorinco' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByText('PMC', { exact: true }).locator('..')).toContainText(/100,0000/);
  await expect(dialog.getByText('Costo fiscale', { exact: true }).locator('..')).toContainText(/100,5000/);
  await dialog.locator('#quantity').fill('10');
  await expect(dialog.getByText('Plusvalenza', { exact: true }).locator('..')).toContainText(/195,00/); // 1200 − 1005
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // ── 5. The trade's fee 5 → 8: the row follows ──
  await row.getByRole('button', { name: 'Movimenti di Ornitorinco' }).click();
  const movements = page.getByRole('dialog', { name: 'Movimenti' });
  await movements.getByRole('button', { name: 'Modifica operazione' }).first().click();
  const edit = page.getByRole('dialog', { name: 'Modifica operazione' });
  await expect(edit.locator('#trade-fees-hint')).toHaveText(/è la sua spesa in Cashflow/);
  await edit.locator('#trade-fees').fill('8');
  await edit.getByRole('button', { name: 'Salva modifiche' }).click();
  await expect(edit).toBeHidden({ timeout: 60_000 });
  await expect.poll(async () => (await feeRows(db)).map((r) => r.amount), { timeout: 30_000 }).toEqual([-8]);

  // ── 6. The trade deleted: its row leaves with it ──
  row = await openPatrimonio(page);
  await row.getByRole('button', { name: 'Movimenti di Ornitorinco' }).click();
  const remove = page.getByRole('dialog', { name: 'Movimenti' }).getByRole('button', { name: 'Elimina operazione' }).first();
  await remove.click();
  await page.getByRole('dialog', { name: 'Movimenti' }).getByRole('button', { name: /^Premi di nuovo per / }).first().click();
  await expect.poll(async () => (await feeRows(db)).length, { timeout: 30_000 }).toBe(0);
  rows = await feeRows(db);
  expect(rows).toEqual([]);
});

test('the first purchase of a new instrument takes its fee, as a row like any trade’s', async ({ page }) => {
  const db = await admin();
  await nameFeeCategory(db, true);

  // ── 1–2. «Ornitorinco Nuovo» created empty; the trade form it opens buys 10 × 100 with a fee of 5 on
  //    «Fenicottero Broker» (2026-11-23: one form for every purchase) ──
  const accountBefore = (await db.collection('assets').doc(ACCOUNT_ID).get()).data()!.quantity as number;
  await openPatrimonio(page);
  await page.getByRole('button', { name: 'Aggiungi asset' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: /^ETF/ }).click();
  await dialog.locator('#ticker').fill(NEW_TICKER);
  await dialog.locator('#name').fill('Ornitorinco Nuovo');
  await dialog.getByRole('button', { name: 'Crea e registra l’acquisto' }).click();
  const buy = page.getByRole('dialog', { name: 'Registra operazione' });
  await expect(buy).toBeVisible({ timeout: 90_000 });
  await buy.locator('#trade-quantity').fill('10');
  await buy.locator('#trade-price').fill('100');
  await buy.getByRole('combobox', { name: 'Conto di regolamento' }).click();
  await page.getByRole('option', { name: ACCOUNT_NAME }).click();
  await expect(buy.locator('#trade-fees')).toBeEnabled({ timeout: 30_000 });
  await buy.locator('#trade-fees').fill('5');
  await buy.getByRole('button', { name: 'Registra operazione' }).click();
  await expect(buy).toBeHidden({ timeout: 60_000 });

  const [created] = (await db.collection('assets').where('userId', '==', UID).where('ticker', '==', NEW_TICKER).get()).docs;
  const trades = (await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', created.id).get()).docs;
  expect(trades.map((t) => t.data())).toEqual([expect.objectContaining({ type: 'buy', quantity: 10, fees: 5 })]);
  const rows = await feeRows(db);
  expect(rows).toEqual([expect.objectContaining({ amount: -5, feeOfTradeId: trades[0].id })]);
  expect((await db.collection('assets').doc(ACCOUNT_ID).get()).data()?.quantity).toBe(accountBefore - 1005);

  // ── 3. Its «Movimenti» hold the one buy, with its fee and its row (the 1440 table has no fee
  //    column: the trade's own form shows it) ──
  const row = page.getByRole('row').filter({ hasText: 'Ornitorinco Nuovo' }).first();
  await row.getByRole('button', { name: 'Movimenti di Ornitorinco Nuovo' }).click();
  const edits = page.getByRole('dialog', { name: 'Movimenti' }).getByRole('button', { name: 'Modifica operazione' });
  await expect(edits).toHaveCount(1);
  await edits.click();
  const edit = page.getByRole('dialog', { name: 'Modifica operazione' });
  await expect(edit.locator('#trade-fees')).toHaveValue('5');
  await expect(edit.locator('#trade-fees-hint')).toHaveText(/è la sua spesa in Cashflow/);
  await page.keyboard.press('Escape');
  await expect(edit).toBeHidden();

  // ── 4. Tracciamento holds its row of 5,00 €, locked like any trade's fee row (2026-11-15: until then
  //    this test read the row from Firestore only) ──
  const table = await openCashflowTable(page);
  const openingRowNote = `Commissione su acquisto di ${NEW_TICKER}`;
  await expect(table.getByRole('row').filter({ hasText: openingRowNote })).toHaveCount(1);
  await expect(table.getByRole('row').filter({ hasText: openingRowNote })).toContainText(/5,00/);
  await expect(
    table.getByRole('button', { name: `Elimina ${openingRowNote} — Si elimina con la sua operazione, in Patrimonio` })
  ).toBeDisabled();
});
