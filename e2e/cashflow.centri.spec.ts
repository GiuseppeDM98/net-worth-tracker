/**
 * Cashflow › Centri di Costo at 1440 — the page's first spec, born from the 2026-09-18 critique.
 *
 * 1. Opening a center is a NAVIGATION: the id lands in the URL, the focus on the back link; a
 *    reload keeps the detail; the browser's Back returns to the LIST (it used to leave
 *    Cashflow for the Panoramica) and hands the focus back to the row that opened it.
 * 2. A center has no pace: a ceiling still holding on what is booked, which the rows already
 *    in the calendar carry past, is the RISK — «supererà», «con le spese già in calendario» —
 *    and no sentence of the page says «ritmo».
 * 3. A NEW center never opens on a colour an active one wears, and a worn swatch says whose
 *    it is (until then every center was born `chart-1`: two cars, one blue).
 * 4. The dialog refuses in its reading line, in Italian, with the submit enabled; nothing is
 *    written (asserted on the emulator, never on the screen alone); closed, it hands the focus
 *    back to the control that opened it.
 * 5. Arming the delete prints the consequence under the button and moves nothing below it;
 *    Escape disarms and deletes nothing.
 *
 * Runs on its OWN account (`centri` project — scripts/seedCostCentersE2E.mts): Fenicottero
 * (chart-1, 800 € booked in January, a 300 € instalment on December 31st, annual ceiling 1000)
 * and Ornitorinco (chart-2, dormant). The names are decoy words.
 */

import { test, expect, type Page } from '@playwright/test';

const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
const LIST_URL = /\/dashboard\/cashflow\?tab=cost-centers$/;
const DETAIL_URL = /\/dashboard\/cashflow\?tab=cost-centers&center=e2e-cc-fenicottero$/;

/** On December 31st the instalment is booked: the ceiling is crossed for real, not at risk. */
const isLastDayOfYear = new Date().getMonth() === 11 && new Date().getDate() === 31;

/** The centers of the fixture account, read from the emulator (not from the page). */
async function savedCenterNames(): Promise<string[]> {
  const res = await fetch(`${FIRESTORE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'costCenters' }],
        where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: 'test-user-centri' } } },
      },
    }),
  });
  const rows = (await res.json()) as Array<{ document?: { fields: { name: { stringValue: string } } } }>;
  return rows.flatMap((row) => (row.document ? [row.document.fields.name.stringValue] : [])).sort();
}

async function openList(page: Page) {
  await page.goto('/dashboard/cashflow?tab=cost-centers');
  await expect(page.getByRole('region', { name: 'Verdetto sui centri di costo' })).toBeVisible({ timeout: 60_000 });
}

const centri = (page: Page) => page.getByRole('region', { name: 'Centri', exact: true });

test.describe('Centri di Costo — desktop', () => {
  test.setTimeout(120_000);

  test('opening a center is a navigation: URL, focus, reload, Back', async ({ page }) => {
    await openList(page);
    const row = centri(page).getByRole('button', { name: /^Apri Fenicottero/ });
    await row.click();

    await expect(page).toHaveURL(DETAIL_URL);
    await expect(page.getByRole('region', { name: 'Verdetto su Fenicottero' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Centri di costo', exact: true })).toBeFocused();

    await page.reload({ waitUntil: 'load' });
    await expect(page.getByRole('region', { name: 'Verdetto su Fenicottero' })).toBeVisible({ timeout: 60_000 });

    // The reload is a fresh document: open the list and the detail again so Back has an entry to return to.
    await openList(page);
    await centri(page).getByRole('button', { name: /^Apri Fenicottero/ }).click();
    await expect(page).toHaveURL(DETAIL_URL);
    await page.goBack();
    await expect(page).toHaveURL(LIST_URL);
    await expect(page.getByRole('region', { name: 'Verdetto sui centri di costo' })).toBeVisible();
    await expect(centri(page).getByRole('button', { name: /^Apri Fenicottero/ })).toBeFocused();
  });

  test('a ceiling the calendar will cross is a risk, and nothing on the page speaks of a pace', async ({ page }) => {
    test.skip(isLastDayOfYear, 'On December 31st the instalment is booked and the ceiling is crossed for real.');
    const year = new Date().getFullYear();
    await openList(page);
    const listVerdict = page.getByRole('region', { name: 'Verdetto sui centri di costo' });
    await expect(listVerdict.getByRole('heading')).toHaveText(`Fenicottero supererà il tetto del ${year}.`);
    await expect(listVerdict).toContainText('con le spese già in calendario');

    await centri(page).getByRole('button', { name: /^Apri Fenicottero/ }).click();
    const verdict = page.getByRole('region', { name: 'Verdetto su Fenicottero' });
    await expect(verdict.getByRole('heading')).toHaveText(`Fenicottero supererà il tetto del ${year}.`);
    await expect(verdict).toContainText('Lo superi con le spese già in calendario');

    // «Quest'anno» prints what is BOOKED; the calendar is the caption's, with the gap past the ceiling.
    const costo = page.getByRole('region', { name: 'Costo di Fenicottero' });
    await expect(costo).toContainText(/con il calendario chiude a 1100[\s  ]*€, 100[\s  ]*€ oltre/);
    // Scoped to the ACTIVE panel: every Cashflow tab stays mounted (`forceMount`) and hidden, and
    // Tracciamento's «Al ritmo attuale» is right where it is — a month of groceries has a pace.
    await expect(page.locator('[role="tabpanel"][data-state="active"]')).not.toContainText(/ritmo/i);
  });

  test('a new center opens on a free colour, and a worn swatch says whose it is', async ({ page }) => {
    await openList(page);
    await page.getByRole('button', { name: 'Nuovo centro', exact: true }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Nuovo centro di costo' })).toBeVisible();

    await expect(dialog.getByRole('button', { name: 'Colore 1 di 8, in uso da Fenicottero', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(dialog.getByRole('button', { name: 'Colore 2 di 8, in uso da Ornitorinco', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(dialog.getByRole('button', { name: 'Colore 3 di 8 (selezionato)', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // Choosing a worn colour is allowed, and says what it costs.
    await dialog.getByRole('button', { name: /^Colore 1 di 8/ }).click();
    await expect(dialog).toContainText('È già il colore di Fenicottero: nei grafici i due centri non si distinguono.');
  });

  test('the dialog refuses in its reading line and writes nothing', async ({ page }) => {
    const before = await savedCenterNames();
    expect(before).toEqual(['Fenicottero', 'Ornitorinco']);

    await openList(page);
    await page.getByRole('button', { name: 'Nuovo centro', exact: true }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog');
    const submit = dialog.getByRole('button', { name: 'Crea', exact: true });
    await expect(submit).toBeEnabled();
    // The reading of a NEW center teaches where an expense gets linked.
    await expect(dialog.getByRole('status')).toContainText('campo «Centro di Costo», sotto «Impostazioni avanzate»');

    await submit.click();
    await expect(dialog.getByRole('status')).toHaveText('Manca un campo: Nome.');
    await expect(dialog.getByLabel('Nome *', { exact: true })).toBeFocused();

    // Typing answers the refusal: the reading goes back to what the form is for.
    await dialog.getByLabel('Nome *', { exact: true }).fill('F');
    await expect(dialog.getByRole('status')).not.toContainText('Manca');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // The focus returns to the control that opened the window (it used to fall to `body`).
    await expect(page.getByRole('button', { name: 'Nuovo centro', exact: true }).filter({ visible: true }).first()).toBeFocused();
    expect(await savedCenterNames()).toEqual(before);
  });

  test('arming the delete prints the consequence under the button, moves nothing, and Escape deletes nothing', async ({ page }) => {
    await openList(page);
    await centri(page).getByRole('button', { name: /^Apri Fenicottero/ }).click();
    const costo = page.getByRole('region', { name: 'Costo di Fenicottero' });
    await expect(costo).toBeVisible();
    const topBefore = await costo.evaluate((el) => el.getBoundingClientRect().top);

    await page.getByRole('button', { name: 'Elimina centro di costo', exact: true }).click();
    const armed = page.getByRole('button', { name: /^Conferma eliminazione/ });
    await expect(armed).toHaveAttribute('aria-pressed', 'true');
    await expect(armed).toHaveText('Conferma');
    await expect(page.locator('[role="tabpanel"][data-state="active"]')).toContainText('2 spese restano in Cashflow e perdono solo il collegamento.');
    expect(await costo.evaluate((el) => el.getBoundingClientRect().top)).toBe(topBefore);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Elimina centro di costo', exact: true })).toBeVisible();
    expect(await savedCenterNames()).toEqual(['Fenicottero', 'Ornitorinco']);
  });
});

/**
 * «Collega spese…», «Scollega» and opening an expense from the detail (2026-09-18).
 *
 * Every outcome is read from the emulator: a link writes `costCenterId` AND the denormalised
 * `costCenterName`, «Annulla» puts each row back exactly as it was, and a refused confirm
 * writes nothing. Each test restores what it changed THROUGH THE APP (the toast's «Annulla»),
 * and the fixture `set`s every row whole, so a run that died half-way is healed by the next.
 */
interface CenterFields {
  costCenterId: string | null;
  costCenterName: string | null;
}

async function centerOf(expenseId: string): Promise<CenterFields> {
  const res = await fetch(`${FIRESTORE}/expenses/${expenseId}`, { headers: { Authorization: 'Bearer owner' } });
  const doc = (await res.json()) as { fields: Record<string, { stringValue?: string }> };
  return { costCenterId: doc.fields.costCenterId?.stringValue ?? null, costCenterName: doc.fields.costCenterName?.stringValue ?? null };
}

const FREE_ROWS = ['e2e-cc-free-1', 'e2e-cc-free-2', 'e2e-cc-free-3'];
const PLAN_ROWS = ['e2e-cc-plan-1', 'e2e-cc-plan-2', 'e2e-cc-plan-3'];
const SERIES_ROWS = ['e2e-cc-serie-1', 'e2e-cc-serie-2', 'e2e-cc-serie-3'];
const NONE: CenterFields = { costCenterId: null, costCenterName: null };
const ORNITORINCO: CenterFields = { costCenterId: 'e2e-cc-ornitorinco', costCenterName: 'Ornitorinco' };

/** The toast's own «Annulla»: a closing modal keeps its «Annulla» in the DOM for a moment, so the name alone is two buttons. */
const undoButton = (page: Page) => page.locator('[data-sonner-toast]').getByRole('button', { name: 'Annulla', exact: true });

async function openDetail(page: Page, centerId: string, name: string) {
  await page.goto(`/dashboard/cashflow?tab=cost-centers&center=${centerId}`);
  await expect(page.getByRole('region', { name: `Verdetto su ${name}` })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Movimenti collegati' })).toBeVisible();
}

test.describe('Centri di Costo — collegare e scollegare', () => {
  test.setTimeout(120_000);

  test('links plain rows and a whole instalment plan in one confirm, says what it would move, and «Annulla» restores every row', async ({ page }) => {
    for (const id of [...FREE_ROWS, ...PLAN_ROWS]) expect(await centerOf(id)).toEqual(NONE);

    await openDetail(page, 'e2e-cc-ornitorinco', 'Ornitorinco');
    await page.getByRole('button', { name: 'Collega spese', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Collega spese a Ornitorinco' })).toBeVisible();
    const reading = dialog.getByRole('status');
    await expect(reading).toContainText('Nessuna spesa selezionata');

    // The submit is enabled on an empty selection, and pressing it says what is missing.
    await dialog.getByRole('button', { name: 'Collega', exact: true }).click();
    await expect(reading).toContainText('spunta almeno una riga');

    // The decoy narrows the list to the three free rows; «Seleziona le 3 elencate» ticks them.
    await dialog.getByRole('searchbox').fill('casuario');
    await expect(dialog.getByRole('checkbox')).toHaveCount(4); // three plain rows + the plan, as ONE row
    await dialog.getByRole('searchbox').fill('Casuario 2');
    await expect(dialog.getByRole('checkbox')).toHaveCount(1);
    await dialog.getByRole('searchbox').fill('casuario');
    await dialog.getByRole('button', { name: /^Seleziona le 4 elencate$/ }).click();
    // 11 + 12 + 13 + three instalments of 20: six ROWS behind four ticks.
    await expect(reading).toHaveText(/^6 spese, 96[\s  ]*€\.$/);
    await expect(dialog.getByText(/^3 rate/)).toBeVisible();

    // A row of another center is hidden until asked for, and the reading names the move BEFORE the confirm.
    await dialog.getByRole('searchbox').fill('');
    await expect(dialog.getByText('di Fenicottero')).toHaveCount(0);
    await dialog.getByRole('switch', { name: 'Mostra anche quelle di altri centri' }).click();
    const foreign = dialog.getByRole('listitem').filter({ hasText: 'di Fenicottero' }).first();
    await foreign.getByRole('checkbox').click();
    await expect(reading).toContainText(/passa da Fenicottero a Ornitorinco/);
    await foreign.getByRole('checkbox').click();
    await expect(reading).toHaveText(/^6 spese, 96[\s  ]*€\.$/);

    await dialog.getByRole('button', { name: 'Collega 6', exact: true }).click();
    await expect(dialog).toBeHidden();
    const toastEl = page.getByText('6 spese collegate a Ornitorinco');
    await expect(toastEl).toBeVisible();
    for (const id of [...FREE_ROWS, ...PLAN_ROWS]) expect(await centerOf(id)).toEqual(ORNITORINCO);
    // Fenicottero's row was only ticked and unticked: it never moved.
    expect((await centerOf('e2e-cc-exp-booked')).costCenterId).toBe('e2e-cc-fenicottero');
    await expect(page.getByRole('region', { name: 'Movimenti collegati' })).toContainText('33 voci');

    await undoButton(page).click();
    await expect(page.getByText(/^Annullato: 6 spese/)).toBeVisible();
    for (const id of [...FREE_ROWS, ...PLAN_ROWS]) expect(await centerOf(id)).toEqual(NONE);
    await expect(page.getByRole('region', { name: 'Movimenti collegati' })).toContainText('27 voci');
  });

  test('a row of a series asks «solo questa o tutta la serie?», unlinks all three, and «Annulla» links them back', async ({ page }) => {
    await openDetail(page, 'e2e-cc-ornitorinco', 'Ornitorinco');
    const movimenti = page.getByRole('region', { name: 'Movimenti collegati' });
    // The three series rows sort among 27 same-day rows: page through until one is on screen.
    const unlinkSeries = movimenti.getByRole('button', { name: /^Scollega / }).filter({ visible: true });
    await expect(unlinkSeries.first()).toBeVisible();
    const seriesRow = movimenti.getByRole('row').filter({ hasText: 'Serie Ornitorinco' }).first();
    if ((await seriesRow.count()) === 0) await movimenti.getByRole('button', { name: /^Mostra altre/ }).click();
    await seriesRow.getByRole('button', { name: /^Scollega / }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Scollega una voce o la serie' })).toBeVisible();
    await expect(dialog.getByRole('status')).toContainText('una serie di 3 occorrenze collegate a Ornitorinco');
    await dialog.getByRole('button', { name: 'Tutta la serie (3)', exact: true }).click();
    await expect(page.getByText('3 spese scollegate da Ornitorinco')).toBeVisible();
    for (const id of SERIES_ROWS) expect(await centerOf(id)).toEqual(NONE);

    await undoButton(page).click();
    await expect(page.getByText(/^Annullato: 3 spese/)).toBeVisible();
    for (const id of SERIES_ROWS) expect(await centerOf(id)).toEqual(ORNITORINCO);
  });

  test('a plain row arms in place with its consequence in the row, Escape unlinks nothing, and its category opens the expense form', async ({ page }) => {
    await openDetail(page, 'e2e-cc-fenicottero', 'Fenicottero');
    const movimenti = page.getByRole('region', { name: 'Movimenti collegati' });
    const year = new Date().getFullYear();
    const unlink = movimenti.getByRole('button', { name: `Scollega Progetti del 15/01/${year}`, exact: true }).filter({ visible: true });
    await unlink.click();
    const armed = movimenti.getByRole('button', { name: `Conferma: scollega Progetti del 15/01/${year}`, exact: true }).filter({ visible: true });
    await expect(armed).toHaveText('Conferma');
    await expect(armed).toHaveAttribute('aria-pressed', 'true');
    await expect(movimenti).toContainText('Scollegando, la spesa resta in Cashflow ed esce dal centro.');
    await page.keyboard.press('Escape');
    await expect(unlink).toBeVisible();
    expect((await centerOf('e2e-cc-exp-booked')).costCenterId).toBe('e2e-cc-fenicottero');

    await movimenti.getByRole('button', { name: `Apri Progetti del 15/01/${year}`, exact: true }).filter({ visible: true }).click();
    const form = page.getByRole('dialog');
    await expect(form.getByRole('heading', { name: 'Modifica spesa', exact: true })).toBeVisible();
    // The center's reader used to hand raw Firestore Timestamps to a form that formats a Date:
    // it threw «Invalid time value» on this very field (found by this test, 2026-09-18).
    await expect(form.locator('input[type="date"]')).toHaveValue(`${year}-01-15`);
  });
});
