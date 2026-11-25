/**
 * Patrimonio — a new ledger instrument created while the page's cached ledger meta is `null`.
 *
 * The meta query is persisted to IndexedDB, `null` included: on an account migrated from another
 * device a restored `null` used to send a new ETF or bond down the NON-ledger path (its quantity
 * typed on the asset, no opening trade), and the first later trade replayed it from zero. Since
 * 2026-11-12 `AssetDialog` asks the server once (`fetchFreshLedgerMeta`) before choosing; since
 * 2026-11-23 the ledger path creates the instrument empty and opens «Registra operazione» on it.
 *
 * The page is made to read `null` for real: the meta is removed before the load and the migration
 * the page then fires is aborted; once that request is seen the meta is planted again with the Admin
 * SDK, so only a fresh read can find it. Asserted on Firestore: the asset created empty, then ONE
 * `buy` of 1000 from the trade form and the asset at quantity 1000. The fetch itself is pinned by __tests__/ledgerMetaFreshness.test.ts; the
 * races of the server writes by __tests__/assetTransactionsRoutes.test.ts — a browser cannot drive
 * them. Restores the meta it read (or removes the one it planted) and removes what it created.
 */

import { test, expect } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const TICKER = 'ORNITORINCO-META';

test.setTimeout(180_000);

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

async function removeCreated(db: FirebaseFirestore.Firestore) {
  const assets = await db.collection('assets').where('userId', '==', UID).where('ticker', '==', TICKER).get();
  for (const asset of assets.docs) {
    const trades = await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', asset.id).get();
    for (const trade of trades.docs) await trade.ref.delete();
    await asset.ref.delete();
  }
}

test('a new ledger instrument takes the ledger path when the cached meta is null but the server holds one', async ({ page }) => {
  const db = await admin();
  await removeCreated(db);
  const metaRef = db.collection('assetTransactionsMeta').doc(UID);
  const storedMeta = await metaRef.get();
  await metaRef.delete();

  try {
    await page.route('**/api/asset-transactions/migrate', (route) => route.abort());
    const migrationAttempt = page.waitForRequest('**/api/asset-transactions/migrate');
    await page.goto('/dashboard/assets', { waitUntil: 'load' });
    // The page fires the migration only after reading a null meta: the read is done.
    await migrationAttempt;

    const now = new Date();
    await metaRef.set({ userId: UID, migratedAt: now, baselineDate: new Date(2025, 0, 1), migratedAssetCount: 0, createdAt: now, updatedAt: now });

    await page.getByRole('button', { name: 'Aggiungi asset' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /Obbligazione/ }).click();
    await dialog.locator('#ticker').fill(TICKER);
    await dialog.locator('#name').fill('BTP Ornitorinco Meta');
    await dialog.getByRole('button', { name: 'Crea e registra l’acquisto' }).click();
    // The fresh read found the ledger: the instrument is created empty and the trade form opens.
    const buy = page.getByRole('dialog', { name: 'Registra operazione' });
    await expect(buy).toBeVisible({ timeout: 90_000 });
    let created = await db.collection('assets').where('userId', '==', UID).where('ticker', '==', TICKER).get();
    expect(created.size).toBe(1);
    expect(created.docs[0].data()).toMatchObject({ quantity: 0, createdEmpty: true });
    await buy.locator('#trade-quantity').fill('1000');
    await buy.locator('#trade-price').fill('100');
    await buy.getByRole('button', { name: 'Registra operazione' }).click();
    await expect(buy).toBeHidden({ timeout: 60_000 });

    created = await db.collection('assets').where('userId', '==', UID).where('ticker', '==', TICKER).get();
    expect(created.docs[0].data().quantity).toBe(1000);
    const trades = await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', created.docs[0].id).get();
    expect(trades.size).toBe(1);
    expect(trades.docs[0].data()).toMatchObject({ type: 'buy', quantity: 1000 });
  } finally {
    await removeCreated(db);
    if (storedMeta.exists) await metaRef.set(storedMeta.data()!);
    else await metaRef.delete();
  }
});
