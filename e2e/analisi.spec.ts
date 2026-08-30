/**
 * Analisi («Verdict over Tiles», 2026-08-25) — desktop regressions only a real browser can catch.
 *
 * Every figure asserted here comes from `scripts/seedAnalisiE2E.mts`: all expenses are dated
 * JANUARY of the current/previous year, so year-to-date windows contain them whatever month the
 * suite runs in, and every derived number below is exact. When an amount looks arbitrary, that
 * file explains the arithmetic.
 *
 * Deliberately NOT covered: what Vitest already proves. `analisiNarrative` decides the words,
 * `expenseEntityStats` the year table's numbers and `comparisonDeltas` the pacing/ranking — those
 * have unit tests. What is tested here is the page: that the verdict opens it, that a bookmarked
 * focus URL cold-loads into an open Scheda, that the search reaches a zero-spend entity, that the
 * focus survives a period switch, and that every entity entry point lands on the same tile.
 */

import { test, expect, type Page } from '@playwright/test';

const CURRENT_YEAR = new Date().getFullYear();
const PREVIOUS_YEAR = CURRENT_YEAR - 1;

/**
 * Match an exact euro amount as the tiles print it (compact, no cents) — Intl uses a
 * non-breaking space before €, and Italian CLDR prints four-digit amounts UNGROUPED ("2000 €").
 * Anchored, so "300" cannot also match "1300".
 */
function euro(amount: string): RegExp {
  return new RegExp(`^${amount.replace(/[.]/g, '\\.')}[\\s\\u00a0]*€$`);
}

/** The Scheda tile — the one landing place of every entity entry point. */
function scheda(page: Page) {
  return page.getByRole('region', { name: /^Scheda di / });
}

/** The dossier's period-scoped hero block ("Totale · {finestra}" + the amount under it). */
function dossierHero(page: Page, periodLabel: string) {
  return page.getByText(`Totale · ${periodLabel}`).locator('..');
}

/** The dossier's per-year table (the year-over-year answer). */
function perYearTable(page: Page) {
  return page.getByText('Per anno', { exact: true }).locator('..');
}

async function gotoAnalisi(page: Page, query = ''): Promise<void> {
  await page.goto(`/dashboard/analisi${query}`);
  // The verdict is the first thing rendered once the data lands.
  await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible({ timeout: 30_000 });
}

test('opens with the verdict and states the seeded KPI totals with their YoY pacing', async ({ page }) => {
  await gotoAnalisi(page);

  // The verdict answers before any number. The default period is «Anno corrente», which spans
  // twelve months, so its delta does too and names the bare year — a «su gen–ago 2025» here would
  // be a delta on a narrower window than the total beside it (owner's call, 2026-08-30;
  // «Da inizio anno» is the mode that keeps the same-months rule).
  const verdict = page.getByRole('region', { name: 'Verdetto del periodo' });
  await expect(verdict.getByRole('heading', { level: 2 })).toHaveText(`Nel ${CURRENT_YEAR} spendi meno dell'anno scorso.`);
  await expect(verdict).toContainText(`hai speso 780 €`);
  await expect(verdict).toContainText(`−13,3% su ${PREVIOUS_YEAR}`);
  await expect(verdict).not.toContainText('su gen–');

  // January-only fixture: Entrate 2000, Spese 780, Risparmio 1220 — the transfer row (+150)
  // must be inside none of them. `.first()`: the income repeats in its category row.
  const periodo = page.getByRole('region', { name: 'Periodo', exact: true });
  await expect(periodo.getByText(euro('2000')).first()).toBeVisible();
  await expect(periodo.getByText(euro('780'))).toBeVisible();
  await expect(periodo.getByText(euro('1220'))).toBeVisible();
  await expect(periodo.getByText('61,0%')).toBeVisible();

  // Pacing from comparisonDeltas: spese (780−900)/900, entrate (2000−1900)/1900 — the Comma
  // Rule, and ONE caption for both under the trio, verbatim from the module.
  await expect(periodo.getByText('↓ 13,3%')).toBeVisible();
  await expect(periodo.getByText('↑ 5,3%')).toBeVisible();
  // Same reason: on «Anno corrente» the caption is the bare year, with no «stessi mesi» clause.
  await expect(periodo.getByText(`vs ${PREVIOUS_YEAR}`, { exact: true })).toBeVisible();
});

test('lays the tiles on the 12-column grid at 1440 with nothing scrolling sideways', async ({ page }) => {
  await gotoAnalisi(page);

  for (const name of ['Periodo', 'Fuori scala', 'Spese maggiori', 'Spese per categoria', 'Entrate per categoria', 'Flusso']) {
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
  }

  // Periodo spans two rows beside Fuori scala + Spese maggiori: it starts at the grid's top and
  // is taller than its right-hand neighbour.
  const [periodo, fuoriScala] = await page.evaluate(() => {
    const rect = (name: string) => document.querySelector(`section[aria-label="${name}"]`)!.getBoundingClientRect();
    return [rect('Periodo'), rect('Fuori scala')];
  });
  expect(Math.abs(periodo.top - fuoriScala.top)).toBeLessThan(2);
  expect(periodo.height).toBeGreaterThan(fuoriScala.height * 1.5);

  // `main` is the horizontal scroll container (AGENTS.md): measure it and every element in it.
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const limit = main.getBoundingClientRect().left + main.clientWidth + 1;
    const culprits = Array.from(main.querySelectorAll('*')).filter((el) => el.getBoundingClientRect().right > limit).length;
    return { scroll: main.scrollWidth - main.clientWidth, culprits };
  });
  expect(overflow).toEqual({ scroll: 0, culprits: 0 });
});

test('drills category → Scheda → subcategory transactions, writing the focus to the URL', async ({ page }) => {
  await gotoAnalisi(page);

  // Level 1 → Casa (aria-label from RankedRows: "name, value, share" on a real button).
  await page.getByRole('region', { name: 'Spese per categoria' }).getByRole('button', { name: /^Casa, / }).click();

  // The Scheda: reading, period hero + per-year table + its own subcategory ranking.
  await expect(scheda(page)).toBeVisible();
  await expect(scheda(page)).toContainText(`Nel ${CURRENT_YEAR} hai speso 380 € in Casa`);
  await expect(dossierHero(page, String(CURRENT_YEAR)).getByText(/^380,00[\s ]*€$/)).toBeVisible();
  const casaYears = perYearTable(page);
  await expect(casaYears.getByText('YTD')).toBeVisible();
  await expect(casaYears.getByText(new RegExp(`\\+40,00[\\s\\u00a0]*€ \\(\\+11,8%\\) vs ${PREVIOUS_YEAR} stessi mesi`))).toBeVisible();
  await expect(page.getByText(`Sottocategorie · ${CURRENT_YEAR}`)).toBeVisible();
  await expect(page).toHaveURL(/focusType=fixed/);
  await expect(page).toHaveURL(/focusCat=e2e-cat-casa/);
  // The focused row is marked in its tile.
  await expect(page.getByRole('region', { name: 'Spese per categoria' }).getByRole('button', { name: /^Casa, / })).toHaveAttribute('aria-current', 'true');

  // Level 2 → Condominio: the condominio question, answered in place.
  await scheda(page).getByRole('button', { name: /^Condominio, / }).click();

  await expect(dossierHero(page, String(CURRENT_YEAR)).getByText(/^300,00[\s ]*€$/)).toBeVisible();
  const condYears = perYearTable(page);
  await expect(condYears.getByText(new RegExp(`\\+50,00[\\s\\u00a0]*€ \\(\\+20,0%\\) vs ${PREVIOUS_YEAR} stessi mesi`))).toBeVisible();
  // The oldest tracked year has no baseline — "—", never a fabricated zero.
  await expect(condYears.getByText(String(PREVIOUS_YEAR), { exact: true })).toBeVisible();
  await expect(condYears.getByText('—')).toBeVisible();

  // The transaction list is period-scoped and signed ("netto"), under the gross hero. The total
  // row is duplicated in the DOM (mobile list + desktop table): filter on visibility.
  await expect(page.getByText(`Transazioni · ${CURRENT_YEAR}`)).toBeVisible();
  await expect(page.getByText('Totale netto (1 voce)').filter({ visible: true })).toBeVisible();
  await expect(page).toHaveURL(/focusSub=e2e-sub-cond/);

  // Chiudi leaves the focus and clears the URL.
  await page.getByRole('button', { name: 'Chiudi la scheda' }).click();
  await expect(scheda(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/focusCat/);
});

test('cold-loads a bookmarked focus URL straight into the open Scheda', async ({ page }) => {
  await gotoAnalisi(page, '?focusType=fixed&focusCat=e2e-cat-casa&focusSub=e2e-sub-cond');

  // No clicks: the deep link IS the check — breadcrumb, hero and year delta all present.
  await expect(page.getByLabel('Posizione nel drill-down').getByText('Condominio')).toBeVisible();
  await expect(dossierHero(page, String(CURRENT_YEAR)).getByText(/^300,00[\s ]*€$/)).toBeVisible();
  await expect(perYearTable(page).getByText(/\+50,00[\s ]*€ \(\+20,0%\)/)).toBeVisible();
});

test('keeps the focus across a period switch — the period is a cursor, not a cage', async ({ page }) => {
  await gotoAnalisi(page, '?focusType=fixed&focusCat=e2e-cat-casa&focusSub=e2e-sub-cond');
  await expect(dossierHero(page, String(CURRENT_YEAR)).getByText(/^300,00[\s ]*€$/)).toBeVisible();

  await page.getByRole('tablist', { name: 'Periodo di analisi' }).getByRole('tab', { name: 'Storico' }).click();

  // Same entity, re-scoped: 300 (CY) + 250 (PY) over the whole tracked history. In Storico the
  // month tile has no month to run on, so it is absent and Spese maggiori widens.
  await expect(dossierHero(page, 'Storico completo').getByText(/^550,00[\s ]*€$/)).toBeVisible();
  await expect(page).toHaveURL(/focusSub=e2e-sub-cond/);
  await expect(page.getByRole('region', { name: 'Fuori scala' })).toHaveCount(0);
});

test('reaches a zero-spend entity through the search — one interaction, honest empty Scheda', async ({ page }) => {
  await gotoAnalisi(page);

  await page.getByRole('button', { name: 'Vai a categoria' }).click();
  await page.getByPlaceholder(/Cerca categoria o sottocategoria/).fill('skipass');
  await page.getByRole('option', { name: /Skipass/ }).click();

  // Never spent a euro on it, still a legitimate focus — and the Scheda says so instead of
  // rendering empty chrome.
  await expect(scheda(page)).toContainText(`Nessuna transazione registrata per Skipass dal ${PREVIOUS_YEAR}.`);
});

test('excludes transfer categories from the entity search', async ({ page }) => {
  await gotoAnalisi(page);

  await page.getByRole('button', { name: 'Vai a categoria' }).click();
  const input = page.getByPlaceholder(/Cerca categoria o sottocategoria/);

  // The taxonomy HAS a "Giroconto" transfer category; net-zero movements have no Scheda, so the
  // search must not offer it.
  await input.fill('giroconto');
  await expect(page.getByText('Nessuna voce trovata')).toBeVisible();

  // Control: the same input finds a real spending entity, so the empty state above proves
  // exclusion, not a broken search.
  await input.fill('condominio');
  await expect(page.getByRole('option', { name: /Condominio/ })).toBeVisible();
});

test('ranks the YoY drivers in the Confronto disclosure, ceased categories included, rows focusing the Scheda', async ({ page }) => {
  await gotoAnalisi(page);

  // The disclosure row already carries the answer; open, the delta ranking is the default view.
  const trigger = page.getByRole('button', { name: 'Confronto annuale' });
  await expect(trigger).toContainText('−120 €');
  await trigger.click();

  // Sorted by |Δ|: Alimentari −100, Palestra −60 (spent only last year → a driver, not an
  // omission), Casa +40. Aria-labels are the spoken form of each delta row.
  const alimentari = page.getByRole('button', { name: `Alimentari, meno 100 euro rispetto al ${PREVIOUS_YEAR}` });
  const palestra = page.getByRole('button', { name: `Palestra, cessata, meno 60 euro rispetto al ${PREVIOUS_YEAR}` });
  const casa = page.getByRole('button', { name: `Casa, più 40 euro rispetto al ${PREVIOUS_YEAR}` });
  await expect(alimentari).toBeVisible();
  await expect(palestra).toBeVisible();
  await expect(casa).toBeVisible();
  await expect(palestra.getByText('Cessata')).toBeVisible();

  const [alimentariBox, palestraBox, casaBox] = await Promise.all([alimentari.boundingBox(), palestra.boundingBox(), casa.boundingBox()]);
  expect(alimentariBox!.y).toBeLessThan(palestraBox!.y);
  expect(palestraBox!.y).toBeLessThan(casaBox!.y);

  // A delta row is an entity entry point like every other: it lands on the Scheda.
  await alimentari.click();
  await expect(dossierHero(page, String(CURRENT_YEAR)).getByText(/^400,00[\s ]*€$/)).toBeVisible();
  await expect(page).toHaveURL(/focusCat=e2e-cat-alimentari/);
});

test('keeps both category tiles usable while an entity is focused', async ({ page }) => {
  await gotoAnalisi(page, '?focusType=fixed&focusCat=e2e-cat-casa');
  await expect(dossierHero(page, String(CURRENT_YEAR)).getByText(/^380,00[\s ]*€$/)).toBeVisible();

  // The Scheda is its own tile: the category lists stay where they were, the income one included.
  await expect(page.getByRole('region', { name: 'Entrate per categoria' }).getByRole('button', { name: /^Stipendio, / })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Spese per categoria' }).getByRole('button', { name: /^Alimentari, / })).toBeVisible();
});

test('breaks a category year row down by subcategory, with the previous year alongside', async ({ page }) => {
  await gotoAnalisi(page, '?focusType=fixed&focusCat=e2e-cat-casa');

  const casaYears = perYearTable(page);
  await expect(casaYears.getByText(new RegExp(`\\+40,00[\\s\\u00a0]*€ \\(\\+11,8%\\) vs ${PREVIOUS_YEAR} stessi mesi`))).toBeVisible();

  // The newest row opens by default: "this year vs last year" is the question the focus exists
  // to answer, so it must not need a click. Every year row keeps its own breakdown mounted (the
  // collapse is a CSS grid-rows transition, so a collapsed one still has a bounding box) — scope
  // through aria-controls, which names exactly the region the OPEN row owns.
  const openToggle = casaYears.getByRole('button', { expanded: true });
  const breakdown = page.locator(`[id="${await openToggle.getAttribute('aria-controls')}"]`);

  // Both figures the drill-down was asked for: the change AND the baseline it is measured against.
  await expect(breakdown.getByText('Condominio')).toBeVisible();
  await expect(breakdown.getByText(/^da 250,00[\s ]*€$/)).toBeVisible();
  await expect(breakdown.getByText(/^\+50,00[\s ]*€ \(\+20,0%\)$/)).toBeVisible();
  await expect(breakdown.getByText('Elettricità')).toBeVisible();
  await expect(breakdown.getByText(/^da 90,00[\s ]*€$/)).toBeVisible();
  await expect(breakdown.getByText(/^−10,00[\s\u00a0]*€ \(−11,1%\)$/)).toBeVisible();

  // Σ(subcategory delta) = the row's own delta: +50 − 10 = +40, the figure asserted on the year
  // row above. That identity is what the block leans on.

  // Collapsing closes the region — measured, because only the browser knows the grid-rows
  // transition actually reached zero — and leaves the year row untouched.
  await openToggle.click();
  await expect.poll(async () => (await breakdown.boundingBox())?.height ?? 0).toBeLessThan(2);
  await expect(casaYears.getByRole('button', { expanded: true })).toHaveCount(0);
  await expect(casaYears.getByText(new RegExp(`\\+40,00[\\s\\u00a0]*€ \\(\\+11,8%\\) vs ${PREVIOUS_YEAR} stessi mesi`))).toBeVisible();
});

test('offers no subcategory breakdown once the focus IS a subcategory', async ({ page }) => {
  await gotoAnalisi(page, '?focusType=fixed&focusCat=e2e-cat-casa&focusSub=e2e-sub-cond');

  // Nothing left to decompose — the year rows stay plain: no toggle, no chevron.
  const condYears = perYearTable(page);
  await expect(condYears.getByRole('button')).toHaveCount(0);
  await expect(condYears.getByText('Per sottocategoria')).toHaveCount(0);
});
