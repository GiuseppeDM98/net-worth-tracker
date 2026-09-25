/**
 * Impostazioni — quello che solo un layout vero può dire, a 1440px.
 *
 * PERCHÉ ESISTE: fino al 2026-09-22 Impostazioni non aveva nessuna spec (doc/guide/impostazioni.md →
 * Per-page blind spots), e la critique di quel giorno ha trovato cinque difetti che né Vitest né
 * `tsc` possono vedere:
 *  1. una lettura fallita degli accessi condivisi diventava «Nessun accesso condiviso»;
 *  2. le modifiche non salvate non dicevano QUALE dei sei tab le teneva, e non si potevano annullare;
 *  3. l'Auto-calcolo in Allocazione restava spento finché non si compilava un campo di un ALTRO tab;
 *  4. «Salva» con un gruppo di sottocategorie che non somma 100 rispondeva con un toast e lasciava lì;
 *  5. cinque `aria-controls` puntavano a pannelli mai montati.
 *
 * NESSUN test qui SCRIVE: si modifica il modulo e si annulla, o si preme «Salva» su un albero che la
 * validazione rifiuta. Che nulla sia stato scritto si verifica sull'emulatore (l'`updateTime` del
 * documento delle impostazioni), non sull'aspetto della pagina.
 *
 * Account base (`test@example.com`): target 60/30/10 su azioni, obbligazioni e criptovalute, due
 * sotto-target su equity (World 80 / Single Stock 20) con le sottocategorie SPENTE, età impostata e
 * risk-free no.
 *
 * REGRESSION GUARD, visti rossi rompendo una cosa alla volta (2026-09-22): `renderedPanels` tolto da
 * `PageTabs`; la chiamata a `revealTargetProblem` tolta da «Salva» (resta il toast); il ramo
 * `loadFailed` tolto da `AccountSharingSection`; `unsaved` forzato a false nelle definizioni dei tab.
 */

import { test, expect, type Page } from '@playwright/test';

const SETTINGS_DOC =
  'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents/assetAllocationTargets/test-user-1';

/** When the settings document was last written — read from the emulator, not from the page. */
async function settingsUpdateTime(): Promise<string> {
  const res = await fetch(SETTINGS_DOC, { headers: { Authorization: 'Bearer owner' } });
  const doc = (await res.json()) as { updateTime: string };
  return doc.updateTime;
}

async function openSettings(page: Page, tab = 'allocazione') {
  await page.goto(`/dashboard/settings?tab=${tab}`, { waitUntil: 'load' });
  await expect(page.locator('h1:visible')).toContainText('Impostazioni', { timeout: 60_000 });
  // The opened tab's panel, with a tile in it, is the load's positive anchor (Radix unmounts the
  // CONTENT of an inactive panel, so no other tab's tiles exist).
  await expect(page.locator(`#settings-tab-pill-panel-${tab} section`).first()).toBeVisible({ timeout: 30_000 });
}

const unsavedBar = (page: Page) => page.getByRole('region', { name: 'Modifiche non salvate' });
/** A tab of the VISIBLE bar (the other one is `display:none`); a string name matches exactly. */
const visibleTab = (page: Page, name: string | RegExp) =>
  page.locator('[role="tablist"]:visible').getByRole('tab', typeof name === 'string' ? { name, exact: true } : { name });

test('ogni aria-controls dei tab nomina un pannello che esiste', async ({ page }) => {
  await openSettings(page);

  const dangling = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"][aria-controls]'))
      .map((tab) => tab.getAttribute('aria-controls')!)
      .filter((id) => !document.getElementById(id))
  );
  expect(dangling).toEqual([]);
});

test('età e risk-free stanno nella tessera della formula, non in un altro tab', async ({ page }) => {
  await openSettings(page);

  const autoCalc = page.locator('section[aria-label="Auto-calcolo Azioni / Obbligazioni"]');
  await expect(autoCalc.locator('#userAge')).toBeVisible();
  await expect(autoCalc.locator('#riskFreeRate')).toBeVisible();
  // The seed has an age and no rate: the reading names the ONE missing input, here.
  await expect(autoCalc).toContainText('manca il risk-free rate, qui sotto');

  await visibleTab(page, 'Preferenze').click();
  await expect(page.locator('section[aria-label="Calcolo dei rendimenti"]')).toBeVisible();
  await expect(page.locator('#userAge')).toHaveCount(0);
});

test('le modifiche non salvate si vedono per tab e «Annulla modifiche» torna al salvato senza scrivere', async ({ page }) => {
  await openSettings(page);
  const before = await settingsUpdateTime();
  const crypto = page.getByRole('spinbutton', { name: 'Target Criptovalute' });
  const saved = await crypto.inputValue();

  await expect(unsavedBar(page)).toHaveCount(0);
  await crypto.fill('15');

  await expect(visibleTab(page, 'Allocazione, modifiche non salvate')).toBeVisible();
  await expect(unsavedBar(page)).toContainText('Modifiche non salvate in Allocazione');

  await visibleTab(page, 'Preferenze').click();
  await page.getByRole('switch', { name: 'Centri di Costo' }).click();
  await expect(unsavedBar(page)).toContainText('Modifiche non salvate in Allocazione e Preferenze');
  await expect(visibleTab(page, 'Preferenze, modifiche non salvate')).toBeVisible();

  await unsavedBar(page).getByRole('button', { name: 'Annulla modifiche' }).click();

  await expect(unsavedBar(page)).toHaveCount(0);
  await expect(visibleTab(page, 'Preferenze')).toBeVisible();
  await visibleTab(page, 'Allocazione').click();
  await expect(crypto).toHaveValue(saved);
  expect(await settingsUpdateTime()).toBe(before);
});

test('«Salva» con un gruppo che non somma 100 non scrive e porta il fuoco sul campo', async ({ page }) => {
  await openSettings(page);
  const before = await settingsUpdateTime();

  // Switch Azioni's subcategories on (80 + 20, valid), break the sum inside the group, then CLOSE it.
  await page.getByRole('button', { name: /^Apri sottocategorie di Azioni/ }).click();
  await page.locator('#toggle-equity').click();
  const firstSubPct = page.locator('input[id^="target-equity-sub-"][id$="-pct"]').first();
  await firstSubPct.fill(String(Number(await firstSubPct.inputValue()) - 10));
  await page.getByRole('button', { name: /^Chiudi sottocategorie di Azioni/ }).click();

  // Closed, the class row still says it: the sum is ON the row and in its name.
  await expect(page.getByRole('button', { name: /^Apri sottocategorie di Azioni \(sommano 90/ })).toBeVisible();
  await expect(page.locator('section[aria-label="Target per classe"]')).toContainText(
    /Le sottocategorie di Azioni sommano 90\s?% invece del 100\s?%/
  );

  // From ANOTHER tab: «Salva» brings the reader back to the field.
  await visibleTab(page, 'Preferenze').click();
  await page.locator('button:visible', { hasText: /^Salva$/ }).first().click();

  await expect(visibleTab(page, /^Allocazione/)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /^Chiudi sottocategorie di Azioni/ })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id ?? ''))
    .toMatch(/^target-equity-sub-\d+-pct$/);
  expect(await settingsUpdateTime()).toBe(before);

  await unsavedBar(page).getByRole('button', { name: 'Annulla modifiche' }).click();
  await expect(unsavedBar(page)).toHaveCount(0);
});

test('una lettura fallita degli accessi non diventa «nessun accesso»', async ({ page }) => {
  // Positive control first: the members read works and the tile reads.
  await openSettings(page, 'condivisione');
  const tile = page.locator('section[aria-label="Condivisione account"]');
  // The count in the aside appears only once the read has come back.
  await expect(tile).toContainText(/\d+ access[oi]/);
  await expect(page.getByText('Condivisione account · lettura fallita')).toHaveCount(0);

  // The same page with the read cut.
  await page.route('**/api/account/members', (route) => route.abort());
  await openSettings(page, 'condivisione');
  const notice = page.getByRole('alert').filter({ hasText: 'Condivisione account · lettura fallita' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('non vuol dire che non ce l');
  await expect(page.getByText('Nessun accesso condiviso')).toHaveCount(0);

  // And it recovers in place once the read works again.
  await page.unroute('**/api/account/members');
  await notice.getByRole('button', { name: 'Riprova' }).click();
  await expect(page.locator('section[aria-label="Condivisione account"]')).toBeVisible();
});
