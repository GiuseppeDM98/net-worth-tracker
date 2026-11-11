/**
 * Rendimenti composed for a phone (since 2026-10-14; the rules in doc/guide/rendimenti.md
 * § Composizione mobile and DESIGN.md → Small-Screen Composition): at 390 on the degraded account's
 * `performance` fixture (`scripts/seedPensionE2E.mts` → PERFORMANCE_SERIES: an ETF that gains
 * 2%, 1,5% and 2% over three measured months, the pension fund out of the base, no trade ledger —
 * so six rows, Plusvalenze absent). The six model series and the FX are answered by the browser
 * itself with a flat invented month (`stubBenchmarks`), so the gap cell and the Benchmark row
 * depend on nothing outside the emulator; one test aborts them instead, to fail the read.
 *
 * What a browser alone can prove here: the period picker sits between the title and the strip;
 * the two cells are a thumb's target; the measured base is on the first screen without a tap,
 * above «Il resto della pagina»; THE tile shows neither its hero nor its peak chip (the strip and
 * the sequel carry them); every other tile is a closed row with an empty, inert panel; «Analizza
 * con AI» is in the navbar, 44×44, and NEVER pressed — it spends (WORKFLOW.md § 3); the calendar
 * icon opens the custom range and hands the focus back; the gap cell opens the Benchmark row with
 * the focus on its trigger; two rows are remembered across a reload; six failed series are the
 * Benchmark row open at load, red once closed, with ONE live node; the DOM order is the vertical
 * order with no `order-*` left, and nothing runs off `main`. The words and the arithmetic are
 * Vitest's (`__tests__/{performanceSummary,performanceNarrative,narrative,mobileSections}.test.ts`).
 *
 * The fixture measures three months, below the six a companion chip needs: the «annualizzato»
 * chip on the other basis — which the phone keeps — cannot be seen here, and no assertion
 * pretends to see it.
 *
 * `.degraded.mobile.spec.ts`: collected by `degraded-mobile` alone (`playwright.config.ts`); the
 * `mobile` project ignores `degraded.`.
 *
 * Seen red on 2026-10-14, one behaviour at a time: (1) the base passed as `scope` only at 1440
 * (nothing on the first screen to wait for — the spec had promised «the base inside «Il perché»»,
 * a mutation with the same effect: no visible «Base:» above «Il resto della pagina»; declared in
 * the retirement of the same day); (2) the AI icon taken out of the phone's navbar
 * (count 0); (4) `reveal` without the `focus()`; (5) the store write removed from the row's
 * handler (the row never opens: `open` is read from the store); (6) Benchmark's `failed` fixed
 * to false (the row closed under six aborted series); (7) an `order-2` put back on Rischio
 * (drawn fourth while sixth in the DOM). (3) the calendar's `returnFocusTo` removed stayed GREEN:
 * below 769px the drawer never takes the focus (vaul's `autoFocus` is off, doc/guide/dialog.md)
 * and `ResponsiveModal`'s own fallback restores it, so the prop matters to Safari alone — the
 * assertion is a regression guard on the focus, not a proof of the prop.
 */

import { spawnSync } from 'node:child_process';
import { test, expect, type Page, type Route } from '@playwright/test';

/** The house floor for a touch target (PRODUCT.md → Accessibility & Inclusion). */
const TOUCH_FLOOR = 44;
const STORAGE_KEY = 'mobile-sections:performance';
/** The rows of the fixture, in DOM order: no ledger, so no Plusvalenze. */
const ROW_IDS = ['rend-benchmark', 'rend-contributi', 'rend-attribuzione', 'rend-capitale', 'rend-rischio', 'rend-consistenza'] as const;

/** Rewrites the scenario; synchronous because the suite runs with `workers: 1`. */
function seedPerformanceScenario(): void {
  const result = spawnSync('npm', ['run', 'e2e:seed', '--', 'performance'], { stdio: 'pipe', shell: true });
  if (result.status !== 0) {
    throw new Error(`Seed dello scenario «performance» fallito:\n${result.stderr?.toString() ?? ''}`);
  }
}

/** Every month of last year and this one — the fixture's window is inside, whatever the day. */
function monthsAround(): Array<{ year: number; month: number }> {
  const year = new Date().getFullYear();
  return [year - 1, year].flatMap((y) => Array.from({ length: 12 }, (_, i) => ({ year: y, month: i + 1 })));
}

/**
 * The six model series and the FX, answered by the browser: every model gains 1% a month, a euro is
 * 0,92 of a dollar. A flat invented series, so the gap cell has a figure and the Benchmark row its
 * table, and nothing reaches Yahoo or Frankfurter.
 */
async function stubBenchmarks(page: Page): Promise<void> {
  await page.route('**/api/benchmarks/returns**', (route: Route) => {
    const benchmarkId = new URL(route.request().url()).searchParams.get('benchmarkId') ?? '';
    return route.fulfill({
      json: { benchmarkId, name: benchmarkId, monthlyReturns: monthsAround().map((m) => ({ ...m, return: 0.01 })), cachedAt: new Date().toISOString() },
    });
  });
  await page.route('**/api/benchmarks/fx-rates**', (route: Route) =>
    route.fulfill({ json: { monthlyRates: monthsAround().map((m) => ({ ...m, eurPerUsd: 0.92 })), cachedAt: new Date().toISOString() } }),
  );
}

/** Calls that reached the AI route across the whole file: a probe never opens a control that spends. */
let aiCalls = 0;
async function countAiCalls(page: Page): Promise<void> {
  await page.route('**/api/ai/**', (route: Route) => {
    aiCalls += 1;
    return route.abort();
  });
}

const trigger = (page: Page, id: string) => page.locator(`#${id}-trigger`);
const panel = (page: Page, id: string) => page.locator(`#${id}-panel`);
const verdictOf = (page: Page) => page.getByRole('region', { name: 'Verdetto sui rendimenti' });
const stripOf = (page: Page) => page.getByRole('list', { name: 'Le cifre del verdetto' });
const baseCaption = (page: Page) => page.getByText(/^Base: /).locator('visible=true');
const perche = (page: Page) => page.getByRole('button', { name: /^Il perché/ });

async function openPerformance(page: Page): Promise<void> {
  await page.goto('/dashboard/performance');
  await expect(baseCaption(page)).toBeVisible({ timeout: 45_000 });
}

test.beforeAll(() => {
  seedPerformanceScenario();
});

test.beforeEach(async ({ page }) => {
  await countAiCalls(page);
});

test.afterAll(() => {
  expect(aiCalls, 'no test of this file may open «Analizza con AI»').toBe(0);
});

test.describe('Rendimenti, composed for a phone', () => {
  test('the first screen: the period under the title, two cells, the base without a tap, THE tile without its hero and peak chip, six closed empty rows', async ({ page }) => {
    await stubBenchmarks(page);
    await openPerformance(page);

    // The axis is in the verdict's section, between the title and the strip (DESIGN.md → Page Verdict);
    // one visible copy of the radiogroup (the desktop one is mounted hidden).
    const verdict = verdictOf(page);
    const axis = page.getByRole('radiogroup', { name: 'Periodo di misura' }).locator('visible=true');
    await expect(axis).toHaveCount(1);
    const strip = stripOf(page);
    await expect(strip).toBeVisible();
    const [titleBox, axisBox, stripBox] = await Promise.all([verdict.locator('h2').boundingBox(), axis.boundingBox(), strip.boundingBox()]);
    expect(axisBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
    expect(stripBox!.y).toBeGreaterThanOrEqual(axisBox!.y + axisBox!.height);
    // The custom range is the calendar icon after the picker, in the same slot.
    const calendar = page.getByRole('button', { name: 'Periodo personalizzato', exact: true }).locator('visible=true');
    await expect(calendar).toHaveCount(1);
    const calendarBox = (await calendar.boundingBox())!;
    expect(calendarBox.width).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    expect(calendarBox.height).toBeGreaterThanOrEqual(TOUCH_FLOOR);

    // Two cells, each a thumb's target: the return on its basis (three measured months), the gap on the 60/40 in points.
    const cells = strip.getByRole('button');
    await expect(cells).toHaveCount(2);
    await expect(cells.nth(0)).toContainText(/Rendimento nei 3 mesi\s*[+−]\d+,\d%/);
    await expect(cells.nth(1)).toContainText(/Sul 60\/40\s*[+−]?\d+(,\d)?\s*pt/);
    await expect(cells.nth(0)).toHaveAccessibleName(/, apre Da dove viene il rendimento$/);
    await expect(cells.nth(1)).toHaveAccessibleName(/, apre Benchmark$/);
    for (let i = 0; i < 2; i++) {
      const box = await cells.nth(i).boundingBox();
      expect(box, `cell ${i}`).not.toBeNull();
      expect(box!.height, `cell ${i}`).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    }

    // With the model the title stands alone: the whole paragraph is behind «Il perché».
    await expect(verdict.getByText(/\(TWR\)/)).toBeHidden();
    await expect(perche(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(perche(page)).toContainText('rendimento, Sharpe, drawdown e mesi positivi');

    // The measured base is on the first screen without a tap, above «Il resto della pagina» (The Binding-Clause Rule).
    const base = baseCaption(page);
    await expect(base).toContainText("Base: portafoglio gestito, al netto dei fondi pensione e degli asset esclusi dall'allocazione.");
    const rest = page.getByRole('heading', { level: 2, name: 'Il resto della pagina' });
    await expect(rest).toBeVisible();
    const [baseBox, restBox] = await Promise.all([base.boundingBox(), rest.boundingBox()]);
    expect(baseBox!.y + baseBox!.height).toBeLessThanOrEqual(restBox!.y);

    // THE tile: open, its reading in sight; the hero and the peak chip are the strip's and the
    // sequel's (The Lifted-Figure Rule). The fixture never fell, so the chip would read «Massimo del
    // periodo»; three months are too few for the chip on the other basis, which the phone keeps.
    const theTile = page.getByRole('region', { name: 'Rendimento', exact: true });
    // The reading («100 € a fine maggio … valgono …»): its unit is its own span, so the prose is what is matched.
    await expect(theTile.getByText(/a fine \w+ \d{4} oggi valgono/)).toBeVisible();
    await expect(theTile.locator('p.font-mono').first()).toBeHidden();
    await expect(theTile.getByText('Massimo del periodo', { exact: true })).toBeHidden();
    await expect(theTile.getByText('Crescita di 100', { exact: true })).toBeVisible();

    // One closed trigger per row, every panel empty and inert, the first row after THE tile.
    await expect(page.locator('main [id$="-trigger"]')).toHaveCount(ROW_IDS.length);
    for (const id of ROW_IDS) {
      await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger(page, id)).toHaveAttribute('aria-controls', `${id}-panel`);
      expect(await panel(page, id).evaluate((el) => ({ inert: el.hasAttribute('inert'), children: el.children.length })), id).toEqual({ inert: true, children: 0 });
    }
    await expect(trigger(page, 'rend-rischio')).toContainText('volatilità, Sharpe e drawdown');
    const theTileBox = (await theTile.boundingBox())!;
    const firstRow = (await page.locator('#rend-benchmark').boundingBox())!;
    expect(firstRow.y, 'the first row starts after THE tile').toBeGreaterThanOrEqual(theTileBox.y + theTileBox.height);
  });

  test('«Analizza con AI» is in the navbar, a thumb\'s target, and is never pressed', async ({ page }) => {
    await stubBenchmarks(page);
    await openPerformance(page);

    const ai = page.getByRole('button', { name: 'Analizza con AI', exact: true }).locator('visible=true');
    await expect(ai).toHaveCount(1);
    await expect(ai).toBeEnabled();
    const box = (await ai.boundingBox())!;
    // Half a pixel of tolerance: a 44px box can read 43,999996 (sub-pixel layout; red once in the full
    // run of 2026-10-16, green ×3 alone — the second time of that shape, doc/guide/e2e-playwright.md).
    expect(box.width).toBeGreaterThanOrEqual(TOUCH_FLOOR - 0.5);
    expect(box.height).toBeGreaterThanOrEqual(TOUCH_FLOOR - 0.5);
    // In the sticky navbar, beside «Aggiorna»: above the verdict's title.
    const titleBox = (await verdictOf(page).locator('h2').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(titleBox.y);
    await expect(page.getByRole('button', { name: 'Aggiorna', exact: true }).locator('visible=true')).toHaveCount(1);
    expect(aiCalls).toBe(0);
  });

  test('the calendar icon opens the custom range and Escape hands the focus back to it', async ({ page }) => {
    await stubBenchmarks(page);
    await openPerformance(page);

    const calendar = page.getByRole('button', { name: 'Periodo personalizzato', exact: true }).locator('visible=true');
    await calendar.click();
    await expect(page.getByRole('dialog', { name: 'Periodo personalizzato' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(calendar).toBeFocused();
  });

  test('«Sul 60/40» opens the Benchmark row and hands it the focus', async ({ page }) => {
    await stubBenchmarks(page);
    await openPerformance(page);

    await stripOf(page).getByRole('button', { name: /^Sul 60\/40/ }).click();
    await expect(trigger(page, 'rend-benchmark')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'rend-benchmark')).toBeFocused();
    await expect(page.locator('#rend-benchmark')).toContainText('Il tuo portafoglio');
  });

  test('two rows opened are remembered across a reload', async ({ page }) => {
    await stubBenchmarks(page);
    await openPerformance(page);
    await trigger(page, 'rend-rischio').click();
    await trigger(page, 'rend-contributi').click();
    await expect(trigger(page, 'rend-contributi')).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('["rend-contributi","rend-rischio"]');

    await page.reload({ waitUntil: 'load' });
    await expect(baseCaption(page)).toBeVisible({ timeout: 45_000 });
    await expect(trigger(page, 'rend-rischio')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'rend-contributi')).toHaveAttribute('aria-expanded', 'true');
    for (const id of ROW_IDS.filter((row) => row !== 'rend-rischio' && row !== 'rend-contributi')) {
      await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'false');
    }
    await expect(page.locator('#rend-rischio')).toContainText('Volatilità');
  });

  test('six failed series: the Benchmark row open at load, red once closed, one live node, the gap cell says the model is unavailable', async ({ page }) => {
    await page.route('**/api/benchmarks/fx-rates**', (route: Route) =>
      route.fulfill({ json: { monthlyRates: monthsAround().map((m) => ({ ...m, eurPerUsd: 0.92 })), cachedAt: new Date().toISOString() } }),
    );
    // `retry: 1`: each series is asked twice and then fails for good.
    await page.route('**/api/benchmarks/returns**', (route: Route) => route.abort());
    await openPerformance(page);

    const benchmark = trigger(page, 'rend-benchmark');
    await expect(benchmark).toHaveAttribute('aria-expanded', 'true', { timeout: 20_000 });
    await expect(page.locator('#rend-benchmark')).toHaveAttribute('aria-label', 'Benchmark · lettura fallita');
    await expect(panel(page, 'rend-benchmark')).toContainText('non sono stati letti');
    await expect(panel(page, 'rend-benchmark').getByRole('button', { name: 'Riprova' })).toBeVisible();
    await expect(stripOf(page).getByRole('button', { name: /^Sul 60\/40/ })).toContainText('modello non disponibile');

    await benchmark.click();
    await expect(benchmark).toHaveAttribute('aria-expanded', 'false');
    await expect(benchmark.locator('span.text-destructive')).toHaveCount(1);

    // ONE live node: `PageRest`'s sentence; the row is silent below `desktop:`.
    const alerts = page.locator('main [role="alert"]');
    await expect(alerts).toHaveCount(1);
    await expect(alerts.first()).toContainText('Benchmark');
  });

  test('the DOM order is the vertical order, no order-* is left, and nothing runs off main — rows closed and open', async ({ page }) => {
    await stubBenchmarks(page);
    await openPerformance(page);

    const readOrder = () =>
      page.evaluate(() => {
        const main = document.querySelector('main')!;
        const sections = [...main.querySelectorAll<HTMLElement>('section.rounded-2xl')].filter((el) => el.checkVisibility());
        return sections.map((el) => ({ name: el.getAttribute('aria-label'), top: Math.round(el.getBoundingClientRect().top) }));
      });
    const isSorted = (tops: number[]) => tops.every((top, i) => i === 0 || top >= tops[i - 1] - 1);
    // An `order-*` utility, with or without a variant — `border-*` is not one.
    const orderClasses = () =>
      page.evaluate(() =>
        [...document.querySelector('main')!.querySelectorAll('*')]
          .flatMap((el) => [...el.classList])
          .filter((name) => /^(?:[a-z-]+:)*order-/.test(name)),
      );

    const closed = await readOrder();
    expect(closed.map((s) => s.name).slice(0, 7)).toEqual(['Rendimento', 'Benchmark', 'Contributi', 'Da dove viene il rendimento', 'Capitale e mercato', 'Rischio', 'Consistenza']);
    expect(isSorted(closed.map((s) => s.top)), JSON.stringify(closed)).toBe(true);
    expect(await orderClasses()).toEqual([]);

    await page.getByRole('button', { name: 'Apri tutte' }).click();
    for (const id of ROW_IDS) await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(600);
    const open = await readOrder();
    expect(isSorted(open.map((s) => s.top)), JSON.stringify(open)).toBe(true);

    const measurement = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) throw new Error('no <main> in the dashboard shell');
      const limit = main.getBoundingClientRect().left + main.clientWidth;
      const offenders = Array.from(main.querySelectorAll('*'))
        .filter((el) => !el.closest('.sr-only') && !el.closest('.overflow-x-auto'))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return (rect.width > 0 || rect.height > 0) && rect.right > limit + 1;
        })
        .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`)
        .slice(0, 5);
      return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, offenders };
    });
    expect(measurement.offenders, `elements past main's right edge (${measurement.clientWidth}px)`).toEqual([]);
    expect(measurement.scrollWidth).toBe(measurement.clientWidth);
  });
});
