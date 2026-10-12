/**
 * Panoramica › l'occhio del patrimonio su un telefono — quello che solo un layout vero
 * può dire a 390px:
 *
 * 1. L'hero nasce MASCHERATO («••••••», il valore vero non è nel DOM) e l'occhio è un
 *    target da 44px su touch (`h-11 w-11` sotto `pointer: coarse`, 32px col mouse).
 * 2. Il tocco rivela il totale, la scelta sopravvive al reload (`localStorage`), e un
 *    secondo tocco rimaskera — senza che la riga spinga `main` a scorrere di lato.
 *
 * Account base, progetto `mobile` (390×844, touch). Non scrive dati dell'account: Develop
 * l'unica scrittura è la chiave `localStorage` del browser di test, che muore col contesto.
 */

import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'nwt-patrimonio-visibile';

test('l’occhio è un target da 44px, rivela al tocco e la scelta sopravvive al reload', async ({ page }) => {
  await page.goto('/dashboard');
  const hero = page.getByRole('region', { name: 'Patrimonio', exact: true });
  await expect(hero).toBeVisible({ timeout: 30_000 });

  // Positive anchor first: the page answered before asserting the masked state.
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();

  // Masked by default on a browser that never chose: the real total is not in the DOM,
  // only the bullets (aria-hidden) and their sr-only naming.
  const eye = hero.getByRole('button', { name: 'Mostra patrimonio totale' });
  await expect(eye).toBeVisible();
  await expect(eye).toHaveAttribute('aria-pressed', 'false');
  await expect(hero.getByText('Patrimonio nascosto')).toBeVisible();
  await expect(hero.getByText('••••••')).toBeVisible();

  // The touch floor: a real 44×44 box (no pseudo-element hitbox — `boundingBox` sees it).
  const box = (await eye.boundingBox())!;
  expect(box.width, 'eye width on touch').toBeGreaterThanOrEqual(44);
  expect(box.height, 'eye height on touch').toBeGreaterThanOrEqual(44);

  // A tap reveals: the bullets leave, the pressed state flips, the decision is stored.
  await eye.tap();
  const hideEye = hero.getByRole('button', { name: 'Nascondi patrimonio totale' });
  await expect(hideEye).toBeVisible();
  await expect(hideEye).toHaveAttribute('aria-pressed', 'true');
  await expect(hero.getByText('Patrimonio nascosto')).toHaveCount(0);
  await expect(hero.getByText('••••••')).toHaveCount(0);
  await expect(page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).resolves.toBe('1');

  // The choice survives a reload instead of hiding again.
  await page.reload();
  const heroAfterReload = page.getByRole('region', { name: 'Patrimonio', exact: true });
  await expect(heroAfterReload).toBeVisible({ timeout: 30_000 });
  await expect(
    heroAfterReload.getByRole('button', { name: 'Nascondi patrimonio totale' }),
  ).toBeVisible();
  await expect(heroAfterReload.getByText('••••••')).toHaveCount(0);

  // A second tap masks again and clears the stored decision.
  await heroAfterReload.getByRole('button', { name: 'Nascondi patrimonio totale' }).tap();
  await expect(heroAfterReload.getByRole('button', { name: 'Mostra patrimonio totale' })).toBeVisible();
  await expect(heroAfterReload.getByText('••••••')).toBeVisible();
  await expect(page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).resolves.toBeNull();
});

test('l’hero rivelato non spinge `main` a scorrere di lato a 390px', async ({ page }) => {
  await page.goto('/dashboard');
  const hero = page.getByRole('region', { name: 'Patrimonio', exact: true });
  await expect(hero).toBeVisible({ timeout: 30_000 });
  // The revealed total is the widest the row ever gets — measure that state.
  await hero.getByRole('button', { name: 'Mostra patrimonio totale' }).tap();
  await expect(hero.getByRole('button', { name: 'Nascondi patrimonio totale' })).toBeVisible();

  // `main` is the horizontal scroll container of the shell, not the document (AGENTS.md →
  // Tailwind Breakpoints): `document.scrollWidth - clientWidth` reads 0 while the page
  // scrolls sideways. `.sr-only` descendants are excluded — a clipped node keeps its
  // rectangles and would read as dozens of false offenders.
  const measurement = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('no <main> in the dashboard shell');
    const limit = main.getBoundingClientRect().left + main.clientWidth;
    const offenders = Array.from(main.querySelectorAll('*'))
      .filter((el) => !el.closest('.sr-only'))
      .filter((el) => el.getBoundingClientRect().right > limit + 1)
      .map((el) => `${el.tagName}.${(el as HTMLElement).className.toString().slice(0, 60)}`);
    return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, offenders };
  });
  expect(measurement.offenders, `elements past main's right edge`).toEqual([]);
  expect(measurement.scrollWidth).toBe(measurement.clientWidth);
});
