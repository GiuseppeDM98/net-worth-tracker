/**
 * Allocazione › Consulente, the INTERVIEW at 390px (2026-11-08, doc/guide/consulente.md § The path): the
 * faked round 1 with two questions inside the card; every choice row and every footer button at
 * least 44px tall; «Altro…» opening its field; nothing past the right edge of `main` and no
 * horizontal scroll (the repo's overflow guard).
 *
 * The run route is ALWAYS faked (`e2e/consulenteInterview.ts`).
 */

import { test, expect, type Page } from '@playwright/test';
import { clearDraft, openConsulente, walkToSummary } from './consulentePath';
import { installFakeRun, interviewScene, questionCard } from './consulenteInterview';

/** The repo's overflow guard: nothing past the right edge of `main`, no horizontal scroll. */
async function expectNoOverflow(page: Page) {
  const measurement = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('nessun <main> nella shell della dashboard');
    const limit = main.getBoundingClientRect().left + main.clientWidth;
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
  expect(measurement.offenders, `Elementi oltre il bordo destro di main (${measurement.clientWidth}px)`).toEqual([]);
  expect(measurement.scrollWidth).toBe(measurement.clientWidth);
}

test.beforeEach(async ({ page }) => {
  await clearDraft(page);
});

test('round 1 on a phone: 44px rows and buttons, «Altro…» opens its field, nothing overflows', async ({ page }) => {
  await installFakeRun(page);
  await openConsulente(page);
  await walkToSummary(page);
  await page.waitForTimeout(400);
  await expectNoOverflow(page);
  await page.getByRole('button', { name: 'Avvia il colloquio' }).click();

  const scene = interviewScene(page, 1);
  await expect(scene).toBeVisible();
  await expect(page.locator('[data-question-card]')).toHaveCount(2);
  // The rail is a strip above the card, the interview's three ticks under the path's.
  const rail = page.getByRole('list', { name: 'Il colloquio' });
  await expect(rail).toBeVisible();
  const railBox = (await rail.boundingBox())!;
  const cardBox = (await scene.boundingBox())!;
  expect(railBox.y + railBox.height).toBeLessThanOrEqual(cardBox.y);
  await page.waitForTimeout(400);
  await expectNoOverflow(page);

  // Every choice row of both cards, and every footer button, at least 44px.
  const rows = page.locator('[data-question-card] label');
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThanOrEqual(8);
  for (const row of await rows.all()) {
    const box = (await row.boundingBox())!;
    expect(box.height, 'a choice row below 44px').toBeGreaterThanOrEqual(44);
  }
  for (const name of ['Indietro', 'Salta il colloquio', 'Continua']) {
    const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.height, `«${name}» below 44px`).toBeGreaterThanOrEqual(44);
  }

  // «Altro…» opens its field under the row; the typed text makes the primary ready once the single is answered.
  const riserva = questionCard(page, 'riserva');
  await expect(riserva.getByRole('textbox')).toHaveCount(0);
  await riserva.getByRole('checkbox', { name: 'Altro…' }).click();
  await expect(riserva.getByRole('textbox')).toBeVisible();
  await riserva.getByRole('textbox').fill('fenicottero');
  await questionCard(page, 'reddito').getByRole('radio', { name: 'Circa metà' }).click();
  await expect(page.getByRole('button', { name: 'Continua' })).toBeEnabled();
  await expectNoOverflow(page);
});
