/**
 * Hall of Fame at 1440 — the page's FIRST browser spec (Impeccable critique of 2026-09-24).
 *
 * WHAT IS DELIBERATELY NOT HERE: the wording of every reading. Each sentence is pinned in
 * `__tests__/hallOfFameNarrative.test.ts`, where it costs milliseconds. A browser is spent here
 * only on what a browser alone can see (a label cut by its column, a chart's axis, where the
 * focus lands) and on the readings whose value crosses the WHOLE data path — Firestore → the
 * real recalculation route → the stored document → the summary → the tile.
 *
 * The account and the arithmetic are `scripts/seedHallOfFameE2E.mts`: 46 record months from
 * dicembre 2022, best month marzo 2024 (+18.400 €), income record dicembre 2025 (6900 € against
 * an average of 3660 € → «l'88,5% sopra»), a first year of two months. The seed writes NO
 * `hall-of-fame` document: the first test builds it through «Aggiorna i record», as the user
 * would, and the tests below read what the route wrote.
 */

import { test, expect, type Page } from '@playwright/test';

const UID = 'hof-user';
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
/** Without this header the emulator answers as an anonymous client and every read is silently empty. */
const OWNER_HEADERS = { Authorization: 'Bearer owner' };

/** The page as the seed leaves it: no document yet, so the empty verdict, or whatever is there. */
async function gotoPage(page: Page): Promise<void> {
  await page.goto('/dashboard/hall-of-fame');
  // Never `networkidle`: Firestore keeps its sockets open for the life of the page.
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 45_000 });
}

/**
 * The page WITH its rankings. The first test builds them; a test run alone (`--grep`) finds the
 * seed's empty state and builds them itself, so no test depends on the order for its data.
 */
async function openPage(page: Page): Promise<void> {
  await gotoPage(page);
  if (await page.getByRole('heading', { level: 2, name: 'I record cominciano dal secondo snapshot' }).isVisible()) {
    await page.getByRole('button', { name: 'Aggiorna i record' }).filter({ visible: true }).first().click();
  }
  await expect(page.getByRole('heading', { level: 2, name: 'Il tuo mese migliore è marzo 2024' })).toBeVisible({ timeout: 30_000 });
}

/** The stored document, as the emulator's REST API prints it. */
async function readDocument(): Promise<Record<string, unknown>> {
  const response = await fetch(`${FIRESTORE}/hall-of-fame/${UID}`, { headers: OWNER_HEADERS });
  expect(response.status).toBe(200);
  return ((await response.json()) as { fields: Record<string, unknown> }).fields;
}

test.describe('Hall of Fame', () => {
  /**
   * THE DATA PATH. The seed leaves the account without rankings, so the page opens on the
   * empty verdict; the user's own button then runs the real route, and the page re-reads what
   * it wrote. Serial by construction: every later test reads this document.
   */
  test('builds the rankings through the real route, from the empty state', async ({ page }) => {
    await gotoPage(page);
    await expect(page.getByRole('heading', { level: 2, name: 'I record cominciano dal secondo snapshot' })).toBeVisible();

    const recalculated = page.waitForResponse((r) => r.url().includes('/api/hall-of-fame/recalculate'));
    await page.getByRole('button', { name: 'Aggiorna i record' }).filter({ visible: true }).first().click();
    expect((await recalculated).status()).toBe(200);

    await expect(page.getByRole('heading', { level: 2, name: 'Il tuo mese migliore è marzo 2024' })).toBeVisible({ timeout: 20_000 });
    // The header dates the rankings from their own stamp, not from `updatedAt`.
    await expect(page.locator('main')).toContainText(/record aggiornati il \d{2}\/\d{2}\/\d{4}/);

    const fields = await readDocument();
    expect(fields).toHaveProperty('rankingsUpdatedAt');
    const stats = (fields.stats as { mapValue: { fields: Record<string, unknown> } }).mapValue.fields;
    expect(stats).toHaveProperty('sinceWorstMonth');
  });

  /**
   * THE LAYOUT DEFECT THE CRITIQUE MEASURED: «2026 · ORA» was cut to «20…» inside a fixed 58px
   * column, at every width — the only row about the year the reader is living in, and the only
   * one unreadable. A cut year reads as no year.
   */
  test('never cuts the running year, and declares a partial first year', async ({ page }) => {
    await openPage(page);
    const anni = page.getByRole('region', { name: 'Gli anni con la crescita di patrimonio più alta' });
    const running = anni.getByRole('listitem').filter({ hasText: '2026' });
    await expect(running).toContainText('ora');

    const label = running.getByText('2026', { exact: true });
    const fits = await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().width > 20);
    expect(fits, 'the year label must be fully drawn, never truncated').toBe(true);

    // The first year holds two months: ranked beside whole years, and it says so.
    await expect(anni.getByRole('listitem').filter({ hasText: '2022' })).toContainText('2 mesi');
  });

  /**
   * THE HONESTY DEFECTS, through the whole path: the article follows the figure as printed
   * (Firestore → stats.averageMonthlyIncome → «l'88,5%»), and the verdict's figure is not printed
   * again by the tile under it.
   */
  test('reads the grammar from the figure and does not repeat the verdict', async ({ page }) => {
    await openPage(page);

    const entrate = page.getByRole('region', { name: 'I mesi con le entrate più alte' });
    await expect(entrate).toContainText("l'88,5% sopra la tua media mensile");

    const record = page.getByRole('region', { name: 'Record del patrimonio' });
    const text = await record.innerText();
    // Once: the podium's first row. The reading above it speaks of the podium's sum instead.
    expect(text.match(/18\.400/g)?.length ?? 0).toBe(1);
    await expect(record).toContainText('I tre mesi migliori valgono insieme');
    // The footer closes on the recovery, never on the red figure alone.
    await expect(record).toContainText(/da allora \d+ mesi su \d+ in crescita/);

    // The chart's axis dates the bars: the year under the first bar of each year.
    for (const year of ['2024', '2025', '2026']) {
      await expect(record.getByText(year, { exact: true })).toBeVisible();
    }
  });

  /**
   * THE FORM FROM A ROW. A record without a note is a figure without a cause; opened from the
   * row, the form arrives with the period and the ranking written, and the note lands in the
   * stored document — asserted on Firestore, not on the pixels.
   */
  test('a row opens the note form already filled, and the note reaches the document', async ({ page }) => {
    await openPage(page);
    const record = page.getByRole('region', { name: 'Record del patrimonio' });
    const firstRow = record.getByRole('listitem').filter({ hasText: 'mar 2024' });
    await firstRow.hover();
    await firstRow.getByRole('button', { name: 'Aggiungi una nota a marzo 2024' }).click();

    const dialog = page.getByRole('dialog', { name: 'Aggiungi una nota' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('La nota comparirà su una classifica di questo periodo.');
    await expect(dialog.getByRole('combobox').first()).toContainText('2024');
    await expect(dialog.getByRole('combobox').nth(1)).toContainText('Marzo');
    await expect(dialog.getByRole('checkbox', { name: 'Crescita del patrimonio' }).first()).toBeChecked();

    await dialog.getByRole('textbox', { name: 'Nota' }).fill('Vendita del fenicottero di famiglia.');
    await dialog.getByRole('button', { name: 'Salva', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(firstRow.getByRole('button', { name: 'Leggi la nota di marzo 2024' })).toBeAttached();

    const fields = await readDocument();
    const notes = (fields.notes as { arrayValue: { values?: Array<{ mapValue: { fields: Record<string, { stringValue?: string; integerValue?: string; arrayValue?: { values: Array<{ stringValue: string }> } }> } }> } })
      .arrayValue.values ?? [];
    const saved = notes.find((note) => note.mapValue.fields.text.stringValue?.includes('fenicottero'));
    expect(saved).toBeDefined();
    expect(saved!.mapValue.fields.year.integerValue).toBe('2024');
    expect(saved!.mapValue.fields.month.integerValue).toBe('3');
    expect(saved!.mapValue.fields.sections.arrayValue?.values.map((v) => v.stringValue)).toEqual(['bestMonthsByNetWorthGrowth']);
  });

  /** A controlled modal with no Radix Trigger used to drop the focus on `body` when it closed. */
  test('gives the focus back to the opener when a note window closes', async ({ page }) => {
    await openPage(page);
    const opener = page.getByRole('button', { name: 'Aggiungi una nota', exact: true }).filter({ visible: true }).first();
    await opener.click();
    await expect(page.getByRole('dialog', { name: 'Aggiungi una nota' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(opener).toBeFocused();
  });

  /** A note on a period no chosen ranking holds is kept — and said, never silently accepted. */
  test('says when the period chosen sits in none of the chosen rankings', async ({ page }) => {
    await openPage(page);
    await page.getByRole('button', { name: 'Aggiungi una nota', exact: true }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Aggiungi una nota' });

    // marzo 2024 is the best month: it sits in no decline ranking.
    await dialog.getByRole('combobox').first().click();
    await page.getByRole('option', { name: '2024' }).click();
    await dialog.getByRole('checkbox', { name: 'Calo del patrimonio' }).first().check();
    await dialog.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'Marzo' }).click();

    await expect(dialog).toContainText('Questo periodo non è in nessuna delle classifiche scelte');
    await page.keyboard.press('Escape');
  });

  /** The Dettaglio's grammar and vocabulary, on the ranking that used to read «dal migliore» over costs. */
  test('orders the full ranking of costs in its own terms', async ({ page }) => {
    await openPage(page);
    await page.getByRole('button', { name: /^Dettaglio/ }).click();
    const tile = page.getByRole('region', { name: 'Classifica completa' });
    await tile.getByRole('radio', { name: 'Annuale' }).click();
    await tile.getByRole('radio', { name: 'Spese' }).click();
    await expect(tile).toContainText('I 5 anni con le spese più alte, dal più alto.');
    // The two pills pick a value the tile reads: a radiogroup, not a tablist promising a panel.
    await expect(tile.getByRole('radiogroup', { name: 'Categoria della classifica' })).toBeVisible();
  });
});
