/**
 * Patrimonio composed for a phone (since 2026-10-14; doc/guide/patrimonio.md § Composizione
 * mobile), on the base account at 390 (`mobile` project) with the overview patched on the wire
 * (`e2e/overviewFixture.ts`: round invented figures, nothing written) and one top instrument added,
 * so the sentence names the market.
 *
 * What a browser alone can prove here: the first sentence stands under the title and the rest
 * (the year, the market) behind «Il perché»; the strip's two cells open the rows they name; THE
 * tile shows its hero but neither chip, nor «Mercato:», nor the curve's last label; every other tile
 * is a closed row with an empty, inert panel — Strumenti included, so no `AssetRow` and no chart
 * exist until it opens; the hero's count opens Strumenti; the rows are remembered across a reload;
 * the DOM order is the vertical order with no `order-*`; nothing runs off `main`; with the overview
 * unread there is a notice, no strip, «Il resto della pagina» first and Movimenti open. The words and
 * the arithmetic are Vitest's (`__tests__/{patrimonioSummary,patrimonioNarrative}.test.ts`).
 *
 * Seen red on 2026-10-14, one behaviour at a time: (1) `collapse` dropped from Strumenti — the
 * `AssetRow`s mounted at load; (2) the store write removed from the row handler — closed after the
 * reload; (3) `defaultOpen` ignored — Movimenti closed with the overview unread; (4) `liftedFigures`
 * dropped from THE tile — the month's chip visible.
 */

import { test, expect, type Page } from '@playwright/test';
import { patchOverview } from './overviewFixture';
import { atRest } from './atRest';

const TOUCH_FLOOR = 44;
const STORAGE_KEY = 'mobile-sections:assets';
/** The base account's rows (no loan), in DOM order. */
// Intestatari (2026-10-17): the base fixture's pension fund names a household member, so the row exists.
const ROW_IDS = ['patrimonio-movimenti', 'patrimonio-liquidita', 'patrimonio-classi', 'patrimonio-rendimento', 'patrimonio-intestatari', 'patrimonio-strumenti'] as const;
const TOP_MOVER = { topInstrumentMovers: [{ id: 'fenicottero', name: 'Fenicottero ETF', delta: 1500 }] };

const verdictOf = (page: Page) => page.getByRole('region', { name: 'Verdetto del portafoglio' });
const stripOf = (page: Page) => page.getByRole('list', { name: 'Le cifre del verdetto' });
const trigger = (page: Page, id: string) => page.locator(`#${id}-trigger`);
const panel = (page: Page, id: string) => page.locator(`#${id}-panel`);
const perche = (page: Page) => page.getByRole('button', { name: /^Il perché/ });
const assetRows = (page: Page) => page.locator('main button[aria-controls^="asset-row-"]');

async function openPatrimonio(page: Page, overrides: Record<string, unknown> = TOP_MOVER) {
  await patchOverview(page, overrides);
  await page.goto('/dashboard/assets');
  await verdictOf(page).waitFor({ timeout: 60_000 });
  await expect(trigger(page, 'patrimonio-strumenti')).toBeVisible();
}

test.setTimeout(90_000);

test.describe('Patrimonio, composed for a phone', () => {
  test('the first screen: the first sentence, two cells, THE tile without its chips; the rows closed and empty, no AssetRow', async ({ page }) => {
    await openPatrimonio(page);

    const verdict = verdictOf(page);
    await expect(verdict.getByText(/Il portafoglio vale/)).toBeVisible();
    await expect(verdict.getByText(/Da inizio anno/)).toBeHidden();
    await expect(verdict.getByText(/Sul mercato ha spinto/)).toBeHidden();
    await expect(perche(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(perche(page)).toContainText("l'anno e il mercato del mese");

    const cells = stripOf(page).getByRole('button');
    await expect(cells).toHaveCount(2);
    await expect(cells.nth(0)).toContainText(/^G\/P non realizzato[+−]?\d/);
    await expect(cells.nth(0)).toHaveAccessibleName(/, apre Rendimento$/);
    await expect(cells.nth(1)).toContainText(/^Liquidità\d+,\d%/);
    await expect(cells.nth(1)).toHaveAccessibleName(/, apre Liquidità$/);
    for (let i = 0; i < 2; i++) expect((await cells.nth(i).boundingBox())!.height, `cell ${i}`).toBeGreaterThanOrEqual(TOUCH_FLOOR);

    // THE tile: the hero stays (The Lifted-Figure Rule); the chips, the digest and the curve's last label go.
    const theTile = page.getByRole('region', { name: 'Patrimonio' });
    await expect(theTile.getByText(/190\.000,00\s?€/)).toBeVisible();
    await expect(theTile.getByText('questo mese')).toBeHidden();
    await expect(theTile.getByText('da inizio anno')).toBeHidden();
    await expect(theTile.getByText('Mercato:')).toBeHidden();
    await expect(theTile.getByText(/^190\.000\s?€$/)).toBeHidden();

    await expect(page.locator('main [id$="-trigger"]')).toHaveCount(ROW_IDS.length);
    for (const id of ROW_IDS) {
      await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'false');
      expect(await panel(page, id).evaluate((el) => ({ inert: el.hasAttribute('inert'), children: el.children.length })), id).toEqual({ inert: true, children: 0 });
    }
    await expect(trigger(page, 'patrimonio-strumenti')).toContainText(/\d+ strument[oi]/);
    await expect(trigger(page, 'patrimonio-rendimento')).toContainText('vs PMC');
    // Strumenti closed: no phone row, no chart in `main`.
    await expect(assetRows(page)).toHaveCount(0);
    await expect(page.locator('main svg.recharts-surface')).toHaveCount(0);

    // The first row starts after THE tile.
    const theTileBottom = await theTile.evaluate((el) => el.getBoundingClientRect().bottom);
    expect(await page.locator('#patrimonio-movimenti').evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(theTileBottom);
  });

  test('«Il perché» opens the year and the market as sentences of their own', async ({ page }) => {
    await openPatrimonio(page);
    await perche(page).click();
    const verdict = verdictOf(page);
    await expect(verdict.getByText(/Da inizio anno \+15,00% \(\+25\.000,00\s?€\)\./)).toBeVisible();
    await expect(verdict.getByText(/Sul mercato ha spinto soprattutto Fenicottero ETF \(\+1500\s?€\)\./)).toBeVisible();
  });

  test('the G/P cell opens Rendimento, whose KPI is lifted and whose percentage stays', async ({ page }) => {
    await openPatrimonio(page);
    await stripOf(page).getByRole('button', { name: /^G\/P non realizzato/ }).click();
    await expect(trigger(page, 'patrimonio-rendimento')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'patrimonio-rendimento')).toBeFocused();
    const rendimento = page.locator('#patrimonio-rendimento');
    await expect(rendimento.getByText('G/P non realizzato')).toBeHidden();
    await expect(rendimento.getByText(/di costo di carico/)).toBeVisible();
  });

  test('the hero\'s count opens Strumenti, and only then its rows exist', async ({ page }) => {
    await openPatrimonio(page);
    await expect(assetRows(page)).toHaveCount(0);
    await page.getByRole('region', { name: 'Patrimonio' }).getByRole('button', { name: /\d+ strument[oi]/ }).click();
    await expect(trigger(page, 'patrimonio-strumenti')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'patrimonio-strumenti')).toBeFocused();
    await expect(assetRows(page).first()).toBeVisible();
  });

  test('two rows opened are remembered across a reload', async ({ page }) => {
    await openPatrimonio(page);
    await trigger(page, 'patrimonio-liquidita').click();
    await trigger(page, 'patrimonio-classi').click();
    await expect(trigger(page, 'patrimonio-classi')).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('["patrimonio-classi","patrimonio-liquidita"]');

    await page.reload();
    await verdictOf(page).waitFor({ timeout: 60_000 });
    await expect(trigger(page, 'patrimonio-liquidita')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'patrimonio-classi')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'patrimonio-strumenti')).toHaveAttribute('aria-expanded', 'false');
  });

  test('the DOM order is the vertical order, no order-* in main, nothing off the side with every row open', async ({ page }) => {
    await openPatrimonio(page);
    const order = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('main section.rounded-2xl')]
        .filter((el) => el.checkVisibility())
        .map((el) => ({ name: el.getAttribute('aria-label'), top: Math.round(el.getBoundingClientRect().top) })),
    );
    expect(order.map((s) => s.name)).toEqual(['Patrimonio', 'Movimenti del mese', 'Liquidità', 'Classi', 'Rendimento', 'Intestatari', 'Strumenti']);
    expect(order.every((s, i) => i === 0 || s.top >= order[i - 1].top - 1), JSON.stringify(order)).toBe(true);
    expect(
      await page.evaluate(() => [...document.querySelector('main')!.querySelectorAll('*')].flatMap((el) => [...el.classList]).filter((name) => /^(?:[a-z-]+:)*order-/.test(name))),
    ).toEqual([]);

    await page.getByRole('button', { name: 'Apri tutte' }).click();
    for (const id of ROW_IDS) await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'true');
    await atRest(page);
    const measurement = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const limit = main.getBoundingClientRect().left + main.clientWidth;
      const offenders = [...main.querySelectorAll('*')]
        .filter((el) => !el.closest('.sr-only') && !el.closest('.overflow-x-auto'))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return (rect.width > 0 || rect.height > 0) && rect.right > limit + 1;
        })
        .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`)
        .slice(0, 5);
      return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, offenders };
    });
    expect(measurement.offenders).toEqual([]);
    expect(measurement.scrollWidth).toBe(measurement.clientWidth);
  });

  test('with the overview unread: the notice, no strip, «Il resto della pagina» first, Movimenti open', async ({ page }) => {
    await page.route('**/api/dashboard/overview*', (route) => route.abort());
    await page.goto('/dashboard/assets');
    const notice = page.getByText(/Il riepilogo del patrimonio non è stato letto/);
    await expect(notice).toBeVisible({ timeout: 60_000 });
    await expect(stripOf(page)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Patrimonio' })).toHaveCount(0);
    // «Il resto della pagina» is the grid's first child: there is no THE tile above it.
    const firstChild = await page.evaluate(() => {
      const grid = document.querySelector('#patrimonio-movimenti')!.closest('.grid')!;
      return grid.firstElementChild?.querySelector('h2')?.textContent ?? grid.firstElementChild?.textContent ?? '';
    });
    expect(firstChild).toContain('Il resto della pagina');
    await expect(trigger(page, 'patrimonio-movimenti')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'patrimonio-liquidita')).toHaveAttribute('aria-expanded', 'false');
    // Movimenti, Liquidità, Intestatari (on the live assets, overview or not) and Strumenti.
    await expect(page.locator('main [id$="-trigger"]')).toHaveCount(4);
  });
});
