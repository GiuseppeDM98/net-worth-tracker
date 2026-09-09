/**
 * Coast FIRE — layout a 390px.
 *
 * Stessa guardia di `fire.mobile.spec.ts`: il tab è una griglia di tessere dal 2026-08-25, e
 * il grafico Recharts dentro il Traguardo, la rotaia degli Afflussi e le due disclosure (Ipotesi
 * con il form delle pensioni, Dettaglio con la tabella dell'impatto) sono contenuto che l'owner
 * aprirà su un telefono, quindi contenuto da misurare.
 *
 * Si misura `main` e non il documento: la shell monta la pagina dentro `<main class="flex-1
 * overflow-y-auto">`, e un `overflow-y` diverso da `visible` fa computare `overflow-x: visible` a
 * `auto` — il contenitore di scroll orizzontale è `main`. L'asserzione nomina gli elementi colpevoli
 * invece del solo totale (AGENTS → *Tailwind Breakpoints*: misura gli elementi, non il documento).
 */

import { test, expect } from '@playwright/test';

const DISCLOSURES = [/^Ipotesi/, /^Dettaglio/] as const;

test('il tab Coast FIRE non scorre in orizzontale a 390px', async ({ page }) => {
  await page.goto('/dashboard/fire-simulations', { waitUntil: 'load' });
  await page.getByRole('tab', { name: 'Coast FIRE' }).click();
  await expect(page.getByRole('region', { name: 'Traguardo Coast FIRE' })).toBeVisible({ timeout: 30_000 });

  // Il verdetto è la prima cosa letta, sopra le tessere; le tre tessere seguono nell'ordine del telefono.
  await expect(page.getByRole('region', { name: 'Verdetto sul Coast FIRE' }).getByRole('heading', { level: 2 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Afflussi già considerati' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Scenari Coast FIRE' })).toBeVisible();

  for (const label of DISCLOSURES) {
    const trigger = page.getByRole('button', { name: label });
    if ((await trigger.count()) > 0 && (await trigger.first().getAttribute('data-state')) === 'closed') {
      await trigger.first().click();
      await page.waitForTimeout(500);
    }
  }

  // I grafici e i count-up si assestano tardi: una misura presa prima leggerebbe larghezze intermedie.
  await page.waitForTimeout(2000);

  const measurement = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('nessun <main> nella shell della dashboard');
    const limit = main.getBoundingClientRect().left + main.clientWidth;

    // Un solo px di tolleranza: i bordi sub-pixel di Chromium arrotondano verso l'alto.
    const offenders = Array.from(main.querySelectorAll('*'))
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
});
