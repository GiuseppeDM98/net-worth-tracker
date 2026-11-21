/**
 * Allocazione › Piano di accumulo a 390px — le otto schermate del percorso senza scorrimento orizzontale
 * (2026-11-20; doc/guide/accumulo.md § Creare un piano: il percorso). Ogni riga va a capo: nome sopra le cifre
 * sopra il campo. La guardia dell'overflow è quella di `accumulo.mobile.spec.ts`.
 *
 * La revisione del piano attivo (NOVE-26, 2026-11-21) nelle stesse otto schermate, con una vendita già eseguita.
 *
 * Account base, istruments del seed. Il piano scritto, il modello e la bozza del browser tolti in `afterEach`.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  addExecutedFixtureSale,
  clearPlanPathDraft,
  removeAccumuloFixture,
  removeModel,
  removeOwnerPlans,
  seedAccumuloFixture,
  walkPlanPath,
} from './accumuloFixture';

/** Elementi oltre il bordo destro di `main`, nominati (AGENTS.md → Tailwind Breakpoints). */
async function measureOverflow(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('nessun <main> nella shell della dashboard');
    const limit = main.getBoundingClientRect().left + main.clientWidth + 1;
    const offenders = Array.from(main.querySelectorAll<HTMLElement>('*'))
      .filter((el) => el.offsetWidth > 0 && !el.closest('.sr-only') && !el.closest('.overflow-x-auto') && el.getBoundingClientRect().right > limit)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(el.getBoundingClientRect().right - limit)}px`);
    return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, offenders };
  });
}

test.beforeEach(async () => {
  await removeOwnerPlans();
  await removeModel();
});
test.afterEach(async ({ page }) => {
  await removeOwnerPlans();
  await removeModel();
  await clearPlanPathDraft(page).catch(() => {});
});

test('le otto schermate a 390px, senza scorrimento orizzontale, fino al piano attivo', async ({ page }) => {
  // Eight walks from the first screen, one per screen measured.
  test.setTimeout(300_000);
  await page.goto('/dashboard/allocation/piano', { waitUntil: 'load' });
  await clearPlanPathDraft(page);
  await page.reload({ waitUntil: 'load' });

  const walk = {
    start: 'Dai pesi di oggi',
    monthly: '500',
    months: '12',
    accounts: ['Conto Corrente'],
    reserve: '0',
    sales: [{ name: 'Apple Inc.', quantity: '5', month: 3 }],
  };
  for (let screen = 1; screen <= 8; screen++) {
    await page.reload({ waitUntil: 'load' });
    await clearPlanPathDraft(page);
    await page.reload({ waitUntil: 'load' });
    await walkPlanPath(page, { ...walk, stopAt: screen });
    // The sales' rows open on «vendite»: measured with the sale ticked.
    if (screen === 6) {
      await page.getByRole('radio', { name: 'Sì, scelgo cosa' }).click();
      await page.getByRole('checkbox', { name: 'Vendi Apple Inc.' }).click();
    }
    const overflow = await measureOverflow(page);
    expect(overflow.offenders, `schermata ${screen}`).toEqual([]);
    expect(overflow.scrollWidth, `schermata ${screen}`).toBeLessThanOrEqual(overflow.clientWidth);
  }

  await page.getByRole('button', { name: 'Conferma' }).click();
  await expect(page.getByRole('region', { name: 'Piano attivo' })).toBeVisible({ timeout: 30_000 });
  expect((await measureOverflow(page)).offenders).toEqual([]);
});

// E5 (NOVE-26, 2026-11-21): the revision of the active fixture, with a sale already executed (a locked line on
// «vendite») and the open one ticked. Mutation that turns it red: a locked line that does not wrap.
test('la revisione a 390px, senza scorrimento orizzontale, fino al piano rivisto', async ({ page }) => {
  test.setTimeout(300_000);
  await seedAccumuloFixture({ saleMonthOffset: 2 });
  await addExecutedFixtureSale();
  try {
    await page.goto('/dashboard/allocation/piano', { waitUntil: 'load' });
    for (let screen = 1; screen <= 8; screen++) {
      await clearPlanPathDraft(page);
      await page.reload({ waitUntil: 'load' });
      await expect(page.getByRole('region', { name: /^Passo 1 di 8/ })).toBeVisible({ timeout: 60_000 });
      for (let n = 1; n < screen; n++) await page.getByRole('button', { name: 'Avanti' }).click();
      await expect(page.getByRole('region', { name: new RegExp(`^Passo ${screen} di 8`) })).toBeVisible();
      if (screen === 6) await expect(page.getByRole('list', { name: 'Vendite già decise' })).toContainText('già venduta');
      const overflow = await measureOverflow(page);
      expect(overflow.offenders, `schermata ${screen}`).toEqual([]);
      expect(overflow.scrollWidth, `schermata ${screen}`).toBeLessThanOrEqual(overflow.clientWidth);
    }
    await page.getByRole('button', { name: 'Conferma' }).click();
    await expect(page.getByRole('region', { name: 'Piano rivisto' })).toBeVisible({ timeout: 30_000 });
    expect((await measureOverflow(page)).offenders).toEqual([]);
  } finally {
    await removeAccumuloFixture();
  }
});
