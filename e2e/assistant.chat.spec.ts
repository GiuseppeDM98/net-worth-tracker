/**
 * The Assistente as only a chat at 1440px, on the base account (2026-11-12,
 * doc/guide/assistente.md § The page as a chat).
 *
 * WHY IT EXISTS: Vitest holds the hook, the line and the chooser; what only a browser on the
 * emulators knows is the page at rest — eleven controls in `main`, no axis —, that «cambia» →
 * «Rileggi» re-sends the last prompt with the chosen route as a new turn, that a suggestion only
 * fills the composer, that «⋯» → «Preferenze» returns the focus to «⋯», and that a thread saved
 * before the router opens by `?thread=` with its card.
 *
 * The stream is ALWAYS faked (`e2e/assistantRegister.ts`): no request reaches a model. One memory
 * fact is planted for the count (it makes «Apri memoria» appear) and the stored memory is put back.
 */

import { test, expect } from '@playwright/test';
import {
  THREAD_ID, UID, admin, card, composer, expectDecoyUntouched, installFakeStream, openAssistant, plantExchange, plantFixture,
  proposalBlock, removeFixture, resetFixture, send,
} from './assistantRegister';

const FREE_READING = { route: { intent: 'chat', period: { kind: 'none' }, webSearch: false, confidence: 0.9 }, source: 'router' as const };
let memoryBefore: Record<string, unknown> | undefined;

test.beforeAll(async () => {
  await plantFixture();
  const db = await admin();
  const ref = db.collection('assistantMemory').doc(UID);
  memoryBefore = (await ref.get()).data();
  const now = new Date();
  await ref.set({
    ...(memoryBefore ?? {}),
    items: [{ id: 'e2e-chat-fact', userId: UID, category: 'preference', text: 'Preferisco risposte brevi', status: 'active', createdAt: now, updatedAt: now }],
  });
});
test.beforeEach(async () => {
  await resetFixture();
});
test.afterAll(async () => {
  const db = await admin();
  const ref = db.collection('assistantMemory').doc(UID);
  if (memoryBefore) await ref.set(memoryBefore);
  else await ref.delete();
  await expectDecoyUntouched();
  await removeFixture();
});

/** «⋯»: PageHeader draws its actions twice, one of them shown. */
const moreButton = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: "Altre azioni dell'assistente" }).filter({ visible: true }).first();

test('E1 — at rest the page is eleven controls in `main`, and no axis', async ({ page }) => {
  test.setTimeout(90_000);
  const recorder = await installFakeStream(page, () => 'Non serve.');
  await openAssistant(page);
  await expect(page.getByRole('list', { name: 'Domande suggerite' }).getByRole('button')).toHaveCount(4, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: /Apri memoria/ })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Periodo di analisi' })).toHaveCount(0);

  const controls = await page.locator('main').evaluate((main) => {
    const nodes = Array.from(main.querySelectorAll<HTMLElement>('button, a[href], textarea, [role="tab"], [role="combobox"]'));
    const visible = nodes.filter((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden';
    });
    return visible.map((node) => node.getAttribute('aria-label') ?? node.textContent?.trim().slice(0, 40) ?? node.tagName);
  });
  expect(controls, controls.join(' | ')).toHaveLength(11);
  expect(recorder.requests).toHaveLength(0);
});

test('E2 — «cambia» → «Un movimento da registrare» → «Rileggi» sends the first prompt again with the register route', async ({ page }) => {
  test.setTimeout(120_000);
  const recorder = await installFakeStream(page, (_prompt, body) =>
    body.route ? `Ecco la riga.\n\n${proposalBlock({ amount: 40 })}` : { text: 'Ti rispondo sui dati di oggi.', reading: FREE_READING });
  await openAssistant(page);
  await send(page, 'ho fatto benzina 40');
  await expect(page.getByText('Ho letto: domanda libera, sui dati di oggi')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Cambia come ho letto la domanda' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Come devo leggerla?' })).toBeVisible();
  await dialog.getByRole('radio', { name: /^Un movimento da registrare/ }).click();
  await dialog.getByRole('button', { name: 'Rileggi' }).click();

  await expect(card(page, 'expense:0')).toBeVisible({ timeout: 30_000 });
  expect(recorder.requests).toHaveLength(2);
  expect(recorder.requests[0].route).toBeUndefined();
  expect(recorder.requests[1]).toMatchObject({ mode: 'auto', prompt: 'ho fatto benzina 40', route: { intent: 'register', period: { kind: 'none' }, webSearch: false } });
  expect(recorder.requests[1].routeCarried).toBeUndefined();
  // The answer before stays, and the new one says it was chosen.
  await expect(page.getByText('Ti rispondo sui dati di oggi.')).toBeVisible();
  await expect(page.getByText(/^Hai scelto: un movimento da registrare/)).toBeVisible();
});

test('E3 — a suggestion fills the composer and sends nothing', async ({ page }) => {
  test.setTimeout(90_000);
  const recorder = await installFakeStream(page, () => 'Non serve.');
  await openAssistant(page);
  const rows = page.getByRole('list', { name: 'Domande suggerite' }).getByRole('button');
  await expect(rows).toHaveCount(4, { timeout: 60_000 });
  await rows.filter({ hasText: 'Oggi ho speso…' }).click();
  await expect(composer(page)).toBeFocused();
  await expect(composer(page)).toHaveValue('Oggi ho speso ');
  await page.waitForTimeout(500);
  expect(recorder.requests).toHaveLength(0);
});

test('E4 — «⋯» → «Preferenze» opens its modal, Esc returns the focus to «⋯»', async ({ page }) => {
  test.setTimeout(90_000);
  await installFakeStream(page, () => 'Non serve.');
  await openAssistant(page);
  await moreButton(page).click();
  await page.getByRole('menuitem', { name: 'Preferenze' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: "Come risponde l'Assistente" })).toBeVisible();
  await expect(dialog).toContainText('Stile di risposta');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(moreButton(page)).toBeFocused();
});

test('E5 — a thread saved before the router opens by `?thread=` with its card, and no line', async ({ page }) => {
  test.setTimeout(90_000);
  await plantExchange('ho speso 25 euro di spesa', `Ecco la riga.\n\n${proposalBlock({ amount: 25 })}`, null);
  await installFakeStream(page, () => 'Non serve.');
  await openAssistant(page, `?thread=${THREAD_ID}`);
  await expect(card(page, 'expense:0')).toContainText(/Spesa · 25,00\s€/, { timeout: 60_000 });
  await expect(page.getByText(/^Ho letto:/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cambia come ho letto la domanda' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Conversazione' })).toContainText('Registra · senza periodo');
});
