/**
 * Patrimonio · Registro operazioni — a sale credits its account NET of the tax the broker withheld,
 * and the asset form asks where an instrument's dividends are credited. Desktop 1440.
 *
 * What only a browser can prove (2026-09-20): «Tasse trattenute» appears on a sale only, is
 * prefilled with the estimate and FOLLOWS it until the owner types; once typed the owner's figure
 * stays while quantity changes; the summary prints the credit the account will receive; the save
 * stores the typed tax on the trade and moves the account by proceeds − fees − tax. And the asset
 * form's «Conto di accredito» writes `dividendCashAssetId` and REMOVES it on «Predefinito» (the
 * `deleteField()` path of `updateAssetMetadata`, which only the client SDK against the rules
 * exercises). Every outcome is asserted on Firestore (Admin SDK), never on the look of the page.
 * The arithmetic lives in __tests__/{assetTransactionUtils,saleTax,periodSales,dividendAccount}.test.ts.
 *
 * Falsified once each (the spec went red): the tax dropped from `computeCashDelta`; the prefill
 * effect ignoring `isTaxTyped`; the clear-guard removed from `updateAssetMetadata`.
 *
 * The test plants its own instrument and account (decoy names absent from the seed) and removes
 * what it and the app created in `finally` — data-only, never a re-seed
 * (doc/guide/e2e-emulatori.md § Browser-Driven E2E (Playwright)).
 */

import { test, expect, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const ETF_ID = 'e2e-saletax-tapiro';
const ACCOUNT_ID = 'e2e-saletax-fenicottero';

test.setTimeout(240_000);

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

/** 10 units bought at 100 € (26% rate) and an account holding 1.000 €. */
async function plant(db: FirebaseFirestore.Firestore) {
  const now = new Date();
  await db.collection('assets').doc(ETF_ID).set({
    userId: UID, ticker: 'TAPIRO', name: 'Tapiro ETF', type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 10, averageCost: 100, averageCostEur: 100, currentPrice: 150, isLiquid: true, autoUpdatePrice: false,
    taxRate: 26, allocationRole: 'tradable', createdAt: now, updatedAt: now, lastPriceUpdate: now,
  });
  await db.collection('assetTransactions').doc(`${ETF_ID}-baseline`).set({
    userId: UID, assetId: ETF_ID, type: 'buy', date: new Date(2026, 0, 2), quantity: 10,
    pricePerUnit: 100, priceEur: 100, isBaseline: true, createdAt: now, updatedAt: now,
  });
  await db.collection('assets').doc(ACCOUNT_ID).set({
    userId: UID, ticker: '', name: 'Fenicottero Broker', type: 'cash', assetClass: 'cash', currency: 'EUR',
    quantity: 1000, currentPrice: 1, isLiquid: true, autoUpdatePrice: false, createdAt: now, updatedAt: now, lastPriceUpdate: now,
  });
}

async function remove(db: FirebaseFirestore.Firestore) {
  const trades = await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', ETF_ID).get();
  for (const trade of trades.docs) await trade.ref.delete();
  await db.collection('assets').doc(ETF_ID).delete();
  await db.collection('assets').doc(ACCOUNT_ID).delete();
}

async function openPatrimonio(page: Page) {
  await page.goto('/dashboard/assets', { waitUntil: 'load' });
  await expect(page.getByRole('row').filter({ hasText: 'Tapiro' })).toBeVisible({ timeout: 90_000 });
}

test('a sale credits its account net of the withheld tax, and an instrument keeps its dividend account', async ({ page }) => {
  const db = await admin();
  await remove(db);
  const metaRef = db.collection('assetTransactionsMeta').doc(UID);
  const plantedMeta = !(await metaRef.get()).exists;
  if (plantedMeta) {
    const now = new Date();
    await metaRef.set({ userId: UID, migratedAt: now, baselineDate: new Date(2025, 0, 1), migratedAssetCount: 0, createdAt: now, updatedAt: now });
  }
  await plant(db);

  try {
    await openPatrimonio(page);
    const row = page.getByRole('row').filter({ hasText: 'Tapiro' });
    const dialog = page.getByRole('dialog');

    // ── 1. The sale form: the field is a sale's, prefilled, and follows the estimate ──
    await row.getByRole('button', { name: /^Registra operazione su / }).click();
    await expect(dialog.locator('#trade-quantity')).toBeVisible();
    await expect(dialog.locator('#trade-withheld-tax')).toHaveCount(0); // «Compra» asks no tax
    await dialog.getByRole('radio', { name: 'Vendi' }).click();
    const tax = dialog.locator('#trade-withheld-tax');
    await dialog.locator('#trade-quantity').fill('2');
    await dialog.locator('#trade-price').fill('150');
    await expect(tax).toHaveValue('26'); // (150 − 100) × 2 × 26%
    // Half the position: a sold-out instrument leaves the Strumenti table, and step 3 edits it.
    await dialog.locator('#trade-quantity').fill('5');
    await dialog.locator('#trade-fees').fill('5');
    await expect(tax).toHaveValue('65'); // (750 − 500) × 26%: the tax base carries no commission

    // ── 2. Typed, the owner's figure stays; the summary prints what the account receives ──
    await tax.fill('70');
    await dialog.locator('#trade-quantity').fill('4');
    await dialog.locator('#trade-quantity').fill('5');
    await expect(tax).toHaveValue('70');
    await dialog.getByRole('combobox', { name: 'Conto di regolamento' }).click();
    await page.getByRole('option', { name: 'Fenicottero Broker' }).click();
    await expect(dialog.getByText('Accredito sul conto', { exact: true }).locator('..')).toContainText(/675,00/);

    await dialog.getByRole('button', { name: 'Registra operazione' }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    const trades = await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', ETF_ID).get();
    const sell = trades.docs.map((d) => d.data()).find((t) => t.type === 'sell');
    expect(sell?.withheldTaxEur).toBe(70);
    expect((await db.collection('assets').doc(ACCOUNT_ID).get()).data()?.quantity).toBeCloseTo(1675, 9); // 1000 + 750 − 5 − 70

    // ── 3. The asset form: the dividend account is written, then REMOVED on «Predefinito» ──
    await row.getByRole('button', { name: /^Modifica / }).click();
    const picker = dialog.getByRole('combobox', { name: 'Conto di accredito dei pagamenti' });
    await expect(picker).toContainText('Predefinito');
    await picker.click();
    await page.getByRole('option', { name: 'Fenicottero Broker' }).click();
    await dialog.getByRole('button', { name: 'Salva modifiche' }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
    expect((await db.collection('assets').doc(ETF_ID).get()).data()?.dividendCashAssetId).toBe(ACCOUNT_ID);

    await row.getByRole('button', { name: /^Modifica / }).click();
    await expect(picker).toContainText('Fenicottero Broker');
    await picker.click();
    await page.getByRole('option', { name: /^Predefinito/ }).click();
    await dialog.getByRole('button', { name: 'Salva modifiche' }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
    expect((await db.collection('assets').doc(ETF_ID).get()).data()).not.toHaveProperty('dividendCashAssetId');
  } finally {
    await remove(db);
    if (plantedMeta) await metaRef.delete();
  }
});
