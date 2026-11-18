/**
 * Allocazione › Accumulo a 1440px — il portafoglio modello (2026-11-17; le regole in
 * doc/guide/ottimizzatore.md).
 *
 * PERCHÉ ESISTE: solo il browser contro l'emulatore può dire che «Salva come portafoglio modello» scrive
 * DAVVERO un documento con la sua impronta (la base su cui è stato calcolato), e che un modello salvato su
 * un'altra base si legge «superato» appena la pagina lo carica. Le frasi e l'impronta stessa sono di Vitest
 * (`__tests__/modelPortfolio.test.ts`, `portafoglioModelloTile.test.tsx`, `idealCompositionDialog.test.tsx`).
 *
 * Account base (`test@example.com`), nessun piano. «Ricalcola» resta spento finché i criteri sono spenti, e
 * l'account non ne ha: `plantCriteria` li accende in `beforeAll`, `restoreCriteria` rimette ciò che ha letto e
 * toglie il modello in `afterAll`. Si asserisce la STRUTTURA, mai una cifra: i pesi seguono i prezzi del seed.
 *
 * REGRESSION GUARD, visti rossi (2026-11-17): l'impronta tolta dal salvataggio; `isModelStale` sempre falso; «Modifica
 * i criteri» spento su un account che non li ha mai salvati (trovato al collaudo: non c'era modo di accenderli).
 */

import { test, expect, type Page } from '@playwright/test';
import { plantCriteria, plantModel, readCriteriaEnabled, readModel, removeModel, restoreCriteria, type StoredCriteria } from './accumuloFixture';

let stored: StoredCriteria = null;

test.beforeAll(async () => {
  stored = await plantCriteria();
});
test.afterAll(() => restoreCriteria(stored));
test.beforeEach(removeModel);

const tileOf = (page: Page) => page.locator('section[aria-label="Portafoglio modello"]');

async function openAccumulo(page: Page): Promise<void> {
  await page.goto('/dashboard/allocation?tab=accumulo', { waitUntil: 'load' });
  await expect(tileOf(page)).toBeVisible({ timeout: 60_000 });
}

test.describe('Portafoglio modello', () => {
  test('criteri mai salvati: «Modifica i criteri» li accende e «Salva i criteri» li scrive', async ({ page }) => {
    // Absent, whatever the account held before the run: a tour may have saved them.
    await restoreCriteria(null);
    try {
      await openAccumulo(page);
      await expect(tileOf(page).getByRole('button', { name: 'Ricalcola' })).toBeDisabled();
      await page.getByRole('button', { name: 'Modifica i criteri' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('switch', { name: 'Attiva allocazione ideale' }).click();
      await dialog.getByRole('button', { name: 'Salva i criteri' }).click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });
      await expect.poll(readCriteriaEnabled, { timeout: 15_000 }).toBe(true);
      await expect(tileOf(page).getByRole('button', { name: 'Ricalcola' })).toBeEnabled({ timeout: 15_000 });
    } finally {
      await plantCriteria();
    }
  });

  test('«Ricalcola» → «Calcola» → «Salva come portafoglio modello» scrive il modello con la sua impronta', async ({ page }) => {
    await openAccumulo(page);
    await tileOf(page).getByRole('button', { name: 'Ricalcola' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Calcola', exact: true }).click();
    // «Liquidità» è uno dei candidati: i conti sono UNA riga.
    await expect(dialog.getByText('Liquidità').first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Salva come portafoglio modello' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect.poll(readModel, { timeout: 15_000 }).not.toBeNull();
    const model = (await readModel())!;
    expect(model.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(model.assetIds).not.toContain('liquidita');
    expect(Math.abs(model.sum - 100)).toBeLessThan(0.01);
    // Salvato su questa base: non è superato.
    await expect(tileOf(page)).not.toContainText('superato');
  });

  test('un modello salvato su un\'altra base si legge «superato»', async ({ page }) => {
    await plantModel('00000000');
    await openAccumulo(page);
    await expect(tileOf(page)).toContainText('superato', { timeout: 30_000 });
  });
});
