/**
 * Cashflow › Tracciamento — the linked cash account, in a real browser (2026-09-13).
 *
 * What only a browser can prove here: that `ExpenseDialog`'s zod refine reaches the screen (a
 * transfer without its two accounts is refused, the reason under each field, nothing written)
 * and that a recurring series moves the linked account ON EACH ROW'S DATE (2026-09-19): every
 * occurrence carries the account, today's moves it at save with the sign of its type, the one to
 * come waits (`balancePending`) for the server to settle it on the day. The arithmetic belongs to
 * Vitest (`cashSettlement`, `cashBalanceReconciliation`); this file asserts on Firestore, never on
 * the look of the page.
 *
 * Runs on the base seed (`test@example.com`, one cash account «Conto Corrente», category
 * «Alimentari»); every write is removed and the account's balance restored in `finally`, so a
 * failed run leaves the seed as it found it. Only what the app cannot undo is undone by hand:
 * the recurring rows are deleted directly because deleting them through the app would ALSO
 * reverse the balance the test restores.
 *
 * An income cannot recur (`canTypeRecur` = fixed · variable · debt), which is why the recurring
 * case is a variable expense: the sign rule is pinned on the type that can actually reach it.
 */
import { test, expect, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const CASH_ID = 'seed-cash';
/** A decoy amount no seed row carries, so the planted rows are found by it. */
const DECOY_AMOUNT = 137.29;

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

async function cashQuantity(db: FirebaseFirestore.Firestore): Promise<number> {
  return (await db.collection('assets').doc(CASH_ID).get()).data()!.quantity as number;
}

/** Opens the two-step create dialog from Tracciamento and picks the type on step 1. */
async function openNewEntry(page: Page, type: 'Spesa variabile' | 'Trasferimento') {
  await page.goto('/dashboard/cashflow', { waitUntil: 'load' });
  await page.getByRole('region', { name: 'Movimenti' }).waitFor({ timeout: 60_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cashflow:add-expense')));
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('radio', { name: new RegExp(`^${type}`) }).click();
  return dialog;
}

test('a transfer without its two accounts is refused, the reason under each field, nothing written', async ({ page }) => {
  const dialog = await openNewEntry(page, 'Trasferimento');
  await dialog.locator('#amount').fill(String(DECOY_AMOUNT));
  await dialog.locator('button[type=submit]').click();

  await expect(dialog.getByRole('alert').filter({ hasText: 'Scegli il conto di origine' })).toBeVisible();
  await expect(dialog.getByRole('alert').filter({ hasText: 'Scegli il conto di destinazione' })).toBeVisible();
  await expect(dialog.locator('#linkedCashAssetId')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.locator('#transferCashAssetId')).toHaveAttribute('aria-invalid', 'true');

  const db = await admin();
  const transfers = await db.collection('expenses').where('userId', '==', UID).where('type', '==', 'transfer').get();
  expect(transfers.docs.filter((d) => Math.abs(d.data().amount) === DECOY_AMOUNT)).toHaveLength(0);
});

test('a recurring expense links every row, debits today\'s at save and leaves the next one waiting for its date', async ({ page }) => {
  test.setTimeout(90_000);
  const db = await admin();
  const before = await cashQuantity(db);

  const dialog = await openNewEntry(page, 'Spesa variabile');
  await dialog.locator('#amount').fill(String(DECOY_AMOUNT));
  await dialog.locator('#categoryId').click();
  await dialog.getByRole('button', { name: 'Alimentari', exact: true }).click();
  await dialog.locator('#linkedCashAssetId').click();
  await page.getByRole('option', { name: /Conto Corrente/ }).click();
  await dialog.getByRole('button', { name: /Impostazioni avanzate/ }).click();
  await dialog.locator('#isRecurring').click();
  await dialog.locator('#recurringCount').fill('2');
  await dialog.locator('button[type=submit]').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const rows = await db.collection('expenses').where('userId', '==', UID).where('type', '==', 'variable').get();
  const planted = rows.docs.filter((d) => Math.abs(d.data().amount) === DECOY_AMOUNT);
  try {
    expect(planted).toHaveLength(2);
    // Every occurrence carries the account; only the one dated next month waits for its date.
    expect(planted.filter((d) => d.data().linkedCashAssetId === CASH_ID)).toHaveLength(2);
    expect(planted.filter((d) => d.data().balancePending === true)).toHaveLength(1);
    // Falsifiable: with the sign rule inverted this reads before + 137,29; with the future row
    // moved at save too, before − 274,58.
    expect(await cashQuantity(db)).toBeCloseTo(before - DECOY_AMOUNT, 2);
  } finally {
    for (const d of planted) await d.ref.delete();
    await db.collection('assets').doc(CASH_ID).update({ quantity: before });
  }
});
