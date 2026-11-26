/**
 * The Assistente as only a chat at 390px (2026-11-12, doc/guide/assistente.md § The page
 * as a chat).
 *
 * WHY IT EXISTS: what only a layout engine knows on a phone — the header is two 44px targets, «⋯»
 * opens a bottom sheet, «cambia» is a 44px target inside its wrapping line, and nothing in `main`
 * crosses its right edge with an answer on screen; the next questions under an answer are 44px
 * targets (2026-11-25).
 *
 * The stream is ALWAYS faked (`e2e/assistantRegister.ts`): no request reaches a model.
 */

import { test, expect } from '@playwright/test';
import { expectDecoyUntouched, installFakeStream, openAssistant, plantFixture, removeFixture, resetFixture, send } from './assistantRegister';

const OCTOBER_READING = {
  route: { intent: 'month_analysis', period: { kind: 'month', year: 2026, month: 10 }, webSearch: false, confidence: 0.9 },
  source: 'router' as const,
};
const FREE_READING = { route: { intent: 'chat', period: { kind: 'none' }, webSearch: false, confidence: 0.9 }, source: 'router' as const };

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

test('E6 — two 44px header targets, «⋯» as a bottom sheet, «cambia» a 44px target, nothing overflows', async ({ page }) => {
  test.setTimeout(120_000);
  await installFakeStream(page, () => ({ text: 'Ottobre è andato bene: hai risparmiato più del solito.', reading: OCTOBER_READING }));
  await openAssistant(page);

  const more = page.getByRole('button', { name: "Altre azioni dell'assistente" }).filter({ visible: true }).first();
  const next = page.getByRole('button', { name: 'Nuova conversazione' }).filter({ visible: true }).first();
  for (const [name, target] of [['«⋯»', more], ['«Nuova conversazione»', next]] as const) {
    const box = (await target.boundingBox())!;
    expect(box.height, `${name} is a thumb target`).toBeGreaterThanOrEqual(43.5);
    expect(box.width, `${name} is a thumb target`).toBeGreaterThanOrEqual(43.5);
  }

  await more.click();
  const sheet = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-popper-sheet', '');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  await send(page, 'com’è andato ottobre?');
  const change = page.getByRole('button', { name: 'Cambia come ho letto la domanda' });
  await expect(change).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^Ho letto: analisi di ottobre 2026 · cambia$/)).toBeVisible();
  expect((await change.boundingBox())!.height, '«cambia» is a thumb target').toBeGreaterThanOrEqual(43.5);

  const measurement = await page.locator('main').evaluate((main) => ({ scrollWidth: main.scrollWidth, clientWidth: main.clientWidth }));
  expect(measurement.scrollWidth).toBe(measurement.clientWidth);
});


// 2026-11-25: the model's next questions at 390 — each chip a thumb target, nothing overflows.
test('E7 — the three chips of an answer are 44px targets and nothing overflows', async ({ page }) => {
  test.setTimeout(120_000);
  await installFakeStream(page, () => ({
    text: '## Asilo\n\n- Retta: 300 € al mese\n- Mensa: 80 € al mese\n\n**380 €** al mese.',
    reading: FREE_READING,
    followUps: ['E nel 2025?', 'Quanto in un anno?', 'Quanto pesa sulle spese necessarie?'],
  }));
  await openAssistant(page);
  await send(page, 'Quanto costa l’asilo?');

  const chips = page.getByRole('list', { name: 'Continua con' }).getByRole('button');
  await expect(chips).toHaveCount(3, { timeout: 30_000 });
  for (const chip of await chips.all()) {
    const box = (await chip.boundingBox())!;
    expect(box.height, `«${await chip.textContent()}» is a thumb target`).toBeGreaterThanOrEqual(43.5);
  }
  await expect(page.getByRole('region', { name: 'Conversazione' })).not.toContainText('```');
  const measurement = await page.locator('main').evaluate((main) => ({ scrollWidth: main.scrollWidth, clientWidth: main.clientWidth }));
  expect(measurement.scrollWidth).toBe(measurement.clientWidth);
});
