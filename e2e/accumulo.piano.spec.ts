/**
 * Allocazione › Piano di accumulo a 1440px — il percorso guidato che crea un piano a mano (2026-11-20;
 * doc/guide/accumulo.md § Il percorso: creare e rivedere).
 *
 * PERCHÉ ESISTE: solo il browser contro l'emulatore può dire che le otto schermate e UN «Conferma» scrivono
 * DAVVERO un piano attivo (e il modello), che una vendita ha il suo mese nel calendario, che il percorso riprende
 * dopo un ricaricamento, che una bozza in Accumulo è continuata e attivata come se stessa, che il seme del
 * portafoglio modello arriva sulla prima schermata e che, con un piano attivo, le tre porte di «Questo mese» aprono il
 * percorso in REVISIONE e «Conferma» riscrive le sole rate aperte (2026-11-21). Le
 * regole sono di Vitest (`planPath.test.ts`, `pianoScreens.test.tsx`, `pianoWizard.test.tsx`, `pianoClient.test.tsx`).
 *
 * Account base (`test@example.com`), istruments del seed. Ogni test che scrive toglie in `afterEach` i piani
 * (`removeOwnerPlans`), il modello e la bozza del browser: il file seguente non trova un piano aperto. Si asserisce
 * la STRUTTURA, mai una cifra: gli importi seguono i prezzi del seed.
 */

import { test, expect, type Page } from '@playwright/test';
import { atRest } from './atRest';
import { readPersistedQuery } from './persistedCache';
import {
  addFixtureRevisionRow,
  clearPlanPathDraft,
  plantCriteria,
  plantModel,
  readFixturePlan,
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
  // The refetch has no request to wait for; what it brought is in the persisted cache once the
  // persister has written it — the list with the active plan — and the page is then read at rest.
  await expect
    .poll(async () => ((await readPersistedQuery(page, ['accumulation-plans'])) as Array<{ status?: string }> | null)?.some((plan) => plan.status === 'active') ?? false, {
      timeout: 15_000,
    })
    .toBe(true);
  await atRest(page);
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

// ─── Rivedere un piano attivo nel percorso (2026-11-21) ──────────────────────────────────────────
// La fixture attiva (`saleMonthOffset: 2`): 12 rate, le prime due chiuse, la 3ª aperta, una vendita aperta di
// 1 Apple al 5° mese. Le porte di «Questo mese» aprono il percorso in revisione; «Conferma» chiama `revisePlan`.
test.describe('rivedere il piano attivo', () => {
  test.beforeEach(() => seedAccumuloFixture({ saleMonthOffset: 2 }));
  test.afterEach(() => removeAccumuloFixture());

  const next = (page: Page) => page.getByRole('button', { name: 'Avanti' }).click();
  const at = (page: Page, n: number) => expect(page.getByRole('region', { name: new RegExp(`^Passo ${n} di 8`) })).toBeVisible({ timeout: 30_000 });

  // Mutation that turns it red: `plan.months` passed as `remainingMonths` (the plan grows by the closed ones).
  test('«Rivedi il piano» → il percorso precompilato → «Conferma»: le rate chiuse identiche, le aperte riscritte, una riga in più', async ({ page }) => {
    const before = await readFixturePlan();
    await page.goto('/dashboard/allocation?tab=accumulo', { waitUntil: 'load' });
    await clearPlanPathDraft(page);
    await page.getByRole('link', { name: 'Rivedi il piano' }).last().click({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/dashboard\/allocation\/piano$/);
    await expect(page.getByText('Rivedi il piano: le rate chiuse restano come sono.').filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 });
    await at(page, 1);
    await expect(page.getByRole('radio', { name: 'Dal piano com’è' })).toBeChecked();
    await next(page);
    await expect(page.getByLabel('Ogni mese, in euro')).toHaveValue('0');
    await page.getByLabel('Ogni mese, in euro').fill('300');
    await next(page);
    await expect(page.getByLabel('Mesi', { exact: true })).toHaveValue('10');
    for (let screen = 3; screen <= 7; screen++) await next(page);
    await at(page, 8);
    await page.getByRole('button', { name: 'Conferma' }).click();
    await expect(page.getByRole('region', { name: 'Piano rivisto' })).toBeVisible({ timeout: 30_000 });

    const after = await readFixturePlan();
    expect(after.months).toBe(12);
    expect(after.installments.slice(0, 2)).toEqual(before.installments.slice(0, 2));
    expect(after.installments.slice(2).map((i) => i.index)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(after.installments.slice(2)).not.toEqual(before.installments.slice(2));
    expect(after.liquidity.monthlyInflowEur).toBe(300);
    expect(after.revisions).toHaveLength(1);
    expect(after.revisions[0].fromIndex).toBe(3);
  });

  // Mutation that turns it red: no `movedDisposalMonthIndexes` sent (the moved sale keeps its month).
  test('la vendita aperta spostata di un mese e una vendita nuova: i loro mesi nel piano', async ({ page }) => {
    await page.goto(PIANO, { waitUntil: 'load' });
    await clearPlanPathDraft(page);
    await page.reload({ waitUntil: 'load' });
    await at(page, 1);
    for (let screen = 1; screen <= 5; screen++) await next(page);
    await at(page, 6);
    const list = page.getByRole('list', { name: 'Strumenti da vendere' });
    const apple = list.getByRole('listitem').filter({ hasText: 'Apple Inc.' });
    await expect(list.getByRole('checkbox', { name: 'Vendi Apple Inc.' })).toBeChecked();
    await apple.getByRole('combobox', { name: 'In quale mese' }).click();
    await page.getByRole('option', { name: /\(6º\)/ }).click();
    await list.getByRole('checkbox', { name: 'Vendi Vanguard FTSE All-World' }).click();
    const vanguard = list.getByRole('listitem').filter({ hasText: 'Vanguard FTSE All-World' });
    await vanguard.getByLabel('Quante quote').fill('1');
    await vanguard.getByRole('combobox', { name: 'In quale mese' }).click();
    await page.getByRole('option', { name: /\(7º\)/ }).click();
    await next(page);
    await next(page);
    await at(page, 8);
    await expect(page.getByText('Apple Inc.: spostata a', { exact: false })).toBeVisible();
    await expect(page.getByText('Vanguard FTSE All-World: nuova, 1 quota a', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Conferma' }).click();
    await expect(page.getByRole('region', { name: 'Piano rivisto' })).toBeVisible({ timeout: 30_000 });

    const after = await readFixturePlan();
    const month = (assetId: string) => after.disposals.find((d) => d.assetId === assetId)?.monthIndex;
    expect(month('seed-aapl')).toBe(6);
    expect(month('seed-vwce')).toBe(7);
  });

  // Mutation that turns it red: `fromModel` ignored (the start stays «Dal piano com’è»).
  test('«Rivedi dal modello» → ?da=modello, «Dal portafoglio modello» scelto, le quote del modello alla 7ª', async ({ page }) => {
    await plantModel('e2e-revision');
    await page.goto('/dashboard/allocation?tab=accumulo', { waitUntil: 'load' });
    await clearPlanPathDraft(page);
    await page.getByRole('link', { name: 'Rivedi dal modello' }).click({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/dashboard\/allocation\/piano\?da=modello$/);
    await at(page, 1);
    await expect(page.getByRole('radio', { name: 'Dal portafoglio modello' })).toBeChecked();
    for (let screen = 1; screen <= 6; screen++) await next(page);
    await at(page, 7);
    const quotas = page.getByRole('list', { name: 'Strumenti del piano' });
    await expect(quotas.getByLabel('Vanguard FTSE All-World', { exact: true })).toHaveValue('70');
    await expect(quotas.getByLabel('BTP Valore 2030', { exact: true })).toHaveValue('30');
    await expect(quotas.getByLabel('Apple Inc.', { exact: true })).toHaveValue('0');
  });

  // Mutation that turns it red: any stored draft of the same plan id kept.
  test('un ricaricamento alla 5ª tiene la revisione; una revisione scritta altrove → il percorso riparte dal piano', async ({ page }) => {
    await page.goto(PIANO, { waitUntil: 'load' });
    await clearPlanPathDraft(page);
    await page.reload({ waitUntil: 'load' });
    await at(page, 1);
    await next(page);
    await page.getByLabel('Ogni mese, in euro').fill('400');
    for (let screen = 2; screen <= 4; screen++) await next(page);
    await at(page, 5);
    await page.reload({ waitUntil: 'load' });
    await at(page, 5);

    await addFixtureRevisionRow();
    await page.reload({ waitUntil: 'load' });
    await at(page, 1);
    await expect(page.getByRole('radio', { name: 'Dal piano com’è' })).toBeChecked();
    await next(page);
    await expect(page.getByLabel('Ogni mese, in euro')).toHaveValue('0');
  });
});
