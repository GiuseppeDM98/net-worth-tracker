/**
 * Patrimonio at 390 — the closed group of sold-out instruments closes the phone rows (2026-11-23). Base account (`mobile` project).
 *
 * What only a browser can prove: below the rows of the open Strumenti tile there is the group
 * «1 strumento azzerato»; opened, its two actions are at least 44 px tall (the touch target of the
 * app) and the page does not scroll sideways. Seen red with a fixed 32 px height on the actions.
 *
 * The test plants its own sold-out instrument (decoy name, two ledger rows) and removes it in
 * `finally`, ledger rows first — data-only, never a re-seed.
 */
import { test, expect } from '@playwright/test';
import { pointAdminAtEmulator } from './emulator';

pointAdminAtEmulator();

const UID = 'test-user-1';
const ORNI_ID = 'e2e-archive-mobile-ornitorinco';

test.setTimeout(240_000);

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

async function remove(db: FirebaseFirestore.Firestore) {
  for (const suffix of ['buy', 'sell']) await db.collection('assetTransactions').doc(`${ORNI_ID}-${suffix}`).delete();
  await db.collection('assets').doc(ORNI_ID).delete();
}

test('the sold-out group closes the phone rows, with 44 px actions and no sideways scroll', async ({ page }) => {
  const db = await admin();
  await remove(db);
  const metaRef = db.collection('assetTransactionsMeta').doc(UID);
  const plantedMeta = !(await metaRef.get()).exists;
  const now = new Date();
  if (plantedMeta) {
    await metaRef.set({ userId: UID, migratedAt: now, baselineDate: new Date(2025, 0, 1), migratedAssetCount: 0, createdAt: now, updatedAt: now });
  }
  await db.collection('assets').doc(ORNI_ID).set({
    userId: UID, ticker: 'ORNI', name: 'Ornitorinco', type: 'etf', assetClass: 'equity', currency: 'EUR', quantity: 0,
    averageCost: 100, averageCostEur: 100, currentPrice: 110, isLiquid: true, autoUpdatePrice: false,
    allocationRole: 'tradable', createdAt: now, updatedAt: now, lastPriceUpdate: now,
  });
  const trade = (type: 'buy' | 'sell', date: Date) => ({
    userId: UID, assetId: ORNI_ID, type, date, quantity: 10, pricePerUnit: 100, priceEur: 100, createdAt: now, updatedAt: now,
  });
  await db.collection('assetTransactions').doc(`${ORNI_ID}-buy`).set(trade('buy', new Date(2026, 0, 10, 12)));
  await db.collection('assetTransactions').doc(`${ORNI_ID}-sell`).set(trade('sell', new Date(2026, 2, 9, 12)));

  try {
    await page.goto('/dashboard/assets', { waitUntil: 'load' });
    await page.locator('#patrimonio-strumenti-trigger').click({ timeout: 90_000 });
    const strumenti = page.locator('section#patrimonio-strumenti');
    const rows = strumenti.locator('button[aria-controls^="asset-row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 90_000 });

    const group = strumenti.getByRole('button', { name: '1 strumento azzerato' });
    await expect(group).toBeVisible();
    const lastRow = await rows.last().boundingBox();
    const groupBox = await group.boundingBox();
    expect(groupBox!.y, 'the group sits below the last row').toBeGreaterThan(lastRow!.y);
    await expect(strumenti.getByText('Ornitorinco')).toHaveCount(0);

    await group.click();
    await expect(strumenti.getByText(/venduto il 09\/03\/2026/)).toBeVisible();
    for (const name of ['Movimenti di Ornitorinco', 'Compra Ornitorinco']) {
      const box = await strumenti.getByRole('button', { name }).boundingBox();
      expect(box!.height, `${name} is a 44 px touch target`).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'no horizontal overflow').toBeLessThanOrEqual(0);
  } finally {
    await remove(db);
    if (plantedMeta) await metaRef.delete();
  }
});
