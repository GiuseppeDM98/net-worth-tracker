/**
 * The last known figures first, the fresh ones as they land — on Cashflow, the page the
 * owner feels most (2,1 s to a number from an empty cache).
 *
 * WHY A BROWSER: the persister lives in IndexedDB and restores in an effect before the first fetch;
 * whether a reload paints figures or a skeleton, and what the header's live region says in the
 * milliseconds while the fresh read is in flight, exist only in a real page. On the emulators that
 * window is a few ms, so a `getByText` would arrive late: a MutationObserver installed by
 * `addInitScript` records every text the `[data-freshness]` node has had (`e2e/freshnessProbe.ts`,
 * shared with Rendimenti's spec), and the assertions read the recording.
 *
 * NO CLOCK TRICK: a restored figure is reread on every load whatever its age (the restore
 * invalidates what it restored — stale-while-revalidate, so a reload is still a fresh read), and
 * the label keys on «read before this page load», not on an age. So a plain reload seconds after
 * the first visit is the whole case.
 *
 * The parked session carries NO persisted cache (`e2e/persistedCache.ts` strips it), so the first
 * visit of every context is a genuine first visit — the positive anchor the absence needs.
 *
 * SEEN RED (2026-09-29), one behaviour at a time: (a) the reload without a skeleton, with
 * `maxAge: 0` on the provider (the record is discarded at the restore and the skeleton returns) —
 * not with `NEXT_PUBLIC_PERSIST_QUERIES=false`, which needs a server of its own and was exercised
 * by the benchmark's «prima» build instead (doc/guide/velocita.md § Revisit); (b) the sentence, with
 * `describeFreshness`'s words changed; (c) the emptied node, with the sentence latched once shown.
 */

import { test, expect, type Page } from '@playwright/test';
import { persistedQueryKeys, readPersistedRecord, readRecording, recordLoad } from './freshnessProbe';

/** `test-user-1`'s uid — the owner segment of every persisted key of the base account. */
const BASE_UID = 'test-user-1';

/** The Cashflow page with its month on screen: the verdict region and a euro figure in `main`. */
async function waitForCashflow(page: Page): Promise<void> {
  await expect(page.getByRole('region', { name: 'Verdetto del periodo' }).first()).toBeVisible();
  await expect(page.locator('main')).toContainText(/\d,\d{2}\s?€/);
}

/** The persisted queries of a record as `prefix/owner` — whose data it holds, and which. */
function persistedKeys(record: string | null): string[] {
  return persistedQueryKeys(record).map((queryKey) =>
    queryKey[1] === 'overview' ? `overview/${String(queryKey[2])}` : `${String(queryKey[0])}/${String(queryKey[1])}`,
  );
}

/** Whether the record holds a WINDOW of the base account's expenses (`['expenses', uid, 'range', …]`). */
function holdsExpensesWindow(record: string | null): boolean {
  return persistedQueryKeys(record).some((queryKey) => queryKey[0] === 'expenses' && queryKey[1] === BASE_UID && queryKey[2] === 'range');
}

/**
 * Wait until the EXPENSES of the base account are on disk. The persister writes on a one-second
 * throttle, first call immediately: the first record can hold the settings alone, written the
 * moment they settled, while the month's rows are still a moment away — a reload taken then
 * restores no expenses and shows the skeleton for a reason that is not the page's. The key
 * waited for is the WINDOW Tracciamento paints from (2026-09-30): the collection's bounds sit
 * under the same `expenses/<uid>` prefix and land first, and they restore no figure.
 */
async function waitForPersistedExpenses(page: Page): Promise<void> {
  await expect.poll(async () => holdsExpensesWindow(await readPersistedRecord(page)), { timeout: 5_000 }).toBe(true);
}

test.describe('the last known figures first', () => {
  test('a reload paints the month from the persisted cache — no skeleton, the header says it is rereading, then falls silent', async ({ page }) => {
    await recordLoad(page);

    // ── The positive anchor: a first visit, with nothing persisted, DOES show the page skeleton.
    await page.goto('/dashboard/cashflow', { waitUntil: 'load' });
    await waitForCashflow(page);
    const firstVisit = await readRecording(page);
    expect(firstVisit.pageSkeletonSeen, 'the first visit is the anchor: its skeleton must have been seen').toBe(true);
    expect(firstVisit.freshnessTexts.every((text) => text === ''), 'a first read is a wait, never an old figure').toBe(true);

    await waitForPersistedExpenses(page);

    // ── The reload: the same context, the record just written.
    await page.reload({ waitUntil: 'load' });
    await waitForCashflow(page);

    // (a) No page skeleton: the figures came from the persisted cache.
    const reload = await readRecording(page);
    expect(reload.pageSkeletonSeen, 'the reload must paint the restored figures, not a skeleton').toBe(false);

    // (b) The header's live region HAD the reading while the fresh read was in flight.
    expect(reload.freshnessTexts.some((text) => text.includes('Aggiornato alle')), `texts seen: ${JSON.stringify(reload.freshnessTexts)}`).toBe(true);

    // (c) And it is empty once the fresh read has landed — the same nodes, emptied, never removed.
    // Both copies (the header renders one per width; the phone's is `display: none` here) and not
    // a `visible` filter: an emptied `<p>` has no width, and Playwright calls that not visible.
    const freshness = page.locator('[data-freshness]');
    await expect(freshness).toHaveCount(2);
    await expect(freshness).toHaveText(['', '']);
  });

  test('signing out empties the persisted cache — the next account restores nothing of this one', async ({ page }) => {
    await page.goto('/dashboard/cashflow', { waitUntil: 'load' });
    await waitForCashflow(page);

    // Positive anchor: this account's data IS persisted before the sign-out.
    await waitForPersistedExpenses(page);

    // The sidebar footer's profile menu → «Esci» → the confirm's «Esci».
    await page.locator('[data-sidebar="footer"] [aria-haspopup="menu"]').click();
    await page.getByRole('menuitem', { name: 'Esci' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Esci' }).click();
    await page.waitForURL(/\/login/);

    // Nothing of the account left on disk: no record, or a record with no query of this owner. The
    // removal is an IndexedDB write of its own, a beat after the redirect: poll, never one read.
    await expect
      .poll(async () => persistedKeys(await readPersistedRecord(page)).filter((key) => key.endsWith(`/${BASE_UID}`)), { timeout: 5_000 })
      .toEqual([]);
  });
});
