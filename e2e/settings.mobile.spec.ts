/**
 * Impostazioni a 390px, con il tocco — quello che la critique del 2026-09-22 ha misurato sul telefono.
 *
 *  1. «Salva» usciva dallo schermo: il navbar compatto di `PageHeader` era `sticky` dentro un
 *     contenitore alto quanto lui, quindi non restava mai fermo (misurato a −817px dopo lo scroll).
 *     Il difetto era del PRIMITIVO, su ogni pagina: la prima prova lo dimostra qui, dove la pagina è
 *     più lunga (Preferenze, ~4 schermi).
 *  2. Il chip «modifiche non salvate» era `hidden sm:inline-flex`: sotto 640px non esisteva. Ora la
 *     barra in fondo dice quali tab e sta sopra la pillola di navigazione, mai sotto.
 *  3. «Ripristina default» era un pulsante senza nome (l'etichetta visibile era `hidden sm:inline`).
 *
 * Nessun test SCRIVE: le modifiche si annullano con «Annulla modifiche».
 *
 * REGRESSION GUARD, visti rossi rompendo una cosa alla volta (2026-09-22): lo `sticky` tolto dal
 * contenitore di `PageHeader`; lo `sticky` tolto dalla barra; l'`aria-label` tolto da «Ripristina
 * default». Il `bottom-4` della barra NON è ciò che la tiene sopra la pillola: lo fa il padding
 * inferiore di `<main>` in verticale (88px), da cui l'offset sticky si misura.
 */

import { test, expect, type Page } from '@playwright/test';

async function openSettings(page: Page, tab: string) {
  await page.goto(`/dashboard/settings?tab=${tab}`, { waitUntil: 'load' });
  await expect(page.locator('h1:visible')).toContainText('Impostazioni', { timeout: 60_000 });
  // The opened tab's panel, with a tile in it, is the load's positive anchor (Radix unmounts the
  // CONTENT of an inactive panel, so no other tab's tiles exist).
  await expect(page.locator(`#settings-tab-pill-panel-${tab} section`).first()).toBeVisible({ timeout: 30_000 });
}

const visibleSave = (page: Page) => page.locator('button:visible', { hasText: /^Salva$/ }).first();

test('il navbar con «Salva» resta in cima mentre la pagina scorre', async ({ page }) => {
  await openSettings(page, 'generale');
  await expect(page.locator('section[aria-label="Email periodiche"]')).toBeVisible();

  // `<main>` is the scroll container (AGENTS.md → Tailwind Breakpoints), not the document.
  await page.locator('main').evaluate((main) => main.scrollTo({ top: main.scrollHeight }));
  await expect.poll(() => page.locator('main').evaluate((main) => main.scrollTop)).toBeGreaterThan(1000);

  const box = await visibleSave(page).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThan(120);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('la barra delle modifiche non salvate sta sopra la pillola di navigazione', async ({ page }) => {
  await openSettings(page, 'allocazione');
  await page.getByRole('spinbutton', { name: 'Target Criptovalute' }).fill('15');

  const bar = page.getByRole('region', { name: 'Modifiche non salvate' });
  await expect(bar).toContainText('Modifiche non salvate in Allocazione');
  await page.locator('main').evaluate((main) => main.scrollTo({ top: main.scrollHeight / 3 }));

  const barBox = await bar.boundingBox();
  const navBox = await page.getByRole('navigation', { name: 'Navigazione principale' }).boundingBox();
  expect(barBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(barBox!.y).toBeGreaterThan(0);
  expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(navBox!.y);

  for (const name of ['Annulla modifiche', 'Salva']) {
    const target = await bar.getByRole('button', { name, exact: true }).boundingBox();
    expect(target!.height, name).toBeGreaterThanOrEqual(44);
  }

  await bar.getByRole('button', { name: 'Annulla modifiche' }).click();
  await expect(bar).toHaveCount(0);
});

test('«Ripristina default» ha un nome anche quando mostra solo l\'icona', async ({ page }) => {
  await openSettings(page, 'allocazione');
  const reset = page.locator('button:visible').filter({ has: page.locator('svg.lucide-rotate-ccw') }).first();
  await expect(reset).toHaveAccessibleName('Ripristina default');
  expect((await reset.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('nessun tab scorre di lato', async ({ page }) => {
  for (const tab of ['allocazione', 'generale', 'spese', 'dividendi', 'condivisione', 'aspetto']) {
    await openSettings(page, tab);
    const overflow = await page.locator('main').evaluate((main) => main.scrollWidth - main.clientWidth);
    expect(overflow, tab).toBe(0);
  }
});
