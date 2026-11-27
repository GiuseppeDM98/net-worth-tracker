/**
 * The Assistente as only a chat at 1440px, on the base account (2026-11-12,
 * doc/guide/assistente.md § The page as a chat).
 *
 * WHY IT EXISTS: Vitest holds the hook, the line and the chooser; what only a browser on the
 * emulators knows is the page at rest — eleven controls in `main`, no axis —, that «cambia» →
 * «Rileggi» re-sends the last prompt with the chosen route as a new turn, that a suggestion only
 * fills the composer, that «⋯» → «Preferenze» returns the focus to «⋯», and that a thread saved
 * before the router opens by `?thread=` with its card; and (2026-11-25) that an answer's list has
 * bullets and its next questions come as chips, no fence on screen, after a reload too.
 *
 * The stream is ALWAYS faked (`e2e/assistantRegister.ts`): no request reaches a model. One memory
 * fact is planted for the count (it makes «Apri memoria» appear) and the stored memory is put back.
 */

import { test, expect } from '@playwright/test';
import {
  THREAD_ID, UID, admin, card, composer, expectDecoyUntouched, installFakeStream, openAssistant, plantExchange, plantFixture,
  proposalBlock, removeFixture, resetFixture, send,
} from './assistantRegister';
import { afterIdle, atRest, settledScrollTop } from './atRest';

const FREE_READING = { route: { intent: 'chat', period: { kind: 'none' }, webSearch: false, confidence: 0.9 }, source: 'router' as const };
const ANSWER = '## Asilo\n\n- Retta: 300 € al mese\n- Mensa: 80 € al mese\n\n**380 €** al mese: 300 + 80.';
const FOLLOW_UPS = ['E nel 2025?', 'Quanto in un anno?', 'Quanto pesa sulle spese necessarie?'];
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
  await afterIdle(page);
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


// 2026-11-25: an answer's Markdown is styled by its own renderers (a list has bullets) and
// its next questions are the model's, cut off the saved text — never a fence on screen, before or
// after a reload. Seen RED dropping the `ul` renderer, and with the helper storing the raw text.
test('E6 — an answer with a heading, a list and its tail: bullets, three chips, no fence, after a reload too', async ({ page }) => {
  test.setTimeout(120_000);
  const recorder = await installFakeStream(page, (prompt) =>
    prompt === 'Quanto in un anno?'
      ? { text: '**4.560 €** in un anno.', reading: FREE_READING }
      : { text: ANSWER, reading: FREE_READING, followUps: FOLLOW_UPS });
  await openAssistant(page);
  await send(page, 'Quanto costa l’asilo?');

  const chips = page.getByRole('list', { name: 'Continua con' }).getByRole('button');
  await expect(chips).toHaveCount(3, { timeout: 30_000 });
  await expect(chips).toHaveText(FOLLOW_UPS);
  const answer = page.locator('[data-generated]').last();
  await expect(answer.getByRole('heading', { name: 'Asilo' })).toBeVisible();
  expect(await answer.locator('ul').first().evaluate((list) => getComputedStyle(list).listStyleType)).toBe('disc');
  const conversation = page.getByRole('region', { name: 'Conversazione' });
  await expect(conversation).not.toContainText('```');
  await expect(conversation).not.toContainText('assistant-followups');
  // A tail left in the text would render as a code block, its fence hidden by the Markdown.
  await expect(answer.locator('pre')).toHaveCount(0);

  await page.reload({ waitUntil: 'load' });
  await expect(page.getByRole('list', { name: 'Continua con' }).getByRole('button')).toHaveText(FOLLOW_UPS, { timeout: 60_000 });
  await expect(conversation).not.toContainText('```');
  await expect(conversation).not.toContainText('assistant-followups');
  await expect(page.locator('[data-generated]').last().getByRole('heading', { name: 'Asilo' })).toBeVisible();
  await expect(page.locator('[data-generated]').last().locator('pre')).toHaveCount(0);

  await page.getByRole('list', { name: 'Continua con' }).getByRole('button', { name: 'Quanto in un anno?' }).click();
  await expect(page.getByText('in un anno.')).toBeVisible({ timeout: 30_000 });
  expect(recorder.requests.map((request) => request.prompt)).toEqual(['Quanto costa l’asilo?', 'Quanto in un anno?']);
});

// The owner, phase F of 2026-11-25: a streaming answer was plain text that turned into Markdown at
// the end, and every chunk brought the page back down. A slow stream faked in the page (no model).
// Seen RED with the follow gate removed from AssistantPageClient (the page came back down).
test('E8 — a slow stream: Markdown while it arrives, and a scroll up is not undone', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes('/api/ai/assistant/stream')) return original(input, init);
      const encoder = new TextEncoder();
      const send = (controller: ReadableStreamDefaultController, event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      const body = new ReadableStream({
        async start(controller) {
          send(controller, { type: 'meta', threadId: 'e2e-reg-thread-slow', title: 'Lento' });
          send(controller, { type: 'route', reading: { route: { intent: 'chat', period: { kind: 'none' }, webSearch: false, confidence: 0.9 }, source: 'router' } });
          send(controller, { type: 'text', text: '**380 €** al mese.\n\n## I conti\n\n' });
          for (let i = 1; i <= 120; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 80));
            send(controller, { type: 'text', text: `- Voce ${i}: ${i} €\n` });
          }
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
  });
  await openAssistant(page);
  await send(page, 'Quanto costa l’asilo?');
  const answer = page.locator('[data-generated]').last();
  await expect(answer.getByRole('heading', { name: 'I conti' })).toBeVisible({ timeout: 30_000 });
  await expect(answer.locator('li').nth(20)).toBeAttached({ timeout: 30_000 });
  expect(await answer.locator('ul').first().evaluate((node) => getComputedStyle(node).listStyleType)).toBe('disc');
  await expect(page.getByRole('region', { name: 'Conversazione' })).not.toContainText('##');

  const main = page.locator('main');
  const followed = await main.evaluate((node) => node.scrollTop);
  expect(followed, 'the page followed the stream').toBeGreaterThan(200);
  await main.hover();
  await page.mouse.wheel(0, -600);
  // The wheel has landed and the offset holds, while the stream goes on writing under it.
  await expect.poll(() => main.evaluate((node) => node.scrollTop)).toBeLessThan(followed);
  const afterUp = await settledScrollTop(main);
  expect(afterUp).toBeLessThan(followed);
  // Twenty more lines of the stream (one every 80 ms): each of them was a chance to pull the page down.
  const linesAtScroll = await answer.locator('li').count();
  await expect(answer.locator('li').nth(linesAtScroll + 20)).toBeAttached({ timeout: 30_000 });
  const later = await main.evaluate((node) => node.scrollTop);
  console.log('[scroll]', { followed, afterUp, later });
  expect(Math.abs(later - afterUp), 'the stream did not bring the page back down').toBeLessThan(5);

  await page.mouse.wheel(0, 20_000);
  // The stream is the clock (a line every 80 ms): ten lines after the wheel its own motion is over…
  const linesAtWheel = await answer.locator('li').count();
  await expect(answer.locator('li').nth(linesAtWheel + 10)).toBeAttached({ timeout: 30_000 });
  const back = await main.evaluate((node) => node.scrollTop);
  // …and ten lines later the page has gone down with them: a page that stopped following is still at `back`.
  await expect(answer.locator('li').nth(linesAtWheel + 20)).toBeAttached({ timeout: 30_000 });
  const followingAgain = await main.evaluate((node) => node.scrollTop);
  console.log('[scroll]', { back, followingAgain });
  expect(followingAgain, 'back at the end, the page follows again').toBeGreaterThan(back);
});

// The owner, phase F of 2026-11-25 (second report): the page still came back down when the stream
// started (the thread id arriving) and when it ended (the saved thread replacing the buffer). A
// long thread, a slow stream faked in the page that ends with `done` on a planted message.
// Seen RED with the scroll after the stream left ungated (the page jumped 1713 px at `done`).
test('E9 — a scroll up as the stream starts holds through its end', async ({ page }) => {
  test.setTimeout(120_000);
  const OLD = Array.from({ length: 60 }, (_, i) => `- Riga vecchia ${i + 1}: ${i + 1} €`).join('\n');
  const FINAL = ['**380 €** al mese.', '', '## Nuovi conti', '', ...Array.from({ length: 30 }, (_, i) => `- Voce ${i + 1}: ${i + 1} €`)].join('\n');
  await plantExchange('Domanda vecchia', `**Vecchia risposta.**\n\n${OLD}`, FREE_READING);
  await page.addInitScript((threadId) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes('/api/ai/assistant/stream')) return original(input, init);
      const done = (window as unknown as { __e2eDone: { messageId: string; content: string } }).__e2eDone;
      const encoder = new TextEncoder();
      const emit = (controller: ReadableStreamDefaultController, event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      const lines = done.content.split('\n');
      const body = new ReadableStream({
        async start(controller) {
          emit(controller, { type: 'meta', threadId, title: 'Registrazioni · e2e' });
          emit(controller, { type: 'route', reading: { route: { intent: 'chat', period: { kind: 'none' }, webSearch: false, confidence: 0.9 }, source: 'router' } });
          for (const line of lines) {
            emit(controller, { type: 'text', text: `${line}\n` });
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          emit(controller, { type: 'done', threadId, messageId: done.messageId, webSearchUsed: false, content: done.content, followUps: [] });
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
  }, THREAD_ID);
  await openAssistant(page, `?thread=${THREAD_ID}`);
  await expect(page.getByText('Riga vecchia 60: 60 €')).toBeAttached({ timeout: 60_000 });
  const messageId = await plantExchange('Quanto costa l’asilo?', FINAL, FREE_READING);
  await page.evaluate(([id, content]) => { (window as unknown as { __e2eDone: unknown }).__e2eDone = { messageId: id, content }; }, [messageId, FINAL]);

  await send(page, 'Quanto costa l’asilo?');
  await expect(page.getByRole('heading', { name: 'Nuovi conti' })).toBeVisible({ timeout: 30_000 });
  const main = page.locator('main');
  await main.hover();
  const beforeWheel = await main.evaluate((node) => node.scrollTop);
  await page.mouse.wheel(0, -900);
  // The wheel has landed and the offset holds, while the stream goes on writing under it.
  await expect.poll(() => main.evaluate((node) => node.scrollTop)).toBeLessThan(beforeWheel);
  const held = await settledScrollTop(main);
  // «Interrompi risposta» leaves only after the saved thread has been read again
  // (`useAssistantStreaming` awaits the invalidation before it stops streaming): the buffer has been
  // replaced, and a jump it caused is over once the page is at rest.
  await expect(page.getByRole('button', { name: 'Interrompi risposta' })).toHaveCount(0, { timeout: 30_000 });
  await atRest(page);
  const after = await main.evaluate((node) => node.scrollTop);
  console.log('[scroll E9]', { held, after });
  expect(Math.abs(after - held), 'neither the stream nor its end brought the page back down').toBeLessThan(5);
});

// The owner, phase F of 2026-11-25 (third report): right after sending in a new conversation, a
// flash as the waiting phrases began. The thread id arriving with `meta` started the saved thread's
// read, and the tile swapped the messages for its skeleton, then mounted them again. A slow stream
// faked in the page; the skeleton must never show, the question's bubble never be replaced.
test('E10 — a new conversation: no skeleton and no remount while the answer arrives', async ({ page }) => {
  test.setTimeout(120_000);
  const FINAL = '**380 €** al mese.';
  const messageId = await plantExchange('Quanto costa l’asilo?', FINAL, FREE_READING);
  await page.addInitScript(([threadId, id, content]) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes('/api/ai/assistant/stream')) return original(input, init);
      const encoder = new TextEncoder();
      const emit = (controller: ReadableStreamDefaultController, event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const body = new ReadableStream({
        async start(controller) {
          emit(controller, { type: 'meta', threadId, title: 'Registrazioni · e2e' });
          emit(controller, { type: 'route', reading: { route: { intent: 'chat', period: { kind: 'none' }, webSearch: false, confidence: 0.9 }, source: 'router' } });
          await wait(2500);
          emit(controller, { type: 'text', text: content });
          await wait(500);
          emit(controller, { type: 'done', threadId, messageId: id, webSearchUsed: false, content, followUps: [] });
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
  }, [THREAD_ID, messageId, FINAL]);
  await openAssistant(page);
  await page.evaluate(() => {
    const flags = { skeleton: false };
    (window as unknown as { __e2eFlags: typeof flags }).__e2eFlags = flags;
    new MutationObserver(() => {
      if (document.querySelector('[aria-label="Caricamento conversazione"]')) flags.skeleton = true;
    }).observe(document.body, { childList: true, subtree: true });
  });

  await send(page, 'Quanto costa l’asilo?');
  const bubble = page.locator('main').getByText('Quanto costa l’asilo?', { exact: true }).first();
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  const handle = await bubble.elementHandle();
  await expect(page.getByText('al mese.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Interrompi risposta' })).toHaveCount(0, { timeout: 30_000 });
  await atRest(page);
  const flags = await page.evaluate(() => (window as unknown as { __e2eFlags: { skeleton: boolean } }).__e2eFlags);
  const connected = await handle!.evaluate((node) => node.isConnected);
  console.log('[flash E10]', { ...flags, connected });
  expect(flags.skeleton, 'the skeleton never replaced the messages').toBe(false);
  expect(connected, 'the question’s bubble was never mounted again').toBe(true);
});

// The owner, phase F of 2026-11-25: «Nuova conversazione» left the page where the last thread had
// been read, at its bottom. The click is dispatched, so Playwright does not scroll to the button; a
// low window, so the empty page still scrolls (on a tall one it fits, and goes back to 0 by itself).
// Seen RED without the scroll in `handleNewThread`, and one run in three (8–34px) without its
// second scroll in the next frame (2026-11-27; ten runs green with it).
test('E11 — «Nuova conversazione» brings the page back to the top', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 420 });
  const OLD = Array.from({ length: 60 }, (_, i) => `- Riga vecchia ${i + 1}: ${i + 1} €`).join('\n');
  await plantExchange('Domanda vecchia', `**Vecchia risposta.**\n\n${OLD}`, FREE_READING);
  await openAssistant(page, `?thread=${THREAD_ID}`);
  await expect(page.getByText('Riga vecchia 60: 60 €')).toBeAttached({ timeout: 60_000 });
  const main = page.locator('main');
  await main.evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
  await expect.poll(() => main.evaluate((node) => node.scrollTop)).toBeGreaterThan(500);
  await page.getByRole('button', { name: 'Nuova conversazione', exact: true }).dispatchEvent('click');
  await expect(page.getByText('Riga vecchia 60: 60 €')).toHaveCount(0, { timeout: 30_000 });
  const room = await main.evaluate((node) => node.scrollHeight - node.clientHeight);
  console.log('[top E11]', { room });
  expect(room, 'the empty page still scrolls, or the test proves nothing').toBeGreaterThan(100);
  await expect.poll(() => main.evaluate((node) => node.scrollTop)).toBe(0);
});
