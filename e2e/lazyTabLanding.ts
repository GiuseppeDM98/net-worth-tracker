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
 * toolbar row is not drawn), Divisione on the split account at 390 and 1440
 * (`cashflow.split{,.mobile}.spec.ts`). Seen red on 2026-10-06 with the old fallbacks put back.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { holdChunks, holdRequests } from './chunkProbe';

/** A function only the tab's own module defines (a dev chunk keeps the names; the page's chunk names only the path). */
const DIVIDENDS_TAB_SIGNATURE = 'function DividendTrackingTab(';
const SPLIT_TAB_SIGNATURE = 'function ExpenseSplitTab(';

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
