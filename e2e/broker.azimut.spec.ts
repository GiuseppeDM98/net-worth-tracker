/**
 * Azimut — l'anteprima chiede la classe che il mercato non ha detto (2026-10-22).
 *
 * PERCHÉ ESISTE: il foglio Gestito non porta alcun codice, e per un fondo che il mercato non
 * classifica (nessun mix pubblicato) la classe era una PROPOSTA — «azionaria» — scritta nell'asset
 * e correggibile solo dopo, su Patrimonio, riga per riga. Da oggi la domanda è nella riga
 * dell'anteprima, e l'import non parte finché una riga ne è senza.
 *
 * Il contratto verificato qui:
 *  1. la riga che il mercato non ha classificato mostra il menu delle classi, e il bottone
 *     «Salva nel patrimonio» resta disabilitato finché la riga è senza;
 *  2. scelta la classe, l'import parte e l'asset nasce con QUELLA classe (letta dall'emulatore, non
 *     dagli screenshot);
 *  3. il SECONDO caricamento dello stesso file non chiede più nulla: la riga è ormai un asset
 *     tracciato, e la sua classe è quella già salvata.
 *
 * QUANTE righe aspettano dipende dalla rete (il mix di un ticker lo legge Yahoo, l'identità di un
 * fondo senza codice la cerca EODHD): la spec non conta le righe, ne sceglie TUTTE quelle che
 * aspettano. La riga che SEMPRE aspetta è quella del fondo copiato in valuta (il suo mix è tutto
 * «other», che non è una classe): su quella l'affermazione «la classe scelta è quella salvata» è
 * verificabile senza dipendere da Yahoo.
 *
 * L'account è quello base, e la spec RIPULISCE quello che ha creato (gli asset dell'import): la
 * suite condivide un account, e 35 asset in più sposterebbero i numeri delle altre spec
 * (doc/guide/e2e-emulatori.md).
 */

import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const FIXTURE = resolve(__dirname, '../__tests__/fixtures/azimut-portfolio.xlsx');
const DOCUMENTS = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const USER_ID = 'test-user-1';
/** The row the market never classes: its mix is all «other» (a currency hedge), so it always waits. */
const WAITING_ROW = 'WT LONG JPY SHORT EUR (EUJP IM)';

interface FirestoreValue {
  stringValue?: string;
  mapValue?: { fields?: Record<string, FirestoreValue> };
  arrayValue?: { values?: FirestoreValue[] };
}

interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
}

/** The assets of the emulator — the whole collection, not its first page. */
async function readAssets(): Promise<FirestoreDocument[]> {
  const res = await fetch(`${DOCUMENTS}/assets?pageSize=500`, { headers: OWNER });
  expect(res.ok).toBe(true);
  const body = (await res.json()) as { documents?: FirestoreDocument[] };
  return body.documents ?? [];
}

/** The class stored on the asset whose name is the given one. */
async function storedClass(name: string): Promise<string | undefined> {
  const doc = (await readAssets()).find((candidate) => candidate.fields?.name?.stringValue === name);
  return doc?.fields?.assetClass?.stringValue;
}

test.describe('Azimut — la classe scelta a mano', () => {
  // The preview asks EODHD for the funds without a code and Yahoo for the mixes of the ETFs: the
  // round trips are the network's, not the app's.
  test.setTimeout(240_000);

  let assetsBefore: string[] = [];

  test.beforeAll(async () => {
    assetsBefore = (await readAssets()).map((doc) => doc.name.split('/').pop()!);
  });

  test.afterAll(async () => {
    // Phase G: what the spec created leaves the emulator as it was.
    const created = (await readAssets())
      .map((doc) => doc.name.split('/').pop()!)
      .filter((id) => !assetsBefore.includes(id));
    for (const id of created) {
      await fetch(`${DOCUMENTS}/assets/${id}`, { method: 'DELETE', headers: OWNER });
    }
    await fetch(`${DOCUMENTS}/brokerConnections/${USER_ID}/brokers/azimut`, {
      method: 'DELETE',
      headers: OWNER,
    });
  });

  async function openAzimutTile(page: Page) {
    await page.goto('/dashboard/settings', { waitUntil: 'load' });
    await expect(page.locator('h1:visible')).toContainText('Impostazioni', { timeout: 60_000 });
    // The tab is CLICKED, not asked for in the URL: the page canonicalises `?tab=` on mount, and a
    // first render without the parameter lands on Allocazione.
    await page
      .locator('[role="tablist"]:visible')
      .getByRole('tab', { name: 'Collegamenti', exact: true })
      .click();
    const tile = page.getByRole('region', { name: 'Azimut' });
    await expect(tile).toBeVisible({ timeout: 60_000 });
    return tile;
  }

  test('la riga senza classe chiede, l’import aspetta, e la scelta arriva nell’asset', async ({
    page,
  }) => {
    const tile = await openAzimutTile(page);

    await tile
      .locator('input[aria-label="Carica il file XLSX del portafoglio Azimut"]')
      .setInputFiles(FIXTURE);

    // The preview is up: the file's rows, with the ones the market could not class.
    const salva = tile.getByRole('button', { name: 'Salva nel patrimonio' });
    await expect(tile.getByText(/righe senza classe/)).toBeVisible({ timeout: 120_000 });
    await expect(salva).toBeDisabled();

    // The rows that need a class carry the menu; the others carry the class the market named.
    const menus = tile.getByRole('combobox');
    const missing = await menus.count();
    expect(missing).toBeGreaterThan(0);
    await expect(menus.first()).toBeVisible();

    // Every row gets a class: the import is released.
    for (let index = 0; index < missing; index += 1) {
      await menus.nth(index).click();
      await page.getByRole('listbox').getByRole('option', { name: 'Obbligazioni' }).click();
    }
    await expect(tile.getByText('Classe scelta su tutte le righe: l’import può partire.')).toBeVisible();
    await expect(salva).toBeEnabled();

    await salva.click();
    await expect(tile.getByText('Anteprima:')).toHaveCount(0, { timeout: 120_000 });

    // The class the user chose is the one STORED (read from the emulator, not from the page).
    await expect.poll(() => storedClass(WAITING_ROW), { timeout: 60_000 }).toBe('bonds');
  });

  test('il secondo caricamento non chiede più nulla: la classe è quella già salvata', async ({
    page,
  }) => {
    const tile = await openAzimutTile(page);

    await tile
      .locator('input[aria-label="Carica il file XLSX del portafoglio Azimut"]')
      .setInputFiles(FIXTURE);
    // The preview is up before anything is counted: a count taken before it exists proves nothing.
    await expect(tile.getByText('Anteprima:')).toBeVisible({ timeout: 120_000 });
    await expect(tile.getByText(/righe senza classe/)).toHaveCount(0);

    // The rows are tracked assets now: no menu, and the class they carry is the stored one.
    await expect(tile.getByRole('combobox')).toHaveCount(0);
    await expect(tile.getByText(/dal patrimonio/).first()).toBeVisible();
    await expect(tile.getByRole('button', { name: 'Salva nel patrimonio' })).toBeEnabled();
  });
});
