/**
 * Patrimonio at 1440 — ONE list in the DOM, no sparkline code, and the two dialogs that mount only
 * while they are needed (2026-10-07). Base account (`desktop` project).
 *
 * What only a browser can prove:
 * - Strumenti renders the TABLE and nothing else: one `<tr>` per instrument (counted in Firestore,
 *   not on the page), no phone row (`AssetRow`), no chart. Until 2026-10-07 both lists were in the
 *   DOM at every width, the hidden one included. Seen red by rendering both lists again.
 * - The desktop never downloads the sparkline's chunk: the line lives only in a phone row, behind
 *   a `lazyComponent`, preloaded on a phone only. The positive anchor — the same chunk arriving at
 *   390 — is `assets.rows.mobile.spec.ts`.
 * - `AssetDialog` and `CashAccountDialog` leave with their exit animation (the dialog is seen with
 *   `data-state="closed"` before it goes, watched from BEFORE the Escape) and hand the focus back
 *   to the control that opened them. Seen red twice on 2026-10-07: unmounting at `onClose` (no
 *   closing frame ever appears), and without `returnFocusTo` (the focus is nowhere). The focus
 *   alone cannot tell the first one: unmounted at once, the dialog STILL gave the focus back —
 *   Radix's `FocusScope` dispatches `onCloseAutoFocus` from its cleanup, after the unmount, and the
 *   handler holds the ref — so the closing frame is the assertion about the exit.
 * - «Aggiungi asset» opens on step 1 after a «Modifica»: a REGRESSION GUARD that stayed green
 *   through that change — with the dialog mounted only while open, the initializer trap it was written
 *   for (AGENTS.md § Two-Step Create Dialogs) cannot happen on this page any more; the reset during
 *   render still has to hold for a host that keeps its dialog mounted (WORKFLOW.md § 2).
 *
 * The absence of a chart is asserted on an `svg.recharts-surface` count; at 1440 that was already
 * 0 before 2026-10-07 (a `ResponsiveContainer` inside `display:none` draws nothing), so it is a guard
 * for the table, not the proof that rows stopped mounting their sparkline — that one is at 390.
 */
import { test, expect, type Page } from '@playwright/test';
import { probeChunks } from './chunkProbe';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
/** A function only `components/assets/AssetSparkline.tsx` defines (a dev chunk keeps the names). */
const SPARKLINE_SIGNATURE = 'function AssetSparkline';

test.setTimeout(120_000);

/** The instruments the table must list: every asset of the account but its cash accounts. */
async function countInstruments(): Promise<number> {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const snap = await getFirestore(app).collection('assets').where('userId', '==', UID).get();
  return snap.docs.filter((doc) => !(doc.get('type') === 'cash' && doc.get('assetClass') === 'cash')).length;
}

async function openPatrimonio(page: Page) {
  await page.goto('/dashboard/assets', { waitUntil: 'load' });
  await expect(page.locator('section#strumenti tbody tr').first()).toBeVisible({ timeout: 90_000 });
}

/**
 * Record, from now on, whether a dialog was ever in the DOM with `data-state="closed"` — the frame
 * Radix keeps while the exit animation runs. Installed BEFORE the action: read after it, a closing
 * frame that came and went is invisible.
 */
async function watchClosingFrame(page: Page) {
  await page.evaluate(() => {
    const flag = window as unknown as { __closingFrameSeen: boolean };
    flag.__closingFrameSeen = false;
    const seen = () => document.querySelector('[role="dialog"][data-state="closed"]') !== null;
    new MutationObserver(() => {
      if (seen()) flag.__closingFrameSeen = true;
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
  });
}

const closingFrameSeen = (page: Page) => page.evaluate(() => (window as unknown as { __closingFrameSeen: boolean }).__closingFrameSeen);

test('Strumenti at 1440 is the table alone: one row per instrument, no phone rows, no sparkline code', async ({ page }) => {
  const sparklineChunks = probeChunks(page, SPARKLINE_SIGNATURE);
  const instruments = await countInstruments();
  await openPatrimonio(page);
  const strumenti = page.locator('section#strumenti');

  expect(instruments).toBeGreaterThan(0);
  await expect(strumenti.locator('tbody tr')).toHaveCount(instruments);
  await expect(strumenti.locator('button[aria-controls^="asset-row-"]')).toHaveCount(0);
  await expect(strumenti.locator('svg.recharts-surface')).toHaveCount(0);

  // Past the idle preload's 4 s ceiling (`usePreloadWhenIdle`): had the desktop asked for the chunk, it is in.
  await page.waitForTimeout(5_000);
  expect(await sparklineChunks.matching()).toEqual([]);
});

test('AssetDialog leaves with its exit animation and gives the focus back to «Modifica»; «Aggiungi asset» then opens on step 1', async ({ page }) => {
  await openPatrimonio(page);
  // Any row will do (other specs plant instruments on this account, some under the seed's names).
  const edit = page.locator('section#strumenti tbody').getByRole('button', { name: /^Modifica / }).first();
  await edit.click();
  const dialog = page.getByRole('dialog');
  // Step 2 of an edit: the form, not the picker.
  await expect(dialog.getByRole('button', { name: 'Salva modifiche' })).toBeVisible({ timeout: 30_000 });

  await watchClosingFrame(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await closingFrameSeen(page), 'the dialog was seen closing before it left').toBe(true);
  await expect(edit).toBeFocused();

  // A new asset after an edit starts on the type picker.
  await page.getByRole('button', { name: 'Aggiungi asset' }).click();
  await expect(dialog.getByRole('radiogroup', { name: 'Tipo di asset' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Salva modifiche' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('CashAccountDialog leaves with its exit animation and gives the focus back to the Liquidità row', async ({ page }) => {
  await openPatrimonio(page);
  const account = page.getByRole('button', { name: /^Conto Corrente, / });
  await account.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Conto Corrente' })).toBeVisible({ timeout: 30_000 });

  await watchClosingFrame(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await closingFrameSeen(page), 'the dialog was seen closing before it left').toBe(true);
  await expect(account).toBeFocused();
});
