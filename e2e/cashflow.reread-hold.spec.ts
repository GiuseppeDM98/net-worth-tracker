/**
 * A row's «Modifica» and «Elimina» wait while the list on screen is a restored copy being reread —
 * on Cashflow › Tracciamento, where it was found (2026-11-26: a «Modifica» opened on the row a reload
 * restored, which still pointed at a fee the save before had deleted; doc/guide/e2e-suite.md).
 *
 * WHY A BROWSER: the rule (`components/ui/row-actions-hold.tsx`) is held by Vitest, control by control;
 * only a real reload says that the persisted cache DOES paint the rows before the reread, that the
 * provider on the page reaches the table's buttons, and that they come back by themselves when the
 * read lands. On the emulators the reread takes a few milliseconds, so the spec holds Firestore's
 * channel behind a gate (a route that answers only when released): the window is as long as the
 * test needs, and nothing is slept on.
 *
 * Base account, the seed's own rows of the month; the spec writes nothing. SEEN RED (2026-11-26) with
 * `RowActionsHold` taken off `CashflowPageClient`: «Modifica» enabled behind the closed gate.
 */

import { test, expect, type Page } from '@playwright/test';
import { persistedQueryKeys, readPersistedRecord } from './freshnessProbe';

/** `test-user-1`'s uid — the owner segment of every persisted key of the base account. */
const BASE_UID = 'test-user-1';
/** Every read of the client SDK, whatever the emulator's host and the worker's project. */
const FIRESTORE_CHANNEL = /google\.firestore\.v1\.Firestore/;

/** The WINDOW of expenses Tracciamento paints from is on disk: a reload taken before restores no row. */
async function waitForPersistedExpenses(page: Page): Promise<void> {
  await expect
    .poll(
      async () => persistedQueryKeys(await readPersistedRecord(page)).some((queryKey) => queryKey[0] === 'expenses' && queryKey[1] === BASE_UID && queryKey[2] === 'range'),
      { timeout: 10_000 },
    )
    .toBe(true);
}

test('a reload holds the rows’ «Modifica» and «Elimina» until the reread has landed', async ({ page }) => {
  await page.goto('/dashboard/cashflow', { waitUntil: 'load' });
  const movimenti = page.getByRole('region', { name: 'Movimenti' });
  await expect(movimenti).toBeVisible({ timeout: 30_000 });
  await movimenti.getByRole('tab', { name: 'Tabella' }).click();
  const table = movimenti.getByRole('table');
  const edit = table.getByRole('button', { name: /^Modifica / }).first();
  const remove = table.getByRole('button', { name: /^Elimina (?!.*o la sua serie$)/ }).first();

  // The positive anchor: with the list read in this load the actions are there to press.
  await expect(edit).toBeEnabled();
  await expect(remove).toBeEnabled();
  await waitForPersistedExpenses(page);

  // The reread held: every Firestore request waits at the gate.
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(FIRESTORE_CHANNEL, async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });

  await page.reload({ waitUntil: 'load' });
  // The rows are the restored ones (the read cannot have answered), the header says so, the actions wait.
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-freshness]').filter({ hasText: 'Aggiornato alle' }).first()).toBeAttached();
  await expect(edit).toBeDisabled();
  await expect(remove).toBeDisabled();

  // The read lands: the header falls silent and the actions come back by themselves.
  release();
  await expect(edit).toBeEnabled({ timeout: 60_000 });
  await expect(remove).toBeEnabled();
  await expect(page.locator('[data-freshness]').filter({ hasText: 'Aggiornato alle' })).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
