/**
 * The Consulente's path in a browser, shared by its specs (desktop, mobile, report;
 * 2026-11-07). A helper, not a spec: no project collects it.
 *
 * Base account (`test@example.com`): the age may be missing from the settings, so the walk writes
 * it; the seed's goals, if any, are crossed with «Avanti» until «cosa manca» — the walk never
 * counts on a number.
 */

import { expect, type Page } from '@playwright/test';

export async function openConsulente(page: Page) {
  await page.goto('/dashboard/allocation', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: "Verdetto sull'allocazione" })).toBeVisible({ timeout: 60_000 });
  const button = page.getByRole('link', { name: 'Consulente' }).filter({ visible: true }).first();
  await expect(button).toBeVisible();
  await button.click();
  await page.waitForURL(/\/dashboard\/allocation\/consulente/);
  // A finished report on this account (a real run left one on 2026-10-20) opens the page on the
  // report: «Rifai il percorso» brings the screens back. The emulators keep the document between runs.
  const step1 = page.getByRole('heading', { name: /Passo 1 di 8/ });
  const redo = page.getByRole('button', { name: /Rifai il percorso|Ricomincia il percorso/ });
  await expect(step1.or(redo)).toBeVisible({ timeout: 60_000 });
  if (await redo.isVisible()) await redo.click();
  await expect(step1).toBeVisible({ timeout: 60_000 });
}

export async function next(page: Page) {
  await page.getByRole('button', { name: 'Avanti' }).click();
}

/** The draft of a previous run must not steer this one. */
export async function clearDraft(page: Page) {
  await page.goto('/dashboard/allocation', { waitUntil: 'load' });
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith('allocation-advice-draft:')) localStorage.removeItem(key);
  });
}

/** One sub-screen per goal, then «cosa manca» — however many goals the seed holds. The scene slides between them: wait for the next screen before counting. */
export async function walkGoals(page: Page) {
  const landed = page.locator('#consulente-missing').or(page.locator('input[id^="goal-"][id$="-name"]'));
  for (let i = 0; i < 12; i += 1) {
    await expect(landed.first()).toBeVisible();
    if ((await page.locator('#consulente-missing').count()) > 0) return;
    await next(page);
  }
  throw new Error('the goals screen never reached «cosa manca»');
}

/** From step 1 to the summary: age 35, horizon 20, «Media», the default exchange, «Accumulazione», the goals walked, the roles and the constraints as they are. */
export async function walkToSummary(page: Page) {
  await page.locator('#consulente-age').fill('35');
  await page.locator('#consulente-horizon').fill('20');
  await next(page);
  await expect(page.getByRole('heading', { name: /Passo 2 di 8/ })).toBeVisible();
  await page.getByRole('radio', { name: /^Media/ }).check();
  await next(page);
  await expect(page.getByRole('heading', { name: /Passo 3 di 8/ })).toBeVisible();
  await next(page);
  await expect(page.getByRole('heading', { name: /Passo 4 di 8/ })).toBeVisible();
  await page.getByRole('radio', { name: /^Accumulazione/ }).check();
  await next(page);
  await expect(page.getByRole('heading', { name: /Passo 5 di 8/ })).toBeVisible();
  await walkGoals(page);
  await next(page);
  await expect(page.getByRole('heading', { name: /Passo 6 di 8/ })).toBeVisible();
  await next(page);
  await expect(page.getByRole('heading', { name: /Passo 7 di 8/ })).toBeVisible();
  await next(page);
  await expect(page.getByRole('heading', { name: /Passo 8 di 8/ })).toBeVisible();
}
