/**
 * Assistente › Registra at 1440px: the questions the Assistente asks (2026-11,
 * doc/guide/assistente.md § Registra; DESIGN.md → The Question-Card Rule).
 *
 * WHY IT EXISTS: the parser and the card are held by Vitest; what only a browser knows is that a
 * message of two ```assistant-question blocks draws two cards and ONE «Rispondi», that «Altro…»
 * on an account question picks among the page's own accounts, that the answer leaves as ONE
 * request whose prompt is one line per question, that the answers are kept on the message so a
 * reload reads them back, that a card in a message with a question waits for the answer, and that
 * an older question may no longer be answered.
 *
 * The stream is ALWAYS faked (`e2e/assistantRegister.ts`): no request reaches a model. Six
 * accounts under the ids `e2e-reg-q-`, removed here in `afterAll`.
 */

import { test, expect } from '@playwright/test';
import {
  UID, admin, card, enterRegister, expectDecoyUntouched, installFakeStream, openAssistant, plantFixture, proposalBlock,
  questionBlock, questionCard, removeFixture, resetFixture, send, storedProposals,
} from './assistantRegister';

const ACCOUNTS = ['Uno', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei'].map((name, index) => ({ id: `e2e-reg-q-conto-${index + 1}`, name: `Conto ${name} ornitorinco` }));
const option = (index: number) => ({ value: ACCOUNTS[index].id, label: ACCOUNTS[index].name });

const QUESTIONS = [
  'Mi servono i due conti.',
  questionBlock({ id: 'account:from', text: 'Da quale conto?', options: [option(0), option(1), option(2)] }),
  questionBlock({ id: 'account:to', text: 'Su quale conto?', options: [option(0), option(1), option(2)] }),
].join('\n\n');
const QUESTION_AND_CARD = ['Ancora una cosa.', questionBlock({ id: 'abitudine', text: 'È una spesa abituale?', options: [{ value: 'si', label: 'Sì' }, { value: 'no', label: 'No' }] }), proposalBlock({ amount: 20 })].join('\n\n');

test.beforeAll(async () => {
  await plantFixture();
  const db = await admin();
  const now = new Date();
  for (const account of ACCOUNTS) {
    await db.collection('assets').doc(account.id).set({
      userId: UID, ticker: 'CASH', name: account.name, type: 'cash', assetClass: 'cash', currency: 'EUR', quantity: 100, currentPrice: 1,
      subCategory: 'Conto Corrente', lastPriceUpdate: now, createdAt: now, updatedAt: now,
    });
  }
});
test.beforeEach(async () => {
  await resetFixture();
});
test.afterAll(async () => {
  await expectDecoyUntouched();
  const db = await admin();
  for (const account of ACCOUNTS) await db.collection('assets').doc(account.id).delete();
  await removeFixture();
});

test('two questions, one «Rispondi»; the answer is one request of two lines, kept on the message; an older question is closed', async ({ page }) => {
  test.setTimeout(150_000);
  const recorder = await installFakeStream(page, (prompt) => (prompt.includes('→') ? QUESTION_AND_CARD : QUESTIONS));
  await openAssistant(page);
  await enterRegister(page);
  await send(page, 'Ho spostato 500 euro');

  const from = questionCard(page, 'account:from');
  const to = questionCard(page, 'account:to');
  await expect(from).toBeVisible();
  await expect(to).toBeVisible();
  await expect(page.getByText("L'Assistente chiede")).toHaveCount(2);
  const respond = page.getByRole('button', { name: 'Rispondi' });
  await expect(respond).toHaveCount(1);
  await expect(respond).toBeDisabled();
  // An entity question has no «Preferisco non dire».
  await expect(from.getByRole('radio', { name: 'Preferisco non dire' })).toHaveCount(0);

  await from.getByRole('radio', { name: ACCOUNTS[1].name }).click();
  await expect(respond).toBeDisabled();
  await to.getByRole('radio', { name: 'Altro…' }).click();
  await to.getByRole('combobox', { name: 'Scegli fra tutti i conti' }).click();
  // The page's own accounts, not the model's three.
  for (const account of ACCOUNTS) await expect(page.getByRole('option', { name: account.name })).toBeVisible();
  await page.getByRole('option', { name: ACCOUNTS[5].name }).click();
  await expect(respond).toBeEnabled();

  await respond.click();
  await expect.poll(() => recorder.requests.length).toBe(2);
  expect(recorder.requests[1].prompt).toBe(`Da quale conto? → ${ACCOUNTS[1].name} [${ACCOUNTS[1].id}]\nSu quale conto? → ${ACCOUNTS[5].name} [${ACCOUNTS[5].id}]`);
  expect(recorder.requests[1].mode).toBe('register');

  // The cards are read-only now; the next message carries a question AND a card: the card waits.
  await expect(from).toContainText(`Risposta: ${ACCOUNTS[1].name}`);
  await expect(to).toContainText(`Risposta: ${ACCOUNTS[5].name}`);
  const waiting = card(page, 'expense:0');
  await expect(waiting).toBeVisible();
  await expect(waiting.getByRole('button', { name: 'Conferma' })).toBeDisabled();
  await expect(waiting).toContainText('Rispondi prima alla domanda');

  await expect(page.getByRole('button', { name: 'Rispondi' })).toHaveCount(1);
  const stored = await storedProposals(recorder.messageIds[0]);
  expect(stored['question:0']?.status).toBe('answered');
  expect(stored['question:1']?.status).toBe('answered');

  // A reload: the param opens the day's thread, read back from the documents.
  await openAssistant(page, '?mode=registra');
  await expect(questionCard(page, 'account:from')).toContainText(`Risposta: ${ACCOUNTS[1].name}`, { timeout: 60_000 });
  await expect(questionCard(page, 'account:to')).toContainText(`Risposta: ${ACCOUNTS[5].name}`);
  // One «Rispondi» only, under the LAST message's question; the older message has none.
  await expect(page.getByRole('button', { name: 'Rispondi' })).toHaveCount(1);
  const blockOf = (id: string) => page.locator('div.not-prose', { has: questionCard(page, id) });
  await expect(blockOf('account:to').getByRole('button', { name: 'Rispondi' })).toHaveCount(0);
  await expect(blockOf('abitudine').getByRole('button', { name: 'Rispondi' })).toHaveCount(1);
});
