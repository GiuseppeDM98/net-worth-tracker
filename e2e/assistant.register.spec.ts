/**
 * Assistente › Registra at 1440px, on the base account (2026-11, doc/guide/assistente.md).
 *
 * WHY IT EXISTS: the protocol, the resolution and the card are held by Vitest; what only a browser
 * on the emulators knows is that «Registra» swaps the period axis for its strip and shows what the
 * assistant knows before any message, that a sentence becomes a card, that «Conferma» writes ONE
 * row through the expense services (the account moves, a future row waits), that the outcome is
 * saved on the message so a reload shows «Registrata» and never the buttons, that «Modifica» opens
 * the form on the proposal, that «apri in Cashflow» lands on the row's month and on the row, and that «Torna
 * all'analisi» leaves the register thread.
 *
 * The stream is ALWAYS faked (`e2e/assistantRegister.ts`): no request reaches a model. Amounts are
 * invented and round; the regexes take both no-break spaces before «€».
 */

import { test, expect } from '@playwright/test';
import {
  ACCOUNT_ID, ACCOUNT_START, FOOD_ID, FOOD_SUB_ID, HEALTH_ID, HEALTH_SUB_ID, THREAD_ID,
  admin, card, composer, enterRegister, expectDecoyUntouched, installFakeStream, italyDateIso, italyDayOffsetIso,
  openAssistant, outcomeSaved, plantExchange, plantFillers, plantFixture, previousMonthFifteenthIso, proposalBlock, quantityOf,
  removeFixture, resetFixture, send, storedProposals, writtenRows,
} from './assistantRegister';

const MONTH_NAMES = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

test.beforeAll(async () => {
  await plantFixture();
});
test.beforeEach(async () => {
  await resetFixture();
});
test.afterAll(async () => {
  await expectDecoyUntouched();
  await removeFixture();
});

test('«Registra» shows the strip and what the assistant knows; the owner’s sentence becomes a card and «Conferma» writes one row, once', async ({ page }) => {
  test.setTimeout(120_000);
  const recorder = await installFakeStream(page, () => `Ti propongo questa riga.\n\n${proposalBlock({ amount: 103 })}`);
  await openAssistant(page);
  await expect(page.getByRole('tablist', { name: 'Periodo di analisi' })).toBeVisible();

  await enterRegister(page);
  // The strip stands where the axis was; the composer has the focus.
  await expect(page.getByRole('tablist', { name: 'Periodo di analisi' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: "Torna all'analisi" })).toBeVisible();
  await expect(composer(page)).toBeFocused();
  await expect(composer(page)).toHaveAttribute('placeholder', 'Scrivi cosa hai speso o incassato…');

  // Before any message: the verdict is computed (never the skeleton) and the panel lists the account.
  const verdict = page.getByRole('region', { name: 'Verdetto sul contesto' });
  await expect(verdict).toContainText("Registra una spesa o un'entrata.");
  await expect(verdict).toContainText(/Conosco \d+ categorie e \d+ conti/);
  const companion = page.locator('[data-scene="register"]');
  await expect(companion).toContainText("Cosa conosce l'Assistente");
  await expect(companion.getByRole('list', { name: 'Conti' })).toContainText('Conto principale');
  await expect(companion.getByRole('list', { name: 'Conti' })).toContainText('addebito predefinito');
  await expect(companion).not.toContainText('righe lette');

  await send(page, 'Ciao, ho fatto spesa per 103 euro, per favore segnalo');
  const proposed = card(page, 'expense:0');
  await expect(proposed).toBeVisible();
  await expect(proposed).toContainText("L'Assistente propone");
  await expect(proposed).toContainText(/Spesa · 103,00\s€ · Cibo › Spesa · oggi · Conto principale/);
  // The request was the mode's, with no period; the panel now shows what the server read.
  expect(recorder.requests).toHaveLength(1);
  expect(recorder.requests[0]).toMatchObject({ mode: 'register', prompt: 'Ciao, ho fatto spesa per 103 euro, per favore segnalo' });
  expect(recorder.requests[0].month).toBeUndefined();
  await expect(companion).toContainText('ultime 4 righe lette');
  await expect(verdict).toContainText(/le ultime 4 righe/);

  // The accent is on what the model wrote — the assistant message and its card — and nowhere else.
  await expect(page.locator('main [data-generated]')).toHaveCount(2);
  await expect(verdict.locator('[data-generated]')).toHaveCount(0);
  await expect(companion.locator('[data-generated]')).toHaveCount(0);

  // A double click writes ONE row: the first click closes the button.
  const saved = outcomeSaved(page);
  await proposed.getByRole('button', { name: 'Conferma' }).dblclick();
  await expect(proposed.getByText('Registrata')).toBeVisible({ timeout: 30_000 });
  await expect(proposed.getByRole('button')).toHaveCount(0);
  await expect(proposed.getByRole('link', { name: 'apri in Cashflow' })).toHaveAttribute('href', new RegExp(`^/dashboard/cashflow\\?tab=tracking&month=${italyDateIso(new Date()).slice(0, 7)}&row=.+$`));
  expect((await saved).status()).toBe(200);

  const db = await admin();
  const rows = await writtenRows(db);
  expect(rows).toHaveLength(1);
  await expect(proposed.getByRole('link', { name: 'apri in Cashflow' })).toHaveAttribute('href', new RegExp(`&row=${rows[0].id}$`));
  const row = rows[0].data();
  expect(row).toMatchObject({ type: 'variable', amount: -103, categoryId: FOOD_ID, categoryName: 'Cibo', subCategoryId: FOOD_SUB_ID, subCategoryName: 'Spesa', linkedCashAssetId: ACCOUNT_ID });
  expect(row.balancePending).toBeFalsy();
  expect(italyDateIso(row.date.toDate())).toBe(italyDateIso(new Date()));
  expect(await quantityOf(db, ACCOUNT_ID)).toBeCloseTo(ACCOUNT_START - 103, 2);
  // The outcome is on the message the stream's `done` named, with the row's id.
  expect(await storedProposals(recorder.messageIds[0])).toMatchObject({ 'expense:0': { status: 'written', writtenIds: [rows[0].id] } });
});

test('two rows in one sentence are two cards with two outcomes, and a reload on ?mode=registra shows them — never the buttons', async ({ page }) => {
  test.setTimeout(120_000);
  const recorder = await installFakeStream(
    page,
    () =>
      [
        'Ti propongo due righe.',
        proposalBlock({ amount: 100, note: 'Coop' }),
        proposalBlock({ amount: 20, type: 'fixed', categoryId: HEALTH_ID, subCategoryId: HEALTH_SUB_ID, reason: 'La farmacia è Salute.' }),
      ].join('\n\n'),
  );
  await openAssistant(page);
  await enterRegister(page);
  await send(page, 'Ciao, ho speso 100 euro alla Coop per la spesa e 20 euro in farmacia');

  const first = card(page, 'expense:0');
  const second = card(page, 'expense:1');
  await expect(first).toContainText(/Spesa · 100,00\s€ · Cibo › Spesa · oggi · Conto principale/);
  await expect(first).toContainText('«Coop»');
  await expect(second).toContainText(/Spesa · 20,00\s€ · Salute › Farmacia · oggi · Conto principale/);
  await expect(page.locator('main [data-generated]')).toHaveCount(3);

  const confirmed = outcomeSaved(page);
  await first.getByRole('button', { name: 'Conferma' }).click();
  await expect(first.getByText('Registrata')).toBeVisible({ timeout: 30_000 });
  expect((await confirmed).status()).toBe(200);
  // The second card is still its own: three buttons, no outcome.
  await expect(second.getByRole('button', { name: 'Conferma' })).toBeEnabled();
  const ignored = outcomeSaved(page);
  await second.getByRole('button', { name: 'Ignora' }).click();
  await expect(second.getByText('Ignorata')).toBeVisible();
  expect((await ignored).status()).toBe(200);

  const db = await admin();
  const rows = await writtenRows(db);
  expect(rows).toHaveLength(1);
  expect(rows[0].data()).toMatchObject({ amount: -100, categoryId: FOOD_ID, notes: 'Coop' });
  const stored = await storedProposals(recorder.messageIds[0]);
  expect(stored['expense:0']).toMatchObject({ status: 'written', writtenIds: [rows[0].id] });
  expect(stored['expense:1'].status).toBe('ignored');
  expect(await quantityOf(db, ACCOUNT_ID)).toBeCloseTo(ACCOUNT_START - 100, 2);

  // A reload: the param opens the day's thread, read back from the documents.
  await openAssistant(page, '?mode=registra');
  await expect(page.getByRole('button', { name: "Torna all'analisi" })).toBeVisible({ timeout: 60_000 });
  await expect(card(page, 'expense:0').getByText('Registrata')).toBeVisible({ timeout: 60_000 });
  await expect(card(page, 'expense:1').getByText('Ignorata')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conferma' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ignora' })).toHaveCount(0);
  expect(await writtenRows(db)).toHaveLength(1);
});

test('«Modifica» opens the form on the proposal, and the row the form saves is the card’s outcome', async ({ page }) => {
  test.setTimeout(120_000);
  const recorder = await installFakeStream(page, () => `Ecco la riga.\n\n${proposalBlock({ amount: 103, note: 'Supermercato' })}`);
  await openAssistant(page);
  await enterRegister(page);
  await send(page, 'ho fatto spesa per 103 euro');

  const proposed = card(page, 'expense:0');
  await proposed.getByRole('button', { name: 'Modifica' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Nuova spesa non necessaria' })).toBeVisible({ timeout: 30_000 });
  // The form, not the type picker, with the proposal in its fields.
  await expect(dialog.locator('#amount')).toHaveValue('103');
  await expect(dialog.locator('#categoryId')).toHaveValue('Cibo');
  await expect(dialog.locator('#subCategoryId')).toHaveValue('Spesa');
  await expect(dialog.locator('#notes')).toHaveValue('Supermercato');
  await expect(dialog.locator('#linkedCashAssetId')).toContainText('Conto principale');

  await dialog.locator('#amount').fill('105');
  const saved = outcomeSaved(page);
  await dialog.getByRole('button', { name: 'Crea voce' }).click();
  await expect(proposed.getByText('Registrata')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await saved).status()).toBe(200);

  const db = await admin();
  const rows = await writtenRows(db);
  expect(rows).toHaveLength(1);
  expect(rows[0].data()).toMatchObject({ amount: -105, categoryId: FOOD_ID, subCategoryId: FOOD_SUB_ID, linkedCashAssetId: ACCOUNT_ID, notes: 'Supermercato' });
  expect(await quantityOf(db, ACCOUNT_ID)).toBeCloseTo(ACCOUNT_START - 105, 2);
  expect(await storedProposals(recorder.messageIds[0])).toMatchObject({ 'expense:0': { status: 'written', writtenIds: [rows[0].id] } });
});

test('a row dated tomorrow says when it moves the account, and waits: the row is pending, the balance still', async ({ page }) => {
  test.setTimeout(120_000);
  const tomorrow = italyDayOffsetIso(1);
  await installFakeStream(page, () => `Ecco la riga di domani.\n\n${proposalBlock({ amount: 40, dateIso: tomorrow })}`);
  await openAssistant(page);
  await enterRegister(page);
  await send(page, 'domani spendo 40 euro di spesa');

  const proposed = card(page, 'expense:0');
  const [year, month, day] = tomorrow.split('-');
  await expect(proposed).toContainText(`si applica al saldo il ${day}/${month}/${year}`);
  await proposed.getByRole('button', { name: 'Conferma' }).click();
  await expect(proposed.getByText('Registrata')).toBeVisible({ timeout: 30_000 });

  const db = await admin();
  const rows = await writtenRows(db);
  expect(rows).toHaveLength(1);
  expect(rows[0].data()).toMatchObject({ amount: -40, balancePending: true, linkedCashAssetId: ACCOUNT_ID });
  expect(italyDateIso(rows[0].data().date.toDate())).toBe(tomorrow);
  expect(await quantityOf(db, ACCOUNT_ID)).toBeCloseTo(ACCOUNT_START, 2);
});

test('«apri in Cashflow» opens Tracciamento on the row’s month and ON the row, past the first page, in the Feed and in the Tabella', async ({ page }) => {
  test.setTimeout(240_000);
  const dateIso = previousMonthFifteenthIso();
  // 25 rows dated after it in the same month: under the default order (newest first) the row sits on the SECOND page of both views (20 a page).
  await plantFillers(previousMonthFifteenthIso(20), 25);
  await installFakeStream(page, () => `Ecco la riga del mese scorso.\n\n${proposalBlock({ amount: 55, dateIso })}`);
  await openAssistant(page);
  await enterRegister(page);
  await send(page, 'il 15 del mese scorso ho speso 55 euro di spesa');

  const proposed = card(page, 'expense:0');
  const [year, month] = dateIso.split('-');
  await expect(proposed).toContainText(`15/${month}/${year}`);
  const saved = outcomeSaved(page);
  await proposed.getByRole('button', { name: 'Conferma' }).click();
  await expect(proposed.getByText('Registrata')).toBeVisible({ timeout: 30_000 });
  await saved;

  await proposed.getByRole('link', { name: 'apri in Cashflow' }).click();
  await page.waitForURL(new RegExp(`/dashboard/cashflow\\?tab=tracking&month=${year}-${month}`), { timeout: 60_000 });
  const label = `${MONTH_NAMES[Number(month) - 1]} ${year}`;
  await expect(page.getByRole('combobox', { name: `Periodo selezionato: ${label}` }).filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 });

  // The Feed: the list reaches the row, the row is on screen, marked and focused.
  const db = await admin();
  const [written] = await writtenRows(db);
  await expect(page).toHaveURL(new RegExp(`row=${written.id}`));
  const feedRow = page.locator(`button[data-expense-id="${written.id}"]`).filter({ visible: true });
  await expect(feedRow).toBeVisible({ timeout: 60_000 });
  await expect(feedRow).toHaveAttribute('data-linked-row', 'true');
  await expect(feedRow).toBeInViewport();
  await expect(feedRow).toBeFocused();
  await expect(page.locator('[data-linked-row="true"]')).toHaveCount(1);

  // The Tabella (the stored view of a desktop): the table turns to the row's page and marks it.
  await page.evaluate(() => window.localStorage.setItem('cashflow.movimenti.vista', 'table'));
  await page.reload({ waitUntil: 'load' });
  const tableRow = page.locator(`tr[data-expense-id="${written.id}"]`);
  await expect(tableRow).toBeVisible({ timeout: 60_000 });
  await expect(tableRow).toHaveAttribute('data-linked-row', 'true');
  await expect(tableRow).toBeInViewport();
  await expect(page.locator('[data-linked-row="true"]').filter({ visible: true })).toHaveCount(1);
  await page.evaluate(() => window.localStorage.removeItem('cashflow.movimenti.vista'));
});

test('«Torna all’analisi» leaves the register thread: the axis is back and the conversation is empty', async ({ page }) => {
  test.setTimeout(120_000);
  // The thread of today, planted: the param opens it.
  await plantExchange('ieri ho speso 12 euro di spesa', 'Riga di ieri annotata: fenicottero.');
  const recorder = await installFakeStream(page, () => 'Non serve.');
  await openAssistant(page, '?mode=registra');
  const conversation = page.getByRole('region', { name: 'Conversazione' });
  await expect(conversation).toContainText('Riga di ieri annotata: fenicottero.', { timeout: 60_000 });
  await expect(page.getByRole('tablist', { name: 'Periodo di analisi' })).toHaveCount(0);

  await page.getByRole('button', { name: "Torna all'analisi" }).click();
  const axis = page.getByRole('tablist', { name: 'Periodo di analisi' });
  await expect(axis).toBeVisible();
  await expect(axis.getByRole('tab', { name: 'Mese' })).toHaveAttribute('aria-selected', 'true');
  // The register thread is no longer open: its message is gone and the next question would not go into it.
  await expect(conversation).not.toContainText('fenicottero');
  await expect(page.locator('[data-scene="month_analysis"]')).toBeVisible();
  await expect(page).not.toHaveURL(/mode=registra/);
  expect(recorder.requests).toHaveLength(0);
  const db = await admin();
  expect((await db.collection('assistantThreads').doc(THREAD_ID).get()).exists).toBe(true);
});

test('back from Cashflow, the next sentence goes into the day’s thread — never into a second one', async ({ page }) => {
  test.setTimeout(180_000);
  const recorder = await installFakeStream(page, (prompt) => (prompt.includes('budget') ? 'Sei in linea: fenicottero.' : `Ecco la riga.\n\n${proposalBlock({ amount: 30 })}`));
  // The way the owner got there on 2026-11-11: a reload on the param, the card's link, the browser's Back.
  await plantExchange('ho speso 30 euro di spesa', `Ecco la riga.\n\n${proposalBlock({ amount: 30 })}`);
  await openAssistant(page, '?mode=registra');
  const proposed = card(page, 'expense:0');
  const saved = outcomeSaved(page);
  await proposed.getByRole('button', { name: 'Conferma' }).click();
  await expect(proposed.getByText('Registrata')).toBeVisible({ timeout: 30_000 });
  await saved;
  await proposed.getByRole('link', { name: 'apri in Cashflow' }).click();
  await page.waitForURL(/\/dashboard\/cashflow\?tab=tracking/, { timeout: 60_000 });
  await expect(page.locator('[data-linked-row="true"]').filter({ visible: true })).toHaveCount(1, { timeout: 60_000 });

  await page.goBack();
  await expect(page.getByRole('button', { name: "Torna all'analisi" })).toBeVisible({ timeout: 60_000 });
  await expect(card(page, 'expense:0').getByText('Registrata')).toBeVisible({ timeout: 60_000 });
  await send(page, 'come sono messo col budget');
  await expect(page.getByRole('region', { name: 'Conversazione' })).toContainText('fenicottero', { timeout: 30_000 });
  expect(recorder.requests).toHaveLength(1);
  expect(recorder.requests[0].threadId).toBe(THREAD_ID);
  // The earlier exchange is still on screen: the same conversation.
  await expect(card(page, 'expense:0').getByText('Registrata')).toBeVisible();
});
