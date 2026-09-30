/**
 * What a page downloads, and when, at 1440 on the base account (PERF-04, 2026-09-30).
 *
 * - Storico: the PDF engine (`@react-pdf/renderer` and pdfkit, 513 KB gz in the production build of
 *   2026-09-26) is NOT in the page's JavaScript; it is requested when «Esporta PDF» is pressed.
 * - Rendimenti: the Dettaglio's plots are not in the page but are fetched while it is idle
 *   (`lazyComponent` + `usePreloadWhenIdle`), so opening the Dettaglio draws them in that render —
 *   no Suspense fallback held ~300 ms, the defect of `next/dynamic` measured the same day.
 * - Analisi: from 640px the Flusso draws the Sankey, so its chunk (`@nivo/sankey`, d3-sankey) DOES
 *   arrive — the positive anchor of `bundle.lazy.mobile.spec.ts`, where it must not — and the chart
 *   replaces its placeholder without moving anything: the placeholder is the plot's own height.
 *
 * Chunks are recognised by content (`chunkProbe.ts`), and the suite runs on `next dev`: these
 * tests prove the laziness of an IMPORT; the sizes are `npm run perf:budget`'s, on the build.
 * Seen red on 2026-09-30 by putting each static import back (SESSION_NOTES of PERF-04).
 */
import { test, expect } from '@playwright/test';
import { PDF_ENGINE_SIGNATURE, SANKEY_SIGNATURE, UNDERWATER_CHART_SIGNATURE, holdChunks, layoutShiftSince, probeChunks, recordLayoutShifts } from './chunkProbe';

test('Storico downloads the PDF engine when «Esporta PDF» is pressed, not with the page', async ({ page }) => {
  test.setTimeout(150_000); // the engine's first compile in `next dev` is the long wait below
  const pdfEngine = probeChunks(page, PDF_ENGINE_SIGNATURE);
  await page.goto('/dashboard/history', { waitUntil: 'load' });

  // The page is up and its header action is live: every chunk the page needs has arrived.
  const exportButton = page.getByRole('button', { name: 'Esporta PDF' }).filter({ visible: true });
  await expect(exportButton).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Verdetto sullo storico' })).toBeVisible({ timeout: 60_000 });
  expect(await pdfEngine.matching()).toEqual([]);

  await exportButton.click();
  await expect(page.getByRole('dialog', { name: 'Esporta un report' })).toBeVisible();
  // `next dev` compiles the engine on its first request: the wait is the compiler's, not the app's.
  await expect.poll(async () => (await pdfEngine.matching()).length, { timeout: 90_000 }).toBeGreaterThan(0);
});

test('Rendimenti preloads the Dettaglio\'s plots while idle, so opening it draws them with no placeholder', async ({ page }) => {
  test.setTimeout(120_000);
  const underwater = probeChunks(page, UNDERWATER_CHART_SIGNATURE);
  await page.goto('/dashboard/performance', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: 'Rendimento', exact: true })).toBeVisible({ timeout: 60_000 });

  // Nothing opened yet, and the chart's chunk arrives anyway: the idle preload (`usePreloadWhenIdle`).
  await expect.poll(async () => (await underwater.matching()).length, { timeout: 60_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(500); // the chunk evaluated, not only received

  // Watch from before the press whether a placeholder EVER appears in the underwater tile: read after
  // the chart is visible, a count of skeletons is 0 whether or not one was shown first.
  await page.evaluate(() => {
    const w = window as unknown as { __sawPlaceholder: boolean };
    w.__sawPlaceholder = false;
    new MutationObserver(() => {
      if (document.querySelector('section[aria-label="Sotto il massimo (underwater)"] [data-slot="skeleton"]')) w.__sawPlaceholder = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole('button', { name: /^Dettaglio/ }).click();
  await expect(page.getByRole('img', { name: /^Distanza dal massimo/ })).toBeVisible();
  // Drawn in the render that opened the disclosure: no placeholder was ever put in its place.
  expect(await page.evaluate(() => (window as unknown as { __sawPlaceholder: boolean }).__sawPlaceholder)).toBe(false);
});

test('Analisi at 1440 downloads the Sankey and draws it in the box its placeholder held', async ({ page }) => {
  // `next dev` compiles the route and the chart on first request: the default 30 s is too tight in a
  // full run on a loaded machine (seen 2026-09-30).
  test.setTimeout(120_000);
  const sankey = probeChunks(page, SANKEY_SIGNATURE);
  await recordLayoutShifts(page);
  // Held back until the placeholder has been measured: from 640px the chunk is requested when
  // FlussoTile's module is evaluated, before the page's reads return and the tile draws.
  const sankeyChunk = await holdChunks(page, SANKEY_SIGNATURE);
  // Not `load`: the held chunk is requested before the load event, which would then never fire.
  await page.goto('/dashboard/analisi', { waitUntil: 'domcontentloaded' });

  const flusso = page.getByRole('region', { name: 'Flusso', exact: true });
  const placeholder = flusso.locator('[data-slot="skeleton"]');
  await expect(placeholder).toBeVisible({ timeout: 60_000 });
  const placeholderBox = await placeholder.boundingBox();
  const since = await page.evaluate(() => performance.now());
  sankeyChunk.release();

  const chart = flusso.getByRole('img', { name: /^Flusso del periodo/ });
  await expect(chart).toBeVisible({ timeout: 90_000 });
  expect((await sankey.matching()).length).toBeGreaterThan(0);

  // Two readings of «nothing moved»: the browser's own layout-shift score since the placeholder was
  // measured, and the chart's height against the placeholder's (each seen red alone, 2026-09-30).
  expect(await layoutShiftSince(page, since)).toBe(0);
  const chartBox = await chart.boundingBox();
  expect(Math.abs((chartBox?.height ?? 0) - (placeholderBox?.height ?? -1))).toBeLessThan(1);
});
