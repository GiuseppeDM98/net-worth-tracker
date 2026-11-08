/**
 * Allocazione › Consulente — the INTERVIEW at 1440px, on the base account (2026-11-08,
 * doc/guide/consulente.md § The path).
 *
 * WHY IT EXISTS: the rounds, the answers and the skip are a pure reducer held by Vitest; what only
 * a browser knows is that «Avvia il colloquio» opens the scene inside the card, that the cards
 * answer and the primary waits for every question, that «Continua» sends the previous rounds with
 * their answers, that after three rounds the primary reads «Avvia la ricerca» and the strategy's
 * body carries the whole interview, that «Salta il colloquio» commits the round as it stands —
 * from the scene and from the summary — that a reload keeps the round, that the rail lights one
 * tick per round, and that a round still requested shows the skeleton and can be abandoned.
 *
 * The run route is ALWAYS faked (`e2e/consulenteInterview.ts`): no request reaches a model.
 */

import { test, expect } from '@playwright/test';
import { clearDraft, openConsulente, walkToSummary } from './consulentePath';
import { FAKE_RUN_ERROR, ROUND_1, ROUND_2, ROUND_3, installFakeRun, interviewScene, questionCard } from './consulenteInterview';

test.beforeEach(async ({ page }) => {
  await clearDraft(page);
});

test('three rounds: the cards answer, «Continua» carries the answers, the third ends on «Avvia la ricerca» and the strategy reads the whole interview', async ({ page }) => {
  const recorder = await installFakeRun(page);
  await openConsulente(page);
  await walkToSummary(page);

  // The summary: the two buttons, the interview's rail dimmed (hidden from the tree).
  const start = page.getByRole('button', { name: 'Avvia il colloquio' });
  await expect(start).toBeVisible();
  await expect(start).toHaveClass(/var\(--ai-glow\)/);
  await expect(page.getByRole('button', { name: 'Salta il colloquio e avvia la ricerca' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Il colloquio' })).toHaveCount(0);
  await start.click();

  // Round 1: the eyebrow, the note as the headline with the focus, two cards, the primary held.
  const scene1 = interviewScene(page, 1);
  await expect(scene1).toBeVisible();
  await expect(scene1.getByRole('heading', { name: 'Colloquio · tornata 1 di 3' })).toBeVisible();
  await expect(page.locator('[data-scene="interview"] > p[tabindex="-1"]')).toHaveText(ROUND_1.note);
  await expect(page.locator('[data-scene="interview"] > p[tabindex="-1"]')).toBeFocused();
  await expect(page.locator('[data-question-card]')).toHaveCount(2);
  await expect(questionCard(page, 'reddito')).toContainText('Il Consulente chiede · 1 di 2');
  await expect(questionCard(page, 'reddito')).toContainText("l'86% delle entrate");
  const next = page.getByRole('button', { name: 'Continua' });
  await expect(next).toBeDisabled();
  await expect(scene1.getByRole('status')).toHaveText('Rispondi a «Quanto dipendi da quella fonte?», o scegli «Preferisco non dire».');
  expect(recorder.interview).toHaveLength(1);
  expect(recorder.interview[0].interview).toEqual({ rounds: [], skipped: false });

  // The rail: the first tick lit, current.
  const rail = page.getByRole('list', { name: 'Il colloquio' });
  await expect(rail).toBeVisible();
  await expect(rail.getByRole('listitem').nth(0)).toHaveAttribute('aria-current', 'step');

  // The single answered; the multiple's «Altro…» chosen — the other rows unchecked — and typed.
  await questionCard(page, 'reddito').getByRole('radio', { name: 'Circa metà' }).click();
  await expect(scene1.getByRole('status')).toHaveText('Rispondi a «Cosa conta come riserva di emergenza?», o scegli «Preferisco non dire».');
  const riserva = questionCard(page, 'riserva');
  await riserva.getByRole('checkbox', { name: 'I conti correnti' }).click();
  await riserva.getByRole('checkbox', { name: 'Altro…' }).click();
  await expect(riserva.getByRole('checkbox', { name: 'I conti correnti' })).toHaveAttribute('aria-checked', 'false');
  await expect(riserva.getByRole('checkbox', { name: 'Altro…' })).toHaveAttribute('aria-checked', 'true');
  // A blank «Altro…» is not an answer yet.
  await expect(next).toBeDisabled();
  await riserva.getByRole('textbox').fill('fenicottero');
  await expect(scene1.getByRole('status')).toHaveText('');
  await expect(next).toBeEnabled();
  await next.click();

  // Round 2: the request carried round 1 with its two answers; the rail's second tick lit and current.
  const scene2 = interviewScene(page, 2);
  await expect(scene2).toBeVisible();
  await expect(page.locator('[data-scene="interview"] > p[tabindex="-1"]')).toHaveText(ROUND_2.note);
  expect(recorder.interview).toHaveLength(2);
  expect(recorder.interview[1].interview.skipped).toBe(false);
  expect(recorder.interview[1].interview.rounds).toHaveLength(1);
  expect(recorder.interview[1].interview.rounds[0].answers).toEqual([
    { questionId: 'reddito', value: 'meta' },
    { questionId: 'riserva', value: { other: 'fenicottero' } },
  ]);
  const second = rail.getByRole('listitem').nth(1);
  await expect(second).toHaveAttribute('aria-current', 'step');
  await expect(second.locator('span').first()).toHaveClass(/bg-\[color:var\(--ai-accent\)\]/);
  await expect(rail.getByRole('listitem').nth(0).locator('span').first()).toHaveClass(/bg-\[color:var\(--ai-accent\)\]/);
  await expect(rail.getByRole('listitem').nth(2).locator('span').first()).not.toHaveClass(/ai-accent/);
  await expect(page.locator('[data-question-card]')).toHaveCount(2);
  await questionCard(page, 'casa').getByRole('radio', { name: 'Sì, resta fuori' }).click();
  await questionCard(page, 'prestito').getByRole('radio', { name: 'Preferisco non dire' }).click();
  await expect(next).toBeEnabled();
  await next.click();

  // Round 3: one question, unsatisfied, and once answered the primary is «Avvia la ricerca».
  await expect(interviewScene(page, 3)).toBeVisible();
  await expect(page.locator('[data-scene="interview"] > p[tabindex="-1"]')).toHaveText(ROUND_3.note);
  await expect(page.locator('[data-question-card]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Continua' })).toHaveCount(0);
  const run = page.getByRole('button', { name: 'Avvia la ricerca' });
  await expect(run).toBeDisabled();
  await questionCard(page, 'previdenza').getByRole('radio', { name: 'Sì, congelato' }).click();
  await expect(run).toBeEnabled();
  await expect(run).toHaveClass(/var\(--ai-glow\)/);
  await run.click();

  // The run screen shows the fake error; the strategy body holds the three rounds.
  const card = page.getByRole('region', { name: 'Corsa del Consulente' });
  await expect(card.getByRole('status')).toHaveText('Il percorso non si è concluso.');
  await expect(card).toContainText(FAKE_RUN_ERROR);
  expect(recorder.strategy).toHaveLength(1);
  const sent = recorder.strategy[0].interview!;
  expect(sent.skipped).toBe(false);
  expect(sent.rounds).toHaveLength(3);
  expect(sent.rounds[1].answers).toEqual([
    { questionId: 'casa', value: 'fuori' },
    { questionId: 'prestito', value: '__decline__' },
  ]);
  expect(sent.rounds[2].answers).toEqual([{ questionId: 'previdenza', value: 'si' }]);
  expect(recorder.interview).toHaveLength(3);
});

test('«Salta il colloquio» on round 2 commits the rounds as they stand, one answer of two', async ({ page }) => {
  const recorder = await installFakeRun(page);
  await openConsulente(page);
  await walkToSummary(page);
  await page.getByRole('button', { name: 'Avvia il colloquio' }).click();
  await expect(interviewScene(page, 1)).toBeVisible();
  await questionCard(page, 'reddito').getByRole('radio', { name: 'Interamente' }).click();
  await questionCard(page, 'riserva').getByRole('checkbox', { name: 'I BTP a breve' }).click();
  await page.getByRole('button', { name: 'Continua' }).click();
  await expect(interviewScene(page, 2)).toBeVisible();
  await questionCard(page, 'casa').getByRole('radio', { name: 'No, potrei venderla' }).click();

  // The skip is never accented; it starts the strategy at once.
  const skip = page.getByRole('button', { name: 'Salta il colloquio' });
  await expect(skip).not.toHaveClass(/ai-glow/);
  await skip.click();
  await expect(page.getByRole('region', { name: 'Corsa del Consulente' })).toContainText(FAKE_RUN_ERROR);
  expect(recorder.strategy).toHaveLength(1);
  const sent = recorder.strategy[0].interview!;
  expect(sent.skipped).toBe(true);
  expect(sent.rounds).toHaveLength(2);
  expect(sent.rounds[0].answers).toEqual([
    { questionId: 'reddito', value: 'tutto' },
    { questionId: 'riserva', value: ['btp'] },
  ]);
  expect(sent.rounds[1].answers).toEqual([{ questionId: 'casa', value: 'dentro' }]);
});

test('the skip from the summary starts the strategy with no round and asks none', async ({ page }) => {
  const recorder = await installFakeRun(page);
  await openConsulente(page);
  await walkToSummary(page);
  const skip = page.getByRole('button', { name: 'Salta il colloquio e avvia la ricerca' });
  await expect(skip).not.toHaveClass(/ai-glow/);
  await skip.click();
  await expect(page.getByRole('region', { name: 'Corsa del Consulente' })).toContainText(FAKE_RUN_ERROR);
  expect(recorder.interview).toHaveLength(0);
  expect(recorder.strategy).toHaveLength(1);
  expect(recorder.strategy[0].interview).toEqual({ rounds: [], skipped: true });
});

test('a reload on round 1 shows the round again, the answer kept, with no new request', async ({ page }) => {
  const recorder = await installFakeRun(page);
  await openConsulente(page);
  await walkToSummary(page);
  await page.getByRole('button', { name: 'Avvia il colloquio' }).click();
  await expect(interviewScene(page, 1)).toBeVisible();
  await questionCard(page, 'reddito').getByRole('radio', { name: 'Circa metà' }).click();
  expect(recorder.interview).toHaveLength(1);

  await page.reload({ waitUntil: 'load' });
  await expect(interviewScene(page, 1)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-scene="interview"] > p[tabindex="-1"]')).toHaveText(ROUND_1.note);
  await expect(questionCard(page, 'reddito').getByRole('radio', { name: 'Circa metà' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-question-card]')).toHaveCount(2);
  expect(recorder.interview).toHaveLength(1);

  // «Indietro» returns to the summary, where «Torna al colloquio» reopens the same round.
  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page.getByRole('heading', { name: /Passo 8 di 8/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Torna al colloquio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ricomincia il colloquio' })).toBeVisible();
  await page.getByRole('button', { name: 'Torna al colloquio' }).click();
  await expect(interviewScene(page, 1)).toBeVisible();
  expect(recorder.interview).toHaveLength(1);
});

test('a delayed round shows the skeleton under the previous note, and «Salta il colloquio» abandons it', async ({ page }) => {
  const recorder = await installFakeRun(page, { delayRoundMs: (round) => (round === 2 ? 3_000 : 0) });
  await openConsulente(page);
  await walkToSummary(page);
  await page.getByRole('button', { name: 'Avvia il colloquio' }).click();
  await expect(interviewScene(page, 1)).toBeVisible();
  await questionCard(page, 'reddito').getByRole('radio', { name: 'Circa metà' }).click();
  await questionCard(page, 'riserva').getByRole('checkbox', { name: 'Preferisco non dire' }).click();
  await page.getByRole('button', { name: 'Continua' }).click();

  // The wait: round 2's eyebrow, round 1's note, two skeleton cards, one status line, the primary and «Indietro» held.
  const scene = interviewScene(page, 2);
  await expect(scene).toBeVisible();
  await expect(page.locator('[data-scene="interview"] > p[tabindex="-1"]')).toHaveText(ROUND_1.note);
  const skeleton = page.locator('[aria-busy="true"]');
  await expect(skeleton).toBeVisible();
  await expect(skeleton.getByRole('status')).toHaveText('Il Consulente legge le tue risposte e i tuoi dati…');
  await expect(page.locator('[data-question-card]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continua' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Indietro' })).toBeDisabled();
  const skip = page.getByRole('button', { name: 'Salta il colloquio' });
  await expect(skip).toBeEnabled();
  await skip.click();

  await expect(page.getByRole('region', { name: 'Corsa del Consulente' })).toContainText(FAKE_RUN_ERROR);
  expect(recorder.strategy).toHaveLength(1);
  const sent = recorder.strategy[0].interview!;
  expect(sent.skipped).toBe(true);
  expect(sent.rounds).toHaveLength(1);
  expect(sent.rounds[0].answers).toEqual([
    { questionId: 'reddito', value: 'meta' },
    { questionId: 'riserva', value: '__decline__' },
  ]);
  // The late round lands on nothing: the run screen stays.
  await page.waitForTimeout(3_500);
  await expect(page.getByRole('region', { name: 'Corsa del Consulente' })).toBeVisible();
  expect(recorder.strategy).toHaveLength(1);
});
