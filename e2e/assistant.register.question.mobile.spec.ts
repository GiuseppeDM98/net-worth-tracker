/**
 * Assistente › Registra at 390px: the question cards on a phone (2026-11, doc/guide/assistente.md
 * § Registra; AGENTS.md § Tailwind Breakpoints).
 *
 * WHY IT EXISTS: what only a layout engine knows — every row of the cards and «Rispondi» are 44px
 * thumb targets, and nothing in `main` crosses its right edge with two cards on screen (the guard
 * of `e2e/fire.mobile.spec.ts`: `main` is the horizontal scroll container, so its own widths are
 * compared and the offenders named).
 *
 * The stream is ALWAYS faked (`e2e/assistantRegister.ts`): no request reaches a model.
 */

import { test, expect } from '@playwright/test';
import {
  expectDecoyUntouched, installFakeStream, openAssistant, enterRegister, plantFixture, questionBlock, questionCard, removeFixture,
  resetFixture, send,
} from './assistantRegister';

const QUESTIONS = [
  'Mi servono due dettagli.',
  questionBlock({ id: 'abitudine', text: 'È una spesa che fai spesso, ogni settimana o quasi?', options: [{ value: 'si', label: 'Sì, ogni settimana' }, { value: 'no', label: 'No, è stata una volta sola' }] }),
  questionBlock({ id: 'nota', text: 'Vuoi una nota sulla riga?', options: [{ value: 'si', label: 'Sì' }, { value: 'no', label: 'No' }] }),
].join('\n\n');

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

test('the cards’ rows and «Rispondi» are 44px targets, and nothing overflows', async ({ page }) => {
  test.setTimeout(120_000);
  await installFakeStream(page, () => QUESTIONS);
  await openAssistant(page);
  await enterRegister(page);
  await send(page, 'Ho speso 30 euro');

  await expect(questionCard(page, 'abitudine')).toBeVisible();
  await expect(questionCard(page, 'nota')).toBeVisible();
  // The cards' entrance is a translate: measure once it has settled.
  await page.waitForTimeout(1500);

  for (const id of ['abitudine', 'nota']) {
    // The row is the label around the radio: the radio itself is its 16px dot.
    const rows = questionCard(page, id).locator('label');
    const count = await rows.count();
    expect(count).toBeGreaterThan(1);
    for (let index = 0; index < count; index += 1) {
      const box = await rows.nth(index).boundingBox();
      expect(box?.height ?? 0, `row ${index + 1} of «${id}»`).toBeGreaterThanOrEqual(44);
    }
  }
  const respond = page.getByRole('button', { name: 'Rispondi' });
  await expect(respond).toHaveCount(1);
  expect((await respond.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  const measurement = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('no <main> in the dashboard shell');
    const limit = main.getBoundingClientRect().left + main.clientWidth;
    // One px of tolerance: Chromium rounds sub-pixel borders up.
    const offenders = Array.from(main.querySelectorAll('*'))
      .filter((el) => !el.closest('.sr-only') && !el.closest('.overflow-x-auto'))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return (rect.width > 0 || rect.height > 0) && rect.right > limit + 1;
      })
      .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`)
      .slice(0, 5);
    return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, offenders };
  });
  expect(measurement.offenders, `Elements past main's right edge (${measurement.clientWidth}px)`).toEqual([]);
  expect(measurement.scrollWidth).toBe(measurement.clientWidth);
});
