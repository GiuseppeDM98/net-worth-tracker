/**
 * The Panoramica composed for a phone (since 2026-10-11; doc/guide/panoramica.md § Composizione
 * mobile): the first spec of the page's CONTENT at 390, on the base account with the overview
 * response patched on the wire (`e2e/overviewFixture.ts`: round invented figures, nothing written).
 *
 * What a browser alone can prove here: the title stands alone over the strip (title only, the
 * strip restates the first sentence); the three cells are a thumb's target and open what they
 * say — «Il perché», the Cashflow row with the focus on its trigger, THE tile's curve on YTD with
 * the focus on the checked period; THE tile shows neither chip nor «Mercato:» while the sentence
 * names the market; every other tile is a closed row with an empty, inert panel, the first starting
 * after THE tile (under the pill at 390, the owner's call of 2026-10-11, registered in
 * doc/guide/prima-schermata-misure.md § Registro delle voci allargate); the tax on a
 * sale is on the first screen without a tap, and a taxed month that
 * is not the story keeps the whole paragraph with no «Il perché»; the rows are remembered across a
 * reload; the DOM order is the vertical order with no `order-*` left; nothing runs off `main`. The
 * words and the arithmetic are Vitest's (`__tests__/{overviewSummary,overviewNarrative,
 * salesNarrative,narrative}.test.ts`).
 *
 * Seen red on 2026-10-11, one behaviour at a time: (1) the panel's content mounted while closed
 * (`TileRowShell` rendering it whatever `mounted` says — the first-screen test, panels with
 * children); (2) `onOpen('perche')` doing nothing — «Il perché» never expanded; (3) `reveal` without
 * the `focus()` — the trigger not focused; (4) the «Da inizio anno» cell not changing the period —
 * «1A» still checked; (5) `binding` removed from the tax and (6) `splitVerdict` ignoring `binding` —
 * both on the taxed month that is NOT the story: an «Il perché» appeared (in the taxed STORY the
 * cut already sits after the sale, so the tax is on the first screen with or without the flag);
 * (7) the store write removed from the row handler — nothing remembered after the reload; (8) an
 * `order-1` put back on the Cashflow cell — Cashflow drawn last at 1238px while fourth in the DOM.
 */

import { test, expect, type Page } from '@playwright/test';
import { openOverview, patchOverview, sale } from './overviewFixture';

/** The house floor for a touch target (PRODUCT.md → Accessibility & Inclusion). */
const TOUCH_FLOOR = 44;
const STORAGE_KEY = 'mobile-sections:panoramica';
/** The seven rows of the patched payload (no goal), in DOM order. */
const ROW_IDS = [
  'panoramica-sintesi',
  'panoramica-cashflow',
  'panoramica-composizione',
  'panoramica-costi',
  'panoramica-spese',
  'panoramica-entrate',
  'panoramica-asset',
  // The base fixture's pension fund names a household member, so the Intestatari row exists (2026-10-17).
  'panoramica-intestatari',
] as const;

const verdictOf = (page: Page) => page.getByRole('region', { name: 'Verdetto del mese' });
const stripOf = (page: Page) => page.getByRole('list', { name: 'Le cifre del verdetto' });
const cell = (page: Page, label: RegExp) => stripOf(page).getByRole('button', { name: label });
const trigger = (page: Page, id: string) => page.locator(`#${id}-trigger`);
const panel = (page: Page, id: string) => page.locator(`#${id}-panel`);
const perche = (page: Page) => page.getByRole('button', { name: /^Il perché/ });
const badge = (page: Page) => page.locator('[class*="fixed bottom-4 left-4"]');

test.describe('Panoramica, composed for a phone', () => {
  test('the first screen: title only, three cells, THE tile without its chips; the rows closed and empty, the first after THE tile', async ({ page }) => {
    await patchOverview(page);
    await openOverview(page);
    await expect(badge(page)).toHaveCount(0);

    // Title only: the first sentence is behind «Il perché» (in the DOM, hidden), which the cells will open.
    const verdict = verdictOf(page);
    await expect(verdict.getByText(/Il patrimonio vale/)).toBeHidden();
    await expect(verdict.getByRole('heading', { level: 2 })).toContainText('sta andando bene');
    await expect(perche(page)).toBeVisible();
    await expect(perche(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(perche(page)).toContainText('il patrimonio, il risparmio e il mercato del mese');

    // The strip: three cells, each a thumb's target, each what the sentence prints.
    const cells = stripOf(page).getByRole('button');
    await expect(cells).toHaveCount(3);
    await expect(cells.nth(0)).toContainText(/Questo mese\s*\+3000,00\s?€/);
    await expect(cells.nth(1)).toContainText(/Da inizio anno\s*\+15,00%/);
    await expect(cells.nth(2)).toContainText(/Messo da parte finora\s*59%/);
    // Each cell says what it opens: the rest, THE tile's curve, the Cashflow row (never its own label).
    await expect(cells.nth(0)).toHaveAccessibleName(/, apre il perché$/);
    await expect(cells.nth(1)).toHaveAccessibleName(/, apre l'andamento da inizio anno$/);
    await expect(cells.nth(2)).toHaveAccessibleName(/, apre Cashflow$/);
    for (let i = 0; i < 3; i++) {
      const box = await cells.nth(i).boundingBox();
      expect(box, `cell ${i}`).not.toBeNull();
      expect(box!.height, `cell ${i}`).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    }

    // THE tile: the hero, no chip (the strip has them), no «Mercato:» (the sentence names it).
    const theTile = page.getByRole('region', { name: 'Patrimonio' });
    await expect(theTile.getByText(/190\.000,00\s?€/)).toBeVisible();
    await expect(theTile.getByText('questo mese')).toBeHidden();
    await expect(theTile.getByText('da inizio anno')).toBeHidden();
    await expect(theTile.getByText('Mercato:')).toBeHidden();
    await expect(theTile.getByRole('radiogroup', { name: 'Periodo del grafico' })).toBeVisible();

    // One closed trigger per row, every panel empty and inert; the first row starts after THE tile.
    await expect(page.locator('main [id$="-trigger"]')).toHaveCount(ROW_IDS.length);
    for (const id of ROW_IDS) {
      await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger(page, id)).toHaveAttribute('aria-controls', `${id}-panel`);
      expect(await panel(page, id).evaluate((el) => ({ inert: el.hasAttribute('inert'), children: el.children.length })), id).toEqual({ inert: true, children: 0 });
    }
    await expect(trigger(page, 'panoramica-sintesi')).toContainText('cosa è liquidabile');

    // The first screen ENDS at the pill: the title, the verdict (title only, the cells, «Il perché»)
    // and THE tile's hero and curve sit above it. The first closed row does NOT (owner, 2026-10-11,
    // the exception of DESIGN.md → The First-Screen Rule extended to this page: the strip takes two
    // rows whenever the month's euro has four digits — «+3000,00 €» is a wide cell, longer than nine
    // characters (DESIGN.md → Page Verdict) — and the period picker is 44px, so
    // Sintesi ends ~110px under the pill; `perf/mobile-budget.json` registers `firstClosedRowAbovePill: false`
    // with its `raisedBy`). What is held here is the order: the row starts after THE tile ends.
    const pillTop = await page.locator('nav[data-nav="pill"]').evaluate((el) => el.getBoundingClientRect().top);
    expect(pillTop).toBeGreaterThan(600);
    const bottomOf = async (locator: ReturnType<Page['locator']>) => {
      const box = (await locator.boundingBox())!;
      return box.y + box.height;
    };
    expect(await bottomOf(page.locator('main h1').filter({ visible: true }).first()), 'title').toBeLessThanOrEqual(pillTop);
    expect(await bottomOf(verdict), 'verdict').toBeLessThanOrEqual(pillTop);
    expect(await bottomOf(theTile.getByRole('radiogroup', { name: 'Periodo del grafico' })), 'the period picker').toBeLessThanOrEqual(pillTop);
    const theTileBottom = await bottomOf(theTile);
    const firstRow = (await page.locator('#panoramica-sintesi').boundingBox())!;
    expect(firstRow.y, 'the first row starts after THE tile').toBeGreaterThanOrEqual(theTileBottom);
  });

  test('«Questo mese» opens «Il perché», where the sentence names the market and the year\'s euro', async ({ page }) => {
    await patchOverview(page);
    await openOverview(page);
    await expect(verdictOf(page).getByText(/dal mercato/)).toBeHidden();

    await cell(page, /^Questo mese/).click();
    await expect(perche(page)).toHaveAttribute('aria-expanded', 'true');
    const verdict = verdictOf(page);
    await expect(verdict.getByText(/dal mercato/)).toBeVisible();
    await expect(verdict).toContainText(/da inizio anno \(\+25\.000,00\s?€\)/);
    await expect(verdict).toContainText(/Hai messo da parte il 59% delle entrate finora \(altri 350\s?€ di spese in calendario\)/);
  });

  test('«Messo da parte finora» opens the Cashflow row and hands it the focus; the calendar is a caption under the figure', async ({ page }) => {
    await patchOverview(page);
    await openOverview(page);
    await expect(cell(page, /^Messo da parte finora/)).toHaveAccessibleName(/, apre Cashflow$/);

    await cell(page, /^Messo da parte finora/).click();
    await expect(trigger(page, 'panoramica-cashflow')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'panoramica-cashflow')).toBeFocused();
    const cashflow = page.locator('#panoramica-cashflow');
    await expect(cashflow).toContainText(/di cui 350\s?€ già in calendario, entro il \d{2}/);
    // The tile keeps the WHOLE month: 50%, beside the verdict's 59% so far.
    await expect(cashflow).toContainText('Messo da parte il 50%');
  });

  test('«Da inizio anno» puts the curve on YTD and lands the focus on that period', async ({ page }) => {
    await patchOverview(page);
    await openOverview(page);
    const periods = page.getByRole('radiogroup', { name: 'Periodo del grafico' });
    await expect(periods.getByRole('radio', { name: '1A' })).toHaveAttribute('aria-checked', 'true');
    await expect(cell(page, /^Da inizio anno/)).toHaveAccessibleName(/, apre l'andamento da inizio anno$/);

    await cell(page, /^Da inizio anno/).click();
    const ytd = periods.getByRole('radio', { name: 'YTD' });
    await expect(ytd).toHaveAttribute('aria-checked', 'true');
    await expect(ytd).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const rect = document.getElementById('panoramica-patrimonio-andamento')!.getBoundingClientRect();
          return rect.top >= 0 && rect.top < window.innerHeight;
        }),
      )
      .toBe(true);
  });

  test('a month in the red for the tax on a sale: the tax is on the first screen, the rest behind «Il perché»', async ({ page }) => {
    // Δ −10.000 with the market at +5000 and 20.000 € withheld: `taxes-despite-market`.
    await patchOverview(page, {
      variations: { monthly: { value: -10000, percentage: -5 }, yearly: { value: 25000, percentage: 15 } },
      marketEffect: 5000,
      topMovers: [{ assetClass: 'equity', label: 'Azioni', delta: 4000 }],
      monthSales: sale(20000),
    });
    await openOverview(page);

    const verdict = verdictOf(page);
    await expect(verdict).toContainText('per le tasse sulla vendita di Fenicottero ETF, non per il mercato');
    await expect(verdict.getByText(/pagato circa 20\.000\s?€ di tasse/)).toBeVisible();
    await expect(verdict.getByText(/senza, il mese avrebbe fatto/)).toBeVisible();
    await expect(perche(page)).toBeVisible();
    await expect(perche(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(verdict.getByText(/Hai messo da parte/)).toBeHidden();
    // The strip still prints the month: −10.000,00 € is a wide cell, on a row of its own.
    await expect(cell(page, /^Questo mese/)).toContainText(/−10\.000,00\s?€/);
  });

  test('a taxed month that is not the story: no «Il perché», the whole paragraph, «Questo mese» focuses it', async ({ page }) => {
    // Δ +30.000 with 10.000 € of tax: the sale closes the sentence, binding, so the cut is cancelled.
    await patchOverview(page, {
      variations: { monthly: { value: 30000, percentage: 15 }, yearly: { value: 25000, percentage: 15 } },
      monthSales: sale(10000),
    });
    await openOverview(page);

    const verdict = verdictOf(page);
    await expect(verdict).toContainText('sta andando bene');
    await expect(perche(page)).toHaveCount(0);
    await expect(verdict.getByText(/Il patrimonio vale/)).toBeVisible();
    await expect(verdict.getByText(/pagato circa 10\.000\s?€ di tasse/)).toBeVisible();
    await expect(verdict.getByText(/Hai messo da parte/)).toBeVisible();

    await cell(page, /^Questo mese/).click();
    await expect(page.locator('#panoramica-verdetto')).toBeFocused();
  });

  test('two rows opened are remembered across a reload', async ({ page }) => {
    await patchOverview(page);
    await openOverview(page);
    await trigger(page, 'panoramica-cashflow').click();
    await trigger(page, 'panoramica-sintesi').click();
    await expect(trigger(page, 'panoramica-sintesi')).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('["panoramica-cashflow","panoramica-sintesi"]');

    await page.reload({ waitUntil: 'load' });
    await verdictOf(page).waitFor({ timeout: 45_000 });
    await expect(trigger(page, 'panoramica-cashflow')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'panoramica-sintesi')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'panoramica-composizione')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#panoramica-sintesi')).toContainText('Liquidità');
  });

  test('the DOM order is the vertical order, no order-* in the grid, no «Il perché» outside main, nothing off the side', async ({ page }) => {
    await patchOverview(page);
    await openOverview(page);

    const order = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const sections = [...main.querySelectorAll<HTMLElement>('section.rounded-2xl')].filter((el) => el.checkVisibility());
      return sections.map((el) => ({ name: el.getAttribute('aria-label'), top: Math.round(el.getBoundingClientRect().top) }));
    });
    // Sintesi before Cashflow on the phone, as at 1440 (The First-Screen Rule); the Cashflow tile is named after its month.
    const EXPECTED = [/^Patrimonio$/, /^Sintesi patrimoniale$/, /^Cashflow · \p{Ll}+$/u, /^Composizione$/, /^Costi$/, /^Spese per categoria$/, /^Entrate per categoria$/, /^Asset principali$/, /^Intestatari$/];
    expect(order.length, JSON.stringify(order)).toBe(EXPECTED.length);
    order.forEach((s, i) => expect(s.name, `tile ${i}`).toMatch(EXPECTED[i]));
    expect(order.every((s, i) => i === 0 || s.top >= order[i - 1].top - 1), JSON.stringify(order)).toBe(true);
    // An `order-*` utility, with or without a variant (`desktop:order-none`) — `border-*` is not one.
    expect(
      await page.evaluate(() =>
        [...document.querySelector('main')!.querySelectorAll('*')].flatMap((el) => [...el.classList]).filter((name) => /^(?:[a-z-]+:)*order-/.test(name)),
      ),
    ).toEqual([]);
    expect(await page.locator('body > :not(:has(main)) button', { hasText: /^Il perché/ }).count()).toBe(0);
    await expect(page.locator('main').getByRole('button', { name: /^Il perché/ })).toHaveCount(1);

    // «Il resto della pagina» sits right after THE tile, before the first row — held, not just
    // visible (added in the retirement of 2026-10-11, seen red with `PageRest` moved after Sintesi).
    const rest = page.getByRole('heading', { level: 2, name: 'Il resto della pagina' });
    await expect(rest).toBeVisible();
    const [restTop, theTileBottom, firstRowTop] = await page.evaluate(() => {
      const top = (el: Element | null) => el!.getBoundingClientRect().top;
      const tile = document.querySelector('#panoramica-patrimonio')!.getBoundingClientRect();
      const heading = [...document.querySelectorAll('h2')].find((h) => h.textContent?.trim() === 'Il resto della pagina');
      return [top(heading!), tile.bottom, top(document.querySelector('#panoramica-sintesi'))];
    });
    expect(restTop, 'after THE tile').toBeGreaterThanOrEqual(theTileBottom - 1);
    expect(restTop, 'before the first row').toBeLessThanOrEqual(firstRowTop);
    await page.getByRole('button', { name: 'Apri tutte' }).click();
    for (const id of ROW_IDS) await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(600);

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

  test('a cell with a six-figure variation takes a row of its own, and the strip still fits', async ({ page }) => {
    await patchOverview(page, { variations: { monthly: { value: 123456.78, percentage: 65 }, yearly: { value: 25000, percentage: 15 } } });
    await openOverview(page);
    const first = cell(page, /^Questo mese/);
    await expect(first).toContainText(/\+123\.456,78\s?€/);
    // The page above the strip still settles after the figures show (1,3–1,6 px on 2026-10-16, 1,02 px on
    // 2026-11-13, 0,36 px twice on 2026-11-18): separate boundingBox() calls read the cells in different frames,
    // so two cells on one line read apart. The three boxes are read in ONE evaluate — one frame, one layout —
    // and polled until the second row shares its line; the test fails only if it never does.
    const readBoxes = () =>
      stripOf(page).evaluate((list) =>
        Array.from(list.querySelectorAll('button, [role="button"]'))
          .slice(0, 3)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { y: r.y, width: r.width, height: r.height };
          }),
      );
    let boxes = await readBoxes();
    await expect
      .poll(async () => {
        boxes = await readBoxes();
        return boxes.length === 3 && boxes[1].y === boxes[2].y;
      })
      .toBe(true);
    expect(boxes[0]!.width).toBeGreaterThan(boxes[1]!.width * 1.8);
    expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height - 1);
    expect(boxes[1]!.y).toBe(boxes[2]!.y);
    const main = await page.locator('main').evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(main.scrollWidth).toBe(main.clientWidth);
  });
});
