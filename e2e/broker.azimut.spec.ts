/**
 * Azimut — la classe che il mercato non ha detto viene dal NOME del fondo (2026-10-27).
 *
 * PERCHÉ ESISTE: il foglio Gestito non porta alcun codice, e per un fondo che il mercato non
 * classifica (nessun mix pubblicato) la classe la deduce il nome (`inferFundClassFromName`). Dal
 * 2026-10-22 al 2026-10-27 la riga chiedeva la classe e l'import aspettava; per scelta del
 * proprietario l'import ora non chiede nulla: scrive la classe del nome e la riga dice che è dedotta.
 *
 * Il contratto verificato qui:
 *  1. l'anteprima non ha menu di classe e «Salva nel patrimonio» è subito abilitato; la riga che
 *     il mercato non ha classificato dice «dedotta dal nome»;
 *  2. l'import parte e l'asset nasce con la classe del nome (letta dall'emulatore, non dagli
 *     screenshot);
 *  3. il SECONDO caricamento dello stesso file non deduce più nulla: la riga è ormai un asset
 *     tracciato, e la sua classe è quella già salvata.
 *
 * La riga verificata è quella del fondo coperto in valuta: il suo mix è tutto «other», che non è
 * una classe, e il nome non ha parole chiave — quindi resta SEMPRE la classe di default
 * (azionaria) senza dipendere da Yahoo o da EODHD.
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
/** The row the market never classes: its mix is all «other» (a currency hedge), so the name decides. */
const GUESSED_ROW = 'WT LONG JPY SHORT EUR (EUJP IM)';

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

test.describe('Azimut — la classe dal nome', () => {
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

  test('l’import non chiede la classe: la deduce dal nome e la scrive nell’asset', async ({ page }) => {
    const tile = await openAzimutTile(page);

    await tile
      .locator('input[aria-label="Carica il file XLSX del portafoglio Azimut"]')
      .setInputFiles(FIXTURE);

    // The preview is up, with no question in it: no class menu, and the save is released.
    const salva = tile.getByRole('button', { name: 'Salva nel patrimonio' });
    await expect(tile.getByText('Anteprima:')).toBeVisible({ timeout: 120_000 });
    await expect(tile.getByRole('combobox')).toHaveCount(0);
    await expect(salva).toBeEnabled();

    // The row the market could not class says its class was deduced.
    const guessedRow = tile.getByRole('listitem').filter({ hasText: GUESSED_ROW });
    await expect(guessedRow).toContainText('Classe: Azioni — dedotta dal nome, verificala su Patrimonio');

    await salva.click();
    await expect(tile.getByText('Anteprima:')).toHaveCount(0, { timeout: 120_000 });

    // The name's class is the one STORED (read from the emulator, not from the page).
    await expect.poll(() => storedClass(GUESSED_ROW), { timeout: 60_000 }).toBe('equity');
  });

  test('il secondo caricamento non deduce più nulla: la classe è quella già salvata', async ({
    page,
  }) => {
    const tile = await openAzimutTile(page);

    await tile
      .locator('input[aria-label="Carica il file XLSX del portafoglio Azimut"]')
      .setInputFiles(FIXTURE);
    // The preview is up before anything is counted: a count taken before it exists proves nothing.
    await expect(tile.getByText('Anteprima:')).toBeVisible({ timeout: 120_000 });

    // The rows are tracked assets now: nothing is deduced, the class they carry is the stored one.
    await expect(tile.getByText(/dedotta dal nome/)).toHaveCount(0);
    await expect(tile.getByText(/dal patrimonio/).first()).toBeVisible();
    await expect(tile.getByRole('button', { name: 'Salva nel patrimonio' })).toBeEnabled();
  });
});
