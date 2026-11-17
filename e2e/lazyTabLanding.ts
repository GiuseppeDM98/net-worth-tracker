/**
 * «Nothing moves when a lazy Cashflow tab's chunk lands» (2026-10-06): the placeholder the page
 * draws while the chunk is on its way (`components/cashflow/CashflowTabSkeletons.tsx`) must have
 * the geometry of what the tab draws first — its own loading state. Until that day the fallback of
 * Dividendi lacked the phone's toolbar row and Divisione's lacked the period picker rows, so on a
 * deep link the grid jumped down when the tab mounted.
 *
 * Both routines hold the tab's chunk, measure the first cell of the placeholder grid, then put the
 * tab itself in its loading state and measure the same cell again. A helper, not a spec: the
 * FILENAME chooses the account (AGENTS.md § 5), so each spec that runs one sits on the right
 * fixture — Dividendi on the base account at 390 (`bundle.lazy.mobile.spec.ts`; at 1440 the
 * phone's axis row is not drawn — since 2026-10-12 the period pill and the «+» sit in the
 * verdict's `axis` slot, and the fallback draws them in `VerdictSkeleton.axis`), Divisione on the
 * split account at 390 and 1440 (`cashflow.split{,.mobile}.spec.ts`). Seen red on 2026-10-06 with
 * the old fallbacks put back.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { ACCUMULO_TAB_SIGNATURE, DIVIDENDS_TAB_SIGNATURE, SPLIT_TAB_SIGNATURE, holdChunks, holdRequests } from './chunkProbe';

/** The first cell of the tile grid inside the panel's loading state (`TileGridSkeleton`). */
function firstSkeletonCell(panel: Locator): Locator {
  return panel.getByRole('status', { name: 'Caricamento' }).locator('.grid > div').first();
}

async function topOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!.y;
}

/**
 * The top once it has stopped moving: a panel enters with `tabPanelSwitch` (6px of rise in 200ms),
 * and a reading taken during it differs from a settled one by a few pixels (2,4 seen 2026-10-06).
 */
async function settledTopOf(locator: Locator): Promise<number> {
  // Two readings 250ms apart (longer than the whole entrance) that agree. `expect.poll` would take
  // its first reading at once, beside the one before it, and call a moving cell still.
  let previous = await topOf(locator);
  for (let attempt = 0; attempt < 20; attempt++) {
    await locator.page().waitForTimeout(250);
    const current = await topOf(locator);
    if (Math.abs(current - previous) < 0.1) return current;
    previous = current;
  }
  throw new Error('the cell never stopped moving');
}

/**
 * Allocazione › Accumulo (2026-11-12): only the chunk is held — the plans come from the Firestore SDK,
 * already read by the page for the Piano's note, so the tab mounts with its content, not its loading
 * state. The check is therefore the fallback's first cell against the tab's first tile: the fallback
 * (`AccumuloTabSkeleton`) holds the verdict's place, and the tab's first tile (`section`) starts where its
 * grid started. The tab bar is on screen while the chunk is held. Seen red with the tab imported
 * statically (no chunk to hold).
 */
export async function expectAccumuloTabLandsInPlace(page: Page): Promise<void> {
  const tabChunk = await holdChunks(page, ACCUMULO_TAB_SIGNATURE);
  await page.goto('/dashboard/allocation?tab=accumulo', { waitUntil: 'domcontentloaded' });

  const panel = page.getByRole('tabpanel', { name: 'Accumulo' });
  const cell = firstSkeletonCell(panel);
  await expect(cell).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('tab', { name: 'Accumulo' })).toBeVisible();
  const placeholderTop = await settledTopOf(cell);
  expect(tabChunk.held(), 'the Accumulo tab\'s chunk is held while the placeholder is measured').toBeGreaterThan(0);

  tabChunk.release();
  // A tile is a `section` (components/ui/tile.tsx); the verdict is one too, so it is left out.
  const firstTile = panel.locator('section:not([aria-label^="Verdetto"])').first();
  await expect(firstTile).toBeVisible({ timeout: 30_000 });
  expect(Math.abs((await settledTopOf(firstTile)) - placeholderTop)).toBeLessThan(1);
}

/**
 * Dividendi: the chunk is held, then its data (`/api/dividends/stats`), so once the chunk lands the
 * tab mounts in its loading state — which since 2026-10-06 IS the page's fallback element.
 */
export async function expectDividendsTabLandsInPlace(page: Page): Promise<void> {
  const stats = await holdRequests(page, '**/api/dividends/stats*');
  const tabChunk = await holdChunks(page, DIVIDENDS_TAB_SIGNATURE);
  // Not `load`: the held chunk is requested before the load event, which would then never fire.
  await page.goto('/dashboard/cashflow?tab=dividends', { waitUntil: 'domcontentloaded' });

  const panel = page.getByRole('tabpanel', { name: 'Dividendi' });
  const cell = firstSkeletonCell(panel);
  await expect(cell).toBeVisible({ timeout: 60_000 });
  const placeholderTop = await settledTopOf(cell);
  // The cell measured is the PAGE's placeholder only while the tab's chunk is stopped: since the tab's
  // own loading state is that same element, nothing else here would tell a held chunk from none.
  expect(tabChunk.held(), 'the Dividendi tab\'s chunk is held while the placeholder is measured').toBeGreaterThan(0);

  tabChunk.release();
  // The chunk is fulfilled at once; evaluating it and mounting the tab is well inside this wait,
  // and the tab cannot leave its loading state while the stats are held.
  // Not the browser's layout-shift score: the tab REPLACES the fallback's nodes, and a node that
  // appears is no shift — the score stayed 0 with the old fallback. The position of the cell is the check.
  await page.waitForTimeout(1500);
  expect(Math.abs((await settledTopOf(cell)) - placeholderTop)).toBeLessThan(1);

  await stats.release();
  await expect(cell).toHaveCount(0, { timeout: 30_000 });
}

/**
 * Divisione keeps its LIVE period picker while it reads, so its fallback can only mirror it. The
 * chunk is held to measure the fallback; then the tab, ready, is sent to a period not read yet
 * («Quest'anno», a new window) with Firestore's channel held, and its own loading state is measured.
 */
export async function expectSplitTabLandsInPlace(page: Page): Promise<void> {
  const tabChunk = await holdChunks(page, SPLIT_TAB_SIGNATURE);
  await page.goto('/dashboard/cashflow?tab=split', { waitUntil: 'domcontentloaded' });

  const panel = page.getByRole('tabpanel', { name: 'Divisione' });
  const cell = firstSkeletonCell(panel);
  await expect(cell).toBeVisible({ timeout: 60_000 });
  const placeholderTop = await settledTopOf(cell);

  tabChunk.release();
  await expect(panel.getByRole('heading', { name: 'In comune' })).toBeVisible({ timeout: 45_000 });

  const firestore = await holdRequests(page, '**/google.firestore.v1.Firestore/**');
  try {
    await panel.getByRole('combobox', { name: /Periodo selezionato/ }).filter({ visible: true }).first().click();
    await page.getByRole('button', { name: "Quest'anno", exact: true }).filter({ visible: true }).first().click();
    await expect(cell).toBeVisible({ timeout: 15_000 });
    expect(Math.abs((await settledTopOf(cell)) - placeholderTop)).toBeLessThan(1);
  } finally {
    await firestore.release();
  }
  await expect(panel.getByRole('heading', { name: 'In comune' })).toBeVisible({ timeout: 30_000 });
}
