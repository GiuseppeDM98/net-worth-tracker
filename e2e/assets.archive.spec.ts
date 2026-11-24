/**
 * Patrimonio · Strumenti — the closed group of sold-out instruments, and no deletion over a history
 * (2026-11-23). Base account, desktop 1440.
 *
 * What only a browser against the emulators can prove:
 * - An instrument at quantity 0 with trades in the Registro («ornitorinco») leaves the table for
 *   «1 strumento azzerato», closed; opened it says «venduto il 09/03/2026».
 * - One created empty with no ledger row («fenicottero») stays in the table with its «Mai comprato»
 *   chip, and its trash still arms and deletes it: the POSITIVE CONTROL of the refusal below (same
 *   route, same account, the instrument that has nothing to protect).
 * - The trash of a held instrument with a trade («ETF Alfa») does not arm: a toast says why and the
 *   row, and its Firestore document, are still there after a reload.
 * - Under the UI: a direct DELETE with the owner's token answers 409 `has-ledger-operations` with
 *   `operations: 1` and deletes nothing — the check lives on the server, not in the button.
 *
 * Every outcome is asserted on Firestore (Admin SDK) or on the route's own answer. The test plants
 * its three instruments with decoy names and removes what it planted in `finally`, the ledger rows
 * before the assets — data-only, never a re-seed (doc/guide/e2e-playwright.md).
 *
 * Falsified once each (the spec went red): the `operations > 0` branch of `DeleteButton` removed
 * (the toast assertion); the server's check removed (the direct call).
 */
import { test, expect, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const ORNI_ID = 'e2e-archive-ornitorinco';
const FENI_ID = 'e2e-archive-fenicottero';
const ALFA_ID = 'e2e-archive-etf-alfa';
const ASSET_IDS = [ORNI_ID, FENI_ID, ALFA_ID];

test.setTimeout(240_000);

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

const instrument = (name: string, ticker: string, quantity: number, extra: Record<string, unknown> = {}) => {
  const now = new Date();
  return {
    userId: UID, ticker, name, type: 'etf', assetClass: 'equity', currency: 'EUR', quantity,
    averageCost: 100, averageCostEur: 100, currentPrice: 110, isLiquid: true, autoUpdatePrice: false,
    allocationRole: 'tradable', createdAt: now, updatedAt: now, lastPriceUpdate: now, ...extra,
  };
};

const trade = (assetId: string, type: 'buy' | 'sell', date: Date, quantity: number, price: number) => {
  const now = new Date();
  return { userId: UID, assetId, type, date, quantity, pricePerUnit: price, priceEur: price, createdAt: now, updatedAt: now };
};

async function plant(db: FirebaseFirestore.Firestore) {
  await db.collection('assets').doc(ORNI_ID).set(instrument('Ornitorinco', 'ORNI', 0));
  await db.collection('assetTransactions').doc(`${ORNI_ID}-buy`).set(trade(ORNI_ID, 'buy', new Date(2026, 0, 10, 12), 10, 100));
  await db.collection('assetTransactions').doc(`${ORNI_ID}-sell`).set(trade(ORNI_ID, 'sell', new Date(2026, 2, 9, 12), 10, 110));
  await db.collection('assets').doc(FENI_ID).set(instrument('Fenicottero', 'FENI', 0, { createdEmpty: true }));
  await db.collection('assets').doc(ALFA_ID).set(instrument('ETF Alfa', 'ALFA', 5));
  await db.collection('assetTransactions').doc(`${ALFA_ID}-buy`).set(trade(ALFA_ID, 'buy', new Date(2026, 0, 10, 12), 5, 100));
}

async function remove(db: FirebaseFirestore.Firestore) {
  const trades = await db.collection('assetTransactions').where('userId', '==', UID).get();
  for (const doc of trades.docs) if (ASSET_IDS.includes(doc.get('assetId'))) await doc.ref.delete();
  for (const id of ASSET_IDS) await db.collection('assets').doc(id).delete();
}

/** The owner's ID token, from the Auth emulator: the route under test wants a Bearer. */
async function ownerToken(): Promise<string> {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'test1234', returnSecureToken: true }),
  });
  return (await response.json()).idToken as string;
}

async function openPatrimonio(page: Page) {
  await page.goto('/dashboard/assets', { waitUntil: 'load' });
  await expect(page.getByRole('row').filter({ hasText: 'ETF Alfa' })).toBeVisible({ timeout: 90_000 });
}

test('a sold-out instrument is grouped, a never-bought one is deletable, one with a trade refuses — also under the UI', async ({ page }) => {
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
    const table = page.getByRole('table');

    // ── 1. The sold-out instrument leaves the table for the closed group ──
    await expect(table.getByText('Ornitorinco')).toHaveCount(0);
    const group = page.getByRole('button', { name: '1 strumento azzerato' });
    await expect(group).toHaveAttribute('aria-expanded', 'false');
    await group.click();
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Ornitorinco')).toHaveCount(1);
    await expect(page.getByText(/venduto il 09\/03\/2026/)).toBeVisible();

    // ── 2. Never bought: in the table with its chip, and its trash deletes it (the positive control) ──
    const feniRow = table.getByRole('row').filter({ hasText: 'Fenicottero' });
    await expect(feniRow.getByText('Mai comprato')).toBeVisible();
    await feniRow.getByRole('button', { name: 'Elimina Fenicottero' }).click();
    await feniRow.getByRole('button', { name: /^Premi di nuovo per eliminare Fenicottero/ }).click();
    await expect(table.getByText('Fenicottero')).toHaveCount(0, { timeout: 30_000 });
    expect((await db.collection('assets').doc(FENI_ID).get()).exists).toBe(false);

    // ── 3. One trade: the trash does not arm, a toast says why, nothing is deleted ──
    const alfaRow = table.getByRole('row').filter({ hasText: 'ETF Alfa' });
    await alfaRow.getByRole('button', { name: 'Elimina ETF Alfa' }).click();
    await expect(page.getByText(/ETF Alfa ha 1 operazione nel registro e non si può eliminare/).first()).toBeVisible();
    await expect(alfaRow.getByRole('button', { name: /^Premi di nuovo/ })).toHaveCount(0);
    await page.reload({ waitUntil: 'load' });
    await expect(page.getByRole('row').filter({ hasText: 'ETF Alfa' })).toBeVisible({ timeout: 90_000 });
    expect((await db.collection('assets').doc(ALFA_ID).get()).exists).toBe(true);

    // ── 4. Under the UI: the same refusal from the route, with the count, deleting nothing ──
    const direct = await page.request.delete(`/api/assets/${ALFA_ID}`, {
      headers: { Authorization: `Bearer ${await ownerToken()}`, 'Content-Type': 'application/json' },
      data: { userId: UID },
    });
    expect(direct.status()).toBe(409);
    expect(await direct.json()).toMatchObject({ code: 'has-ledger-operations', operations: 1 });
    expect((await db.collection('assets').doc(ALFA_ID).get()).exists).toBe(true);
    expect((await db.collection('assetTransactions').doc(`${ALFA_ID}-buy`).get()).exists).toBe(true);
  } finally {
    await remove(db);
    if (plantedMeta) await metaRef.delete();
  }
});
