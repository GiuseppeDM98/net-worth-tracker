/**
 * Calcolatore FIRE — layout a 390px.
 *
 * PERCHÉ ESISTE: l'hero `[2fr_1fr]` del vecchio tab è uscito dal viewport per due volte. La prima
 * fu misurata il 2026-08-18 mentre si ridisegnava il tab Coast e archiviata come debito noto; la
 * seconda la segnalò l'owner, come scorrimento orizzontale della pagina su mobile. Nessun test
 * poteva vederla: Vitest non ha un motore di layout, e `fire.spec.ts` gira a 1440px, dove la
 * griglia usa il suo template esplicito e il difetto non esiste. Dal 2026-08-25 il tab è una
 * griglia di tessere: la spec apre le due disclosure (Parametri, Dettaglio) e il Ventaglio, così
 * misura anche i grafici Recharts dentro le tessere.
 *
 * PERCHÉ SI MISURA `main` E NON IL DOCUMENTO: la shell della dashboard monta la pagina dentro
 * `<main class="flex-1 overflow-y-auto">`, e un `overflow-y` diverso da `visible` fa computare
 * `overflow-x: visible` a `auto`. Il contenitore di scroll orizzontale è quindi `main`, non il
 * documento — `document.scrollWidth - clientWidth` resta 0 anche mentre la pagina scorre di lato,
 * che è esattamente il motivo per cui il difetto è sopravvissuto alla prima misurazione.
 *
 * L'asserzione nomina gli elementi colpevoli invece di limitarsi al totale: un overflow è sempre
 * causato da un elemento preciso, e un fallimento che dice solo "81px" costringe a rifare da capo
 * la misura (AGENTS → *Tailwind Breakpoints*: misura gli elementi, non il documento).
 */

import { test, expect } from '@playwright/test';

/** Le disclosure del tab: contenuto che l'owner aprirà, quindi contenuto da misurare. */
const DISCLOSURES = [/^Parametri/, /^Dettaglio/] as const;

test('il tab Calcolatore FIRE non scorre in orizzontale a 390px', async ({ page }) => {
  await page.goto('/dashboard/fire-simulations', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: 'Reddito passivo sostenibile' })).toBeVisible({ timeout: 30_000 });

  // Il verdetto è la prima cosa letta, sopra le tessere.
  await expect(page.getByRole('region', { name: 'Verdetto sul FIRE' }).getByRole('heading', { level: 2 })).toBeVisible();

  for (const label of DISCLOSURES) {
    const trigger = page.getByRole('button', { name: label });
    if ((await trigger.count()) > 0 && (await trigger.first().getAttribute('data-state')) === 'closed') {
      await trigger.first().click();
      await page.waitForTimeout(500);
    }
  }

  // Anche il Ventaglio, quando l'allocazione lo consente: 1000 percorsi Recharts nella tessera.
  const ventaglio = page.getByRole('button', { name: 'Ventaglio' });
  if ((await ventaglio.count()) > 0) {
    await ventaglio.click();
    await expect(page.locator('[role="img"][aria-label*="Ventaglio Monte Carlo"]')).toBeVisible({ timeout: 15_000 });
  }

  // I grafici e i count-up si assestano tardi: una misura presa prima leggerebbe larghezze
  // intermedie.
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
