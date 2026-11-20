/**
 * Allocazione › Piano di accumulo a 390px — le otto schermate del percorso senza scorrimento orizzontale
 * (2026-11-20; doc/guide/accumulo.md § Creare un piano: il percorso). Ogni riga va a capo: nome sopra le cifre
 * sopra il campo. La guardia dell'overflow è quella di `accumulo.mobile.spec.ts`.
 *
 * Account base, istruments del seed. Il piano scritto, il modello e la bozza del browser tolti in `afterEach`.
 */

import { test, expect, type Page } from '@playwright/test';
import { clearPlanPathDraft, removeModel, removeOwnerPlans, walkPlanPath } from './accumuloFixture';

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
