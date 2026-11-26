/**
 * Patrimonio — a trade in a foreign currency (2026-11-23). Desktop 1440.
 *
 * What only a browser can prove: a new USD stock created from «Aggiungi asset» opens «Registra
 * operazione» by itself (one form for every purchase); a buy of 10 at 50 USD with a 5 USD fee and the
 * broker's «Totale addebitato in euro» of 460,00 takes EXACTLY 460,00 € from the account; Movimenti
 * names the rate «dal totale dell'estratto»; the instrument sits in Strumenti.
 *
 * Nothing here depends on what Frankfurter answers: the currency is picked by hand (the ticker's
 * lookup never overrides a pick), the server reads the day's rate only for its 25% guard, and the
 * total implies EUR/USD 1,0978 — inside that guard for any fixing between 0,88 and 1,37, and
 * accepted when the service does not answer. The rate line of the preview is D1's (Vitest).
 *
 * Plants a euro account «Ornitorinco Broker» and a fee category named in the settings (the whole
 * settings document read first and restored), the ledger meta when absent; removes the operation
 * through the app and everything else by id.
 */

import { test, expect, type Page } from '@playwright/test';
import { pointAdminAtEmulator } from './emulator';

pointAdminAtEmulator();

const UID = 'test-user-1';
const ACCOUNT_ID = 'e2e-fx-ornitorinco-broker';
const ACCOUNT_NAME = 'Ornitorinco Broker';
const FEE_CATEGORY_ID = 'e2e-fx-fee-category';
const TICKER = 'ORNI-FX';
const NAME = 'Ornitorinco Dollari';

test.setTimeout(240_000);

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

let savedSettings: FirebaseFirestore.DocumentData | undefined;
let plantedMeta = false;

async function remove(db: FirebaseFirestore.Firestore) {
  const assets = await db.collection('assets').where('userId', '==', UID).where('ticker', '==', TICKER).get();
  for (const asset of assets.docs) {
    const trades = await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', asset.id).get();
    for (const trade of trades.docs) await trade.ref.delete();
    await asset.ref.delete();
  }
  const rows = await db.collection('expenses').where('userId', '==', UID).where('categoryId', '==', FEE_CATEGORY_ID).get();
  for (const row of rows.docs) await row.ref.delete();
  await db.collection('assets').doc(ACCOUNT_ID).delete();
  await db.collection('expenseCategories').doc(FEE_CATEGORY_ID).delete();
}

test.beforeAll(async () => {
  const db = await admin();
  await remove(db);
  const settingsRef = db.collection('assetAllocationTargets').doc(UID);
  savedSettings = (await settingsRef.get()).data();
  const metaRef = db.collection('assetTransactionsMeta').doc(UID);
  const now = new Date();
  if (!(await metaRef.get()).exists) {
    plantedMeta = true;
    await metaRef.set({ userId: UID, migratedAt: now, baselineDate: new Date(2025, 0, 1), migratedAssetCount: 0, createdAt: now, updatedAt: now });
  }
  await db.collection('assets').doc(ACCOUNT_ID).set({
    userId: UID, ticker: '', name: ACCOUNT_NAME, type: 'cash', assetClass: 'cash', currency: 'EUR',
    quantity: 10000, currentPrice: 1, isLiquid: true, autoUpdatePrice: false, createdAt: now, updatedAt: now, lastPriceUpdate: now,
  });
  await db.collection('expenseCategories').doc(FEE_CATEGORY_ID).set({
    userId: UID, name: 'Commissioni Ornitorinco', type: 'variable', subCategories: [], createdAt: now, updatedAt: now,
  });
  await settingsRef.set({ transferFeeCategoryId: FEE_CATEGORY_ID }, { merge: true });
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
  await expect(page.getByRole('button', { name: 'Aggiungi asset' })).toBeVisible({ timeout: 90_000 });
}

test('a USD buy with the statement total takes exactly that total from the account and keeps its rate', async ({ page }) => {
  const db = await admin();
  await openPatrimonio(page);

  // ── 1. A new USD stock: the create hands it to «Registra operazione» ──
  await page.getByRole('button', { name: 'Aggiungi asset' }).click();
  const assetDialog = page.getByRole('dialog');
  await assetDialog.getByRole('radio', { name: /^Azione/ }).click();
  await assetDialog.getByRole('combobox', { name: 'Valuta' }).click();
  await page.getByRole('option', { name: 'USD', exact: true }).click();
  await assetDialog.locator('#ticker').fill(TICKER);
  await assetDialog.locator('#name').fill(NAME);
  await assetDialog.locator('#manualPrice').fill('50');
  await assetDialog.getByRole('button', { name: 'Crea e registra l’acquisto' }).click();

  const trade = page.getByRole('dialog', { name: 'Registra operazione' });
  await expect(trade).toBeVisible({ timeout: 90_000 });
  const [created] = (await db.collection('assets').where('userId', '==', UID).where('ticker', '==', TICKER).get()).docs;
  expect(created.data()).toMatchObject({ currency: 'USD', quantity: 0, createdEmpty: true });

  // ── 2. The buy: 10 × 50 USD, fee 5 USD, «Totale addebitato in euro» 460,00 on the euro account ──
  await expect(trade.getByLabel('Commissioni (USD)')).toBeEnabled({ timeout: 30_000 });
  await trade.locator('#trade-quantity').fill('10');
  await trade.locator('#trade-price').fill('50');
  await trade.locator('#trade-fees').fill('5');
  await trade.locator('#trade-settled-total').fill('460');
  await expect(trade.getByText('Cambio dal tuo totale: EUR/USD 1,0978')).toBeVisible();
  await trade.getByRole('combobox', { name: 'Conto di regolamento' }).click();
  await page.getByRole('option', { name: ACCOUNT_NAME }).click();
  await trade.getByRole('button', { name: 'Registra operazione' }).click();
  await expect(trade).toBeHidden({ timeout: 60_000 });

  // The account fell by exactly the statement's total; the trade keeps both inputs and the rate.
  await expect.poll(async () => (await db.collection('assets').doc(ACCOUNT_ID).get()).data()?.quantity, { timeout: 30_000 }).toBe(9540);
  const trades = (await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', created.id).get()).docs;
  expect(trades).toHaveLength(1);
  expect(trades[0].data()).toMatchObject({ type: 'buy', quantity: 10, pricePerUnit: 50, feesNative: 5, fees: 4.55, settledTotalEur: 460, fxSource: 'statement' });
  expect(trades[0].data().fxRate).toBeCloseTo(460 / 505, 10);

  // ── 3. Strumenti holds it; Movimenti names the rate ──
  await openPatrimonio(page);
  const row = page.getByRole('row').filter({ hasText: NAME }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.getByRole('button', { name: `Movimenti di ${NAME}` }).click();
  const movements = page.getByRole('dialog', { name: 'Movimenti' });
  await expect(movements.getByRole('table').getByText("EUR/USD 1,0978 · dal totale dell'estratto")).toBeVisible();

  // ── 4. The operation removed through the app (its fee row leaves with it) ──
  await movements.getByRole('button', { name: 'Elimina operazione' }).first().click();
  await movements.getByRole('button', { name: /^Premi di nuovo per / }).first().click();
  await expect
    .poll(async () => (await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', created.id).get()).size, { timeout: 30_000 })
    .toBe(0);
});
