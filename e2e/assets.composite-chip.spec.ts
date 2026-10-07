/**
 * Patrimonio › Strumenti — the class chip of a COMPOSITE instrument, desktop 1440 and phone 390.
 *
 * What only a browser can prove: the row stays ONE row under its prevailing class, while its chip
 * splits into proportional segments («Azioni · Obbl.» with the 60/40 stops in its gradient) and says
 * the shares to a screen reader; a leg under 5% gets no segment (a 97/3 fund reads «Azioni», plain
 * width); the 112px floor holds in the desktop table and nowhere else; the table still does not
 * scroll sideways with «Andamento» on; the group header keeps the plain chip; on a phone the chip
 * ends before the amount even after a 12-character ticker, and `main` does not scroll sideways. The
 * label and share rules live in __tests__/assetDisplayClass.test.ts.
 *
 * The base seed has no composite instrument, so the test plants three (decoy names and tickers
 * absent from the seed) with the Admin SDK and removes them in `finally` — data-only, never a
 * re-seed (doc/guide/e2e-emulatori.md § Browser-Driven E2E (Playwright)).
 */

import { test, expect, type Locator, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const PELLICANO = { id: 'e2e-composite-pellicano', name: 'Fondo Pellicano Bilanciato', ticker: 'PELLICANO' };
const CAPIBARA = { id: 'e2e-composite-capibara', name: 'ETF Capibara Quasi Puro', ticker: 'CAPIBARA' };
// The phone row's hard case: an ISIN-shaped ticker (12 characters, «ZZ» is no country) and a
// six-digit value, so both columns of the row are as wide as a real holding makes them.
const TAPIRO = { id: 'e2e-composite-tapiro', name: 'Fondo Tapiro Globale', ticker: 'ZZ9900000042' };

test.setTimeout(180_000);

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

async function plant(db: FirebaseFirestore.Firestore) {
  const now = new Date();
  const fixtures = [
    { ...PELLICANO, quantity: 10, price: 100, composition: [{ assetClass: 'equity', percentage: 60 }, { assetClass: 'bonds', percentage: 40 }] },
    { ...CAPIBARA, quantity: 10, price: 100, composition: [{ assetClass: 'equity', percentage: 97 }, { assetClass: 'cash', percentage: 3 }] },
    // 1.000 × 150 € = 150.000 €, a six-digit amount.
    { ...TAPIRO, quantity: 1000, price: 150, composition: [{ assetClass: 'equity', percentage: 55 }, { assetClass: 'bonds', percentage: 45 }] },
  ];
  for (const f of fixtures) {
    await db.collection('assets').doc(f.id).set({
      userId: UID, ticker: f.ticker, name: f.name, type: 'etf', assetClass: 'equity', subCategory: 'All-World',
      currency: 'EUR', quantity: f.quantity, averageCost: f.price, averageCostEur: f.price, currentPrice: f.price,
      isLiquid: true, autoUpdatePrice: false, allocationRole: 'tradable', composition: f.composition,
      createdAt: now, updatedAt: now,
    });
    await db.collection('assetTransactions').doc(`${f.id}-baseline`).set({
      userId: UID, assetId: f.id, type: 'buy', date: new Date(2026, 0, 2), quantity: f.quantity,
      pricePerUnit: f.price, priceEur: f.price, isBaseline: true, createdAt: now, updatedAt: now,
    });
  }
}

async function remove(db: FirebaseFirestore.Firestore) {
  for (const { id } of [PELLICANO, CAPIBARA, TAPIRO]) {
    await db.collection('assetTransactions').doc(`${id}-baseline`).delete();
    await db.collection('assets').doc(id).delete();
  }
}

async function openPatrimonio(page: Page, width: number) {
  await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
  await page.goto('/dashboard/assets', { waitUntil: 'load' });
  // One list is in the DOM per width since 2026-10-07 (the table at 1440, the phone rows at 390), so
  // the name is there once; the visible filter stays harmless and says what is being waited for.
  await expect(page.getByText(PELLICANO.name).filter({ visible: true }).first()).toBeVisible({ timeout: 90_000 });
}

/** Turns one of the Strumenti toggles on from its default OFF state, and proves both states. */
async function switchOn(toggle: Locator) {
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

test('a composite instrument keeps one row and splits its class chip — desktop 1440', async ({ page }) => {
  const db = await admin();
  await remove(db);
  await plant(db);
  try {
    await openPatrimonio(page, 1440);
    const strumenti = page.locator('section#strumenti');

    const pellicanoRow = page.getByRole('row').filter({ hasText: PELLICANO.name });
    await expect(pellicanoRow).toHaveCount(1);
    const chip = pellicanoRow.locator('[data-composite-chip]');
    await expect(chip).toHaveText(/Azioni · Obbl\./);
    // The shares are sr-only TEXT, so they are part of the chip's content and of the row's name.
    await expect(chip.locator('.sr-only')).toHaveText('Azioni 60%, Obbligazioni 40%');
    const style = (await chip.getAttribute('style')) ?? '';
    expect(style).toContain('0% 60%');
    expect(style).toContain('60% 100%');
    // The floor of the Classe column (`desktop:min-w-[112px]`), so proportions compare down it.
    expect((await chip.boundingBox())!.width).toBeGreaterThanOrEqual(112);

    // 97/3: the 3% has no segment and no word — the chip reads like a plain «Azioni» at plain width.
    const capibaraChip = page.getByRole('row').filter({ hasText: CAPIBARA.name }).locator('[data-composite-chip]');
    await expect(capibaraChip.locator('[data-chip-label]')).toHaveText('Azioni');
    await expect(capibaraChip.locator('.sr-only')).toHaveText('Azioni 97%, Liquidità 3%');
    expect((await capibaraChip.boundingBox())!.width).toBeLessThan(112);

    // «Andamento» on, with the composites planted: the Classe column grew to at least 112px, and the
    // table must still fit its tile (doc/guide/patrimonio.md: «at 1440 nothing scrolls»). The
    // columnheader is the positive anchor that the view really switched before the measurement.
    await switchOn(strumenti.getByRole('button', { name: 'Andamento', exact: true }));
    await expect(strumenti.getByRole('columnheader', { name: /Δ Mese/ })).toBeVisible();
    const scroller = strumenti.locator('div.overflow-x-auto').filter({ has: page.locator('table') });
    const sideways = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(sideways).toBeLessThanOrEqual(0);

    // The group header names the group: its chip stays plain. Grouping is OFF by default, so it is
    // switched on and a group header seen BEFORE the absence is asserted (AGENTS.md → Audit habits:
    // an absence needs a positive anchor). Falsify by rendering `InstrumentClassChip` for the group's
    // composite in `renderGroupHeader` (StrumentiTile.tsx): the header's name then starts with
    // «Azioni 60%, …», the locator still finds it, and the count reads 1.
    await switchOn(strumenti.getByRole('button', { name: 'Raggruppa per classe', exact: true }));
    const groupHeader = strumenti.locator('tbody').getByRole('button', { name: /^Azioni\b.*strument/ });
    await expect(groupHeader).toBeVisible();
    await expect(groupHeader).toHaveAttribute('aria-expanded', 'true');
    // The composite rows under it still carry the split chip: the header's absence is a choice, not
    // a table that lost its composite chips when grouped.
    await expect(pellicanoRow.locator('[data-composite-chip]')).toBeVisible();
    await expect(groupHeader.locator('[data-composite-chip]')).toHaveCount(0);
  } finally {
    await remove(db);
  }
});

test('the composite chip fits a phone row without pushing the page sideways — 390', async ({ page }) => {
  const db = await admin();
  await remove(db);
  await plant(db);
  try {
    await openPatrimonio(page, 390);

    for (const { fixture, shares } of [
      { fixture: PELLICANO, shares: 'Azioni 60%, Obbligazioni 40%' },
      { fixture: TAPIRO, shares: 'Azioni 55%, Obbligazioni 45%' },
    ]) {
      // The row's own toggle (the row also carries «Elimina …», whose name names the instrument too).
      const rowButton = page.locator(`button[aria-controls="asset-row-${fixture.id}"]`);
      await expect(rowButton).toContainText(shares);
      const chip = rowButton.locator('[data-composite-chip]');
      await expect(chip).toBeVisible();

      // The chip sits INSIDE the row button, so the button's box can never see it overflow: compare
      // it with the amount column beside it (`shrink-0`), which is what it would paint under.
      const chipBox = (await chip.boundingBox())!;
      const amountBox = (await rowButton.locator(':scope > div.shrink-0').boundingBox())!;
      expect(chipBox.x + chipBox.width, `${fixture.name}: chip ends before the amount`).toBeLessThanOrEqual(amountBox.x);
      // No 112px floor on the phone: a two-segment chip is as wide as its label.
      expect(chipBox.width, `${fixture.name}: no floor below 1440`).toBeLessThan(112);
    }

    // The dashboard's horizontal scroller is `main`, not the document (AGENTS.md → Tailwind
    // Breakpoints and Responsive Layout).
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main');
      return main ? main.scrollWidth - main.clientWidth : -1;
    });
    expect(overflow).toBe(0);
  } finally {
    await remove(db);
  }
});
