/**
 * Allocazione › Consulente, the REPORT read as a BOOK at 1440px (2026-11-08): one page per section
 * and tile, turned from the footer and jumped to from the rail's labels; each page an address
 * (`?pagina=`, `replaceState`); the accent on the pages the model wrote and never on «Il colloquio»,
 * «Chiedi una modifica», «Applica»; the first page cascades once per JS session and the proposal
 * page counts up on its first mount; «Chiedi una modifica» asks its round and keeps its draft across
 * a turn; a failed run is a book too; a run still going shows its stage rows; a printer gets every
 * page; reduced motion plays nothing.
 *
 * Each test plants its own document (`e2e/consulenteReport.ts`); `afterAll` puts back what the
 * account held. The run route is ALWAYS faked (`installFakeRun`): no model is called.
 */

import { test, expect, type Page } from '@playwright/test';
import { REVISION_ROUND, installFakeRun, type FakeRunRecorder } from './consulenteInterview';
import { PRINTABLE_TITLES, bookCard, expectPage, openReport, plant, rememberHeld, restoreHeld } from './consulenteReport';

declare global {
  interface Window {
    __report?: { minOpacity: number; pcts: string[]; transforms: string[] };
  }
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(rememberHeld);
test.afterAll(restoreHeld);

/** Frame by frame: the lowest opacity of the page's blocks, the proposal's first figure as it changes, the scene's transform. */
async function installProbe(page: Page) {
  await page.addInitScript(() => {
    window.__report = { minOpacity: 1, pcts: [], transforms: [] };
    const tick = () => {
      const probe = window.__report!;
      const scene = document.querySelector<HTMLElement>('[data-scene]');
      if (scene) {
        probe.transforms.push(getComputedStyle(scene).transform);
        for (const block of Array.from(scene.querySelectorAll(':scope > div > *'))) {
          const opacity = Number.parseFloat(getComputedStyle(block).opacity);
          if (opacity < probe.minOpacity) probe.minOpacity = opacity;
        }
        const text = scene.querySelector('[data-proposed-pct]')?.textContent ?? null;
        if (text !== null && probe.pcts[probe.pcts.length - 1] !== text) probe.pcts.push(text);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const readProbe = (page: Page) => page.evaluate(() => window.__report!);
const resetProbe = (page: Page) =>
  page.evaluate(() => {
    window.__report = { minOpacity: 1, pcts: [], transforms: [] };
  });

const forward = (page: Page) => bookCard(page).getByRole('button', { name: 'Avanti' }).click();
const back = (page: Page) => bookCard(page).getByRole('button', { name: 'Indietro' }).click();
const rail = (page: Page) => page.getByRole('list', { name: 'Le pagine' });

let recorder: FakeRunRecorder;

test.beforeEach(async ({ page }) => {
  await installProbe(page);
  recorder = await installFakeRun(page, { delayRoundMs: () => 1_000 });
});

test('the cover cascades once, does not slide, and the proposal page counts up on its first mount only', async ({ page }) => {
  await plant('ready');
  await openReport(page);
  await expectPage(page, 'Pagina 1 di 10 · In una frase', 'copertina');
  await expect(page.locator('[data-generated]')).toHaveCount(1);
  await page.waitForTimeout(800);
  const opened = await readProbe(page);
  expect(opened.minOpacity).toBeLessThan(0.5);
  expect(opened.transforms.every((transform) => transform === 'none')).toBe(true);
  const settled = await page.evaluate(() => Array.from(document.querySelectorAll('[data-scene] > div > *')).every((block) => getComputedStyle(block).opacity === '1'));
  expect(settled).toBe(true);

  await resetProbe(page);
  await forward(page);
  await expectPage(page, "Pagina 2 di 10 · L'allocazione proposta", 'allocazione');
  await expect(bookCard(page).locator('[data-proposed-pct]').first()).toHaveText('70,0%');
  await page.waitForTimeout(800);
  const counted = await readProbe(page);
  expect(counted.pcts.length).toBeGreaterThan(1);
  expect(counted.pcts[counted.pcts.length - 1]).toBe('70,0%');

  await forward(page);
  await expectPage(page, 'Pagina 3 di 10 · Gli strumenti', 'strumenti');
  await resetProbe(page);
  await back(page);
  await expectPage(page, "Pagina 2 di 10 · L'allocazione proposta", 'allocazione');
  await page.waitForTimeout(800);
  const again = await readProbe(page);
  expect(again.pcts).toEqual(['70,0%']);
  expect(again.minOpacity).toBe(1);

  // Back to the Allocazione and in again, the same JS session: no cascade, no count.
  await page.getByRole('link', { name: "Torna all'Allocazione" }).click();
  await expect(page.getByRole('region', { name: "Verdetto sull'allocazione" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('link', { name: 'Consulente' }).filter({ visible: true }).first().click();
  await expectPage(page, /^Pagina 1 di 10/, 'copertina');
  await resetProbe(page);
  await forward(page);
  await expectPage(page, /^Pagina 2 di 10/, 'allocazione');
  await page.waitForTimeout(800);
  const returned = await readProbe(page);
  expect(returned.pcts).toEqual(['70,0%']);
  expect(returned.minOpacity).toBe(1);
});

test('a session opened on «Gli strumenti» still counts up when it turns back to the proposal', async ({ page }) => {
  await plant('ready');
  await openReport(page, '?pagina=strumenti');
  await expectPage(page, 'Pagina 3 di 10 · Gli strumenti', 'strumenti');
  await resetProbe(page);
  await back(page);
  await expectPage(page, /^Pagina 2 di 10/, 'allocazione');
  await page.waitForTimeout(800);
  const probe = await readProbe(page);
  expect(probe.pcts.length).toBeGreaterThan(1);
  expect(probe.pcts[probe.pcts.length - 1]).toBe('70,0%');
});

test('the rail is the index: its label turns the page, one Tab stop between the header and the card', async ({ page }) => {
  await plant('ready');
  await openReport(page);
  await expectPage(page, /^Pagina 1 di 10/, 'copertina');
  await rail(page).getByRole('button', { name: 'Gli strumenti' }).click();
  await expectPage(page, 'Pagina 3 di 10 · Gli strumenti', 'strumenti');
  await expect(bookCard(page)).toContainText('ETF fenicottero breve · duration 1,9 anni · Borsa Italiana');
  await expect(bookCard(page)).toContainText("L'ETF ornitorinco copre le azioni.");

  // From the header's last control: one Tab lands on the rail's current page, the next one in the card.
  await page.getByRole('link', { name: "Torna all'Allocazione" }).focus();
  await page.keyboard.press('Tab');
  await expect(rail(page).getByRole('button', { name: 'Gli strumenti' })).toBeFocused();
  await page.keyboard.press('Tab');
  const inCard = await page.evaluate(() => Boolean(document.activeElement?.closest('section[aria-label^="Pagina "]')));
  expect(inCard).toBe(true);
});

test('a page is an address: replaceState on every turn, the history never grows, «Rifai il percorso» cleans it', async ({ page }) => {
  await plant('ready');
  await openReport(page, '?pagina=strumenti');
  await expectPage(page, /^Pagina 3 di 10/, 'strumenti');
  const length = await page.evaluate(() => history.length);
  await back(page);
  await expectPage(page, /^Pagina 2 di 10/, 'allocazione');
  expect(page.url()).toContain('pagina=allocazione');
  await forward(page);
  await expectPage(page, /^Pagina 3 di 10/, 'strumenti');
  await forward(page);
  await expectPage(page, /^Pagina 4 di 10/, 'obiettivi');
  expect(page.url()).toContain('pagina=obiettivi');
  expect(await page.evaluate(() => history.length)).toBe(length);
  await rail(page).getByRole('button', { name: 'In una frase' }).click();
  await expectPage(page, /^Pagina 1 di 10/, 'copertina');
  expect(page.url()).not.toContain('pagina=');

  await rail(page).getByRole('button', { name: 'Applica' }).click();
  await expectPage(page, 'Pagina 10 di 10 · Applica', 'applica');
  expect(page.url()).toContain('pagina=applica');
  await bookCard(page).getByRole('button', { name: 'Rifai il percorso' }).click();
  await expect(page.getByRole('heading', { name: /Passo 1 di 8/ })).toBeVisible({ timeout: 30_000 });
  expect(page.url()).not.toContain('pagina=');
});

test('the accent follows the author: «Il colloquio», «Chiedi una modifica» and «Applica» are not the model’s', async ({ page }) => {
  await plant('ready');
  await openReport(page, '?pagina=colloquio');
  await expectPage(page, 'Pagina 8 di 10 · Il colloquio', 'colloquio');
  await expect(page.locator('[data-generated]')).toHaveCount(0);
  const card = bookCard(page);
  await expect(card).toContainText('2 tornate');
  await expect(card).toContainText('Tornata 1');
  await expect(card).toContainText("Vedo un reddito concentrato: l'86% delle entrate da una fonte sola.");
  await expect(card).toContainText('Circa metà');
  await expect(card).toContainText('Preferisco non dire');
  await expect(card).toContainText('Sì, resta fuori');

  await forward(page);
  await expectPage(page, 'Pagina 9 di 10 · Chiedi una modifica', 'modifica');
  await expect(page.locator('[data-generated]')).toHaveCount(0);
  await expect(card).toContainText('1 richiesta');
  await expect(card).toContainText('meno cripto');
  const asked = card.locator('[data-revision-interview]');
  await expect(asked).toContainText('Il Consulente ha chiesto');
  await expect(asked).toContainText("Un po' di rendimento atteso");
  await expect(card.getByRole('button', { name: 'Rivedi il report' })).toHaveClass(/var\(--ai-glow\)/);

  await forward(page);
  await expectPage(page, 'Pagina 10 di 10 · Applica', 'applica');
  await expect(page.locator('[data-generated]')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Avanti' })).toHaveCount(0);
});

test('a text without headings is one page «Il report» after a plain cover', async ({ page }) => {
  await plant('ready', 'plain');
  await openReport(page);
  await expectPage(page, /^Pagina 1 di 9 · In una frase/, 'copertina');
  await expect(page.locator('[data-generated]')).toHaveCount(0);
  await forward(page);
  await expectPage(page, 'Pagina 2 di 9 · Il report', 'report');
  await expect(page.locator('[data-generated]')).toHaveCount(1);
  await expect(bookCard(page)).toContainText('Il report del Consulente, finto, senza titoli.');
});

test('«Rivedi il report» asks one round first, keeps the draft across a turn, then sends the answered round', async ({ page }) => {
  await plant('ready');
  await openReport(page, '?pagina=modifica');
  await expectPage(page, /^Pagina 9 di 10/, 'modifica');
  const card = bookCard(page);
  const primary = card.getByRole('button', { name: 'Rivedi il report' });
  await expect(primary).toBeDisabled();
  await expect(card.getByRole('button', { name: 'Salta le domande' })).toHaveCount(0);
  await page.locator('#consulente-revision').fill('niente ornitorinchi');
  await primary.click();
  await expect(card.locator('[aria-busy="true"]')).toBeVisible();
  await expect(page.locator('#consulente-revision')).toHaveAttribute('readonly', '');
  expect(recorder.interview).toHaveLength(1);
  expect(recorder.interview[0]).toMatchObject({ stage: 'interview', interview: { rounds: [], skipped: false }, revision: { requests: 'niente ornitorinchi' } });
  await expect(card.locator('[data-revision-round]')).toBeVisible();

  // The draft lives in the book: a turn away and back finds the request and the round.
  await back(page);
  await expectPage(page, /^Pagina 8 di 10/, 'colloquio');
  await forward(page);
  await expectPage(page, /^Pagina 9 di 10/, 'modifica');
  await expect(page.locator('#consulente-revision')).toHaveValue('niente ornitorinchi');
  const round = card.locator('[data-revision-round]');
  await expect(round).toContainText(REVISION_ROUND.note);
  await expect(round.locator('[data-question-card]')).toHaveCount(1);
  await expect(card.getByRole('status').last()).toHaveText('Rispondi a «Cosa accetti di cedere per avere meno cripto?», o scegli «Preferisco non dire».');
  await round.getByRole('radio', { name: 'Niente: solo spostare' }).click();
  await expect(primary).toBeEnabled();
  await primary.click();

  await expect(round).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('#consulente-revision')).toHaveValue('');
  // The revision keeps the reader on the page where the request was made.
  await expectPage(page, /Chiedi una modifica$/);
  expect(recorder.revise).toHaveLength(1);
  expect(recorder.revise[0].request).toBe('niente ornitorinchi');
  expect(recorder.revise[0].interview?.rounds).toHaveLength(1);
  expect((recorder.revise[0].interview?.rounds[0] as { answers: unknown[] }).answers).toEqual([{ questionId: 'cedere', value: 'niente' }]);
  expect(recorder.strategy).toHaveLength(0);
});

test('«Salta le domande» while the round is still asked sends the revision with no round, skipped', async ({ page }) => {
  await plant('ready');
  await openReport(page, '?pagina=modifica');
  await expectPage(page, /^Pagina 9 di 10/, 'modifica');
  const card = bookCard(page);
  await page.locator('#consulente-revision').fill('niente ornitorinchi');
  await card.getByRole('button', { name: 'Rivedi il report' }).click();
  await expect(card.locator('[aria-busy="true"]')).toBeVisible();
  const skip = card.getByRole('button', { name: 'Salta le domande' });
  await expect(skip).not.toHaveClass(/ai-glow/);
  await skip.click();
  await expect(page.locator('#consulente-revision')).toHaveValue('', { timeout: 15_000 });
  expect(recorder.revise).toHaveLength(1);
  expect(recorder.revise[0]).toMatchObject({ stage: 'revise', request: 'niente ornitorinchi', interview: { rounds: [], skipped: true } });
  await page.waitForTimeout(1_500);
  await expect(card.locator('[data-revision-round]')).toHaveCount(0);
  expect(recorder.revise).toHaveLength(1);
});

test('a failed run is a book over its strategy: the negative verdict on the cover, «Rifai il percorso» alone at the end', async ({ page }) => {
  await plant('failed');
  await openReport(page);
  await expectPage(page, /^Pagina 1 di \d+ · La situazione/, 'copertina');
  await expect(bookCard(page).getByRole('heading', { level: 2 })).toContainText('Il percorso non si è concluso');
  await expect(page.locator('[data-generated]')).toHaveCount(1);
  await rail(page).getByRole('button', { name: 'Applica' }).click();
  await expectPage(page, /· Applica$/, 'applica');
  await expect(bookCard(page).getByRole('checkbox')).toHaveCount(0);
  await expect(bookCard(page).getByRole('button', { name: 'Applica alle impostazioni' })).toHaveCount(0);
  await expect(bookCard(page).getByRole('button', { name: 'Rifai il percorso' })).toBeVisible();
  await expect(rail(page).getByRole('button', { name: 'Chiedi una modifica' })).toHaveCount(0);
});

test('a run still going shows its stage rows with the typical duration and no clock', async ({ page }) => {
  await plant('running');
  await openReport(page);
  const stages = page.getByRole('region', { name: 'Le fasi' });
  await expect(stages).toHaveAttribute('data-generated', '');
  const active = stages.locator('li[data-state="active"]');
  await expect(active).toHaveCount(1);
  await expect(active).toContainText('Cerco gli strumenti');
  await expect(active).toContainText('di solito ~2 min');
  await expect(active).not.toContainText(/\d+:\d\d/);
  await expect(bookCard(page)).toHaveCount(0);
});

test('a printer gets every page but the two that act; the shell opens for it on this page only', async ({ page }) => {
  await plant('ready');
  await openReport(page);
  await expectPage(page, /^Pagina 1 di 10/, 'copertina');
  await page.emulateMedia({ media: 'print' });
  const sheet = page.locator('[data-book-print]');
  await expect(sheet).toBeVisible();
  // The pages' titles (`section > div > h2`), not the verdict's own heading (`section > h2`).
  expect(await sheet.locator(':scope > section > div > h2').allTextContents()).toEqual(PRINTABLE_TITLES);
  await expect(sheet).not.toContainText('Chiedi una modifica');
  await expect(page.locator('[data-consulente-report]')).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('page-main')!).overflowY)).toBe('visible');
  await expect(page.locator('[role="navigation"][aria-label="Navigazione principale"]')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await expect(sheet).toBeHidden();

  await page.goto('/dashboard/allocation', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: "Verdetto sull'allocazione" })).toBeVisible({ timeout: 60_000 });
  await page.emulateMedia({ media: 'print' });
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('page-main')!).overflowY)).toBe('auto');
  await page.emulateMedia({ media: 'screen' });
});

test.describe('under reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the book neither cascades nor counts', async ({ page }) => {
    await plant('ready');
    await openReport(page);
    await expectPage(page, /^Pagina 1 di 10/, 'copertina');
    await page.waitForTimeout(800);
    expect((await readProbe(page)).minOpacity).toBe(1);
    await resetProbe(page);
    await forward(page);
    await expectPage(page, /^Pagina 2 di 10/, 'allocazione');
    await expect(bookCard(page).locator('[data-proposed-pct]').first()).toHaveText('70,0%');
    await page.waitForTimeout(800);
    const probe = await readProbe(page);
    expect(probe.pcts).toEqual(['70,0%']);
  });
});
