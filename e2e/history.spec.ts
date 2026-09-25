/**
 * Storico — quello che solo un layout vero può dire, a 1440px.
 *
 * PERCHÉ ESISTE: la critique del 2026-09-20 ha misurato quattro difetti che né Vitest né `tsc`
 * possono vedere, e che la pagina si è portata dietro perché non aveva una spec:
 *  1. la tabella di «Valore per strumento» chiedeva 813px dentro 671 e nascondeva «di cui prezzo /
 *     di cui quantità» — le due colonne di cui parla la lettura della tessera;
 *  2. le sei parti del Driver erano una frase da otto cifre: il lettore doveva sommarle a mano, e
 *     arrotondate una per una sbagliavano di un euro (44.967 contro 44.966);
 *  3. «Dettaglio» stava a ~55 Tab dall'inizio pagina, dietro una checkbox per riga;
 *  4. la pagina elencava a uno screen reader due soli heading.
 *
 * REGRESSION GUARD, tutti e quattro visti rossi rompendo una cosa alla volta (la griglia 7/5 sempre
 * accesa; il resto tolto dal registro; `tabIndex` a 0 su ogni riga; l'occhiello tornato `<p>`).
 *
 * Account base (`test@example.com`): due snapshot con `byAsset` e le spese del mese. Gli importi
 * dipendono dal mese in cui gira la suite, quindi si asserisce la STRUTTURA e l'aritmetica di ciò
 * che è stampato, mai una cifra.
 */

import { test, expect, type Page } from '@playwright/test';

const TILE = 'section[aria-label="Valore per strumento"]';

async function openStorico(page: Page) {
  await page.goto('/dashboard/history', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: 'Verdetto sullo storico' })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(`${TILE} tbody tr`).first()).toBeVisible({ timeout: 30_000 });
}

/** The table's scroller, its width budget and the column heads that are actually painted. */
async function measureTable(page: Page) {
  return page.evaluate((tile) => {
    const scroller = Array.from(document.querySelectorAll<HTMLElement>(`${tile} div`)).find((el) => el.className.includes('overflow-x-auto') && el.offsetWidth > 0);
    if (!scroller) throw new Error('nessuna tabella visibile in «Valore per strumento»');
    const edge = scroller.getBoundingClientRect().right;
    const heads = Array.from(scroller.querySelectorAll<HTMLElement>('thead th')).filter((th) => th.offsetWidth > 0);
    return {
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
      heads: heads.map((th) => (th.textContent ?? '').trim()),
      // A head painted past the scroller's edge is a column the reader cannot see.
      clipped: heads.filter((th) => th.getBoundingClientRect().right > edge + 1).map((th) => (th.textContent ?? '').trim()),
    };
  }, TILE);
}

test('la tabella degli strumenti mostra le colonne del Δ senza scorrere, con e senza selezione', async ({ page }) => {
  await openStorico(page);

  const wide = await measureTable(page);
  expect(wide.scrollWidth, 'senza selezione la tabella ha tutta la tessera').toBe(wide.clientWidth);
  expect(wide.clipped).toEqual([]);
  expect(wide.heads).toEqual(expect.arrayContaining(['Quantità', 'Quota', 'di cui prezzo', 'di cui quantità']));

  // Ticking an instrument hands 5/12 of the tile to the selection: Quantità and Quota fold under their
  // neighbours, the two columns the reading is about stay.
  await page.locator(`${TILE} tbody [data-roving-item]`).first().click();
  await expect(page.locator(TILE).getByText(/^Selezione/)).toBeVisible();
  await page.waitForTimeout(600);

  const narrow = await measureTable(page);
  expect(narrow.clientWidth).toBeLessThan(wide.clientWidth);
  expect(narrow.scrollWidth, 'con la selezione aperta la tabella non scorre').toBe(narrow.clientWidth);
  expect(narrow.clipped).toEqual([]);
  expect(narrow.heads).toEqual(expect.arrayContaining(['di cui prezzo', 'di cui quantità']));
  expect(narrow.heads).not.toContain('Quantità');
});

test('il registro del Driver somma, all’euro, alla crescita su cui chiude', async ({ page }) => {
  await openStorico(page);
  const tile = page.getByRole('region', { name: 'Driver della crescita' });
  // The featured year opens on its ledger.
  const row = tile.locator('button[aria-expanded="true"]').first();
  await expect(row).toBeVisible();

  const ledger = await row.evaluate((button) => {
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
    if (!panel) throw new Error('la riga non controlla nessun pannello');
    // `textContent`: «−» is the typographic minus, and Intl's spaces are not the keyboard's.
    const toEuro = (text: string) => Number(text.replace(/[^\d−+-]/g, '').replace('−', '-'));
    return Array.from(panel.querySelectorAll(':scope > div > div > div')).map((line) => ({ label: (line.children[0].textContent ?? '').trim(), value: toEuro(line.children[1].textContent ?? '') }));
  });

  expect(ledger.map((line) => line.label).slice(0, 2)).toEqual(['Risparmio', 'Mercato']);
  const total = ledger.at(-1)!;
  expect(total.label).toBe('Crescita del patrimonio');
  expect(ledger.slice(0, -1).reduce((sum, line) => sum + line.value, 0)).toBe(total.value);
});

test('da tastiera: il primo Tab salta al contenuto e gli strumenti sono UN solo Tab stop', async ({ page }) => {
  await openStorico(page);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Vai al contenuto principale' })).toBeFocused();

  // One Tab stop for the list, whatever its length; the arrows move inside it.
  const items = page.locator(`${TILE} tbody [data-roving-item]`);
  expect(await items.count()).toBeGreaterThan(2);
  expect(await page.locator(`${TILE} tbody [data-roving-item][tabindex="0"]`).count()).toBe(1);

  await items.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('Tab');
  // Tab LEAVES the list: the next stop is not another instrument.
  expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-roving-item'))).toBe(false);
});

test('ogni tessera è un heading sotto il verdetto', async ({ page }) => {
  await openStorico(page);
  for (const name of ['Evoluzione', 'Raddoppi', 'Composizione', 'Driver della crescita', 'Valore per strumento']) {
    await expect(page.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  // The eyebrow's metrics are the class's, not the element's: a browser default on `h3` would show here.
  expect(await page.getByRole('heading', { level: 3, name: 'Evoluzione', exact: true }).evaluate((el) => getComputedStyle(el).fontSize)).toBe('10px');
});
