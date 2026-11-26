/**
 * «Nothing moves when a lazy tab's chunk lands» (2026-10-06, Cashflow; Allocazione › Accumulo since 2026-11-17): the placeholder the page
 * draws while the chunk is on its way (`components/cashflow/CashflowTabSkeletons.tsx`) must have
 * the geometry of what the tab draws first — its own loading state. Until that day the fallback of
 * Dividendi lacked the phone's toolbar row and Divisione's lacked the period picker rows, so on a
 * deep link the grid jumped down when the tab mounted.
 *
 * The Cashflow routines hold the tab's chunk, measure the first cell of the placeholder grid, then put the
 * tab itself in its loading state and measure the same cell again. A helper, not a spec: the
 * FILENAME chooses the account (AGENTS.md § 5), so each spec that runs one sits on the right
 * fixture — Dividendi on the base account at 390 (`bundle.lazy.mobile.spec.ts`; at 1440 the
 * phone's axis row is not drawn — since 2026-10-12 the period pill and the «+» sit in the
 * verdict's `axis` slot, and the fallback draws them in `VerdictSkeleton.axis`), Divisione on the
 * split account at 390 and 1440 (`cashflow.split{,.mobile}.spec.ts`). Seen red on 2026-10-06 with
 * the old fallbacks put back. The Accumulo routine (below, its own header) runs from
 * `bundle.lazy.mobile.spec.ts` on the base account.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { ACCUMULO_TAB_SIGNATURE, DIVIDENDS_TAB_SIGNATURE, SPLIT_TAB_SIGNATURE, holdChunks, holdRequests } from './chunkProbe';
import { atRest } from './atRest';

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
  // At rest frame by frame (e2e/atRest.ts): no animation on the cell or on what carries it, its box
  // still for the quiet window. The skeletons are on screen on purpose here — the chunk or the read
  // is held — so they are not «content still due».
  await atRest(locator, { skeletons: false });
  return topOf(locator);
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
  // A tile is a `section` with its `aria-label` (components/ui/tile.tsx); the verdict is one too, so it is
  // left out. The placeholder holds an UNLABELLED `section` (the verdict's skeleton) for a frame or two after
  // the chunk lands: matched by an unlabelled selector, it was measured while React removed it — a `null`
  // box, the flake of 2026-11-18/19 (doc/guide/e2e-suite.md) — so the check waits for the placeholder to go.
  await expect(panel.getByRole('status', { name: 'Caricamento' })).toHaveCount(0, { timeout: 30_000 });
  const firstTile = panel.locator('section[aria-label]:not([aria-label^="Verdetto"])').first();
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
  const placeholderCell = await cell.elementHandle();

  tabChunk.release();
  // The tab REPLACES the fallback's nodes: it is mounted once the cell measured above has left the
  // document, and it cannot leave its loading state while the stats are held — the cell the locator
  // finds now is the TAB's. (Not «the stats were asked»: the page asks for them before the tab's
  // code lands — seen 2026-11-26, one request held with the chunk still stopped.)
  // Not the browser's layout-shift score either: a node that appears is no shift — the score stayed
  // 0 with the old fallback. The position of the cell is the check.
  await expect.poll(() => placeholderCell!.evaluate((node) => node.isConnected), { timeout: 30_000 }).toBe(false);
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
