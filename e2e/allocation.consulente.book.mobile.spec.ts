/**
 * Allocazione › Consulente, the report read as a BOOK at 390px (2026-11-08): a turn slides inside
 * the card and nothing overflows `main` while it does; «Avanti» pressed at the bottom of a long page
 * brings the card's top back into view; two taps on «Avanti» in the same frame turn ONE page (the
 * leaving page is `inert`); «Indice» is a drawer of 44px rows; the footer stacks the page's buttons
 * full width above «Indietro» · «Indice»; under reduced motion the page appears in place and the
 * headline still takes the focus.
 *
 * The documents are planted by `e2e/consulenteReport.ts`; the run route is ALWAYS faked.
 */

import { test, expect, type Page } from '@playwright/test';
import { installFakeRun } from './consulenteInterview';
import { bookCard, expectPage, openReport, plant, rememberHeld, restoreHeld } from './consulenteReport';

declare global {
  interface Window {
    __book?: { transforms: string[]; overflow: number[] };
  }
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(rememberHeld);
test.afterAll(restoreHeld);

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    window.__book = { transforms: [], overflow: [] };
    const tick = () => {
      const probe = window.__book!;
      document.querySelectorAll<HTMLElement>('[data-scene]').forEach((scene) => probe.transforms.push(getComputedStyle(scene).transform));
      const main = document.querySelector('main');
      if (main) probe.overflow.push(main.scrollWidth - main.clientWidth);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const readProbe = (page: Page) => page.evaluate(() => window.__book!);
const resetProbe = (page: Page) =>
  page.evaluate(() => {
    window.__book = { transforms: [], overflow: [] };
  });

/** The card's content box: its width without the border (`clientWidth`) and without the padding. */
async function contentBox(page: Page) {
  return bookCard(page).evaluate((card) => {
    const style = getComputedStyle(card);
    return { width: card.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight) };
  });
}

test.beforeEach(async ({ page }) => {
  await installProbe(page);
  await installFakeRun(page);
});

test('a turn slides inside the card, nothing overflows, and a long page brings the card’s top back', async ({ page }) => {
  await plant('ready');
  await openReport(page, '?pagina=strumenti');
  await expectPage(page, /^Pagina 3 di 10 · Gli strumenti/, 'strumenti');
  await resetProbe(page);

  // «Avanti» at the bottom of the page: the card's top above the viewport when pressed.
  const next = bookCard(page).getByRole('button', { name: 'Avanti' });
  await next.scrollIntoViewIfNeeded();
  await page.locator('#page-main').evaluate((main) => main.scrollBy(0, 400));
  await next.click();
  await expectPage(page, /^Pagina 4 di 10/, 'obiettivi');
  await page.waitForTimeout(600);
  const probe = await readProbe(page);
  expect(probe.transforms.some((transform) => transform !== 'none')).toBe(true);
  expect(Math.max(...probe.overflow)).toBe(0);
  const top = await bookCard(page).evaluate((card) => card.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(page.viewportSize()!.height);
});

test('two taps on «Avanti» in the same frame turn one page, and the leaving page is inert', async ({ page }) => {
  await plant('ready');
  await openReport(page);
  await expectPage(page, /^Pagina 1 di 10/, 'copertina');
  // Frame by frame during the turn: whether the leaving page was ever on screen with `inert`. Two clicks
  // in one task arrive before React re-renders, and the leaving page's «Avanti» keeps its own index (a
  // no-op on the new one): `inert` is what keeps every other control of the leaving page out of reach.
  const leftInert = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const started = performance.now();
        const tick = () => {
          if (document.querySelector('[data-scene="copertina"][inert]')) return resolve(true);
          if (performance.now() - started > 1500) return resolve(false);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })
  );
  await bookCard(page)
    .getByRole('button', { name: 'Avanti' })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  expect(await leftInert).toBe(true);
  await expectPage(page, /^Pagina 2 di 10/, 'allocazione');
  await page.waitForTimeout(600);
  await expectPage(page, /^Pagina 2 di 10/, 'allocazione');
});

test('«Indice» is a drawer of 44px rows; a row turns the page and its headline takes the focus', async ({ page }) => {
  await plant('ready');
  await openReport(page);
  await expectPage(page, /^Pagina 1 di 10/, 'copertina');
  await bookCard(page).getByRole('button', { name: 'Indice' }).click();
  const drawer = page.getByRole('dialog', { name: 'Vai a una pagina' });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('Il report · 10 pagine');
  const rows = drawer.locator('ol > li > button');
  await expect(rows).toHaveCount(10);
  // Rounded: the drawer's rise leaves a sub-pixel (43,9999) on a row measured mid-animation.
  for (const height of await rows.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height))) expect(Math.round(height)).toBeGreaterThanOrEqual(44);
  await drawer.getByRole('button', { name: '7 · Rischi e revisione' }).click();
  await expect(drawer).toBeHidden();
  await expectPage(page, 'Pagina 7 di 10 · Rischi e revisione', 'rischi');
  await expect(bookCard(page).getByText('Rischi e revisione', { exact: true })).toBeFocused();
});

test('the footer stacks the page’s buttons full width above «Indietro» · «Indice», every button 44px', async ({ page }) => {
  await plant('ready');
  await openReport(page, '?pagina=strumenti');
  await expectPage(page, /^Pagina 3 di 10/, 'strumenti');
  const box = await contentBox(page);
  const card = bookCard(page);
  const next = (await card.getByRole('button', { name: 'Avanti' }).boundingBox())!;
  const back = (await card.getByRole('button', { name: 'Indietro' }).boundingBox())!;
  const index = (await card.getByRole('button', { name: 'Indice' }).boundingBox())!;
  expect(Math.abs(next.width - box.width)).toBeLessThanOrEqual(1);
  expect(next.y + next.height).toBeLessThanOrEqual(back.y);
  expect(Math.abs(back.y - index.y)).toBeLessThanOrEqual(1);
  for (const button of [next, back, index]) expect(button.height).toBeGreaterThanOrEqual(44);

  await card.getByRole('button', { name: 'Indice' }).click();
  await page.getByRole('dialog', { name: 'Vai a una pagina' }).getByRole('button', { name: '10 · Applica' }).click();
  await expectPage(page, 'Pagina 10 di 10 · Applica', 'applica');
  const apply = (await card.getByRole('button', { name: 'Applica alle impostazioni' }).boundingBox())!;
  const redo = (await card.getByRole('button', { name: 'Rifai il percorso' }).boundingBox())!;
  expect(Math.abs(apply.width - box.width)).toBeLessThanOrEqual(1);
  expect(apply.y + apply.height).toBeLessThanOrEqual(redo.y);
  expect(apply.height).toBeGreaterThanOrEqual(44);
  await expect(card.getByRole('button', { name: 'Avanti' })).toHaveCount(0);
});

test.describe('under reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the page appears in place and the headline takes the focus', async ({ page }) => {
    await plant('ready');
    await openReport(page);
    await expectPage(page, /^Pagina 1 di 10/, 'copertina');
    await resetProbe(page);
    await bookCard(page).getByRole('button', { name: 'Avanti' }).click();
    await expectPage(page, /^Pagina 2 di 10/, 'allocazione');
    await expect(bookCard(page).getByText("L'allocazione proposta", { exact: true })).toBeFocused();
    const probe = await readProbe(page);
    expect(probe.transforms.every((transform) => transform === 'none')).toBe(true);
  });
});
