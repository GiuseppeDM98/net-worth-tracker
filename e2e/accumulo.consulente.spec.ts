/**
 * Dal Consulente al piano di accumulo a 1440px (2026-11-12; le regole in doc/guide/accumulo.md § Dal Consulente).
 *
 * PERCHÉ ESISTE: solo il browser contro l'emulatore può dire che il link di «Applica» atterra su Accumulo e apre
 * «Dal Consulente» UNA volta (l'URL ripulito), che con un piano aperto non lo apre, e che «Crea» scrive davvero lo
 * strumento a 0 quote e la riga lo rilegge. Le frasi, il seme e i tre stati della finestra sono di Vitest
 * (`__tests__/allocationAdviceHandoff.test.ts`, `consulenteHandoff.test.tsx`, `consulenteBook.test.tsx`).
 *
 * Account base (`test@example.com`). Il documento del Consulente è piantato (`plant`, nessun modello chiamato);
 * `rememberHeld` / `restoreHeld` rimettono ciò che l'account aveva. La suite gira su un worker sullo stesso
 * account: `afterAll` cancella ogni asset «ETF ornitorinco» creato qui (il seed non ne ha), e il piano piantato.
 * La quotazione del ticker inventato è finta (`/api/prices/quote`): nessuna rete.
 *
 * REGRESSION GUARD, visti rossi (2026-11-18): `router.replace` tolto (l'URL tiene `da`); la finestra aperta con un
 * piano aperto; il prefill ignorato; `finishWithModel` tolto da «Salva bozza» (E4, owner 2026-11-18).
 */

import { test, expect, type Page } from '@playwright/test';
import { bookCard, openReport, plant, rememberHeld, restoreHeld } from './consulenteReport';
import { readModel, removeAccumuloFixture, removeModel, seedAccumuloFixture } from './accumuloFixture';

const LINK = 'Crea un piano di accumulo verso questa allocazione';
const TITLE = 'Un piano verso la nuova allocazione';
const ACTIVE_NOTE = 'Hai un piano di accumulo attivo: i nuovi target non lo cambiano. Rivedilo in Allocazione › Accumulo.';
const DRAFT_NOTE = 'Hai una bozza di piano di accumulo: completala o eliminala in Allocazione › Accumulo, poi torna qui per crearne una verso questa allocazione.';

/** Every plan of the seed account: a draft saved here is written under a generated id, not the fixture's. */
async function deleteAllPlans(): Promise<void> {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT }));
  const snap = await db.collection('accumulationPlans').where('userId', '==', 'test-user-1').get();
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()));
}

async function deleteCreatedAssets(): Promise<void> {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT }));
  const snap = await db.collection('assets').where('userId', '==', 'test-user-1').where('name', '==', 'ETF ornitorinco').get();
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()));
}

test.beforeAll(rememberHeld);
test.afterAll(async () => {
  await deleteCreatedAssets();
  await deleteAllPlans();
  await removeAccumuloFixture();
  await removeModel();
  await restoreHeld();
});
test.beforeEach(async ({ page }) => {
  await removeAccumuloFixture();
  await page.route('**/api/prices/quote**', (route) => route.fulfill({ json: { price: 100, currency: 'EUR', priceEur: 100 } }));
});

const handoffDialog = (page: Page) => page.getByRole('dialog', { name: TITLE });

async function openAccumuloFromConsulente(page: Page): Promise<void> {
  await page.goto('/dashboard/allocation?tab=accumulo&da=consulente', { waitUntil: 'load' });
  await expect(page).toHaveURL(/\?tab=accumulo$/, { timeout: 60_000 });
}

test('E1 — «Applica» → il link → «Dal Consulente» una volta → l\'editor al suo posto', async ({ page }) => {
  await plant('applied');
  await openReport(page, '?pagina=applica');
  const link = bookCard(page).getByRole('link', { name: LINK });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/dashboard\/allocation\?tab=accumulo$/, { timeout: 60_000 });
  const dialog = handoffDialog(page);
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText(/ETF ornitorinco/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Crea' }).first()).toBeVisible();
  await dialog.getByRole('button', { name: "Apri l'editor" }).click();
  await expect(handoffDialog(page)).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Da dove arriva la liquidità' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
});

test('E2 — con un piano aperto: la nota e nessun link; `?da=consulente` non apre nulla e si ripulisce', async ({ page }) => {
  await plant('applied');
  await seedAccumuloFixture();
  await openReport(page, '?pagina=applica');
  await expect(bookCard(page).getByText(ACTIVE_NOTE)).toBeVisible();
  await expect(bookCard(page).getByRole('link', { name: LINK })).toHaveCount(0);
  await openAccumuloFromConsulente(page);
  await expect(handoffDialog(page)).toHaveCount(0);

  await removeAccumuloFixture();
  await seedAccumuloFixture({ status: 'draft' });
  await openReport(page, '?pagina=applica');
  await expect(bookCard(page).getByText(DRAFT_NOTE)).toBeVisible();
  await expect(bookCard(page).getByRole('link', { name: LINK })).toHaveCount(0);

  // A document not applied: the landing only cleans the URL.
  await removeAccumuloFixture();
  await plant('ready');
  await openAccumuloFromConsulente(page);
  await expect(handoffDialog(page)).toHaveCount(0);
});

test('E3 — «Crea» apre AssetDialog già compilato; salvato, la riga legge «0 quote»', async ({ page }) => {
  await plant('applied');
  await openAccumuloFromConsulente(page);
  const dialog = handoffDialog(page);
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const row = dialog.getByRole('listitem').filter({ hasText: 'ETF ornitorinco' });
  await row.getByRole('button', { name: 'Crea' }).click();
  await expect(handoffDialog(page)).toBeHidden();
  await expect(page.locator('#name')).toHaveValue('ETF ornitorinco');
  // The planted candidate has no ticker: the row said so, the owner types one.
  await page.locator('#ticker').fill('ORNI.MI');
  await page.getByRole('button', { name: /^Crea/ }).last().click();
  await expect(handoffDialog(page)).toBeVisible({ timeout: 30_000 });
  await expect(handoffDialog(page).getByRole('listitem').filter({ hasText: 'ETF ornitorinco' })).toContainText('0 quote', { timeout: 30_000 });
});

// Owner, 2026-11-18 (the tour of NOVE-21): «Salva bozza» writes the model too when «Aggiorna anche il portafoglio
// modello» is on, as «Attiva» does — for every plan. Seen red with `finishWithModel` dropped from `handleSaveDraft`.
test('E4 — «Salva bozza» con la casella accesa scrive anche il portafoglio modello', async ({ page }) => {
  await removeModel();
  await plant('applied');
  await openAccumuloFromConsulente(page);
  const dialog = handoffDialog(page);
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: "Apri l'editor" }).click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('button', { name: 'Avanti' }).click();
  await editor.getByRole('button', { name: 'Avanti' }).click();
  await expect(editor.getByRole('checkbox', { name: 'Aggiorna anche il portafoglio modello' })).toBeChecked();
  await editor.getByRole('button', { name: 'Salva bozza' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => (await readModel())?.sum ?? null, { timeout: 15_000 }).toBe(100);
  await deleteAllPlans();
  await removeAccumuloFixture();
});
