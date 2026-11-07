/**
 * Allocazione › Consulente at 390px (AI-03, 2026-11-07): the scene slides inside the card and
 * nothing overflows while it does; the rail is a strip above the card; the choice rows keep their
 * 44px; under reduced motion the screen appears in place and the headline still takes the focus.
 *
 * A rAF probe installed before the page records, frame by frame, the computed transform of every
 * `[data-scene]` and the overflow of `main`: what a screenshot cannot catch, a slide that leaks a
 * horizontal scrollbar for 250 ms.
 */

import { test, expect, type Page } from '@playwright/test';
import { clearDraft, next, openConsulente, walkGoals } from './consulentePath';

declare global {
  interface Window {
    __scene?: { transforms: string[]; overflow: number[] };
  }
}

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    window.__scene = { transforms: [], overflow: [] };
    const tick = () => {
      const probe = window.__scene!;
      document.querySelectorAll<HTMLElement>('[data-scene]').forEach((scene) => probe.transforms.push(getComputedStyle(scene).transform));
      const main = document.querySelector('main');
      if (main) probe.overflow.push(main.scrollWidth - main.clientWidth);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const readProbe = (page: Page) => page.evaluate(() => window.__scene!);
const resetProbe = (page: Page) =>
  page.evaluate(() => {
    window.__scene = { transforms: [], overflow: [] };
  });

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
  await installProbe(page);
  await clearDraft(page);
});

test('the scene slides inside the card, the strip above it, nothing overflowing', async ({ page }) => {
  await openConsulente(page);
  // The first screen of a mount is drawn in place.
  await page.waitForTimeout(400);
  const atRest = await readProbe(page);
  expect(atRest.transforms.length).toBeGreaterThan(0);
  expect(atRest.transforms.every((transform) => transform === 'none')).toBe(true);
  await expectNoOverflow(page);

  const rail = page.getByRole('list', { name: 'Il percorso' });
  const railBox = (await rail.boundingBox())!;
  const cardBox = (await page.getByRole('region', { name: /^Passo 1 di 8/ }).boundingBox())!;
  expect(railBox.y + railBox.height).toBeLessThanOrEqual(cardBox.y);

  await page.locator('#consulente-age').fill('35');
  await page.locator('#consulente-horizon').fill('20');
  await resetProbe(page);
  await next(page);
  await expect(page.getByRole('heading', { name: /Passo 2 di 8/ })).toBeVisible();
  await expect(page.locator('[data-scene] > p[tabindex="-1"]')).toBeFocused();
  await page.waitForTimeout(400);
  const sliding = await readProbe(page);
  expect(sliding.transforms.some((transform) => transform !== 'none')).toBe(true);
  expect(sliding.overflow.every((overflow) => overflow === 0)).toBe(true);
  await expectNoOverflow(page);
});

test('the goals’ screens keep their 44px rows and overflow nothing', async ({ page }) => {
  await openConsulente(page);
  await page.locator('#consulente-age').fill('35');
  await page.locator('#consulente-horizon').fill('20');
  await next(page);
  await page.getByRole('radio', { name: /^Media/ }).check();
  await next(page);
  await next(page);
  await page.getByRole('radio', { name: /^Accumulazione/ }).check();
  await next(page);
  await expect(page.getByRole('heading', { name: /Passo 5 di 8/ })).toBeVisible();
  await walkGoals(page);
  await page.waitForTimeout(400);
  await expectNoOverflow(page);

  await page.getByRole('button', { name: 'Aggiungi un obiettivo' }).click();
  const priority = page.getByRole('radiogroup', { name: 'Priorità' });
  await expect(priority).toBeVisible();
  const labels = priority.locator('label');
  await expect(labels).toHaveCount(3);
  for (const label of await labels.all()) {
    const box = (await label.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test.describe('under reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the screen appears in place and the headline still takes the focus', async ({ page }) => {
    await openConsulente(page);
    await page.locator('#consulente-age').fill('35');
    await page.locator('#consulente-horizon').fill('20');
    await resetProbe(page);
    await next(page);
    await expect(page.getByRole('heading', { name: /Passo 2 di 8/ })).toBeVisible();
    await expect(page.locator('[data-scene] > p[tabindex="-1"]')).toBeFocused();
    await page.waitForTimeout(400);
    const probe = await readProbe(page);
    expect(probe.transforms.length).toBeGreaterThan(0);
    expect(probe.transforms.every((transform) => transform === 'none')).toBe(true);
  });
});
