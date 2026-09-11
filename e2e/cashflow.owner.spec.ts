/**
 * Cashflow › Tracciamento — the «Intestatario» filter and the owner chip, desktop 1440.
 *
 * What only a browser can prove: with Divisione ON the Select exists in the Movimenti toolbar, an
 * attributed row prints its owner as a chip, choosing a person narrows the list and the tile's
 * count follows; with the flag OFF neither the Select nor a chip exists. The arithmetic of the
 * filter lives in __tests__/movementsOwnerFilter.test.ts.
 *
 * The base seed has no household, so the test plants one on the shared account (two decoy names
 * that appear nowhere in the seed) and attributes ONE current-month row through the Admin SDK,
 * then restores everything in `finally` — data-only per test, never a re-seed (AGENTS.md →
 * Browser-Driven E2E: re-seeding logs the account out).
 */

import { test, expect, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const ORNITORINCO = { id: 'e2e-owner-ornitorinco', name: 'Ornitorinco' };
const FENICOTTERO = { id: 'e2e-owner-fenicottero', name: 'Fenicottero' };

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return { db: getFirestore(app), FieldValue };
}

/** One current-month, non-transfer row of the seed — the one the test attributes. */
async function pickCurrentMonthRow(db: FirebaseFirestore.Firestore): Promise<FirebaseFirestore.DocumentReference> {
  const now = new Date();
  const snap = await db.collection('expenses').where('userId', '==', UID).get();
  const row = snap.docs.find((doc) => {
    const data = doc.data();
    const date = (data.date as { toDate(): Date }).toDate();
    return data.type !== 'transfer' && !data.personalMemberId && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
  if (!row) throw new Error('the seed has no current-month row to attribute');
  return row.ref;
}

async function openTracciamento(page: Page) {
  await page.goto('/dashboard/cashflow', { waitUntil: 'load' });
  const movimenti = page.getByRole('region', { name: 'Movimenti' });
  await expect(movimenti).toBeVisible({ timeout: 60_000 });
  return movimenti;
}

/** Rows (buttons) carrying the chip whose own text is exactly `name`. */
const rowsWithChip = (page: Page, movimenti: ReturnType<Page['getByRole']>, name: string) =>
  movimenti.getByRole('button').filter({ has: page.locator('div').filter({ hasText: new RegExp(`^${name}$`) }) });

test('with Divisione on, the Intestatario filter narrows the list and the rows carry the chip; off, neither exists', async ({ page }) => {
  const { db, FieldValue } = await admin();
  const settings = db.collection('assetAllocationTargets').doc(UID);
  const row = await pickCurrentMonthRow(db);
  // The Previdenza fixture (global-setup) keeps its family member in the SAME settings document:
  // remember the two fields as they are and put them back, never delete them — deleting wiped
  // «Marco» and failed every pension spec that ran after this one (2026-09-11).
  const before = (await settings.get()).data() ?? {};
  const restoreField = (key: 'expenseSplitEnabled' | 'familyMembers') =>
    key in before ? before[key] : FieldValue.delete();

  await settings.set({ userId: UID, expenseSplitEnabled: true, familyMembers: [ORNITORINCO, FENICOTTERO] }, { merge: true });
  await row.update({ personalMemberId: ORNITORINCO.id });

  try {
    const movimenti = await openTracciamento(page);
    const total = Number((await movimenti.textContent())?.match(/(\d+) voci/)?.[1]);
    expect(total).toBeGreaterThan(1);

    // The attributed row prints its owner; the shared rows print nothing.
    await expect(rowsWithChip(page, movimenti, ORNITORINCO.name)).toHaveCount(1);
    await expect(rowsWithChip(page, movimenti, FENICOTTERO.name)).toHaveCount(0);

    const owner = movimenti.getByRole('combobox', { name: 'Filtra per intestatario' });
    await owner.click();
    for (const name of ['Tutti', 'In comune', ORNITORINCO.name, FENICOTTERO.name]) {
      await expect(page.getByRole('option', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('option', { name: 'Senza intestatario' })).toHaveCount(0);
    await page.getByRole('option', { name: ORNITORINCO.name, exact: true }).click();

    await expect(movimenti).toContainText(`1 di ${total} voci`);
    await expect(rowsWithChip(page, movimenti, ORNITORINCO.name)).toHaveCount(1);

    await owner.click();
    await page.getByRole('option', { name: 'In comune', exact: true }).click();
    await expect(movimenti).toContainText(`${total - 1} di ${total} voci`);
    await expect(rowsWithChip(page, movimenti, ORNITORINCO.name)).toHaveCount(0);

    // «Ripristina» resets the owner filter with the others.
    await movimenti.getByRole('button', { name: 'Ripristina' }).click();
    await expect(owner).toHaveText('Tutti');
    await expect(movimenti).not.toContainText(`${total - 1} di ${total} voci`);

    // Flag off: the row is still attributed in Firestore, but no Select and no chip.
    await settings.update({ expenseSplitEnabled: false });
    const again = await openTracciamento(page);
    await expect(again).toContainText(`${total} voci`);
    await expect(again.getByRole('combobox', { name: 'Filtra per intestatario' })).toHaveCount(0);
    await expect(rowsWithChip(page, again, ORNITORINCO.name)).toHaveCount(0);
  } finally {
    await row.update({ personalMemberId: FieldValue.delete() });
    await settings.update({ expenseSplitEnabled: restoreField('expenseSplitEnabled'), familyMembers: restoreField('familyMembers') });
  }
});
