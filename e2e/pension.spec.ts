/**
 * Previdenza — desktop regressions that only a real browser can catch.
 *
 * Every figure asserted here comes from `scripts/seedPensionE2E.mts`, which the global setup writes
 * before the suite runs; when a number below looks arbitrary, that file explains why it was chosen.
 *
 * Deliberately NOT covered: anything a Vitest file already proves. `pensionSummary` decides the
 * numbers and `pensionNarrative` the words — those have unit tests. What is tested here is that the
 * page puts them in the right place, at the right size, under the right control: the verdict over
 * the tile grid, the two-row hero, the year axis beside the verdict, the «Dettaglio» disclosure.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Match an exact euro amount as the app prints it.
 *
 * Two traps this exists for: `Intl` separates the amount from the € with a NON-BREAKING space, and
 * a plain substring match for "821,01" also matches "1821,01". Anchored regex solves both.
 */
function euro(amount: string): RegExp {
  return new RegExp(`^${amount.replace(/[.]/g, '\\.')}[\\s\\u00a0]*€$`);
}

/** Last point of the fixture's value series — the hero figure. */
const FUND_VALUE = euro('29.800,00');
/** `valueGrowth (1.800) − contributions recorded in July (821,01)`, signed as the Dettaglio prints it. */
const MARKET_GAIN = /^\+978,99[\s ]*€$/;
/** The cumulative TWR of the fixture: Italian comma, explicit sign. */
const TWR = '+3,48%';

/** The Rendimento tile's KPI paragraph — the reading above it carries the same figure as a span. */
function twrKpi(page: Page): Locator {
  return page.getByRole('region', { name: 'Rendimento del fondo' }).getByRole('paragraph').filter({ hasText: /^\+3,48%$/ });
}

function heroValue(page: Page): Locator {
  return page.getByRole('region', { name: 'Il fondo oggi' }).getByText(FUND_VALUE);
}

async function gotoPension(page: Page): Promise<void> {
  await page.goto('/dashboard/pension');
  // The hero value is the last thing to settle; waiting on it makes every later assertion stable.
  await expect(heroValue(page)).toBeVisible({ timeout: 30_000 });
}

/** Computed pixel size of an element's font — the only way to verify the type scale really applied. */
async function fontSizePx(locator: Locator): Promise<number> {
  const raw = await locator.first().evaluate((el) => getComputedStyle(el).fontSize);
  return parseFloat(raw);
}

/**
 * Nessun frame del caricamento afferma qualcosa che la pagina non ha ancora letto.
 *
 * Polling after the fact would race the render. A MutationObserver installed before the first
 * script runs records the offending state even if it flashes for one frame. Two markers: the empty
 * state, and the reading a fund gets when the contributions have not been read («nessun versamento
 * registrato») — on a page that refuses to print «+0,00%» as a measure, a zero is a statement.
 */
test('never states, at any point in the load, something it has not read', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { __violations: [] as string[] });
    const record = (violation: string) => {
      const seen = (window as unknown as { __violations: string[] }).__violations;
      if (!seen.includes(violation)) seen.push(violation);
    };

    const check = () => {
      // `innerText` applies `text-transform`; both markers are sentence-case prose, so it is safe.
      const text = document.body?.innerText ?? '';
      if (text.includes('Nessun fondo pensione ancora tracciato')) record('empty-state');
      if (text.includes('nessun versamento registrato')) record('versamenti-non-letti');
    };

    // `document`, NOT `document.documentElement`: when `addInitScript` runs the document has just
    // been created and `documentElement` is still null — observing it throws and the observer never
    // attaches, leaving the test green because it observed nothing.
    new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true });
  });

  await gotoPension(page);

  const violations = await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);
  expect(violations).toEqual([]);
});

test('opens with the verdict: three causes, three numbers, the year axis beside it', async ({ page }) => {
  await gotoPension(page);

  const verdict = page.getByRole('region', { name: 'Verdetto sul fondo pensione' });
  await expect(verdict.getByRole('heading', { name: 'Il fondo sta lavorando' })).toBeVisible();
  const sentence = (await verdict.textContent())?.replace(/ /g, ' ') ?? '';
  expect(sentence).toContain('Il fondo di Marco vale 29.800 €');
  expect(sentence).toContain(`il mercato ha reso ${TWR} (TWR)`);
  expect(sentence).toContain('nel 2026 il datore ha aggiunto 134 €');
  // The deductible 2026 contributions are 152,02 + 134,11 = 286,13 € (the TFR does not count); RAL
  // 35.000 puts them entirely in the 35% bracket: 100,15 → «circa 100 €».
  expect(sentence).toContain('il fisco restituisce circa 100 €');

  // The verdict is the page's headline: 30px on desktop, above every tile.
  expect(await fontSizePx(verdict.getByRole('heading'))).toBe(30);
  const verdictBox = (await verdict.boundingBox())!;
  const heroBox = (await page.getByRole('region', { name: 'Il fondo oggi' }).boundingBox())!;
  expect(verdictBox.y).toBeLessThan(heroBox.y);

  // The axis sits on the verdict's row, to the right.
  const axisBox = (await page.getByRole('tablist', { name: 'Anno fiscale' }).boundingBox())!;
  expect(axisBox.x).toBeGreaterThan(verdictBox.x + verdictBox.width - 1);
  expect(Math.abs(axisBox.y - verdictBox.y)).toBeLessThan(40);
});

test('lays the grid out at 1440px: the hero spans two rows, Versato closes the second', async ({ page }) => {
  await gotoPension(page);

  const rect = async (name: string) => (await page.getByRole('region', { name, exact: true }).boundingBox())!;
  const hero = await rect('Il fondo oggi');
  const rendimento = await rect('Rendimento del fondo');
  const annoFiscale = await rect('Anno fiscale');
  const versato = await rect('Versato per natura');
  const versamenti = await rect('Versamenti');

  // Row 1: hero | Rendimento | Anno fiscale, on one line.
  expect(rendimento.x).toBeGreaterThan(hero.x + hero.width - 1);
  expect(annoFiscale.x).toBeGreaterThan(rendimento.x + rendimento.width - 1);
  expect(Math.abs(rendimento.y - hero.y)).toBeLessThan(2);
  expect(Math.abs(annoFiscale.y - hero.y)).toBeLessThan(2);

  // Row 2: Versato beside the hero's second row — the hero is as tall as both rows.
  expect(versato.x).toBeGreaterThan(hero.x + hero.width - 1);
  expect(versato.y).toBeGreaterThan(rendimento.y + rendimento.height - 1);
  expect(hero.y + hero.height).toBeGreaterThan(versato.y + versato.height - 2);

  // Row 3: the ledger takes the full width under everything.
  expect(versamenti.y).toBeGreaterThan(hero.y + hero.height - 1);
  expect(versamenti.width).toBeGreaterThan(hero.width + versato.width);

  // The hero figure steps up to 54px on desktop (DESIGN.md §3); the TWR is a 22px tile KPI.
  expect(await fontSizePx(heroValue(page))).toBe(54);
  expect(await fontSizePx(twrKpi(page))).toBe(22);
});

test('the year axis governs the annual tiles and the annual clauses, and leaves the fund alone', async ({ page }) => {
  await gotoPension(page);

  const yearAxis = page.getByRole('tablist', { name: 'Anno fiscale' });
  await expect(yearAxis.getByRole('tab')).toHaveText(['2026', '2025']);

  // Opens on the current year.
  const annoFiscale = page.getByRole('region', { name: 'Anno fiscale', exact: true });
  await expect(annoFiscale.getByText('Anno fiscale 2026')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Versato per natura' }).getByText('Versato nel 2026')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Versamenti', exact: true }).getByText('Versamenti 2026')).toBeVisible();

  await yearAxis.getByRole('tab', { name: '2025' }).click();

  await expect(annoFiscale.getByText('Anno fiscale 2025')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Versato per natura' }).getByText('Versato nel 2025')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Versamenti', exact: true }).getByText('Versamenti 2025')).toBeVisible();
  // The single 2025 contribution: 1000 € voluntary — ungrouped on purpose (CLDR minimumGroupingDigits = 2).
  await expect(page.getByRole('region', { name: 'Versato per natura' }).getByText(/1000[\s ]*€/).first()).toBeVisible();

  // The verdict follows the axis for its annual clauses only: a closed year is said in the past.
  const sentence = (await page.getByRole('region', { name: 'Verdetto sul fondo pensione' }).textContent())?.replace(/ /g, ' ') ?? '';
  expect(sentence).toContain('nel 2025 il fisco ha restituito circa 350 €');
  expect(sentence).not.toContain('il datore');
  expect(sentence).toContain(`il mercato ha reso ${TWR} (TWR)`);

  // The fund's value and its return are not annual quantities — the axis must not touch them.
  await expect(heroValue(page)).toBeVisible();
  await expect(twrKpi(page)).toBeVisible();
});

test('states the return as a percentage and keeps its decomposition behind «Dettaglio»', async ({ page }) => {
  await gotoPension(page);

  // The fixture's series sits well inside the plausible band, so a percentage is shown rather than
  // the missing-contributions warning or the idle-window note.
  const rendimento = page.getByRole('region', { name: 'Rendimento del fondo' });
  await expect(twrKpi(page)).toBeVisible();
  await expect(rendimento.getByText('non si è ancora mosso')).toBeHidden();
  // The Rendimento tile names the window it is measured on (off the axis).
  await expect(rendimento.getByText('gen 2026 →')).toBeVisible();

  // The decomposition lives only in the Dettaglio: «Crescita del valore» appears nowhere above it.
  const disclosure = page.getByRole('button', { name: /^Dettaglio/ });
  await expect(page.getByText('Crescita del valore')).toBeHidden();

  await disclosure.click();

  const crescita = page.getByRole('region', { name: 'Da dove viene la crescita' });
  await expect(crescita.getByText('Crescita del valore')).toBeVisible();
  // July's value jump is exactly the contributions recorded that month, so the market gain must
  // exclude them — the whole point of keeping the three causes apart.
  await expect(crescita.getByText(MARKET_GAIN)).toBeVisible();
});

test('keeps the primary action in the page header, above the verdict, and never scrolls sideways', async ({ page }) => {
  await gotoPension(page);

  const action = page.getByRole('button', { name: 'Registra versamento' });
  await expect(action).toBeVisible();
  const actionBox = (await action.boundingBox())!;
  const verdictBox = (await page.getByRole('region', { name: 'Verdetto sul fondo pensione' }).boundingBox())!;
  expect(actionBox.y).toBeLessThan(verdictBox.y);

  // `main` is the horizontal scroll container of the shell, not the document (AGENTS.md).
  const { scrollWidth, clientWidth } = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth };
  });
  expect(scrollWidth).toBe(clientWidth);
});
