/**
 * Cashflow › Tracciamento composed for a tablet (2026-10-16; doc/guide/cashflow-tracciamento.md
 * § Composizione mobile): one spec, two projects — `tablet` (768×1024) and `tablet-landscape`
 * (1024×768) — branching on the width, on the base account as it is (four closed rows: Spese,
 * Entrate, Risparmio nel tempo, Movimenti; in landscape all four in the index beside the verdict and
 * THE tile). The tab's own add affordances are the point of the second half: the portrait «+» of the
 * pill at 768, the axis' «Aggiungi» in landscape — the only one there, a 44px target. And the second
 * sample page at 1440: twelve columns, as a page opened there.
 *
 * Seen red on 2026-10-16 (the landscape stage), one at a time (with
 * `overview.tablet.spec.ts`): the stage's columns without `max-desktop:` — «the grid spans main at
 * 1440»; `REST_CELL_CLASS` emptied — «"Il resto" as tall as a row»; `INDEX_CLASS`'s `min-h` dropped —
 * «the index ends on THE tile line»; `WIDE_CELL_CLASS` emptied — «the open row spans the grid» at 768.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  TOUCH_FLOOR,
  expectGridAcrossMain,
  expectLandscapeStage,
  expectNoHalfCells,
  expectNoOverflow,
  expectOpenedRow,
  expectStickyStage,
  foldOf,
  gridOf,
  gridTracks,
  isLandscape,
  openRow,
  rectOf,
} from './tabletLayout';

const LEAD_ID = 'trk-periodo';
/** The four rows, in DOM order. */
const ROW_IDS = ['trk-spese', 'trk-entrate', 'trk-risparmio', 'trk-movimenti'] as const;

test.use({ contextOptions: { reducedMotion: 'reduce' } });

const panel = (page: Page) => page.getByRole('tabpanel', { name: 'Tracciamento' });
const lead = (page: Page) => page.locator(`#${LEAD_ID}`);
const trigger = (page: Page, id: string) => page.locator(`#${id}-trigger`);

async function open(page: Page): Promise<void> {
  await page.goto('/dashboard/cashflow');
  await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible({ timeout: 45_000 });
  await expect(lead(page)).toBeVisible();
  // The tab bar paints after the verdict and THE tile: without this wait «the tabs are 44×44» read 0
  // visible tabs 1,3 s after the verdict, once on 2026-10-16 and again on 2026-10-20 (e2e-emulatori.md).
  await expect(page.getByRole('tablist').first()).toBeVisible();
  await expect(page.getByRole('tab').filter({ visible: true }).first()).toBeVisible();
}

test.describe('Cashflow › Tracciamento, composed for a tablet', () => {
  test('two columns at 768 with THE tile across them; the landscape stage at 1024; the first closed row above the fold', async ({ page }) => {
    await open(page);
    const fold = await foldOf(page);
    if (isLandscape(page)) {
      await expectLandscapeStage(page, panel(page), ROW_IDS);
    } else {
      const grid = gridOf(page, LEAD_ID);
      expect((await gridTracks(grid)).columns).toBe(2);
      const [gridRect, theTile] = await Promise.all([rectOf(grid), rectOf(lead(page))]);
      expect(Math.abs(theTile.width - gridRect.width), 'THE tile across the grid').toBeLessThanOrEqual(1);
      expect(theTile.bottom, 'THE tile ends above the pill').toBeLessThanOrEqual(fold);
      // Four closed rows pair up.
      await expectNoHalfCells(page, grid, ROW_IDS);
    }
    const first = await rectOf(page.locator(`#${ROW_IDS[0]}`));
    expect(first.bottom, 'the first closed row above the fold').toBeLessThanOrEqual(fold);
  });

  test('an opened row stays in place in the index at 1024 and spans the grid at 768, the rows after it under it', async ({ page }) => {
    await open(page);
    const where = await openRow(page, ROW_IDS[1]);
    await expectOpenedRow(page, gridOf(page, LEAD_ID), ROW_IDS[1], where, ROW_IDS[0], ROW_IDS.slice(2));
    if (isLandscape(page)) await expectLandscapeStage(page, panel(page), ROW_IDS);
    // Spese, left alone before the open Entrate, takes the whole row.
    else await expectNoHalfCells(page, gridOf(page, LEAD_ID), ROW_IDS);
  });

  test('a rotation keeps Movimenti open, its feed whole; every row open, the left stack still and nothing past main', async ({ page }) => {
    await open(page);
    await trigger(page, 'trk-movimenti').click();
    await expect(trigger(page, 'trk-movimenti')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Movimenti' }).getByRole('combobox', { name: /^Periodo dei movimenti:/ })).toBeVisible();

    const landscape = isLandscape(page);
    await page.setViewportSize(landscape ? { width: 768, height: 1024 } : { width: 1024, height: 768 });
    await expect
      .poll(async () => {
        const row = await rectOf(page.locator('#trk-movimenti'));
        if (landscape) return Math.round(row.width) === Math.round((await rectOf(gridOf(page, LEAD_ID))).width);
        const index = await rectOf(panel(page).getByRole('heading', { level: 2, name: 'Il resto della pagina' }).locator('xpath=../..'));
        return row.x >= index.x && row.right <= index.right + 0.5;
      })
      .toBe(true);
    await expect(trigger(page, 'trk-movimenti')).toHaveAttribute('aria-expanded', 'true');

    await panel(page).getByRole('button', { name: 'Apri tutte' }).click();
    for (const id of ROW_IDS) await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'true');
    if (!landscape) await expectStickyStage(page, panel(page));
    await expectNoOverflow(page);
  });

  test('the tabs are 44×44; the «+» at 768, «Aggiungi» at 1024 is 44px tall and the «+» is gone', async ({ page }) => {
    await open(page);
    const tabs = page.getByRole('tab').filter({ visible: true });
    expect(await tabs.count()).toBeGreaterThanOrEqual(2);
    for (const tab of await tabs.all()) {
      const box = (await tab.boundingBox())!;
      const name = (await tab.getAttribute('aria-label')) ?? (await tab.textContent()) ?? '';
      expect(box.width, name).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      expect(box.height, name).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    }

    const fab = page.getByRole('button', { name: 'Aggiungi nuova voce' });
    const add = page.getByRole('button', { name: 'Aggiungi voce', exact: true });
    if (isLandscape(page)) {
      await expect(add).toBeVisible();
      expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      await expect(fab).toBeHidden();
    } else {
      await expect(fab).toBeVisible();
      await expect(add).toBeHidden();
    }
  });

  test('at 1440 the grid is the one of a page opened at 1440: twelve tracks, no row', async ({ page }) => {
    await open(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const grid = gridOf(page, LEAD_ID);
    await expect.poll(async () => (await gridTracks(grid)).columns).toBe(12);
    await expect(panel(page).locator('[id$="-trigger"]')).toHaveCount(0);
    await expectGridAcrossMain(page, grid);
  });
});
