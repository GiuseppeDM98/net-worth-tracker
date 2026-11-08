/**
 * Allocazione › Consulente — the eight screens and the run, at 1440px, on the base account.
 *
 * WHY IT EXISTS: the path is a pure reducer with one screen per question, and Vitest holds every
 * transition; what only a browser knows is that the page is reached from the Allocazione button,
 * that every screen shows its step and its controls, that «Avanti» stays still until the step is
 * complete, that «Indietro» goes back, that the draft survives a reload (localStorage), that the
 * summary points back to the right screen, and — since 2026-11-07 — that the rail says
 * where the reader is, that the headline takes the focus after the slide, and that the run shows
 * its stages, the failed one and «Riprova».
 *
 * It presses «Salta il colloquio e avvia la ricerca» only on a route faked with `page.route`: the
 * `.env.local` key enables the button, no request reaches the server (doc/guide/e2e-emulatori.md
 * § Browser-Driven E2E). A real run is covered by `allocationAdviceRun` (the SDK simulated) and,
 * on 2026-10-20, by a real run on the mirror. The interview that precedes the run (2026-11-08) has
 * its own specs, `allocation.consulente.interview*.spec.ts`.
 */

import { test, expect } from '@playwright/test';
import { clearDraft, next, openConsulente, walkGoals, walkToSummary } from './consulentePath';

test.beforeEach(async ({ page }) => {
  await clearDraft(page);
});

test('walks the eight screens, «Avanti» held until a screen is complete, and «Indietro» returns', async ({ page }) => {
  await openConsulente(page);

  // The rail: eight steps, the current one marked, beside the card at 1440.
  const rail = page.getByRole('list', { name: 'Il percorso' });
  await expect(rail.getByRole('listitem')).toHaveCount(8);
  await expect(rail.locator('[aria-current="step"]')).toHaveText('Chi sei');
  const railBox = (await rail.boundingBox())!;
  const cardBox = (await page.getByRole('region', { name: /^Passo 1 di 8/ }).boundingBox())!;
  expect(railBox.x + railBox.width).toBeLessThan(cardBox.x);

  // Step 1: without the horizon the screen says so and «Avanti» stays disabled.
  await page.locator('#consulente-age').fill('35');
  await page.locator('#consulente-horizon').fill('');
  await expect(page.getByRole('button', { name: 'Avanti' })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('quanti anni investi');
  await page.locator('#consulente-horizon').fill('20');
  await expect(page.getByRole('button', { name: 'Avanti' })).toBeEnabled();
  await next(page);

  // Step 2: three loss rows in euro, a radio of three; the rail moved, the headline took the focus.
  await expect(page.getByRole('heading', { name: /Passo 2 di 8/ })).toBeVisible();
  await expect(rail.locator('[aria-current="step"]')).toHaveText('Le perdite');
  await expect(page.locator('[data-scene] > p[tabindex="-1"]')).toBeFocused();
  const scenarios = page.getByRole('list', { name: 'Scenari di perdita sulla tua base' });
  await expect(scenarios.getByRole('listitem')).toHaveCount(3);
  await expect(scenarios).toContainText('−10%');
  await page.getByRole('radio', { name: /^Alta/ }).check();
  await next(page);

  // Step 3: the exchange is prefilled, the broker optional.
  await expect(page.getByRole('heading', { name: /Passo 3 di 8/ })).toBeVisible();
  // The exchange is a closed list with «Altra…» opening a free field; the default stays Borsa Italiana.
  await expect(page.locator('#consulente-exchange')).toContainText('Borsa Italiana');
  await page.locator('#consulente-exchange').click();
  await page.getByRole('option', { name: 'Altra…' }).click();
  await page.locator('#consulente-exchange-other').fill('SIX Swiss Exchange');
  await page.locator('#consulente-exchange').click();
  await page.getByRole('option', { name: /Borsa Italiana/ }).click();
  await expect(page.locator('#consulente-exchange-other')).toHaveCount(0);
  await page.locator('#consulente-broker').fill('Broker X');
  await next(page);

  await expect(page.getByRole('heading', { name: /Passo 4 di 8/ })).toBeVisible();
  await page.getByRole('radio', { name: /^Distribuzione/ }).check();
  await next(page);

  // Step 5: the goals, then «cosa manca» with its textarea and «Aggiungi un obiettivo».
  await expect(page.getByRole('heading', { name: /Passo 5 di 8/ })).toBeVisible();
  await walkGoals(page);
  await page.locator('#consulente-missing').fill('un fondo per i figli');
  await page.getByRole('button', { name: 'Aggiungi un obiettivo' }).click();
  // The new goal's screen: no name → blocked; a name → on.
  await expect(page.getByRole('button', { name: 'Avanti' })).toBeDisabled();
  await page.locator('input[id^="goal-"][id$="-name"]').fill('Fondo figli');
  await expect(page.getByRole('button', { name: 'Avanti' })).toBeEnabled();
  await next(page);
  await expect(page.locator('#consulente-missing')).toHaveValue('un fondo per i figli');
  await next(page);

  // Step 6: three role blocks.
  await expect(page.getByRole('heading', { name: /Passo 6 di 8/ })).toBeVisible();
  await expect(page.getByRole('radiogroup')).toHaveCount(3);
  await next(page);

  // Step 7: the constraints.
  await expect(page.getByRole('heading', { name: /Passo 7 di 8/ })).toBeVisible();
  await page.locator('#consulente-avoid').fill('niente leva');
  await next(page);

  // Step 8: the summary rows, each a link back; «Avvia il colloquio» (an AI control) beside the skip
  // that starts the run (never accented, decision 78); neither pressed here (2026-11-08).
  await expect(page.getByRole('heading', { name: /Passo 8 di 8/ })).toBeVisible();
  const summary = page.getByRole('list', { name: 'Le tue risposte' });
  await expect(summary).toContainText('35 anni · 20 anni di orizzonte');
  await expect(summary).toContainText('Broker X');
  await expect(summary).toContainText('distribuzione');
  await expect(summary).toContainText('Fondo figli');
  await expect(summary).toContainText('evita: niente leva');
  await expect(page.getByRole('button', { name: 'Avvia il colloquio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Avvia il colloquio' })).toHaveClass(/var\(--ai-glow\)/);
  await expect(page.getByRole('button', { name: 'Salta il colloquio e avvia la ricerca' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salta il colloquio e avvia la ricerca' })).not.toHaveClass(/ai-glow/);

  // «Indietro» returns to the constraints; the summary's row opens its screen.
  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page.getByRole('heading', { name: /Passo 7 di 8/ })).toBeVisible();
  await next(page);
  await summary.getByRole('button', { name: /Borsa e broker/ }).click();
  await expect(page.getByRole('heading', { name: /Passo 3 di 8/ })).toBeVisible();
  await expect(page.locator('#consulente-broker')).toHaveValue('Broker X');
});

test('the draft survives a reload on this browser', async ({ page }) => {
  await openConsulente(page);
  await page.locator('#consulente-age').fill('42');
  await page.locator('#consulente-horizon').fill('15');
  await next(page);
  await expect(page.getByRole('heading', { name: /Passo 2 di 8/ })).toBeVisible();

  await page.reload({ waitUntil: 'load' });
  await expect(page.getByRole('heading', { name: /Passo 2 di 8/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page.locator('#consulente-age')).toHaveValue('42');
  await expect(page.locator('#consulente-horizon')).toHaveValue('15');
});

test('runs the three stages on a faked route, a failed stage retried from itself', async ({ page }) => {
  const order: string[] = [];
  const carriesAnswers: Record<string, boolean> = {};
  let instrumentsRequests = 0;
  let releaseRetry: () => void = () => {};
  const retryHeld = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  const sse = (events: object[]) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  const stream = (events: object[]) => ({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse(events) });

  // Installed before the walk: no request of the run ever reaches the server.
  await page.route('**/api/allocation-advice/run', async (route) => {
    const body = route.request().postDataJSON() as { stage: string; answers?: unknown };
    order.push(body.stage);
    carriesAnswers[`${body.stage}#${order.length}`] = body.answers !== undefined;
    if (body.stage === 'strategy') {
      await route.fulfill(stream([{ type: 'stage', stage: 'context' }, { type: 'stage', stage: 'strategy' }, { type: 'done' }]));
    } else if (body.stage === 'instruments') {
      instrumentsRequests += 1;
      if (instrumentsRequests === 1) {
        await route.fulfill(stream([{ type: 'stage', stage: 'instruments' }, { type: 'error', error: 'Ricerca finta interrotta: ornitorinco.', retryable: true }]));
      } else {
        await retryHeld;
        await route.fulfill(stream([{ type: 'stage', stage: 'instruments' }, { type: 'done' }]));
      }
    } else {
      await route.fulfill(stream([{ type: 'stage', stage: 'review' }, { type: 'done' }]));
    }
  });

  await openConsulente(page);
  await walkToSummary(page);
  // The run without the interview (2026-11-08): the strategy body carries `{ rounds: [], skipped: true }`.
  const start = page.getByRole('button', { name: 'Salta il colloquio e avvia la ricerca' });
  await expect(start).toBeEnabled();
  await start.click();

  // The first instruments request fails: the stage marked, the decoy sentence, «Riprova».
  const card = page.getByRole('region', { name: 'Corsa del Consulente' });
  await expect(card.getByRole('status')).toHaveText('Il percorso non si è concluso.');
  await expect(card).toContainText('Ricerca finta interrotta: ornitorinco.');
  const rows = card.locator('ol[aria-label="Le fasi"] > li');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toHaveAttribute('data-state', 'done');
  await expect(rows.nth(1)).toHaveAttribute('data-state', 'done');
  await expect(rows.nth(2)).toHaveAttribute('data-state', 'failed');
  await expect(rows.nth(3)).toHaveAttribute('data-state', 'pending');
  await expect(card.getByRole('button', { name: 'Riprova' })).toBeVisible();

  // «Riprova» restarts from the instruments, whose request is held: the row is active with its
  // typical duration and a clock; the rail's fills are there, hidden; one live region.
  await card.getByRole('button', { name: 'Riprova' }).click();
  await expect(rows.nth(2)).toHaveAttribute('data-state', 'active');
  await expect(rows.nth(2)).toContainText('Cerco gli strumenti');
  await expect(rows.nth(2)).toContainText('di solito ~2 min');
  await expect(rows.nth(2).locator('[aria-hidden="true"]').last()).toHaveText(/^\d+:\d\d$/);
  await expect(page.locator('ol[aria-label="Le fasi"][aria-hidden="true"]')).toHaveCount(1);
  await expect(card.locator('[aria-live]')).toHaveCount(1);
  releaseRetry();

  await expect(card.getByRole('status')).toHaveText('La proposta è pronta.');
  await expect(rows.nth(3)).toHaveAttribute('data-state', 'done');
  expect(order).toEqual(['strategy', 'instruments', 'instruments', 'review']);
  expect(carriesAnswers).toEqual({ 'strategy#1': true, 'instruments#2': false, 'instruments#3': false, 'review#4': false });
});

test('the assistant links to the Consulente', async ({ page }) => {
  await page.goto('/dashboard/assistant', { waitUntil: 'load' });
  const link = page.getByRole('link', { name: /Imposta la tua allocazione con il Consulente/ });
  await expect(link).toBeVisible({ timeout: 60_000 });
  await expect(link).toHaveAttribute('href', '/dashboard/allocation/consulente');
});
