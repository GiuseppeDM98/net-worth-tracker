/**
 * Cashflow › Dividendi — a dividend in a foreign currency (2026-11-23). Desktop 1440.
 *
 * What only a browser can prove: a US share in dollars opens the form in USD with two withholdings
 * proposed (15% abroad, the instrument's 26% in Italy on what is left); a dividend of 0,50 USD a unit
 * on 10 units with «Netto accreditato in euro» 2,88, paid today, becomes an income row of EXACTLY
 * 2,88 € in Tracciamento; the record's details show the two withholdings and name the rate «dal
 * totale dell'estratto».
 *
 * Nothing here depends on what Frankfurter answers: the credit implies EUR/USD 1,0920 (3,145 USD
 * for 2,88 €), inside the server's 25% guard for any fixing between 0,88 and 1,46, and accepted when
 * the service does not answer. The preview line of the form is pinned by
 * `__tests__/dividendDialog.fx.test.tsx`. Seen red (2026-11-25) with `settledNetEur` not sent by the
 * form: the income became the net at the ECB rate.
 *
 * Plants «Azione Alfa» (equity, USD, ISIN US0000000001, 10 units) and an income category named in
 * the settings as the dividends' (the whole settings document read first and restored); removes the
 * dividend, its income row, the instrument and the category by id, in a loop, before and after.
 * `e2e/cashflow.dividendi.spec.ts` asserts the base account's empty page: nothing is left behind.
 */

import { test, expect, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const ASSET_ID = 'e2e-fx-azione-alfa';
const TICKER = 'ALFA';
const NAME = 'Azione Alfa';
const INCOME_CATEGORY_ID = 'e2e-fx-dividend-income';

test.setTimeout(240_000);

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

let savedSettings: FirebaseFirestore.DocumentData | undefined;

async function remove(db: FirebaseFirestore.Firestore) {
  const dividends = await db.collection('dividends').where('userId', '==', UID).where('assetId', '==', ASSET_ID).get();
  for (const dividend of dividends.docs) await dividend.ref.delete();
  const rows = await db.collection('expenses').where('userId', '==', UID).where('categoryId', '==', INCOME_CATEGORY_ID).get();
  for (const row of rows.docs) await row.ref.delete();
  await db.collection('assets').doc(ASSET_ID).delete();
  await db.collection('expenseCategories').doc(INCOME_CATEGORY_ID).delete();
}

test.beforeAll(async () => {
  const db = await admin();
  await remove(db);
  const settingsRef = db.collection('assetAllocationTargets').doc(UID);
  savedSettings = (await settingsRef.get()).data();
  const now = new Date();
  await db.collection('assets').doc(ASSET_ID).set({
    userId: UID, ticker: TICKER, name: NAME, type: 'stock', assetClass: 'equity', currency: 'USD', isin: 'US0000000001',
    quantity: 10, currentPrice: 50, averageCost: 40, taxRate: 26, autoUpdatePrice: false,
    createdAt: now, updatedAt: now, lastPriceUpdate: now,
  });
  await db.collection('expenseCategories').doc(INCOME_CATEGORY_ID).set({
    userId: UID, name: 'Dividendi Alfa', type: 'income', subCategories: [], createdAt: now, updatedAt: now,
  });
  await settingsRef.set({ dividendIncomeCategoryId: INCOME_CATEGORY_ID }, { merge: true });
});

test.afterAll(async () => {
  const db = await admin();
  await remove(db);
  const settingsRef = db.collection('assetAllocationTargets').doc(UID);
  if (savedSettings) await settingsRef.set(savedSettings);
  else await settingsRef.delete();
});

async function openDividendi(page: Page) {
  await page.goto('/dashboard/cashflow?tab=dividends');
  await expect(page.getByRole('region', { name: 'Pagamenti' })).toBeVisible({ timeout: 90_000 });
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('a USD dividend with the credited euro becomes an income of exactly that figure, with both withholdings', async ({ page }) => {
  const db = await admin();
  await openDividendi(page);

  // ── 1. The form: the instrument's currency and two withholdings proposed ──
  await page.getByRole('button', { name: 'Aggiungi dividendo', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Dividendi · Nuovo pagamento')).toBeVisible();
  await dialog.locator('#assetId').fill('Alfa');
  await dialog.getByRole('button', { name: /ALFA - Azione Alfa/ }).click();
  await expect(dialog.locator('#currency')).toHaveText('USD');
  await expect(dialog.locator('#sharesHeld')).toHaveValue('10');

  await dialog.locator('#grossAmountPerShare').fill('0.5');
  await expect(dialog.locator('#foreignWithholdingTax')).toHaveValue('0.075');
  // (0,50 − 0,075) × 26% = 0,1105.
  await expect(dialog.locator('#withholdingTax')).toHaveValue('0.1105');
  await expect(dialog.getByText('proposta al 15%')).toBeVisible();

  const today = todayIso();
  await dialog.locator('#exDate').fill(today);
  await dialog.locator('#paymentDate').fill(today);
  await dialog.locator('#settledNetEur').fill('2.88');
  await expect(dialog.getByTestId('dividend-fx-line')).toHaveText('Cambio dal tuo accredito: EUR/USD 1,0920');

  const created = page.waitForResponse((r) => r.url().endsWith('/api/dividends') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Registra pagamento', exact: true }).click();
  expect((await created).status()).toBe(200);
  await expect(dialog).toBeHidden();

  // The record: the credit IS the euro net, the foreign part beside the total tax.
  const [record] = (await db.collection('dividends').where('userId', '==', UID).where('assetId', '==', ASSET_ID).get()).docs;
  expect(record.data()).toMatchObject({ currency: 'USD', settledNetEur: 2.88, netAmountEur: 2.88, fxSource: 'statement' });
  expect(record.data().foreignTaxAmount).toBeCloseTo(0.75, 10);
  expect(record.data().taxAmount).toBeCloseTo(1.855, 10);
  await expect
    .poll(async () => (await db.collection('expenses').where('userId', '==', UID).where('categoryId', '==', INCOME_CATEGORY_ID).get()).docs.map((d) => d.data().amount), { timeout: 30_000 })
    .toEqual([2.88]);

  // ── 2. The details: two withholdings and the rate's source ──
  const pagamenti = page.getByRole('region', { name: 'Pagamenti' });
  await pagamenti.getByRole('button', { name: /^Dettagli: .*ALFA/ }).first().click();
  const details = page.getByRole('dialog');
  await expect(details.getByText('Ritenuta estera', { exact: true })).toBeVisible();
  await expect(details.getByText('Ritenuta italiana', { exact: true })).toBeVisible();
  await expect(details.getByTestId('dividend-record-fx')).toHaveText("EUR/USD 1,0920 · dal totale dell'estratto");
  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();

  // ── 3. Tracciamento: the income row is the credited euro ──
  await page.goto('/dashboard/cashflow');
  const movimenti = page.getByRole('region', { name: 'Movimenti' });
  await expect(movimenti).toBeVisible({ timeout: 90_000 });
  await movimenti.getByRole('tab', { name: 'Tabella' }).click();
  const row = movimenti.getByRole('table').getByRole('row').filter({ hasText: /2,88/ });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('2,88 €');
});
