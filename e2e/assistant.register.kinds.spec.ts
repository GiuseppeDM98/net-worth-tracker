/**
 * Assistente › Registra at 1440px: the kinds of row beyond a plain expense (2026-11,
 * doc/guide/assistente.md § Registra).
 *
 * WHY IT EXISTS: the resolver and the card are held by Vitest on mocked services; what only the
 * emulators know is that «Conferma» writes each kind as the expense dialog does — a transfer moves
 * two balances (or a house's value), an instalment repays the loan and splits its principal from its
 * interest, a series is twelve documents of one parent, a fee is a second row linked to the first in
 * the category of Impostazioni, and a new category or subcategory is written BEFORE the row that
 * names it. Then that a reload reads every card back as written, and that «Registra un'altra» comes
 * first among the chips once a card is written.
 *
 * The stream is ALWAYS faked (`e2e/assistantRegister.ts`): no request reaches a model. The fixture
 * lives under the ids `e2e-reg-kinds-` and is removed here, whole, in `afterAll`; invented round
 * amounts; the regexes take both no-break spaces before «€».
 */

import { test, expect } from '@playwright/test';
import {
  UID, admin, card, composer, enterRegister, expectDecoyUntouched, installFakeStream, openAssistant, outcomeSaved,
  plantFixture, quantityOf, rawProposalBlock, removeFixture, resetFixture, send, storedProposals,
} from './assistantRegister';

const ACCOUNT_A = 'e2e-reg-kinds-conto-a';
const ACCOUNT_B = 'e2e-reg-kinds-conto-b';
const HOUSE = 'e2e-reg-kinds-casa';
const LOAN = 'e2e-reg-kinds-mutuo';
const FUN = 'e2e-reg-kinds-svago';
const FUN_SUB = 'e2e-reg-kinds-cinema';
const TRANSFERS = 'e2e-reg-kinds-trasferimenti';
const INSTALMENTS = 'e2e-reg-kinds-rate';
const FEES = 'e2e-reg-kinds-banca';
const A_START = 3000;
const B_START = 1000;
const HOUSE_START = 150_000;
const LOAN_START = 1000;
const NEW_SUB = 'Ceramica ornitorinco';
const NEW_CATEGORY = 'Vasi ornitorinco';

type Db = Awaited<ReturnType<typeof admin>>;
let savedSettings: FirebaseFirestore.DocumentData = {};

async function plantKinds(db: Db): Promise<void> {
  const now = new Date();
  const cash = (id: string, name: string, quantity: number) => db.collection('assets').doc(id).set({
    userId: UID, ticker: 'CASH', name, type: 'cash', assetClass: 'cash', currency: 'EUR', quantity, currentPrice: 1,
    subCategory: 'Conto Corrente', lastPriceUpdate: now, createdAt: now, updatedAt: now,
  });
  await cash(ACCOUNT_A, 'Conto A ornitorinco', A_START);
  await cash(ACCOUNT_B, 'Conto B ornitorinco', B_START);
  // A house the way the form creates one: its value in `quantity` at price 1.
  await db.collection('assets').doc(HOUSE).set({
    userId: UID, ticker: '', name: 'Casa ornitorinco', type: 'realestate', assetClass: 'realestate', currency: 'EUR',
    quantity: HOUSE_START, currentPrice: 1, isLiquid: false, autoUpdatePrice: false, allocationRole: 'excluded', lastPriceUpdate: now, createdAt: now, updatedAt: now,
  });
  await db.collection('assets').doc(LOAN).set({
    userId: UID, ticker: '', name: 'Mutuo ornitorinco', type: 'loan', assetClass: 'realestate', currency: 'EUR', quantity: LOAN_START, currentPrice: 1,
    debtInterestRate: 1.2, isLiquid: false, autoUpdatePrice: false, stampDutyExempt: true, allocationRole: 'excluded', financedAssetId: HOUSE,
    lastPriceUpdate: now, createdAt: now, updatedAt: now,
  });
  const category = (id: string, name: string, type: string, subCategories: { id: string; name: string }[] = []) =>
    db.collection('expenseCategories').doc(id).set({ userId: UID, name, type, subCategories, createdAt: now, updatedAt: now });
  await category(FUN, 'Svago ornitorinco', 'variable', [{ id: FUN_SUB, name: 'Cinema' }]);
  await category(TRANSFERS, 'Giroconti ornitorinco', 'transfer');
  await category(INSTALMENTS, 'Rate ornitorinco', 'debt');
  await category(FEES, 'Banca ornitorinco', 'variable');
}

/** The rows and the category the app created with ids of its own: found by the names this spec gave them. */
async function removeCreated(db: Db): Promise<void> {
  const created = await db.collection('expenseCategories').where('userId', '==', UID).where('name', '==', NEW_CATEGORY).get();
  for (const category of created.docs) {
    const rows = await db.collection('expenses').where('userId', '==', UID).where('categoryId', '==', category.id).get();
    for (const row of rows.docs) await row.ref.delete();
    await category.ref.delete();
  }
}

test.beforeAll(async () => {
  const db = await admin();
  // Read whole BEFORE the shared fixture writes its defaults: put back as it was, at the end.
  savedSettings = (await db.collection('assetAllocationTargets').doc(UID).get()).data() ?? {};
  await plantFixture();
  await db.collection('assetAllocationTargets').doc(UID).set({ transferFeeCategoryId: FEES }, { merge: true });
});
test.beforeEach(async () => {
  const db = await admin();
  // `resetFixture` removes every row in an `e2e-reg-` category, these included.
  await resetFixture();
  await removeCreated(db);
  await plantKinds(db);
});
test.afterAll(async () => {
  const db = await admin();
  await expectDecoyUntouched();
  await resetFixture();
  await removeCreated(db);
  for (const id of [ACCOUNT_A, ACCOUNT_B, HOUSE, LOAN]) await db.collection('assets').doc(id).delete();
  for (const id of [FUN, TRANSFERS, INSTALMENTS, FEES]) await db.collection('expenseCategories').doc(id).delete();
  await removeFixture();
  await db.collection('assetAllocationTargets').doc(UID).set(savedSettings);
});

/** Opens Registra with the fake answering `content`, sends a sentence and waits for the first card. */
async function proposeAndConfirm(page: import('@playwright/test').Page, content: string) {
  const recorder = await installFakeStream(page, () => content);
  await openAssistant(page);
  await enterRegister(page);
  await send(page, 'Registra questa, per favore');
  const proposed = card(page, 'expense:0');
  await expect(proposed).toBeVisible();
  const saved = outcomeSaved(page);
  await proposed.getByRole('button', { name: 'Conferma' }).click();
  await saved;
  return { recorder, proposed };
}

async function rowsOf(db: Db, field: string, value: string) {
  return (await db.collection('expenses').where('userId', '==', UID).where(field, '==', value).get()).docs;
}

test('a transfer between two accounts moves both balances', async ({ page }) => {
  test.setTimeout(120_000);
  const { proposed } = await proposeAndConfirm(page, rawProposalBlock({ kind: 'transfer', type: 'transfer', amount: 500, categoryId: TRANSFERS, fromAccount: ACCOUNT_A, toAccount: ACCOUNT_B, note: 'giro ornitorinco' }));
  await expect(proposed.getByText('Registrata')).toBeVisible({ timeout: 30_000 });
  const db = await admin();
  expect(await quantityOf(db, ACCOUNT_A)).toBe(A_START - 500);
  expect(await quantityOf(db, ACCOUNT_B)).toBe(B_START + 500);
  const [row] = await rowsOf(db, 'categoryId', TRANSFERS);
  expect(row.data()).toMatchObject({ type: 'transfer', linkedCashAssetId: ACCOUNT_A, transferCashAssetId: ACCOUNT_B });
});

test('a transfer onto a house raises its value, and the card says so before «Conferma»', async ({ page }) => {
  test.setTimeout(120_000);
  const recorder = await installFakeStream(page, () => rawProposalBlock({ kind: 'transfer', type: 'transfer', amount: 2000, categoryId: TRANSFERS, fromAccount: ACCOUNT_A, toAccount: HOUSE }));
  await openAssistant(page);
  await enterRegister(page);
  await send(page, 'Ho messo 2000 euro nella casa');
  const proposed = card(page, 'expense:0');
  await expect(proposed).toContainText(/verso l'immobile Casa ornitorinco: il valore della casa sale di 2\.?000,00\s€/);
  const saved = outcomeSaved(page);
  await proposed.getByRole('button', { name: 'Conferma' }).click();
  await saved;
  const db = await admin();
  expect(await quantityOf(db, HOUSE)).toBe(HOUSE_START + 2000);
  expect(await quantityOf(db, ACCOUNT_A)).toBe(A_START - 2000);
  expect(recorder.requests).toHaveLength(1);
});

test('an instalment repays the loan: principal and interest split on the row', async ({ page }) => {
  test.setTimeout(120_000);
  const { proposed } = await proposeAndConfirm(page, rawProposalBlock({ kind: 'debt', type: 'debt', amount: 12.34, categoryId: INSTALMENTS, loanName: LOAN, accountId: ACCOUNT_A }));
  await expect(proposed.getByText('Registrata')).toBeVisible({ timeout: 30_000 });
  const db = await admin();
  // 1000 € at 1,2% a year: 1,00 € of interest this month, the other 11,34 € repay the debt.
  expect(await quantityOf(db, LOAN)).toBeCloseTo(988.66, 2);
  expect(await quantityOf(db, ACCOUNT_A)).toBeCloseTo(A_START - 12.34, 2);
  const [row] = await rowsOf(db, 'categoryId', INSTALMENTS);
  expect(row.data()).toMatchObject({ debtAssetId: LOAN, debtPrincipalRepaid: 11.34, debtInterestPaid: 1 });
});

test('a monthly series is twelve documents of one parent, «12 righe registrate»', async ({ page }) => {
  test.setTimeout(120_000);
  const { proposed } = await proposeAndConfirm(page, rawProposalBlock({ kind: 'expense', type: 'variable', amount: 10, categoryId: FUN, subCategoryId: FUN_SUB, recurring: { frequency: 'monthly', count: 12 } }));
  await expect(proposed.getByText('12 righe registrate')).toBeVisible({ timeout: 30_000 });
  const rows = await rowsOf(await admin(), 'categoryId', FUN);
  expect(rows).toHaveLength(12);
  expect(new Set(rows.map((row) => row.data().recurringParentId)).size).toBe(1);
  expect(rows[0].data().recurringParentId).toBeTruthy();
});

test('a row with a fee writes two documents: the fee linked to its row, in the category of Impostazioni', async ({ page }) => {
  test.setTimeout(120_000);
  const { proposed } = await proposeAndConfirm(page, rawProposalBlock({ kind: 'expense', type: 'variable', amount: 20, categoryId: FUN, subCategoryId: FUN_SUB, fee: { amount: 1.5 } }));
  await expect(proposed.getByText('+ 1 commissione')).toBeVisible({ timeout: 30_000 });
  const db = await admin();
  const [parent] = await rowsOf(db, 'categoryId', FUN);
  const [fee] = await rowsOf(db, 'categoryId', FEES);
  expect(parent.data().amount).toBe(-20);
  expect(fee.data()).toMatchObject({ amount: -1.5, feeOfTransferId: parent.id });
});

test('a new subcategory is written under its category before the row that names it', async ({ page }) => {
  test.setTimeout(120_000);
  const { proposed } = await proposeAndConfirm(page, rawProposalBlock({ kind: 'expense', type: 'variable', amount: 30, categoryId: FUN, newSubCategory: { categoryId: FUN, name: NEW_SUB } }));
  await expect(proposed.getByText('Registrata')).toBeVisible({ timeout: 30_000 });
  const db = await admin();
  const subs = (await db.collection('expenseCategories').doc(FUN).get()).data()!.subCategories as { id: string; name: string }[];
  expect(subs.map((sub) => sub.name)).toEqual(['Cinema', NEW_SUB]);
  const [row] = await rowsOf(db, 'categoryId', FUN);
  expect(row.data().subCategoryId).toBe(subs[1].id);
});

test('a new category is a document of its own, and the row is in it', async ({ page }) => {
  test.setTimeout(120_000);
  const { proposed } = await proposeAndConfirm(page, rawProposalBlock({ kind: 'expense', type: 'variable', amount: 40, newCategory: { name: NEW_CATEGORY, type: 'variable' } }));
  await expect(proposed.getByText('Registrata')).toBeVisible({ timeout: 30_000 });
  const db = await admin();
  const created = await db.collection('expenseCategories').where('userId', '==', UID).where('name', '==', NEW_CATEGORY).get();
  expect(created.docs).toHaveLength(1);
  expect(created.docs[0].data()).toMatchObject({ type: 'variable' });
  const rows = await rowsOf(db, 'categoryId', created.docs[0].id);
  expect(rows).toHaveLength(1);
  expect(rows[0].data().amount).toBe(-40);
});

test('a reload reads every written card back; «Registra un’altra» comes first and only empties the composer', async ({ page }) => {
  test.setTimeout(150_000);
  const content = [
    'Ecco le due righe.',
    rawProposalBlock({ kind: 'transfer', type: 'transfer', amount: 100, categoryId: TRANSFERS, fromAccount: ACCOUNT_A, toAccount: ACCOUNT_B }),
    rawProposalBlock({ kind: 'expense', type: 'variable', amount: 20, categoryId: FUN, subCategoryId: FUN_SUB, fee: { amount: 1.5 } }),
  ].join('\n\n');
  const recorder = await installFakeStream(page, () => content);
  await openAssistant(page);
  await enterRegister(page);
  await send(page, 'Registra queste due');
  for (const key of ['expense:0', 'expense:1']) {
    const saved = outcomeSaved(page);
    await card(page, key).getByRole('button', { name: 'Conferma' }).click();
    await saved;
    await expect(card(page, key).getByText('Registrata')).toBeVisible({ timeout: 30_000 });
  }

  const chips = page.getByRole('list', { name: 'Continua con' }).getByRole('button');
  const another = page.getByRole('button', { name: "Registra un'altra" });
  await expect(another).toBeVisible();
  await expect(chips.first()).toHaveText("Registra un'altra");
  await composer(page).fill('bozza');
  await another.click();
  await expect(composer(page)).toBeFocused();
  await expect(composer(page)).toHaveValue('');
  expect(recorder.requests).toHaveLength(1);

  const stored = await storedProposals(recorder.messageIds[0]);
  expect(stored['expense:0']?.status).toBe('written');
  expect(stored['expense:1']?.writtenIds).toHaveLength(2);

  // A reload: the param opens the day's thread, read back from the documents.
  await openAssistant(page, '?mode=registra');
  for (const key of ['expense:0', 'expense:1']) {
    await expect(card(page, key).getByText('Registrata')).toBeVisible({ timeout: 60_000 });
    await expect(card(page, key).getByRole('button', { name: 'Conferma' })).toHaveCount(0);
  }
  await expect(card(page, 'expense:1').getByText('+ 1 commissione')).toBeVisible();
});
