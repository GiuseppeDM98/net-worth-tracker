/**
 * Patrimonio · Registro · Dividendi — a BTP€i and a zero-coupon bond through the dialogs, desktop 1440.
 *
 * What only a browser can prove (issues #340 / #341, 2026-09-11): the asset form shows a BTP€i's
 * mechanism and coefficient and its save materialises a PROVISIONAL coupon at the latest known
 * coefficient; the trade form asks the coefficient at the trade date and stores quote × coefficient;
 * the Dividendi tab's «Imposta inflazione» asks the coefficient and finalises the coupon; a bond
 * created with a coupon rate of 0 keeps its details, gets a 1 €-unit price and no coupon. Every
 * outcome is asserted on Firestore (Admin SDK), never on the look of the page. The arithmetic lives
 * in __tests__/{bondPricing,couponUtils,bondDetailsForm-via-assetDialogHelpers}.test.ts.
 *
 * The base seed has no inflation-linked bond, so the test plants one (a decoy name absent from the
 * seed) with the Admin SDK and removes everything it and the app created in `finally` — data-only,
 * never a re-seed (AGENTS.md → Browser-Driven E2E). The zero-coupon ISIN is a real BTP the seed's
 * dividends do not reference: `createAsset` re-links a new asset onto an existing one whose ISIN
 * already has dividends, which would merge the new bond into the seed's.
 */

import { test, expect, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const ORNITORINCO_ID = 'e2e-btpei-ornitorinco';
const ZERO_TICKER = 'FENICOTTEROZERO';
const ZERO_COUPON_ISIN = 'IT0005696338'; // BTP Valore Marzo 2032 — not in the base seed

test.setTimeout(240_000);

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

/** The BTP€i fixture: 5.000 € nominal (1 € units), real rate 0,40 %, coefficient 1,25 known since May. */
async function plantBtpEi(db: FirebaseFirestore.Firestore) {
  const now = new Date();
  await db.collection('assets').doc(ORNITORINCO_ID).set({
    userId: UID, ticker: 'ORNITORINCO', name: 'BTP€i Ornitorinco Maggio 2030', isin: 'IT0005387052',
    type: 'bond', assetClass: 'bonds', subCategory: 'Bond Singoli', currency: 'EUR', quantity: 5000,
    averageCost: 1.2, averageCostEur: 1.2, currentPrice: 1.2, isLiquid: true, autoUpdatePrice: false, taxRate: 12.5,
    allocationRole: 'tradable', createdAt: now, updatedAt: now,
    bondDetails: {
      // UTC midnight, as the form stores a `<input type="date">` (`new Date('YYYY-MM-DD')`): a local
      // midnight lands on 23:00 UTC of the day before and every coupon then reads the 14th.
      couponRate: 0.4, couponFrequency: 'semiannual', issueDate: new Date('2019-11-15'), maturityDate: new Date('2030-05-15'),
      inflationIndexation: 'euro', indexationCoefficients: [{ date: new Date('2026-05-15'), coefficient: 1.25 }],
    },
  });
  await db.collection('assetTransactions').doc(`${ORNITORINCO_ID}-baseline`).set({
    userId: UID, assetId: ORNITORINCO_ID, type: 'buy', date: new Date(2026, 0, 2), quantity: 5000,
    pricePerUnit: 1.2, priceEur: 1.2, isBaseline: true, createdAt: now, updatedAt: now,
  });
}

/** Everything the fixture and the app wrote for these two bonds, looped so an earlier failed run leaves nothing. */
async function removeBonds(db: FirebaseFirestore.Firestore) {
  const created = await db.collection('assets').where('userId', '==', UID).where('ticker', '==', ZERO_TICKER).get();
  for (const assetId of [ORNITORINCO_ID, ...created.docs.map((d) => d.id)]) {
    for (const collection of ['assetTransactions', 'dividends']) {
      const rows = await db.collection(collection).where('userId', '==', UID).where('assetId', '==', assetId).get();
      for (const row of rows.docs) await row.ref.delete();
    }
    await db.collection('assets').doc(assetId).delete();
  }
}

async function openPatrimonio(page: Page) {
  await page.goto('/dashboard/assets', { waitUntil: 'load' });
  await expect(page.getByRole('row').filter({ hasText: 'Ornitorinco' })).toBeVisible({ timeout: 90_000 });
}

test('a BTP€i and a zero-coupon bond write what the pure layer promises', async ({ page }) => {
  const db = await admin();
  await removeBonds(db);
  // The ledger must be open for the trade form and the ledger create; plant the meta only if the
  // account has none, and take it away again in that case only.
  const metaRef = db.collection('assetTransactionsMeta').doc(UID);
  const plantedMeta = !(await metaRef.get()).exists;
  if (plantedMeta) {
    const now = new Date();
    await metaRef.set({ userId: UID, migratedAt: now, baselineDate: new Date(2025, 0, 1), migratedAssetCount: 0, createdAt: now, updatedAt: now });
  }
  await plantBtpEi(db);

  try {
    // ── 1. Edit the BTP€i: mechanism + coefficient shown; save → provisional coupon at 1,25 ──
    await openPatrimonio(page);
    await page.getByRole('row').filter({ hasText: 'Ornitorinco' }).getByRole('button', { name: 'Modifica asset' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('combobox', { name: "Indicizzazione all'inflazione" })).toContainText('BTP€i');
    await expect(dialog.locator('#bondIndexationCoefficient')).toHaveValue('1.25');
    await dialog.getByRole('button', { name: 'Salva modifiche' }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    const provisional = await db.collection('dividends').where('userId', '==', UID).where('assetId', '==', ORNITORINCO_ID).get();
    expect(provisional.size).toBe(1);
    const coupon = provisional.docs[0].data();
    expect(coupon.isProvisional).toBe(true);
    expect(coupon.dividendPerShare).toBeCloseTo(0.0025, 10); // 0,2 % × 1 € × 1,25
    expect(coupon.notes).toContain("all'ultimo coefficiente noto 1,25");

    // ── 2. A trade on the BTP€i: coefficient asked, quote × coefficient stored ──
    await page.getByRole('row').filter({ hasText: 'Ornitorinco' }).getByRole('button', { name: 'Registra operazione' }).click();
    await expect(dialog.locator('#trade-indexation-coefficient')).toHaveValue('1.25');
    await dialog.locator('#trade-quantity').fill('1000');
    await dialog.locator('#trade-price').fill('97');
    await dialog.locator('#trade-indexation-coefficient').fill('1.26');
    await expect(dialog.getByText(/≈ .*per unità/)).toContainText('1,22');
    await dialog.getByRole('button', { name: 'Registra operazione' }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    const trades = await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', ORNITORINCO_ID).get();
    const trade = trades.docs.map((d) => d.data()).find((t) => !t.isBaseline);
    expect(trade?.pricePerUnit).toBeCloseTo(0.97 * 1.26, 10);
    expect(trade?.indexationCoefficient).toBe(1.26);
    expect((await db.collection('assets').doc(ORNITORINCO_ID).get()).data()?.quantity).toBe(6000);

    // ── 3. Dividendi: «Imposta inflazione» asks for the coefficient and finalises the coupon ──
    await page.goto('/dashboard/cashflow?tab=dividends', { waitUntil: 'load' });
    await page.getByRole('button', { name: /Imposta il dato d'inflazione per ORNITORINCO/ }).click({ timeout: 90_000 });
    await expect(dialog.getByRole('heading', { name: 'Coefficiente di indicizzazione della cedola' })).toBeVisible();
    await dialog.locator('#inflationRate').fill('1.27');
    await expect(dialog.getByText('Cedola lorda stimata')).toBeVisible();
    await dialog.getByRole('button', { name: 'Salva e ricalcola' }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    const finalised = await db.collection('dividends').where('userId', '==', UID).where('assetId', '==', ORNITORINCO_ID).get();
    expect(finalised.size).toBe(1);
    const final = finalised.docs[0].data();
    expect(final.isProvisional).toBe(false);
    expect(final.dividendPerShare).toBeCloseTo(0.002 * 1.27, 10);
    expect(final.quantity).toBe(6000);
    expect(final.notes).toContain('coefficiente di indicizzazione 1,27');
    const entries = (await db.collection('assets').doc(ORNITORINCO_ID).get()).data()?.bondDetails
      .indexationCoefficients as Array<{ coefficient: number }>;
    expect(entries.map((e) => e.coefficient)).toEqual([1.25, 1.27]);

    // «Di oggi» is the latest coefficient at or before today: the 1,27 belongs to the November
    // coupon date, so the asset form (and the cron, same rule) still read 1,25 (owner's tour, 2026-09-11).
    await openPatrimonio(page);
    await page.getByRole('row').filter({ hasText: 'Ornitorinco' }).getByRole('button', { name: 'Modifica asset' }).click();
    await expect(dialog.locator('#bondIndexationCoefficient')).toHaveValue('1.25');
    // Switching the mechanism away and back keeps the coefficient (it used to be cleared).
    const mechanism = dialog.getByRole('combobox', { name: "Indicizzazione all'inflazione" });
    await mechanism.click();
    await page.getByRole('option', { name: /BTP Italia/ }).click();
    await expect(dialog.locator('#bondIndexationCoefficient')).toHaveCount(0);
    await mechanism.click();
    await page.getByRole('option', { name: /BTP€i/ }).click();
    await expect(dialog.locator('#bondIndexationCoefficient')).toHaveValue('1.25');
    await dialog.getByRole('button', { name: 'Annulla' }).click();
    await expect(dialog).toBeHidden();

    // ── 4. A zero-coupon bond through the dialog: details kept, 1 €-unit price, no coupon ──
    await openPatrimonio(page);
    await page.getByRole('button', { name: 'Aggiungi asset' }).click();
    await dialog.getByRole('radio', { name: /Obbligazione/ }).click();
    await dialog.locator('#ticker').fill(ZERO_TICKER);
    await dialog.locator('#name').fill('BTP Fenicottero Zero');
    await dialog.locator('#isin').fill(ZERO_COUPON_ISIN);
    await dialog.locator('#quantity').fill('2000');
    await dialog.locator('#averageCost').fill('96');
    await expect(dialog.getByText(/≈ .*per unità/)).toContainText('0,96');
    await dialog.getByRole('switch', { name: 'Dettagli Cedole' }).check();
    await expect(dialog.locator('#bondCouponRate')).toBeVisible();
    await dialog.locator('#bondCouponRate').fill('0');
    await dialog.getByText('Seleziona periodicità').click();
    await page.getByRole('option', { name: 'Annuale (1/anno)' }).click();
    await dialog.locator('#bondIssueDate').fill('2026-01-15');
    await dialog.locator('#bondMaturityDate').fill('2027-01-15');
    await dialog.getByRole('button', { name: 'Crea strumento' }).click();
    await expect(dialog).toBeHidden({ timeout: 90_000 });

    const created = await db.collection('assets').where('userId', '==', UID).where('ticker', '==', ZERO_TICKER).get();
    expect(created.size).toBe(1);
    const zero = created.docs[0].data();
    expect(zero.bondDetails.couponRate).toBe(0);
    expect(zero.bondDetails.maturityDate).toBeDefined();
    expect(zero.quantity).toBe(2000);
    expect(zero.averageCost).toBeCloseTo(0.96, 10); // the opening buy: 96 % of a 1 € unit
    const zeroCoupons = await db.collection('dividends').where('userId', '==', UID).where('assetId', '==', created.docs[0].id).get();
    expect(zeroCoupons.size).toBe(0);
  } finally {
    await removeBonds(db);
    if (plantedMeta) await metaRef.delete();
  }
});
