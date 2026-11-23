/**
 * Assistente › Registra at 1440px, on the base account (2026-11, doc/guide/assistente-registra.md).
 *
 * WHY IT EXISTS: the protocol, the resolution and the card are held by Vitest; what only a browser
 * on the emulators knows is that a sentence written in the chat (no axis, no «Registra» button
 * since 2026-11-12) is read as a registration and becomes a card with the companion showing what the
 * assistant knows, that «Conferma» writes ONE row through the expense services (the account moves,
 * a future row waits), that the outcome is saved on the message so a reload on `?thread=` shows
 * «Registrata» and never the buttons, that «Modifica» opens the form on the proposal, that «apri in
 * Cashflow» lands on the row's month and on the row, and that «Nuova conversazione» leaves the thread.
 *
 * The stream is ALWAYS faked (`e2e/assistantRegister.ts`): no request reaches a model. Amounts are
 * invented and round; the regexes take both no-break spaces before «€».
 */

import { test, expect } from '@playwright/test';
import {
  ACCOUNT_ID, ACCOUNT_START, FOOD_ID, FOOD_SUB_ID, HEALTH_ID, HEALTH_SUB_ID, THREAD_ID,
  admin, card, expectDecoyUntouched, installFakeStream, italyDateIso, italyDayOffsetIso,
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

test('a sentence written in the chat is read as a registration: a card, what the assistant knows, and «Conferma» writes one row, once', async ({ page }) => {
  test.setTimeout(120_000);
  const recorder = await installFakeStream(page, () => `Ti propongo questa riga.\n\n${proposalBlock({ amount: 103 })}`);
  await openAssistant(page);
  // Only a chat: no period axis, no «Registra» button — the composer takes the sentence.
  await expect(page.getByRole('tablist', { name: 'Periodo di analisi' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Registra un movimento' })).toHaveCount(0);

  await send(page, 'Ciao, ho fatto spesa per 103 euro, per favore segnalo');
  const proposed = card(page, 'expense:0');
  await expect(proposed).toBeVisible();
  await expect(proposed).toContainText("L'Assistente propone");
  await expect(proposed).toContainText(/Spesa · 103,00\s€ · Cibo › Spesa · oggi · Conto principale/);
  await expect(page.getByText('Ho letto: un movimento da registrare')).toBeVisible();
  // The request was `auto`, with no period; the router's reading turned the page to the registration.
  expect(recorder.requests).toHaveLength(1);
  expect(recorder.requests[0]).toMatchObject({ mode: 'auto', prompt: 'Ciao, ho fatto spesa per 103 euro, per favore segnalo' });
  expect(recorder.requests[0].month).toBeUndefined();
  expect(recorder.requests[0].route).toBeUndefined();

  // After the answer: the verdict is the registration's and the panel lists the account and what the server read.
  const verdict = page.getByRole('region', { name: 'Verdetto sul contesto' });
  await expect(verdict).toContainText('Registra un movimento.');
  // What the server read: the categories, the account and the last rows (the stream's `register` summary).
  await expect(verdict).toContainText(/Conosco \d+ categorie, \d+ cont[oi] e le ultime 4 righe/);
  const companion = page.locator('[data-scene="register"]');
  await expect(companion).toContainText("Cosa conosce l'Assistente");
  await expect(companion.getByRole('list', { name: 'Conti' })).toContainText('Conto principale');
  await expect(companion.getByRole('list', { name: 'Conti' })).toContainText('addebito predefinito');
  await expect(companion).toContainText('ultime 4 righe lette');

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

test('two rows in one sentence are two cards with two outcomes, and a reload on ?thread= shows them — never the buttons', async ({ page }) => {
  test.setTimeout(120_000);
  const recorder = await installFakeStream(
    page,
    () =>
      [
        'Ti propongo due righe.',
        proposalBlock({ amount: 100, note: 'Coop' }),
        proposalBlock({ amount: 20, type: 'fixed', categoryId: HEALTH_ID, subCategoryId: HEALTH_SUB_ID, reason: 'La farmacia è Salute.' }),
        // A tail long enough to put the conversation's end below the fold: an outcome that scrolled
        // to it would move the page (below).
        ...Array.from({ length: 30 }, (_, index) => `Nota ${index + 1} in coda alla risposta.`),
      ].join('\n\n'),
  );
  await openAssistant(page);
  await send(page, 'Ciao, ho speso 100 euro alla Coop per la spesa e 20 euro in farmacia');

  const first = card(page, 'expense:0');
  const second = card(page, 'expense:1');
  await expect(first).toContainText(/Spesa · 100,00\s€ · Cibo › Spesa · oggi · Conto principale/);
  await expect(first).toContainText('«Coop»');
  await expect(second).toContainText(/Spesa · 20,00\s€ · Salute › Farmacia · oggi · Conto principale/);
  await expect(page.locator('main [data-generated]')).toHaveCount(3);

  // An outcome never moves the page (seen red on 2026-11-11 with the scroll keyed on the messages
  // themselves): the cards are brought up, away from the conversation's end, and stay where they are.
  await expect(page.getByText('Nota 30 in coda alla risposta.')).toBeInViewport({ timeout: 30_000 });
  await first.scrollIntoViewIfNeeded();
  await expect(page.getByText('Nota 30 in coda alla risposta.')).not.toBeInViewport();
  const firstTop = async () => Math.round((await first.boundingBox())!.y);
  await expect.poll(async () => { const a = await firstTop(); await page.waitForTimeout(250); return (await firstTop()) === a; }).toBe(true);
  const topBefore = await firstTop();

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
  // Long enough for a smooth scroll to have started and ended.
  await page.waitForTimeout(1200);
  expect(await firstTop()).toBe(topBefore);
  await expect(page.getByText('Nota 30 in coda alla risposta.')).not.toBeInViewport();

  const db = await admin();
  const rows = await writtenRows(db);
  expect(rows).toHaveLength(1);
  expect(rows[0].data()).toMatchObject({ amount: -100, categoryId: FOOD_ID, notes: 'Coop' });
  const stored = await storedProposals(recorder.messageIds[0]);
  expect(stored['expense:0']).toMatchObject({ status: 'written', writtenIds: [rows[0].id] });
  expect(stored['expense:1'].status).toBe('ignored');
  expect(await quantityOf(db, ACCOUNT_ID)).toBeCloseTo(ACCOUNT_START - 100, 2);

  // A reload: the URL kept the thread (`?thread=`), read back from the documents.
  await expect(page).toHaveURL(new RegExp(`thread=${THREAD_ID}`));
  await openAssistant(page, `?thread=${THREAD_ID}`);
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

test('«Nuova conversazione» empties the conversation and drops `?thread`', async ({ page }) => {
  test.setTimeout(120_000);
  // A planted thread: the param opens it.
  await plantExchange('ieri ho speso 12 euro di spesa', 'Riga di ieri annotata: fenicottero.');
  const recorder = await installFakeStream(page, () => 'Non serve.');
  await openAssistant(page, `?thread=${THREAD_ID}`);
  const conversation = page.getByRole('region', { name: 'Conversazione' });
  await expect(conversation).toContainText('Riga di ieri annotata: fenicottero.', { timeout: 60_000 });
  await expect(page.locator('[data-scene="register"]')).toBeVisible();

  await page.getByRole('button', { name: 'Nuova conversazione' }).filter({ visible: true }).first().click();
  // The thread is no longer open: its message is gone and the next question would not go into it.
  await expect(conversation).not.toContainText('fenicottero');
  await expect(conversation.getByRole('list', { name: 'Domande suggerite' })).toBeVisible();
  await expect(page.locator('[data-scene="chat"]')).toBeVisible();
  await expect(page).not.toHaveURL(/thread=/);
  expect(recorder.requests).toHaveLength(0);
  const db = await admin();
  expect((await db.collection('assistantThreads').doc(THREAD_ID).get()).exists).toBe(true);
});

test('back from Cashflow on `?thread=`, the next sentence goes into that thread — never into a second one', async ({ page }) => {
  test.setTimeout(180_000);
  const recorder = await installFakeStream(page, (prompt) => (prompt.includes('budget') ? 'Sei in linea: fenicottero.' : `Ecco la riga.\n\n${proposalBlock({ amount: 30 })}`));
  // The way the owner got there on 2026-11-11: the thread on screen, the card's link, the browser's Back.
  await plantExchange('ho speso 30 euro di spesa', `Ecco la riga.\n\n${proposalBlock({ amount: 30 })}`);
  await openAssistant(page, `?thread=${THREAD_ID}`);
  const proposed = card(page, 'expense:0');
  const saved = outcomeSaved(page);
  await proposed.getByRole('button', { name: 'Conferma' }).click();
  await expect(proposed.getByText('Registrata')).toBeVisible({ timeout: 30_000 });
  await saved;
  await proposed.getByRole('link', { name: 'apri in Cashflow' }).click();
  await page.waitForURL(/\/dashboard\/cashflow\?tab=tracking/, { timeout: 60_000 });
  await expect(page.locator('[data-linked-row="true"]').filter({ visible: true })).toHaveCount(1, { timeout: 60_000 });

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`thread=${THREAD_ID}`));
  await expect(card(page, 'expense:0').getByText('Registrata')).toBeVisible({ timeout: 60_000 });
  await send(page, 'come sono messo col budget');
  await expect(page.getByRole('region', { name: 'Conversazione' })).toContainText('fenicottero', { timeout: 30_000 });
  expect(recorder.requests).toHaveLength(1);
  expect(recorder.requests[0].threadId).toBe(THREAD_ID);
  // The earlier exchange is still on screen: the same conversation.
  await expect(card(page, 'expense:0').getByText('Registrata')).toBeVisible();
});
