/**
 * Centri di Costo, a centre's «Costo» at 1440: fixed and one-off are a ring in the footer (The Ring
 * Rule, 2026-11-12) whose figure stays INSIDE its hole. The centri account (`scripts/seedCostCentersE2E.mts`):
 * «Ornitorinco» books 30 € recurring and 240 € one-off → «270 €» in the hole; «Fenicottero» books no
 * fixed row (its instalment is dated 31 December), so its footer keeps today's sentence. Its 390 twin
 * is `ring-chart.centri.mobile.spec.ts`. Seen red on 2026-11-15 with the figure drawn at three times
 * its font size (`ring-chart.tsx`): it leaves the hole.
 */

import { test, expect } from '@playwright/test';
import { expectRingFiguresInside } from './ringFit';
import { pointAdminAtEmulator } from './emulator';

/** On December 31st the instalment is booked: fixed and one-off, a ring (the guard of cashflow.centri.spec.ts). */
const isLastDayOfYear = new Date().getMonth() === 11 && new Date().getDate() === 31;

test.use({ contextOptions: { reducedMotion: 'reduce' } });
test.setTimeout(120_000);

test('Ornitorinco: «Costo» draws fixed and one-off as a ring, «270 €» inside its hole', async ({ page }) => {
  await page.goto('/dashboard/cashflow?tab=cost-centers&center=e2e-cc-ornitorinco');
  const tile = page.getByRole('region', { name: 'Costo di Ornitorinco' });
  await expect(tile).toBeVisible({ timeout: 60_000 });
  await expectRingFiguresInside(tile);
  await expect(tile.locator('[data-ring-center="hole"]')).toHaveText(/^270[\s ]*€$/);
  await expect(tile.getByRole('list', { name: 'Fisso e una tantum' })).toContainText('ricorrenti e rate');
});

test('Fenicottero: nothing booked as fixed, so the footer keeps its sentence and draws no ring', async ({ page }) => {
  test.skip(isLastDayOfYear, 'On December 31st the instalment is booked: fixed and one-off, a ring.');
  await page.goto('/dashboard/cashflow?tab=cost-centers&center=e2e-cc-fenicottero');
  const tile = page.getByRole('region', { name: 'Costo di Fenicottero' });
  await expect(tile.getByText('Tutto una tantum: nessuna spesa ricorrente o a rate.')).toBeVisible({ timeout: 60_000 });
  await expect(tile.locator('[data-ring]')).toHaveCount(0);
});

// «Per sottocategoria» as a ring (the owner on the mirror tour, 2026-11-15). The fixture's rows carry no
// subcategory, so a centre of its own is planted for this test — «Airone», 200 € of «Manutenzione» and 100 € of
// «Carburante» — and removed after it: «300 €» inside the hole; one row pressed out leaves one part, so no ring
// (the «al netto» hole is Vitest's, sottocategorieTile.test.tsx K4); pressed back, the ring again.
test('Airone: «Per sottocategoria» is a ring, «300 €» inside its hole; one row left counted, no ring', async ({ page }) => {
  pointAdminAtEmulator();
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT }));
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 1), 12);
  const ids = { center: 'e2e-cc-airone', a: 'e2e-cc-airone-man', b: 'e2e-cc-airone-car' };
  const row = (sub: string, name: string, amount: number) => ({
    userId: 'test-user-centri', type: 'variable', categoryId: 'e2e-cc-cat-progetti', categoryName: 'Progetti', currency: 'EUR',
    subCategoryId: sub, subCategoryName: name, date: day, amount, costCenterId: ids.center, costCenterName: 'Airone', createdAt: now, updatedAt: now,
  });
  await db.collection('costCenters').doc(ids.center).set({ userId: 'test-user-centri', name: 'Airone', color: 'chart-5', archivedAt: null, createdAt: now, updatedAt: now });
  await db.collection('expenses').doc(ids.a).set(row('e2e-sub-man', 'Manutenzione', -200));
  await db.collection('expenses').doc(ids.b).set(row('e2e-sub-car', 'Carburante', -100));
  try {
    await page.goto(`/dashboard/cashflow?tab=cost-centers&center=${ids.center}`);
    const tile = page.getByRole('region', { name: 'Per sottocategoria' });
    await expect(tile).toBeVisible({ timeout: 60_000 });
    await expectRingFiguresInside(tile);
    await expect(tile.locator('[data-ring-center="hole"]')).toHaveText(/^300[\s ]*€$/);
    await tile.getByRole('button', { name: /Carburante/ }).click();
    await expect(tile.locator('[data-ring]')).toHaveCount(0);
    await tile.getByRole('button', { name: /Carburante/ }).click();
    await expect(tile.locator('[data-ring] svg')).toHaveAttribute('aria-label', /in tutto 300/);
  } finally {
    await db.collection('expenses').doc(ids.a).delete();
    await db.collection('expenses').doc(ids.b).delete();
    await db.collection('costCenters').doc(ids.center).delete();
  }
});
