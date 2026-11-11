/**
 * Assistente › Registra in a browser, shared by its two specs (1440 and 390; 2026-11,
 * doc/guide/e2e-playwright.md § Browser-Driven E2E). A helper, not a spec: no project collects it.
 *
 * THE STREAM IS ALWAYS FAKED (`installFakeStream`): `dev:e2e` loads `.env.local`, so the real key
 * makes the composer usable — it is never what answers. The fake does what the route does around
 * the model: it writes the thread and the two messages in the emulator (Admin SDK), then answers
 * the SSE body — `meta` with the thread, `register` with a summary of 4 rows read, one `text`
 * with the answer, `done` with the id of the assistant message it wrote. So the card's PATCH and
 * the thread's reload go through the REAL routes against real documents.
 *
 * The fixture lives on the base account (`test@example.com`) under ids prefixed `e2e-reg-`, absent
 * from the seed: the categories «Cibo» › «Spesa» (variable) and «Salute» › «Farmacia» (fixed), the
 * cash account «Conto principale» as the default of both directions, and a decoy row whose note
 * says «ornitorinco» that no test may touch. `removeFixture` deletes it all and puts the settings'
 * two default fields back as they were.
 */

import { expect, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

export const UID = 'test-user-1';
export const ACCOUNT_ID = 'e2e-reg-account';
export const ACCOUNT_START = 5000;
export const FOOD_ID = 'e2e-reg-cibo';
export const FOOD_SUB_ID = 'e2e-reg-spesa';
export const HEALTH_ID = 'e2e-reg-salute';
export const HEALTH_SUB_ID = 'e2e-reg-farmacia';
export const THREAD_ID = 'e2e-reg-thread';
export const DECOY_ID = 'e2e-reg-decoy';
const DECOY = { type: 'variable', categoryId: FOOD_ID, categoryName: 'Cibo', amount: -7, notes: 'ornitorinco' };

export async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

type Db = Awaited<ReturnType<typeof admin>>;

/** The Italian calendar day of an instant, as `YYYY-MM-DD` (a spec cannot import `lib/`). */
export function italyDateIso(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(date);
}

/** `days` after (or before) the Italian today, at noon UTC so the day is the same in every zone. */
export function italyDayOffsetIso(days: number): string {
  const [year, month, day] = italyDateIso(new Date()).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10);
}

/** A day of the month before the Italian current one (the 15th unless asked). */
export function previousMonthFifteenthIso(day = 15): string {
  const [year, month] = italyDateIso(new Date()).split('-').map(Number);
  return new Date(Date.UTC(year, month - 2, day, 12)).toISOString().slice(0, 10);
}

let settingsBefore: { debit: unknown; credit: unknown } | null = null;

/** Plants the categories, the account, its two default roles and the decoy row. */
export async function plantFixture(): Promise<void> {
  const db = await admin();
  const now = new Date();
  const settingsRef = db.collection('assetAllocationTargets').doc(UID);
  const settings = (await settingsRef.get()).data() ?? {};
  // Read once: a second spec file's `beforeAll` must not record this fixture's own values as «before».
  if (settings.defaultDebitCashAssetId !== ACCOUNT_ID) {
    settingsBefore = { debit: settings.defaultDebitCashAssetId, credit: settings.defaultCreditCashAssetId };
  }
  await db.collection('expenseCategories').doc(FOOD_ID).set({ userId: UID, name: 'Cibo', type: 'variable', subCategories: [{ id: FOOD_SUB_ID, name: 'Spesa' }], createdAt: now, updatedAt: now });
  await db.collection('expenseCategories').doc(HEALTH_ID).set({ userId: UID, name: 'Salute', type: 'fixed', subCategories: [{ id: HEALTH_SUB_ID, name: 'Farmacia' }], createdAt: now, updatedAt: now });
  await db.collection('assets').doc(ACCOUNT_ID).set({
    userId: UID, ticker: 'CASH', name: 'Conto principale', type: 'cash', assetClass: 'cash', currency: 'EUR',
    quantity: ACCOUNT_START, currentPrice: 1, subCategory: 'Conto Corrente', lastPriceUpdate: now, createdAt: now, updatedAt: now,
  });
  await settingsRef.set({ defaultDebitCashAssetId: ACCOUNT_ID, defaultCreditCashAssetId: ACCOUNT_ID }, { merge: true });
  await db.collection('expenses').doc(DECOY_ID).set({ ...DECOY, userId: UID, currency: 'EUR', date: now, createdAt: now, updatedAt: now });
}

/** The rows the tests wrote: every expense of the account in one of the fixture's categories, the planted ones (decoy, fillers) apart. */
export async function writtenRows(db: Db) {
  const snap = await db.collection('expenses').where('userId', '==', UID).get();
  return snap.docs.filter((doc) => String(doc.data().categoryId ?? '').startsWith('e2e-reg-') && !doc.id.startsWith('e2e-reg-'));
}

/** `count` rows on one day, ids `e2e-reg-filler-N`: what pushes another row past a list's first page. */
export async function plantFillers(dateIso: string, count: number): Promise<void> {
  const db = await admin();
  const now = new Date();
  const batch = db.batch();
  for (let index = 0; index < count; index += 1) {
    batch.set(db.collection('expenses').doc(`e2e-reg-filler-${index}`), {
      userId: UID, type: 'variable', categoryId: FOOD_ID, categoryName: 'Cibo', amount: -1, currency: 'EUR', notes: `riempitivo ${index + 1}`,
      date: new Date(`${dateIso}T12:00:00Z`), createdAt: now, updatedAt: now,
    });
  }
  await batch.commit();
}

async function removeFillers(db: Db): Promise<void> {
  const snap = await db.collection('expenses').where('userId', '==', UID).get();
  const batch = db.batch();
  snap.docs.filter((doc) => doc.id.startsWith('e2e-reg-filler-')).forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

async function deleteThread(db: Db): Promise<void> {
  const thread = db.collection('assistantThreads').doc(THREAD_ID);
  const messages = await thread.collection('messages').get();
  const batch = db.batch();
  messages.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(thread);
  await batch.commit();
}

/** Before each test: no row written, the account at its start, no register thread. */
export async function resetFixture(): Promise<void> {
  const db = await admin();
  const batch = db.batch();
  for (const row of await writtenRows(db)) batch.delete(row.ref);
  batch.update(db.collection('assets').doc(ACCOUNT_ID), { quantity: ACCOUNT_START });
  await batch.commit();
  await removeFillers(db);
  await deleteThread(db);
}

export async function removeFixture(): Promise<void> {
  const db = await admin();
  const { FieldValue } = await import('firebase-admin/firestore');
  await resetFixture();
  const batch = db.batch();
  batch.delete(db.collection('expenseCategories').doc(FOOD_ID));
  batch.delete(db.collection('expenseCategories').doc(HEALTH_ID));
  batch.delete(db.collection('assets').doc(ACCOUNT_ID));
  batch.delete(db.collection('expenses').doc(DECOY_ID));
  if (settingsBefore) {
    batch.set(
      db.collection('assetAllocationTargets').doc(UID),
      {
        defaultDebitCashAssetId: settingsBefore.debit ?? FieldValue.delete(),
        defaultCreditCashAssetId: settingsBefore.credit ?? FieldValue.delete(),
      },
      { merge: true },
    );
  }
  await batch.commit();
}

/** The decoy row as the fixture wrote it: no test changed, moved or removed it. */
export async function expectDecoyUntouched(): Promise<void> {
  const db = await admin();
  const decoy = await db.collection('expenses').doc(DECOY_ID).get();
  expect(decoy.exists, 'the decoy row «ornitorinco» is still there').toBe(true);
  expect(decoy.data()).toMatchObject(DECOY);
}

export async function quantityOf(db: Db, assetId: string): Promise<number> {
  return (await db.collection('assets').doc(assetId).get()).data()!.quantity as number;
}

export interface ProposedRow {
  kind?: 'expense' | 'income';
  type?: 'fixed' | 'variable' | 'income';
  amount: number;
  dateIso?: string;
  categoryId?: string;
  subCategoryId?: string;
  note?: string;
  reason?: string;
}

/** An ```expense-proposal block as the model writes it, on the fixture's ids. */
export function proposalBlock(row: ProposedRow): string {
  const proposal = {
    kind: row.kind ?? 'expense',
    type: row.type ?? 'variable',
    amount: row.amount,
    dateIso: row.dateIso ?? italyDateIso(new Date()),
    categoryId: row.categoryId ?? FOOD_ID,
    subCategoryId: row.subCategoryId ?? FOOD_SUB_ID,
    ...(row.note ? { note: row.note } : {}),
    reason: row.reason ?? 'Come le ultime spese al supermercato.',
  };
  return ['```expense-proposal', JSON.stringify(proposal), '```'].join('\n');
}

let messageSerial = 0;

/** Writes the thread of today and one exchange in it, as the route does; returns the assistant message's id. */
export async function plantExchange(userContent: string, assistantContent: string): Promise<string> {
  const db = await admin();
  const now = new Date();
  messageSerial += 1;
  const thread = db.collection('assistantThreads').doc(THREAD_ID);
  const messages = await thread.collection('messages').get();
  await thread.set(
    {
      userId: UID, title: 'Registrazioni · e2e', mode: 'register', pinnedMonth: null,
      ...(messages.empty ? { createdAt: now } : {}),
      updatedAt: now, lastMessagePreview: userContent, messageCount: messages.size + 2,
    },
    { merge: true },
  );
  const assistantId = `e2e-reg-msg-${messageSerial}`;
  await thread.collection('messages').doc(`e2e-reg-user-${messageSerial}`).set({ userId: UID, role: 'user', content: userContent, mode: 'register', monthContext: null, webSearchUsed: false, createdAt: new Date(now.getTime() - 1000) });
  await thread.collection('messages').doc(assistantId).set({ userId: UID, role: 'assistant', content: assistantContent, mode: 'register', monthContext: null, webSearchUsed: false, createdAt: now });
  return assistantId;
}

export interface StreamRecorder {
  /** Every body the page posted to the stream route. */
  requests: { mode: string; prompt: string; threadId?: string; month?: unknown; year?: unknown }[];
  /** The ids of the assistant messages the fake wrote, in order. */
  messageIds: string[];
}

/**
 * Fakes the stream route: `reply` turns the user's prompt into the assistant's answer. Installed
 * BEFORE the first message is sent; no request ever reaches the model.
 */
export async function installFakeStream(page: Page, reply: (prompt: string) => string): Promise<StreamRecorder> {
  const recorder: StreamRecorder = { requests: [], messageIds: [] };
  await page.route('**/api/ai/assistant/stream', async (route) => {
    const body = route.request().postDataJSON() as StreamRecorder['requests'][number];
    recorder.requests.push(body);
    const content = reply(body.prompt);
    const messageId = await plantExchange(body.prompt, content);
    recorder.messageIds.push(messageId);
    const events = [
      { type: 'meta', threadId: THREAD_ID, title: 'Registrazioni · e2e' },
      {
        type: 'register',
        summary: {
          accounts: [{ id: ACCOUNT_ID, name: 'Conto principale', balance: ACCOUNT_START, roles: ['addebito', 'accredito'] }],
          categories: 5, costCentersEnabled: false, membersEnabled: false, recent: { rows: 4, cut: 0 },
        },
      },
      { type: 'text', text: content },
      { type: 'done', threadId: THREAD_ID, messageId, webSearchUsed: false },
    ];
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    });
  });
  return recorder;
}

/** «Registra» in the header: PageHeader draws its actions twice, one of them shown. */
export const registerAction = (page: Page) => page.getByRole('button', { name: 'Registra un movimento' }).filter({ visible: true }).first();
export const composer = (page: Page) => page.getByRole('textbox', { name: "Scrivi un messaggio all'assistente" });
export const card = (page: Page, key: string) => page.locator(`[data-proposal="${key}"]`);

/** Opens the Assistente and waits for a usable composer — which needs the key in `.env.local`. */
export async function openAssistant(page: Page, query = ''): Promise<void> {
  await page.goto(`/dashboard/assistant${query}`, { waitUntil: 'load' });
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 60_000 });
  await expect(
    composer(page),
    'the composer is on screen: the dev:e2e server needs ANTHROPIC_API_KEY in .env.local (doc/guide/e2e-playwright.md) — the stream itself is faked',
  ).toBeVisible({ timeout: 60_000 });
}

/** Enters Registra from the header and waits for its strip. */
export async function enterRegister(page: Page): Promise<void> {
  await registerAction(page).click();
  await expect(page.getByText("Registra · l'Assistente conosce categorie, conti e le ultime righe")).toBeVisible();
}

/** Types a sentence and sends it. */
export async function send(page: Page, sentence: string): Promise<void> {
  await composer(page).fill(sentence);
  await page.getByRole('button', { name: 'Invia messaggio' }).click();
}

/** The PATCH that saves a card's outcome on its message. */
export const outcomeSaved = (page: Page) =>
  page.waitForResponse((response) => response.request().method() === 'PATCH' && /\/api\/ai\/assistant\/threads\/[^/]+\/messages\//.test(response.url()));

/** The outcomes stored on an assistant message of the register thread. */
export async function storedProposals(messageId: string): Promise<Record<string, { status: string; writtenIds?: string[] }>> {
  const db = await admin();
  const doc = await db.collection('assistantThreads').doc(THREAD_ID).collection('messages').doc(messageId).get();
  return (doc.data()?.proposals ?? {}) as Record<string, { status: string; writtenIds?: string[] }>;
}

/** An ```expense-proposal block of any kind (2026-11: transfer, debt, series, fee, new categories), written as given. */
export function rawProposalBlock(proposal: Record<string, unknown>): string {
  return ['```expense-proposal', JSON.stringify({ dateIso: italyDateIso(new Date()), reason: 'Come dici tu.', ...proposal }), '```'].join('\n');
}

/** An ```assistant-question block: ONE question object, as the model writes it. */
export function questionBlock(question: { id: string; text: string; options: { value: string; label: string }[]; allowOther?: boolean }): string {
  return ['```assistant-question', JSON.stringify({ kind: 'single', allowOther: true, ...question }), '```'].join('\n');
}

/** The question card of a block, by its question id. */
export const questionCard = (page: Page, questionId: string) => page.locator(`[data-question-card="${questionId}"]`);
