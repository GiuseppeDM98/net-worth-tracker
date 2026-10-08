/**
 * At 390 the Flusso of Analisi is a share bar and rows, never a Sankey (the 640px legibility
 * threshold, doc/guide/cashflow-analisi.md) — and since 2026-09-30 the phone does not
 * DOWNLOAD the Sankey either: `@nivo/sankey` and d3-sankey sit behind a `lazyComponent` in
 * `FlussoTile.tsx`, requested only where the chart is drawn. Base account (`mobile` project); the
 * positive anchor — the same chunk arriving at 1440 — is `bundle.lazy.spec.ts`.
 *
 * Seen red on 2026-09-30 by putting the static import back in `FlussoTile.tsx`: the chunk arrived at 390.
 *
 * Also here, because it is the base account at 390: Cashflow › Dividendi's lazy tab lands on the
 * placeholder the page drew for its chunk, the phone's toolbar row included (`lazyTabLanding.ts`).
 */
import { test, expect } from '@playwright/test';
import { SANKEY_SIGNATURE, probeChunks } from './chunkProbe';
import { expectDividendsTabLandsInPlace } from './lazyTabLanding';

test('Analisi at 390 draws the Flusso as a bar and rows and never downloads the Sankey', async ({ page }) => {
  const sankey = probeChunks(page, SANKEY_SIGNATURE);
  await page.goto('/dashboard/analisi', { waitUntil: 'load' });

  // The phone's drawing of the Flusso is on screen: the page, and the tile's own chunks, are all in.
  const flusso = page.getByRole('region', { name: 'Flusso', exact: true });
  await expect(flusso.getByRole('list', { name: 'Quote del flusso' })).toBeVisible({ timeout: 60_000 });
  await expect(flusso.getByRole('img', { name: /^Flusso del periodo/ })).toHaveCount(0);

  expect(await sankey.matching()).toEqual([]);
});

test('Cashflow › Dividendi at 390 lands on the placeholder the page drew for its chunk, toolbar row included', async ({ page }) => {
  test.setTimeout(120_000);
  await expectDividendsTabLandsInPlace(page);
});
