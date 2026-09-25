/**
 * Storico — layout a 390px.
 *
 * PERCHÉ ESISTE: la pagina non aveva una spec, e la critique del 2026-09-20 ha misurato a 390 tre
 * cose che solo un telefono vede: «Seleziona tutti» era un quadrato di 16×16 senza altra area
 * utile, i tre bottoni di esportazione stavano tra il pollice e la prima cifra, e nessuno aveva mai
 * misurato `main` con il Dettaglio aperto (cinque grafici Recharts in più).
 *
 * REGRESSION GUARD per l'overflow (misurato 0 anche prima: la spec lo tiene tale), vista rossa sulle
 * altre due rompendole una alla volta.
 *
 * `main` è il contenitore di scroll orizzontale, non il documento (AGENTS → Tailwind Breakpoints).
 * La tabella `sr-only` delle barre del Driver è esclusa dalla misura: è ritagliata a 1px, ma i
 * rettangoli delle sue celle sporgono geometricamente e non dipingono nulla.
 */

import { test, expect } from '@playwright/test';

test('Storico non scorre in orizzontale a 390px, Dettaglio aperto', async ({ page }) => {
  await page.goto('/dashboard/history', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: 'Verdetto sullo storico' })).toBeVisible({ timeout: 60_000 });

  const trigger = page.getByRole('button', { name: /^Dettaglio/ });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await expect(page.getByRole('region', { name: 'Variazione anno su anno' })).toBeVisible();
  // Charts settle late: an early measure reads intermediate widths.
  await page.waitForTimeout(2000);

  const measurement = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('nessun <main> nella shell della dashboard');
    const limit = main.getBoundingClientRect().left + main.clientWidth + 1;
    const offenders = Array.from(main.querySelectorAll<HTMLElement>('*'))
      .filter((el) => el.offsetWidth > 0 && !el.closest('.sr-only') && el.getBoundingClientRect().right > limit)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(el.getBoundingClientRect().right - limit)}px`);
    return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, offenders };
  });
  expect(measurement.offenders).toEqual([]);
  expect(measurement.scrollWidth).toBe(measurement.clientWidth);
});

test('a 390px «Seleziona tutti» ha 44px di area e le esportazioni vengono DOPO il contenuto', async ({ page }) => {
  await page.goto('/dashboard/history', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: 'Verdetto sullo storico' })).toBeVisible({ timeout: 60_000 });

  const selectAll = page.getByRole('checkbox', { name: 'Seleziona tutti gli strumenti del mese' }).filter({ visible: true });
  await selectAll.scrollIntoViewIfNeeded();
  // The label is the target: what a finger hits is the box of the element that forwards the tap.
  const target = await selectAll.evaluate((el) => {
    const box = (el.closest('label') ?? el).getBoundingClientRect();
    return { width: Math.round(box.width), height: Math.round(box.height) };
  });
  expect(target.height).toBeGreaterThanOrEqual(44);
  expect(target.width).toBeGreaterThanOrEqual(44);

  // One rect per element, read in ONE evaluate: the exports sit below the last tile of the grid.
  const order = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const top = (el: Element | null | undefined) => (el ? el.getBoundingClientRect().top + main.scrollTop : null);
    const exportButton = Array.from(main.querySelectorAll('button')).find((b) => b.offsetWidth > 0 && (b.textContent ?? '').includes('Esporta CSV'));
    return { exportTop: top(exportButton), lastTileTop: top(document.querySelector('section[aria-label="Valore per strumento"]')) };
  });
  expect(order.exportTop).not.toBeNull();
  expect(order.exportTop!).toBeGreaterThan(order.lastTileTop!);
});
