/**
 * Allocazione › Piano di accumulo a 1440px — il percorso guidato che crea un piano a mano (2026-11-20;
 * doc/guide/accumulo.md § Creare un piano: il percorso).
 *
 * PERCHÉ ESISTE: solo il browser contro l'emulatore può dire che le otto schermate e UN «Conferma» scrivono
 * DAVVERO un piano attivo (e il modello), che una vendita ha il suo mese nel calendario, che il percorso riprende
 * dopo un ricaricamento, che una bozza in Accumulo è continuata e attivata come se stessa, che il seme del
 * portafoglio modello arriva sulla prima schermata e che con un piano attivo il percorso rimanda ad Accumulo. Le
 * regole sono di Vitest (`planPath.test.ts`, `pianoScreens.test.tsx`, `pianoWizard.test.tsx`, `pianoClient.test.tsx`).
 *
 * Account base (`test@example.com`), istruments del seed. Ogni test che scrive toglie in `afterEach` i piani
 * (`removeOwnerPlans`), il modello e la bozza del browser: il file seguente non trova un piano aperto. Si asserisce
 * la STRUTTURA, mai una cifra: gli importi seguono i prezzi del seed.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  clearPlanPathDraft,
  plantCriteria,
  readModel,
  readOwnerPlans,
  removeAccumuloFixture,
  removeModel,
  removeOwnerPlans,
  restoreCriteria,
  seedAccumuloFixture,
  walkPlanPath,
  type StoredCriteria,
} from './accumuloFixture';

const PIANO = '/dashboard/allocation/piano';
const QUOTAS = { 'Vanguard FTSE All-World': '60', 'Apple Inc.': '40', Bitcoin: '0', 'BTP Valore 2030': '0', 'Fondo Pensione Aperto (tracciato come ETF)': '0' };
const BASE_WALK = { start: 'Dai pesi di oggi', monthly: '500', months: '12', accounts: ['Conto Corrente'], reserve: '0', quotas: QUOTAS };

async function openPath(page: Page): Promise<void> {
  await page.goto(PIANO, { waitUntil: 'load' });
  await clearPlanPathDraft(page);
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByRole('region', { name: /^Passo 1 di 8/ })).toBeVisible({ timeout: 60_000 });
}

test.beforeEach(async () => {
  await removeOwnerPlans();
  await removeModel();
});
test.afterEach(async ({ page }) => {
  await removeOwnerPlans();
  await removeModel();
  await clearPlanPathDraft(page).catch(() => {});
});

test('dalla tessera vuota, otto schermate e «Conferma»: UN piano attivo di 12 rate, e il modello', async ({ page }) => {
  await page.goto('/dashboard/allocation?tab=accumulo', { waitUntil: 'load' });
  await page.locator('section[aria-label="Accumulo"]').getByRole('link', { name: 'Crea piano' }).click({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/dashboard\/allocation\/piano$/);
  await clearPlanPathDraft(page);
  await page.reload({ waitUntil: 'load' });

  await walkPlanPath(page, BASE_WALK);
  await expect(page.getByRole('checkbox', { name: 'Aggiorna anche il portafoglio modello' })).toBeChecked();
  await page.getByRole('button', { name: 'Conferma' }).click();
  const done = page.getByRole('region', { name: 'Piano attivo' });
  await expect(done).toBeVisible({ timeout: 30_000 });
  await expect(done.getByRole('link', { name: 'Apri Accumulo' })).toHaveAttribute('href', '/dashboard/allocation?tab=accumulo');

  const plans = await readOwnerPlans();
  expect(plans).toHaveLength(1);
  expect(plans[0].status).toBe('active');
  expect(plans[0].instalmentEur).toHaveLength(12);
  await expect.poll(readModel, { timeout: 15_000 }).not.toBeNull();
  expect(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('plan-path-draft')))).toBe(false);
  // The refetched plans find the plan active: the done card stays, never «Hai già un piano» (found on the mirror tour).
  await page.waitForTimeout(3000);
  await expect(done).toBeVisible();
  await expect(page.getByText('Hai già un piano di accumulo attivo.')).toHaveCount(0);
});

test('una vendita di 5 quote al 3° mese: la frase del riepilogo e le tasse; il piano la scrive, la 3ª rata è più grande', async ({ page }) => {
  await openPath(page);
  await walkPlanPath(page, { ...BASE_WALK, sales: [{ name: 'Apple Inc.', quantity: '5', month: 3 }] });
  const card = page.getByRole('region', { name: /^Passo 8 di 8/ });
  await expect(card).toContainText('la rata sale a');
  await expect(card).toContainText('Apple Inc.: 5 quote a');
  await expect(card).toContainText('tasse');
  await page.getByRole('button', { name: 'Conferma' }).click();
  await expect(page.getByRole('region', { name: 'Piano attivo' })).toBeVisible({ timeout: 30_000 });

  const [plan] = await readOwnerPlans();
  expect(plan.disposals).toEqual([{ quantity: 5, monthIndex: 3 }]);
  expect(plan.instalmentEur[2]).toBeGreaterThan(plan.instalmentEur[1]);
});

test('un ricaricamento alla 4ª schermata torna alla 4ª; «Ricomincia» due volte torna alla 1ª', async ({ page }) => {
  await openPath(page);
  await walkPlanPath(page, { ...BASE_WALK, stopAt: 4 });
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByRole('region', { name: /^Passo 4 di 8/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page.getByLabel('Mesi', { exact: true })).toHaveValue('12');
  await page.getByRole('button', { name: 'Ricomincia' }).click();
  await page.getByRole('button', { name: 'Premi di nuovo per ricominciare' }).click();
  await expect(page.getByRole('region', { name: /^Passo 1 di 8/ })).toBeVisible();
});

test('una bozza in Accumulo: «Continua» → il percorso dalla bozza → «Conferma» attiva LA STESSA bozza', async ({ page }) => {
  await seedAccumuloFixture({ status: 'draft', startOffset: 1 });
  await page.goto('/dashboard/allocation?tab=accumulo', { waitUntil: 'load' });
  await page.getByRole('link', { name: 'Continua' }).click({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/dashboard\/allocation\/piano$/);
  await expect(page.getByRole('radio', { name: 'Dalla bozza che avevi' })).toBeChecked({ timeout: 60_000 });
  for (let screen = 1; screen < 8; screen++) await page.getByRole('button', { name: 'Avanti' }).click();
  await expect(page.getByRole('region', { name: /^Passo 8 di 8/ })).toBeVisible();
  await page.getByRole('button', { name: 'Conferma' }).click();
  await expect(page.getByRole('region', { name: 'Piano attivo' })).toBeVisible({ timeout: 30_000 });

  const plans = await readOwnerPlans();
  expect(plans.map((plan) => [plan.id, plan.status])).toEqual([['e2e-accumulo-plan', 'active']]);
});

test.describe('dal portafoglio modello', () => {
  let stored: StoredCriteria = null;
  test.beforeAll(async () => {
    stored = await plantCriteria();
  });
  test.afterAll(() => restoreCriteria(stored));

  test('«Crea un PAC con questi pesi» → il percorso alla 1ª schermata con «Dai pesi che hai appena calcolato»', async ({ page }) => {
    await page.goto('/dashboard/allocation?tab=accumulo', { waitUntil: 'load' });
    await page.locator('section[aria-label="Portafoglio modello"]').getByRole('button', { name: 'Ricalcola' }).click({ timeout: 60_000 });
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Calcola', exact: true }).click();
    await dialog.getByRole('button', { name: 'Crea un PAC con questi pesi' }).click({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/dashboard\/allocation\/piano$/, { timeout: 30_000 });
    await expect(page.getByRole('radio', { name: 'Dai pesi che hai appena calcolato' })).toBeChecked({ timeout: 60_000 });

    await walkPlanPath(page, { start: 'Dai pesi che hai appena calcolato', monthly: '500', months: '12', accounts: ['Conto Corrente'], stopAt: 7 });
    await expect(page.getByText('Somma: 100,00%')).toBeVisible();
  });
});

test('con un piano attivo il percorso rimanda ad Accumulo; «Rivedi il piano» apre ancora l’editor', async ({ page }) => {
  await seedAccumuloFixture({ reviewAtOpenMonth: true });
  try {
    await page.goto(PIANO, { waitUntil: 'load' });
    await expect(page.getByText('Hai già un piano di accumulo attivo.')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('link', { name: 'Apri Accumulo' }).first().click();
    await expect(page).toHaveURL(/tab=accumulo/);
    const note = page.getByText('Il Consulente ha indicato questo mese per rivedere il piano', { exact: false });
    await note.locator('..').getByRole('button', { name: 'Rivedi il piano' }).click({ timeout: 60_000 });
    await expect(page.getByRole('dialog').getByLabel('Mesi restanti')).toBeVisible();
  } finally {
    await removeAccumuloFixture();
  }
});
