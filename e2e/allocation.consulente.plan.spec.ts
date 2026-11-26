/**
 * Allocazione › Consulente, «Applica» creates the plan of accumulation (2026-11-20, 1440px): the
 * report's operating plan becomes an ACTIVE plan with ONE click — the tick on «Applica» shows the
 * summary, the instrument to create with ticker · price · date and the account; the click writes the
 * targets, creates the instrument at 0 quotes, writes and activates the plan (or replaces a draft,
 * or revises the active plan) and the model. On an applied report «Crea il piano di accumulo» does
 * the same alone. A second press never creates the instrument twice.
 *
 * The base account (`test@example.com`). Each test plants a `ready` (or `applied`) report with an
 * operating plan on the seed's instruments — «Vanguard FTSE All-World» bought, «Apple Inc.» partly
 * sold in month 2, «ETF airone» new — and the quote route is ALWAYS faked: no market is called, no
 * model either (the run route is not touched by these tests). `afterEach` puts the account back as
 * `emulators:seed` left it: the plans and their lock, the instrument the click created, the targets
 * and the investment account, the model, the advice document.
 */

import { test, expect, type Page } from '@playwright/test';
import { reconcileOperatingPlan } from '../lib/utils/operatingPlan';
import { bookCard, expectPage, openReport, plant, rememberHeld, restoreHeld } from './consulenteReport';
import { removeOwnerPlans, seedAccumuloFixture } from './accumuloFixture';
import { pointAdminAtEmulator } from './emulator';

pointAdminAtEmulator();

const UID = 'test-user-1';
const NEW_ISIN = 'IE000AIRO001';
const NEW_SYMBOL = 'AIRO.MI';
const NEW_NAME = 'ETF airone';
/** What `emulators:seed` writes in `assetAllocationTargets/test-user-1` (scripts/seedEmulator.ts). */
const SEED_TARGETS = {
  equity: { targetPercentage: 60, subTargets: { World: { targetPercentage: 80 }, 'Single Stock': { targetPercentage: 20 } } },
  bonds: { targetPercentage: 30 },
  crypto: { targetPercentage: 10 },
};

test.describe.configure({ mode: 'serial' });

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore, Timestamp, FieldValue } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return { db: getFirestore(app), Timestamp, FieldValue };
}

type SeedRows = Parameters<typeof reconcileOperatingPlan>[0]['rows'];
const SEED_ROWS: SeedRows = [
  { ref: 'S1', action: 'buy', targetPercentage: 60, reason: 'Il nucleo azionario.' },
  { ref: 'S2', action: 'sell', targetPercentage: 0, sellQuantity: 5, sellMonth: 2, reason: 'Troppo concentrato.' },
  { ref: 'N1', action: 'buy', targetPercentage: 40, reason: 'La parte che manca.' },
];
/** The swap (owner, 2026-11-20): 5 Apple sold in month 1, the proceeds buy the new ETF at once; the rates buy VWCE. */
const SWAP_ROWS: SeedRows = [
  { ref: 'S1', action: 'buy', targetPercentage: 100, reason: 'Il nucleo azionario.' },
  { ref: 'S2', action: 'sell', targetPercentage: 0, sellQuantity: 5, reinvestInto: 'N1', reason: 'Lo sostituisce.' },
  { ref: 'N1', action: 'buy', targetPercentage: 0, reason: 'Comprato con la vendita.' },
];

/** The operating plan on the seed: 60 on VWCE, 5 Apple sold in month 2, 40 on the new ETF; one stored correction. */
function seedOperatingPlan(rows: SeedRows = SEED_ROWS) {
  const plan = reconcileOperatingPlan(
    {
      summary: 'Il piano piantato per «Applica».',
      monthlyInflowEur: 1000,
      months: 12,
      rows,
      reviewMonth: 6,
      reviewReason: 'A metà strada.',
      departures: [],
    },
    {
      instruments: [
        { ref: 'S1', kind: 'held', name: 'Vanguard FTSE All-World', assetClass: 'equity', assetId: 'seed-vwce' },
        { ref: 'S2', kind: 'held', name: 'Apple Inc.', assetClass: 'equity', assetId: 'seed-aapl' },
        {
          ref: 'N1', kind: 'new', name: NEW_NAME, assetClass: 'equity', symbols: [NEW_SYMBOL],
          prefill: { name: NEW_NAME, ticker: '', isin: NEW_ISIN, type: 'etf', assetClass: 'equity', subCategory: '' },
        },
      ],
      held: {
        S1: { quantity: 20, priceEur: 110, valueEur: 2200, keep: false, tax: { kind: 'exempt' } },
        S2: { quantity: 10, priceEur: 175, valueEur: 1750, keep: false, tax: { kind: 'exempt' } },
      },
    },
  );
  expect(plan.usable).toBe(true);
  return JSON.parse(JSON.stringify({ ...plan, corrections: ['Vanguard FTSE All-World: quota portata dal 70% al 60%.'] }));
}

/** A report (`ready` or `applied`) with the operating plan stored on it, `reportFinishedAt` its own. */
async function plantWithPlan(status: 'ready' | 'applied', rows?: SeedRows) {
  await plant(status, 'headings');
  const { db, Timestamp } = await admin();
  const ref = db.collection('allocationAdvice').doc(UID);
  const reportFinishedAt = (await ref.get()).get('report.finishedAt');
  const now = Timestamp.fromDate(new Date());
  await ref.update({ operatingPlan: { status: 'ready', plan: seedOperatingPlan(rows), error: null, model: 'opus-finto', startedAt: now, finishedAt: now, reportFinishedAt } });
}

/** The quote route faked: every symbol at 50 €, its last trade `ageDays` old. */
async function fakeQuotes(page: Page, ageDays: number) {
  await page.route('**/api/prices/quote*', (route) => {
    const symbol = new URL(route.request().url()).searchParams.get('ticker') ?? '';
    route.fulfill({ json: { symbol, price: 50, currency: 'EUR', quotedAt: new Date(Date.now() - ageDays * 86_400_000).toISOString() } });
  });
}

async function setInvestmentAccount(id: string | null) {
  const { db, FieldValue } = await admin();
  await db.collection('assetAllocationTargets').doc(UID).update({ investmentCashAssetId: id ?? FieldValue.delete() });
}

async function assetsWithIsin() {
  const { db } = await admin();
  const snap = await db.collection('assets').where('userId', '==', UID).where('isin', '==', NEW_ISIN).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Record<string, unknown> & { id: string });
}

async function ownerPlans() {
  const { db } = await admin();
  const snap = await db.collection('accumulationPlans').where('userId', '==', UID).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Record<string, unknown> & { id: string });
}

/** Opens «Applica», unticks the goals (this suite asserts the plan, not the goal document) and waits for the tick's build. */
async function openApply(page: Page, status: 'ready' | 'applied' = 'ready') {
  await openReport(page, '?pagina=applica');
  await expectPage(page, /· Applica$/, 'applica');
  const card = bookCard(page);
  if (status === 'ready') {
    const goals = card.locator('#apply-goals');
    if ((await goals.getAttribute('data-state')) === 'checked' && (await goals.isEnabled())) await goals.click();
  }
  return card;
}

test.beforeAll(rememberHeld);
test.afterAll(restoreHeld);

test.beforeEach(async () => {
  await setInvestmentAccount('seed-cash');
});

test.afterEach(async () => {
  await removeOwnerPlans();
  const { db } = await admin();
  for (const asset of await assetsWithIsin()) await db.collection('assets').doc(asset.id).delete();
  await db.collection('assetAllocationTargets').doc(UID).update({ targets: SEED_TARGETS });
  await setInvestmentAccount(null);
  await db.collection('modelPortfolios').doc(UID).delete();
  await restoreHeld();
});

test('the tick shows the plan with the new instrument priced; one click creates it, activates the plan and writes the model', async ({ page }) => {
  await plantWithPlan('ready');
  await fakeQuotes(page, 0);
  const card = await openApply(page);
  await expect(card.getByText(/^Il piano di accumulo: 12 mesi da .* al mese: prima rata .*, 1 strumento da creare, 1 vendita/)).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText(new RegExp(`^${NEW_NAME} · ${NEW_SYMBOL.replace('.', '\\.')} · 50,00\\s*€ · \\d\\d/\\d\\d/\\d{4}$`))).toBeVisible();
  await expect(card.getByText("Corretto dall'app")).toBeVisible();
  await expect(card.locator('#apply-plan')).toBeEnabled();
  await card.getByRole('button', { name: 'Applica alle impostazioni' }).click();
  await expect(card.getByText('Piano creato.')).toBeVisible({ timeout: 30_000 });
  await expect(card.getByRole('link', { name: 'Apri Accumulo' })).toHaveAttribute('href', '/dashboard/allocation?tab=accumulo');

  const created = await assetsWithIsin();
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ ticker: NEW_SYMBOL, quantity: 0, createdEmpty: true, autoUpdatePrice: true });
  const plans = await ownerPlans();
  expect(plans).toHaveLength(1);
  expect(plans[0].status).toBe('active');
  const disposals = plans[0].disposals as Array<{ assetId: string; monthIndex: number }>;
  expect(disposals.find((d) => d.assetId === 'seed-aapl')?.monthIndex).toBe(2);
  expect(plans[0].advisorNotes).toEqual(expect.arrayContaining(['Vanguard FTSE All-World: quota portata dal 70% al 60%.']));
  const { db } = await admin();
  const model = await db.collection('modelPortfolios').doc(UID).get();
  expect(model.exists).toBe(true);
  expect((model.get('weights') as Array<{ assetId: string }>).map((w) => w.assetId)).toContain(created[0].id);
  const advice = await db.collection('allocationAdvice').doc(UID).get();
  expect(advice.get('applied.planId')).toBe(plans[0].id);
  expect(advice.get('applied.planAction')).toBe('create');
});

test('a stale quote on every symbol → «senza prezzo»; the plan is still created, the instrument not auto-priced', async ({ page }) => {
  await plantWithPlan('ready');
  await fakeQuotes(page, 9);
  const card = await openApply(page);
  await expect(card.getByText(`${NEW_NAME} · senza prezzo: nessun listino ha un prezzo degli ultimi 5 giorni. Il piano lo compra quando gli dai un ticker in Patrimonio.`)).toBeVisible({ timeout: 30_000 });
  await card.getByRole('button', { name: 'Applica alle impostazioni' }).click();
  await expect(card.getByText('Piano creato.')).toBeVisible({ timeout: 30_000 });
  const created = await assetsWithIsin();
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ autoUpdatePrice: false, quantity: 0 });
  const plans = await ownerPlans();
  expect(plans.map((p) => p.status)).toEqual(['active']);
  expect((plans[0].positions as Array<{ buyAssetId: string }>).some((p) => p.buyAssetId === created[0].id)).toBe(true);
});

test('no investment account → the select; the click saves the chosen one and keeps the targets written', async ({ page }) => {
  await setInvestmentAccount(null);
  await plantWithPlan('ready');
  await fakeQuotes(page, 0);
  const card = await openApply(page);
  await expect(card.getByText('Da quale conto?')).toBeVisible({ timeout: 30_000 });
  await expect(card.locator('#apply-plan')).toBeDisabled();
  await card.getByRole('combobox', { name: 'Da quale conto?' }).click();
  await page.getByRole('option', { name: 'Conto Corrente' }).click();
  await expect(card.locator('#apply-plan')).toBeEnabled();
  await card.getByRole('button', { name: 'Applica alle impostazioni' }).click();
  await expect(card.getByText('Piano creato.')).toBeVisible({ timeout: 30_000 });
  const { db } = await admin();
  const settings = await db.collection('assetAllocationTargets').doc(UID).get();
  expect(settings.get('investmentCashAssetId')).toBe('seed-cash');
  // The proposal's two classes, written by the same click: the account's write did not rebuild them away.
  expect(settings.get('targets.equity.targetPercentage')).toBe(70);
  expect(settings.get('targets.bonds.targetPercentage')).toBe(30);
});

test('a draft open → «al posto della bozza»; after the click ONE plan, active', async ({ page }) => {
  await seedAccumuloFixture({ status: 'draft' });
  await plantWithPlan('ready');
  await fakeQuotes(page, 0);
  const card = await openApply(page);
  await expect(card.getByText(/^Il piano di accumulo, al posto della bozza che hai in Accumulo: /)).toBeVisible({ timeout: 30_000 });
  await card.getByRole('button', { name: 'Applica alle impostazioni' }).click();
  await expect(card.getByText('Bozza sostituita e piano attivato.')).toBeVisible({ timeout: 30_000 });
  const plans = await ownerPlans();
  expect(plans).toHaveLength(1);
  expect(plans[0].status).toBe('active');
});

test('an active plan → «Rivede il piano…»; the click adds a revision with the Consulente\'s positions', async ({ page }) => {
  await seedAccumuloFixture();
  await plantWithPlan('ready');
  await fakeQuotes(page, 0);
  const card = await openApply(page);
  await expect(card.getByText(/^Rivede il piano di accumulo attivo: /)).toBeVisible({ timeout: 30_000 });
  await card.getByRole('button', { name: 'Applica alle impostazioni' }).click();
  await expect(card.getByText('Piano rivisto.')).toBeVisible({ timeout: 30_000 });
  const plans = await ownerPlans();
  expect(plans).toHaveLength(1);
  expect((plans[0].revisions as unknown[] | undefined)?.length ?? 0).toBeGreaterThan(0);
  const created = await assetsWithIsin();
  expect(created).toHaveLength(1);
  // What the revised instalments buy: the Consulente's two instruments, nothing he holds (the weights of the ones
  // to hold are their weights of today, so the engine gives them no money).
  type Line = { assetId: string; status: string };
  const openLines = (plans[0].installments as Array<{ lines: Line[] }>).flatMap((instalment) => instalment.lines).filter((line) => line.status === 'planned');
  expect([...new Set(openLines.map((line) => line.assetId))].sort()).toEqual([created[0].id, 'seed-vwce'].sort());
});

test('an applied report with a plan and none recorded → «Crea il piano di accumulo» → «Piano creato»', async ({ page }) => {
  await plantWithPlan('applied');
  await fakeQuotes(page, 0);
  const card = await openApply(page, 'applied');
  const create = card.getByRole('button', { name: 'Crea il piano di accumulo' });
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(card.getByText('Piano creato.')).toBeVisible({ timeout: 30_000 });
  const plans = await ownerPlans();
  expect(plans.map((p) => p.status)).toEqual(['active']);
  const { db } = await admin();
  expect((await db.collection('allocationAdvice').doc(UID).get()).get('applied.planId')).toBe(plans[0].id);
});

// On an applied report the plan goes toward the targets SAVED today, not the report's (2026-11-20): the owner
// may have changed them since. The report proposes no cash; the saved targets keep 1% of it, so the plan's
// reserve is above 0 only when it reads them. Mutation that turns it red: build on the proposal's targets
// whatever the document's status (ConsulenteReport's `planTargets`).
test('an applied report: the plan goes toward the targets saved today, not the report\'s', async ({ page }) => {
  await plantWithPlan('applied');
  const { db } = await admin();
  await db.collection('assetAllocationTargets').doc(UID).update({ targets: { ...SEED_TARGETS, equity: { ...SEED_TARGETS.equity, targetPercentage: 59 }, cash: { targetPercentage: 1 } } });
  await fakeQuotes(page, 0);
  const card = await openApply(page, 'applied');
  const create = card.getByRole('button', { name: 'Crea il piano di accumulo' });
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(card.getByText('Piano creato.')).toBeVisible({ timeout: 30_000 });
  const plans = await ownerPlans();
  expect(plans).toHaveLength(1);
  expect((plans[0].liquidity as { reserveEur: number }).reserveEur).toBeGreaterThan(0);
});

test('the instrument already among the assets under another name (a first press that failed) → not created again', async ({ page }) => {
  const { db, Timestamp } = await admin();
  const now = Timestamp.fromDate(new Date());
  await db.collection('assets').doc('e2e-airone-before').set({
    userId: UID, ticker: NEW_SYMBOL, name: 'Airone creato prima', isin: NEW_ISIN, type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 0, currentPrice: 50, createdEmpty: true, allocationRole: 'tradable', isLiquid: true, autoUpdatePrice: true,
    lastPriceUpdate: now, createdAt: now, updatedAt: now,
  });
  await plantWithPlan('ready');
  await fakeQuotes(page, 0);
  const card = await openApply(page);
  await expect(card.getByText(/^Il piano di accumulo: 12 mesi da /)).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText(/da creare/)).toHaveCount(0);
  await card.getByRole('button', { name: 'Applica alle impostazioni' }).click();
  await expect(card.getByText('Piano creato.')).toBeVisible({ timeout: 30_000 });
  const same = await assetsWithIsin();
  expect(same.map((a) => a.id)).toEqual(['e2e-airone-before']);
  const plans = await ownerPlans();
  expect((plans[0].positions as Array<{ buyAssetId: string; targetPercentage: number }>).find((p) => p.buyAssetId === 'e2e-airone-before')?.targetPercentage).toBeGreaterThan(0);
});

// The swap (owner, 2026-11-20). Mutation that turns it red: the swap not carried onto the plan's sale.
// Month 1 here also buys with the rata, so it reads «Da fare»: «Scambio da fare» is a month of swaps alone (unit tests).
test('a swap → the summary names it; the plan sells and buys the new ETF in month 1, and the Calendario shows it there', async ({ page }) => {
  await plantWithPlan('ready', SWAP_ROWS);
  await fakeQuotes(page, 0);
  const card = await openApply(page);
  await expect(card.getByText(/, scambio a .*: vendi Apple Inc. e compri ETF airone/)).toBeVisible({ timeout: 30_000 });
  await card.getByRole('button', { name: 'Applica alle impostazioni' }).click();
  await expect(card.getByText('Piano creato.')).toBeVisible({ timeout: 30_000 });

  const created = await assetsWithIsin();
  expect(created).toHaveLength(1);
  const plans = await ownerPlans();
  expect(plans).toHaveLength(1);
  const disposals = plans[0].disposals as Array<{ assetId: string; monthIndex: number; reinvestAssetId?: string }>;
  expect(disposals.find((d) => d.assetId === 'seed-aapl')).toMatchObject({ monthIndex: 1, reinvestAssetId: created[0].id });
  const installments = plans[0].installments as Array<{ index: number; lines: Array<{ assetId: string; plannedQuantity: number; swap?: boolean }> }>;
  const swapLine = installments[0].lines.find((line) => line.swap);
  expect(swapLine).toMatchObject({ assetId: created[0].id });
  expect(swapLine!.plannedQuantity).toBeGreaterThan(0);
  // No rata ever buys the new ETF: its quota is the swap alone.
  expect(installments.flatMap((i) => i.lines).filter((line) => line.assetId === created[0].id && !line.swap)).toEqual([]);

  await page.goto('/dashboard/allocation?tab=accumulo');
  await page.getByRole('region', { name: 'Questo mese' }).getByRole('button', { name: 'Calendario' }).click();
  const dialog = page.getByRole('dialog', { name: 'Calendario' });
  await dialog.getByRole('listitem').first().getByRole('button').click();
  await expect(dialog.getByText(NEW_NAME).first()).toBeVisible({ timeout: 15_000 });
});
