/**
 * Coast FIRE — layout a 390px.
 *
 * Stessa guardia di `fire.mobile.spec.ts`: il tab è una griglia di tessere dal 2026-08-25, e
 * il grafico Recharts dentro il Traguardo, la rotaia degli Afflussi e le due disclosure (Ipotesi
 * con il form delle pensioni, Dettaglio con la tabella dell'impatto) sono contenuto che l'owner
 * aprirà su un telefono, quindi contenuto da misurare. Dal 2026-10-15 Afflussi e Scenari
 * sono righe chiuse: la spec preme «Apri tutte» prima di misurare. Dal 2026-10-16 legge anche le
 * quattro tessere delle Ipotesi nell'ordine del DOM senza `order-*` in `main`: visto rosso con
 * `max-desktop:order-first` rimesso su Pensioni.
 *
 * Si misura `main` e non il documento: la shell monta la pagina dentro `<main class="flex-1
 * overflow-y-auto">`, e un `overflow-y` diverso da `visible` fa computare `overflow-x: visible` a
 * `auto` — il contenitore di scroll orizzontale è `main`. L'asserzione nomina gli elementi colpevoli
 * invece del solo totale (AGENTS → *Tailwind Breakpoints*: misura gli elementi, non il documento).
 */

import { test, expect } from '@playwright/test';
import { atRest } from './atRest';

const DISCLOSURES = [/^Ipotesi/, /^Dettaglio/] as const;

test('il tab Coast FIRE non scorre in orizzontale a 390px', async ({ page }) => {
  await page.goto('/dashboard/fire-simulations', { waitUntil: 'load' });
  await page.getByRole('tab', { name: 'Coast FIRE' }).click();
  await expect(page.getByRole('region', { name: 'Traguardo Coast FIRE' })).toBeVisible({ timeout: 30_000 });

  // Il verdetto è la prima cosa letta, sopra le tessere; le due righe seguono nell'ordine del DOM,
  // chiuse e vuote sotto `desktop:` (dal 2026-10-15): «Apri tutte» prima di misurare dentro.
  await expect(page.getByRole('region', { name: 'Verdetto sul Coast FIRE' }).getByRole('heading', { level: 2 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Afflussi già considerati' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Scenari Coast FIRE' })).toBeVisible();
  await page.getByRole('button', { name: 'Apri tutte' }).click();
  await expect(page.locator('#coast-afflussi-trigger')).toHaveAttribute('aria-expanded', 'true');

  for (const label of DISCLOSURES) {
    const trigger = page.getByRole('button', { name: label });
    if ((await trigger.count()) > 0 && (await trigger.first().getAttribute('data-state')) === 'closed') {
      await trigger.first().click();
      await atRest(page);
    }
  }

  // Le quattro tessere delle Ipotesi leggono nell'ordine del DOM anche sul telefono — Profilo,
  // Modello, Pensioni, Scaglioni, l'ordine di Tab — e nessun `order-*` resta in `main` (dal
  // 2026-10-15: fino ad allora `order-*` metteva Pensioni seconda; letto dalla `classList`).
  const ipotesi = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const names = ['Profilo Coast FIRE', 'Modello della pensione', 'Pensioni statali', 'Scaglioni IRPEF'];
    const tiles = [...main.querySelectorAll<HTMLElement>('section.rounded-2xl')].filter((el) => names.includes(el.getAttribute('aria-label') ?? ''));
    return {
      order: tiles.map((el) => ({ name: el.getAttribute('aria-label'), top: Math.round(el.getBoundingClientRect().top) })),
      orderClasses: [...main.querySelectorAll('*')].flatMap((el) => [...el.classList]).filter((name) => /^(?:[a-z-]+:)*order-/.test(name)),
    };
  });
  expect(ipotesi.order.map((tile) => tile.name)).toEqual(['Profilo Coast FIRE', 'Modello della pensione', 'Pensioni statali', 'Scaglioni IRPEF']);
  expect(ipotesi.order.every((tile, i) => i === 0 || tile.top >= ipotesi.order[i - 1].top - 1), JSON.stringify(ipotesi.order)).toBe(true);
  expect(ipotesi.orderClasses).toEqual([]);

  // I grafici e i count-up si assestano tardi: una misura presa prima leggerebbe larghezze intermedie.
  await atRest(page);

  const measurement = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('nessun <main> nella shell della dashboard');
    const limit = main.getBoundingClientRect().left + main.clientWidth;

    // Un solo px di tolleranza: i bordi sub-pixel di Chromium arrotondano verso l'alto.
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
});
