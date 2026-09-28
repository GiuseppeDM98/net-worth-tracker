/**
 * Allocazione › Esposizione — layout a 390px.
 *
 * PERCHÉ ESISTE: la riga di copertura (letto · non letto · non applicabile · fuori vista) è una
 * frase con quattro importi e i nomi degli strumenti, sopra un elenco a quattro colonne, e nessuna
 * misura la vedeva su un telefono (doc/mobile/MOB-07 § 4.2).
 *
 * Account base (`test@example.com`); i profili di Yahoo vengono dal seed
 * (`scripts/instrumentProfileFixtures.ts`), quindi nessuna chiamata alla rete. Si asserisce la
 * STRUTTURA (la riga c'è e nomina la base, `main` non scorre di lato), mai una cifra: gli importi
 * dipendono dai prezzi del seed e dal mese in cui gira la suite.
 *
 * REGRESSION GUARD per l'overflow; la riga di copertura vista rossa seminando VUOTO il profilo di
 * `VWCE.DE` (la frase la nomina come non letta e il titolo Nvidia sparisce dall'elenco).
 */

import { test, expect } from '@playwright/test';

test('a 390px la riga di copertura nomina la base e main non scorre di lato', async ({ page }) => {
  await page.goto('/dashboard/allocation', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: "Verdetto sull'allocazione" })).toBeVisible({ timeout: 60_000 });

  const tile = page.getByRole('region', { name: 'Esposizione del portafoglio' });
  await tile.scrollIntoViewIfNeeded();
  // The coverage line is the anchor: present in both states, it says where every euro went.
  const coverage = tile.locator('p', { hasText: /In questa vista/ }).first();
  await expect(coverage).toBeVisible({ timeout: 30_000 });
  await expect(coverage).toContainText(/azionario nozionale/);
  await expect(tile.getByRole('list', { name: 'Titoli più pesanti' })).toBeVisible();

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
