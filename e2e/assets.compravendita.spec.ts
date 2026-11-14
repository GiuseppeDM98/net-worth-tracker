/**
 * Patrimonio › Compravendita (2026-10-21) in a real browser, every step read back from Firestore: a
 * purchase's preliminare (a new property, the deposit transferred onto it, the agency), its rogito
 * (the mortgage opened on the property, the rest of the price transferred, the instalments as a series
 * linked to the loan, the notary), a plain transfer OUT of the property from the expense form (the fee
 * field hidden, an amount above the value refused), and the sale's rogito (the house revalued to the
 * price, the loan closed WITH the price — no spending row, the account gets the net — and its series stopped).
 *
 * «Legata all'immobile» (owner, 2026-10-21 tour): the purchase's instalments carry the house, the
 * expense form offers the field on a debt row and not on a transfer, and the sale's series screen
 * pre-ticks the house's series ONLY — the base seed's own series (a debt, a policy or not) start unticked.
 *
 * A mortgage above what is left to pay (owner, 2026-11-12): a second house, a 20.000 deposit, then a rogito
 * at 200.000 with a 190.000 mortgage — the bank pays the seller 180.000 and credits the 10.000 to the account,
 * in one transaction and with no row (the property worth the price, the loan the principal, no income).
 *
 * The arithmetic is Vitest's (`realEstateOperationPlan.test.ts`); what only a browser proves here is
 * that the screens walk, that «Conferma» writes what the summary said, and that the expense form's two
 * pickers offer a property on one end only.
 *
 * Runs on the base seed (`test@example.com`, «Conto Corrente» = `seed-cash`), with decoys absent from
 * it: the categories «Casa Ornitorinco» (with «Notaio») and «Mutuo Fenicottero», the property «Casa
 * Fenicottero», and two decoy series in calendar linked to no house — a debt and a life policy, the two
 * shapes the old word rule pre-ticked. `afterAll` deletes what the spec created and restores the account's balance.
 */
import { test, expect, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const ACCOUNT_ID = 'seed-cash';
const HOUSE_NAME = 'Casa Fenicottero';
/** The second house: a mortgage above what is left to pay (its rows' notes contain `HOUSE_NAME`, so `ownRows` collects them). */
const HOUSE_2_NAME = 'Casa Fenicottero 2';
const HOME_CATEGORY_ID = 'e2e-re-home';
const MORTGAGE_CATEGORY_ID = 'e2e-re-mortgage';
const DRAFT_KEY = `real-estate-operation-draft:${UID}`;
/** Two months from the run, so the decoys are in calendar after any rogito dated today. */
const DECOY_ROWS = [
  { id: 'e2e-re-decoy-debt', type: 'debt', categoryId: MORTGAGE_CATEGORY_ID, categoryName: 'Mutuo Fenicottero', notes: 'Rata auto Ornitorinco', amount: -200 },
  { id: 'e2e-re-decoy-life', type: 'fixed', categoryId: HOME_CATEGORY_ID, categoryName: 'Casa Ornitorinco', notes: 'Polizza vita Ornitorinco', amount: -25 },
];

test.describe.configure({ mode: 'serial' });

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

async function quantityOf(db: FirebaseFirestore.Firestore, assetId: string): Promise<number> {
  return (await db.collection('assets').doc(assetId).get()).data()!.quantity as number;
}

async function assetNamed(db: FirebaseFirestore.Firestore, name: string) {
  const snap = await db.collection('assets').where('userId', '==', UID).where('name', '==', name).get();
  return snap.docs[0] ?? null;
}

/** The spec's own rows: every expense whose note names the decoy property. */
async function ownRows(db: FirebaseFirestore.Firestore) {
  const snap = await db.collection('expenses').where('userId', '==', UID).get();
  return snap.docs.filter((doc) => String(doc.data().notes ?? '').includes(HOUSE_NAME));
}

/** Opens the path on a clean draft and waits for its first screen. */
async function openPath(page: Page) {
  await page.goto('/dashboard/assets/compravendita', { waitUntil: 'load' });
  await page.evaluate((key) => window.localStorage.removeItem(key), DRAFT_KEY);
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByRole('region', { name: /^Passo 1 di \d+: Operazione/ })).toBeVisible({ timeout: 60_000 });
}

const screen = (page: Page, eyebrow: string) => page.getByRole('region', { name: new RegExp(`^Passo \\d+ di \\d+: ${eyebrow}$`) });

async function next(page: Page, eyebrow: string) {
  await page.getByRole('button', { name: 'Avanti', exact: true }).click();
  await expect(screen(page, eyebrow)).toBeVisible();
}

/** Picks an option of a Radix Select opened from its trigger. */
async function pick(page: Page, triggerId: string, option: RegExp | string) {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole('option', { name: option }).first().click();
}

/** The centre screen shows only with the cost centres on: «Nessun centro» when it does. */
async function skipCentre(page: Page) {
  await page.getByRole('button', { name: 'Avanti', exact: true }).click();
  const centre = screen(page, 'Centro di costo');
  if (await centre.isVisible().catch(() => false)) {
    await centre.getByText('Nessun centro', { exact: true }).click();
    await next(page, 'Riepilogo');
  }
  await expect(screen(page, 'Riepilogo')).toBeVisible();
}

let accountStart = 0;

test.beforeAll(async () => {
  const db = await admin();
  accountStart = await quantityOf(db, ACCOUNT_ID);
  const now = new Date();
  await db.collection('expenseCategories').doc(HOME_CATEGORY_ID).set({ userId: UID, name: 'Casa Ornitorinco', type: 'fixed', subCategories: [{ id: 'e2e-re-notary', name: 'Notaio' }], createdAt: now, updatedAt: now });
  await db.collection('expenseCategories').doc(MORTGAGE_CATEGORY_ID).set({ userId: UID, name: 'Mutuo Fenicottero', type: 'debt', subCategories: [], createdAt: now, updatedAt: now });
  const inTwoMonths = new Date(now.getFullYear(), now.getMonth() + 2, 10, 12);
  for (const row of DECOY_ROWS) {
    await db.collection('expenses').doc(row.id).set({ ...row, userId: UID, currency: 'EUR', date: inTwoMonths, isRecurring: true, recurringFrequency: 'monthly', recurringDay: 10, recurringParentId: row.id, createdAt: now, updatedAt: now });
  }
});

test.afterAll(async () => {
  const db = await admin();
  const batch = db.batch();
  for (const doc of await ownRows(db)) batch.delete(doc.ref);
  for (const name of [HOUSE_NAME, `Mutuo ${HOUSE_NAME}`, HOUSE_2_NAME, `Mutuo ${HOUSE_2_NAME}`]) {
    const asset = await assetNamed(db, name);
    if (asset) batch.delete(asset.ref);
  }
  batch.delete(db.collection('expenseCategories').doc(HOME_CATEGORY_ID));
  batch.delete(db.collection('expenseCategories').doc(MORTGAGE_CATEGORY_ID));
  for (const row of DECOY_ROWS) batch.delete(db.collection('expenses').doc(row.id));
  batch.update(db.collection('assets').doc(ACCOUNT_ID), { quantity: accountStart });
  await batch.commit();
});

test('the preliminare creates the house, transfers the deposit onto it and books the agency', async ({ page }) => {
  test.setTimeout(120_000);
  await openPath(page);
  await next(page, 'Immobile');
  // «Ricomincia» asks once more, then drops the draft and goes back to the first screen.
  await page.locator('#re-name').fill('Bozza da buttare');
  await page.getByRole('button', { name: 'Ricomincia', exact: true }).click();
  await expect(screen(page, 'Immobile')).toBeVisible();
  await page.getByRole('button', { name: 'Premi di nuovo per ricominciare', exact: true }).click();
  await expect(screen(page, 'Operazione')).toBeVisible();
  await next(page, 'Immobile');
  await expect(page.locator('#re-name')).toHaveValue('');
  await page.locator('#re-name').fill(HOUSE_NAME);
  await page.locator('#re-price').fill('200000');
  await next(page, 'Caparra');
  await pick(page, 're-account', /^Conto Corrente/);
  await page.locator('#re-deposit').fill('20000');
  await next(page, 'Costi');
  await page.locator('#re-cost-agency').fill('3000');
  await pick(page, 're-cost-agency-category', 'Casa Ornitorinco', );
  await skipCentre(page);

  await expect(page.getByRole('list', { name: 'Le scritture, in ordine' })).toContainText(`Crea l’immobile «${HOUSE_NAME}»`);
  await page.getByRole('button', { name: 'Conferma', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Preliminare d’acquisto registrato: ${HOUSE_NAME}` })).toBeVisible({ timeout: 30_000 });

  const db = await admin();
  const house = await assetNamed(db, HOUSE_NAME);
  expect(house?.data()).toMatchObject({ type: 'realestate', currentPrice: 1, quantity: 20000, isPrimaryResidence: true, allocationRole: 'excluded' });
  const rows = await ownRows(db);
  const deposit = rows.find((row) => row.data().type === 'transfer');
  expect(deposit?.data()).toMatchObject({ amount: 20000, linkedCashAssetId: ACCOUNT_ID, transferCashAssetId: house!.id });
  expect(rows.find((row) => row.data().categoryId === HOME_CATEGORY_ID)?.data().amount).toBe(-3000);
  expect(await quantityOf(db, ACCOUNT_ID)).toBeCloseTo(accountStart - 23000, 2);
});

test('the rogito opens the mortgage on the house, transfers the rest and links the instalments to the loan', async ({ page }) => {
  test.setTimeout(120_000);
  await openPath(page);
  await page.getByText('Rogito', { exact: true }).click();
  await next(page, 'Immobile');
  await pick(page, 're-property', new RegExp(`^${HOUSE_NAME}`));
  await page.locator('#re-price').fill('200000');
  await next(page, 'Mutuo');
  await page.locator('#re-principal').fill('150000');
  await page.locator('#re-rate').fill('3');
  await page.locator('#re-years').fill('1');
  await pick(page, 're-mortgage-category', 'Mutuo Fenicottero');
  await next(page, 'Rogito');
  await pick(page, 're-account', /^Conto Corrente/);
  await expect(screen(page, 'Rogito')).toContainText('Dal conto escono 30.000,00');
  await next(page, 'Polizze');
  await next(page, 'Costi');
  await page.locator('#re-cost-notary').fill('2000');
  await pick(page, 're-cost-notary-category', 'Casa Ornitorinco › Notaio');
  await skipCentre(page);
  await page.getByRole('button', { name: 'Conferma', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Rogito d’acquisto registrato: ${HOUSE_NAME}` })).toBeVisible({ timeout: 30_000 });

  const db = await admin();
  const house = await assetNamed(db, HOUSE_NAME);
  const loan = await assetNamed(db, `Mutuo ${HOUSE_NAME}`);
  // 20.000 of deposit + 150.000 of mortgage + 30.000 from the account: the price.
  expect(house?.data()?.quantity).toBe(200000);
  expect(loan?.data()).toMatchObject({ type: 'loan', assetClass: 'realestate', quantity: 150000, financedAssetId: house!.id, debtInterestRate: 3 });
  const instalments = (await ownRows(db)).filter((row) => row.data().debtAssetId === loan!.id);
  expect(instalments).toHaveLength(12);
  expect(instalments.every((row) => row.data().balancePending === true)).toBe(true);
  // They belong to the house through the mortgage (lib/utils/propertyLink.ts): no second link written.
  expect(instalments.every((row) => row.data().propertyAssetId === undefined)).toBe(true);
  expect(await quantityOf(db, ACCOUNT_ID)).toBeCloseTo(accountStart - 23000 - 30000 - 2000, 2);
});

test('a plain transfer out of the house hides the fee and refuses an amount above its value', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/dashboard/cashflow', { waitUntil: 'load' });
  await page.getByRole('region', { name: 'Movimenti' }).waitFor({ timeout: 60_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cashflow:add-expense')));
  const dialog = page.getByRole('dialog');
  // A debt row offers «Legata all'immobile» among the advanced settings, the house in its list.
  await dialog.getByRole('radio', { name: /^Debito \/ rata/ }).click();
  await dialog.getByRole('button', { name: 'Impostazioni avanzate' }).click();
  await dialog.locator('#propertyAssetId').click();
  await expect(page.getByRole('option', { name: HOUSE_NAME, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Cambia tipo' }).click();
  await dialog.getByRole('radio', { name: /^Trasferimento/ }).click();
  await expect(dialog.locator('#fee')).toBeVisible();
  // A transfer names its property as an endpoint: no link field.
  await expect(dialog.locator('#propertyAssetId')).toHaveCount(0);

  await dialog.locator('#linkedCashAssetId').click();
  await page.getByRole('option', { name: HOUSE_NAME, exact: true }).click();
  // Out of a property: no fee, and the destination offers accounts only.
  await expect(dialog.locator('#fee')).toHaveCount(0);
  await expect(dialog.locator('#transferCashAssetId-hint')).toContainText('una vendita o una caparra ricevuta non è un’entrata');
  await dialog.locator('#transferCashAssetId').click();
  await expect(page.getByRole('option', { name: HOUSE_NAME, exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: /^Conto Corrente/ }).click();

  await dialog.locator('#amount').fill('250000');
  await dialog.locator('#notes').fill(`Caparra ricevuta prova · ${HOUSE_NAME}`);
  await dialog.locator('button[type=submit]').click();
  // The refusal is the modal's reading (its one `role="status"` line) and the amount's own error.
  await expect(dialog.getByRole('status').filter({ hasText: `Supera il valore di ${HOUSE_NAME}` })).toBeVisible();
  await expect(dialog.locator('#amount')).toHaveAttribute('aria-invalid', 'true');
  const db = await admin();
  expect(await quantityOf(db, (await assetNamed(db, HOUSE_NAME))!.id)).toBe(200000);

  await dialog.locator('#amount').fill('1000');
  await dialog.locator('button[type=submit]').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  expect(await quantityOf(db, (await assetNamed(db, HOUSE_NAME))!.id)).toBe(199000);
});

test('the sale revalues the house to the price, transfers the rest, pays off the loan and stops its series', async ({ page }) => {
  test.setTimeout(120_000);
  await openPath(page);
  await page.getByText('Vendo casa', { exact: true }).click();
  await page.getByText('Rogito', { exact: true }).click();
  await next(page, 'Immobile');
  await pick(page, 're-property', new RegExp(`^${HOUSE_NAME}`));
  await page.locator('#re-price').fill('210000');
  await next(page, 'Rogito');
  // The 1000 received by the transfer above is a deposit: 210.000 − 1000 to come, 150.000 of it closing the mortgage.
  await expect(page.locator('#re-deposits-received')).toHaveValue('1000');
  await expect(screen(page, 'Rogito')).toContainText('Sul conto entrano 59.000,00');
  await pick(page, 're-account', /^Conto Corrente/);
  await next(page, 'Valore');
  // The house holds 199.000; 209.000 to transfer: +10.000 first.
  await expect(screen(page, 'Valore')).toContainText('sale di 10.000,00');
  await next(page, 'Mutuo');
  await expect(page.locator(`#re-payoff-${(await assetNamed(await admin(), `Mutuo ${HOUSE_NAME}`))!.id}-amount`)).toHaveValue('150000');
  await next(page, 'Serie');
  // Pre-ticked: this house's instalments, and nothing else — the decoys are a debt and a policy of no house.
  const rows = screen(page, 'Serie').getByRole('listitem');
  await expect(rows.filter({ hasText: 'Ornitorinco' })).toHaveCount(2);
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    const ours = (await row.textContent())?.includes(HOUSE_NAME) ?? false;
    await expect(row.getByRole('checkbox')).toHaveAttribute('aria-checked', ours ? 'true' : 'false');
  }
  await next(page, 'Costi');
  await skipCentre(page);
  await page.getByRole('button', { name: 'Conferma', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Vendita registrata: ${HOUSE_NAME}` })).toBeVisible({ timeout: 30_000 });

  const db = await admin();
  const house = await assetNamed(db, HOUSE_NAME);
  const loan = await assetNamed(db, `Mutuo ${HOUSE_NAME}`);
  expect(house?.data()?.quantity).toBe(0);
  expect(loan?.data()?.quantity).toBe(0);
  const own = await ownRows(db);
  // Every instalment was in calendar after the rogito: all twelve gone, and no payoff row — the price closed the debt.
  expect(own.filter((row) => row.data().debtAssetId === loan!.id)).toHaveLength(0);
  expect(own.find((row) => row.data().type === 'transfer' && row.data().notes === `Saldo al rogito · ${HOUSE_NAME}` && row.data().linkedCashAssetId === house!.id)?.data()?.amount).toBe(59000);
  // −23.000 −30.000 −2.000 (purchase) +1000 (deposit) +59.000 (the net balance).
  expect(await quantityOf(db, ACCOUNT_ID)).toBeCloseTo(accountStart + 5000, 2);
});

test('a second house takes a deposit at the preliminare', async ({ page }) => {
  test.setTimeout(120_000);
  await openPath(page);
  await next(page, 'Immobile');
  await page.locator('#re-name').fill(HOUSE_2_NAME);
  await page.locator('#re-price').fill('200000');
  await next(page, 'Caparra');
  await pick(page, 're-account', /^Conto Corrente/);
  await page.locator('#re-deposit').fill('20000');
  await next(page, 'Costi');
  await skipCentre(page);
  await page.getByRole('button', { name: 'Conferma', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Preliminare d’acquisto registrato: ${HOUSE_2_NAME}` })).toBeVisible({ timeout: 30_000 });

  const db = await admin();
  expect((await assetNamed(db, HOUSE_2_NAME))?.data()?.quantity).toBe(20000);
});

test('a mortgage above what is left to pay credits the excess to the account, with no row', async ({ page }) => {
  test.setTimeout(120_000);
  const db = await admin();
  const accountBefore = await quantityOf(db, ACCOUNT_ID);
  await openPath(page);
  await page.getByText('Rogito', { exact: true }).click();
  await next(page, 'Immobile');
  await pick(page, 're-property', new RegExp(`^${HOUSE_2_NAME}`));
  await page.locator('#re-price').fill('200000');
  await next(page, 'Mutuo');
  await page.locator('#re-principal').fill('190000');
  await page.locator('#re-rate').fill('3');
  await page.locator('#re-years').fill('1');
  await pick(page, 're-mortgage-category', 'Mutuo Fenicottero');
  // Above the price the screen refuses; at 190.000 (beyond the 180.000 left to pay) it lets the run go on.
  await page.locator('#re-principal').fill('210000');
  await expect(screen(page, 'Mutuo')).toContainText('Il mutuo supera il prezzo della casa');
  await expect(page.getByRole('button', { name: 'Avanti', exact: true })).toBeDisabled();
  // The amount can be asked as a share of the price: 95% of 200.000, and the field reads it back.
  await page.locator('#re-principal-percent').fill('95');
  await expect(page.locator('#re-principal')).toHaveValue('190000');
  await next(page, 'Rogito');
  // The question asks where the excess LANDS, never where the rest of the price is paid from.
  await expect(screen(page, 'Rogito')).toContainText('Su quale conto la banca accredita quanto avanza del mutuo?');
  await pick(page, 're-account', /^Conto Corrente/);
  await expect(screen(page, 'Rogito')).toContainText('Dal conto non esce nulla');
  await next(page, 'Polizze');
  await next(page, 'Costi');
  await skipCentre(page);
  const summary = page.getByRole('list', { name: 'Le scritture, in ordine' });
  await expect(summary).toContainText('Il mutuo paga al venditore 180.000,00');
  await expect(summary).toContainText('Nessuna entrata: è debito, non reddito.');
  await expect(summary).not.toContainText('saldo al rogito');
  await page.getByRole('button', { name: 'Conferma', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Rogito d’acquisto registrato: ${HOUSE_2_NAME}` })).toBeVisible({ timeout: 30_000 });

  const house = await assetNamed(db, HOUSE_2_NAME);
  const loan = await assetNamed(db, `Mutuo ${HOUSE_2_NAME}`);
  // +200.000 house, −190.000 loan, +10.000 account (−20.000 already moved at the preliminare): the net worth stands.
  expect(house?.data()?.quantity).toBe(200000);
  expect(loan?.data()).toMatchObject({ type: 'loan', quantity: 190000, financedAssetId: house!.id });
  expect(await quantityOf(db, ACCOUNT_ID)).toBeCloseTo(accountBefore + 10000, 2);
  // The excess is neither income nor a transfer: no row carries it (the instalments' series is the only row).
  const rows = (await ownRows(db)).filter((row) => String(row.data().notes ?? '').includes(HOUSE_2_NAME));
  expect(rows.some((row) => Math.abs(row.data().amount) === 10000)).toBe(false);
  expect(rows.filter((row) => row.data().type !== 'debt')).toHaveLength(1); // the preliminare's deposit
});
