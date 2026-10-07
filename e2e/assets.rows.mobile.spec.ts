/**
 * Patrimonio at 390 — the phone rows alone, and a sparkline only in a row someone opened
 * (2026-10-07). Base account (`mobile` project).
 *
 * What only a browser can prove:
 * - Strumenti renders the phone ROWS and nothing else: one `AssetRow` per instrument (counted in
 *   Firestore), no `<tr>`. Until 2026-10-07 the desktop table was in the DOM too, hidden by CSS.
 * - No row mounts its chart until it is opened: 0 `svg.recharts-surface` once the sparkline's chunk
 *   is in (the phone preloads it when idle — this chunk arriving is the positive anchor of
 *   `assets.rows.spec.ts`, which asserts the desktop never fetches it), 1 after opening a row.
 *   Before 2026-10-07 every closed row drew one (15 on the owner's 18 instruments). Seen red by
 *   mounting `AssetSparkline` without the `hasOpened` gate: the count read one per row.
 * - The line lands without moving the row: with the sparkline's chunk HELD, the opened panel shows
 *   its 32px slot; released, the chart replaces it at the same height. A separate test, because a
 *   held chunk would keep the first one's «0 before opening» green whatever the rows mount.
 */
import { test, expect, type Page } from '@playwright/test';
import { holdChunks, probeChunks } from './chunkProbe';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
/** A function only `components/assets/AssetSparkline.tsx` defines (a dev chunk keeps the names). */
const SPARKLINE_SIGNATURE = 'function AssetSparkline';
/** The base seed's VWCE: monthly snapshots give it a unit-price series, so its row has a line. */
const VWCE_ID = 'seed-vwce';

test.setTimeout(120_000);

async function countInstruments(): Promise<number> {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const snap = await getFirestore(app).collection('assets').where('userId', '==', UID).get();
  return snap.docs.filter((doc) => !(doc.get('type') === 'cash' && doc.get('assetClass') === 'cash')).length;
}

async function openPatrimonio(page: Page) {
  await page.goto('/dashboard/assets', { waitUntil: 'load' });
  const rows = page.locator('section#strumenti button[aria-controls^="asset-row-"]');
  await expect(rows.first()).toBeVisible({ timeout: 90_000 });
  return rows;
}

test('Strumenti at 390 is the rows alone, and no row draws its sparkline until it is opened', async ({ page }) => {
  const sparklineChunks = probeChunks(page, SPARKLINE_SIGNATURE);
  const instruments = await countInstruments();
  const rows = await openPatrimonio(page);
  const strumenti = page.locator('section#strumenti');

  expect(instruments).toBeGreaterThan(0);
  await expect(rows).toHaveCount(instruments);
  await expect(strumenti.locator('tbody tr')).toHaveCount(0);

  // The idle preload has brought the chart's code: a row that mounted its sparkline would draw it now.
  await expect.poll(() => sparklineChunks.matching().then((urls) => urls.length), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  await expect(strumenti.locator('svg.recharts-surface')).toHaveCount(0);

  await page.locator(`button[aria-controls="asset-row-${VWCE_ID}"]`).click();
  await expect(page.locator(`#asset-row-${VWCE_ID} svg.recharts-surface`)).toHaveCount(1);
  await expect(strumenti.locator('svg.recharts-surface')).toHaveCount(1);
});

test('an opened row holds the sparkline 32px before its code arrives: the line lands in place', async ({ page }) => {
  const held = await holdChunks(page, SPARKLINE_SIGNATURE);
  await openPatrimonio(page);
  const strumenti = page.locator('section#strumenti');

  // Open VWCE's row with the chunk held: its panel opens on the reserved slot.
  const row = page.locator(`button[aria-controls="asset-row-${VWCE_ID}"]`);
  const panel = page.locator(`#asset-row-${VWCE_ID}`);
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  // The panel's height settles after its 200 ms `grid-template-rows` transition: two readings 250 ms
  // apart that agree (doc/guide/e2e-emulatori.md — never a first reading beside the previous one).
  const settledHeight = async () => {
    let previous = -1;
    for (;;) {
      const height = (await panel.boundingBox())!.height;
      if (height === previous) return height;
      previous = height;
      await page.waitForTimeout(250);
    }
  };
  const withSlot = await settledHeight();
  await expect(strumenti.locator('svg.recharts-surface')).toHaveCount(0);

  held.release();
  await expect(panel.locator('svg.recharts-surface')).toHaveCount(1, { timeout: 30_000 });
  expect(await settledHeight(), 'the chart lands in the slot the panel already held').toBe(withSlot);
});
