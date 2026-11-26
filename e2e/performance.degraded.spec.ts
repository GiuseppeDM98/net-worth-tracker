/**
 * Rendimenti — the pension funds in the measured base, and «Da dove viene il rendimento».
 *
 * Runs on the degraded account with its own fixture (`npm run e2e:seed -- performance`,
 * `scripts/seedPensionE2E.mts` → PERFORMANCE_SERIES): an ETF that gains 2%, 1,5% and 2%, a pension fund
 * marked «escluso dall'allocazione» (the role that used to veto the toggle), one TFR recorded in
 * July. Every euro asserted below is derived there; when a figure looks arbitrary, that file says why.
 *
 * Deliberately NOT covered: the arithmetic — `resolvePerformanceBase`, `calculatePerformanceForPeriod`
 * and `attributePeriodReturn` have their Vitest suites. What only a browser can prove is the WIRING:
 * that the page resolves the same base as the service, that the toggle reaches the caption, the
 * Contributi tile and the attribution, and that the figures on screen are the ones in Firestore.
 * The two data checks read the emulator directly (the snapshot the entry flow comes from, and the
 * cache key the service wrote), so a green run is not a look at the page alone.
 *
 * The last test (2026-09-20, the critique's two P1s) is what only a browser knows about the page's
 * CONTROLS: the axis is a radiogroup, the heatmap is read by keyboard and by tap, a dialog hands
 * focus back to its opener, the Contributi tile gives one answer. Each assertion was seen red on
 * the code it replaced.
 */

import { test, expect, type Page } from '@playwright/test';
import { expectColumnsEndTogether, expectLastFooterOnEdge, forceColumnTaller } from './tileColumns';
import { persistedQueryKeys, readPersistedRecord, readRecording, recordLoad } from './freshnessProbe';
import { FIRESTORE_DOCUMENTS, pointAdminAtEmulator, runSeedSync } from './emulator';
import { afterIdle } from './atRest';

const UID = 'test-user-degraded';
const FIRESTORE = FIRESTORE_DOCUMENTS;
/** Without this header the emulator answers as an anonymous client and every read is silently empty. */
const OWNER_HEADERS = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/**
 * Rewrites the scenario — the script of `npm run e2e:seed`, run on this worker's project. Synchronous:
 * the tests of a file run one after the other in one worker, and no other worker reads these documents.
 */
function seedPerformanceScenario(): void {
  runSeedSync('scripts/seedPensionE2E.mts', ['performance'], 'Seed dello scenario «performance» fallito');
}

/** Flip «Includi i fondi pensione» on the settings document, the way Impostazioni would save it. */
async function setPensionToggle(on: boolean): Promise<void> {
  const response = await fetch(`${FIRESTORE}/assetAllocationTargets/${UID}?updateMask.fieldPaths=performanceIncludesPensionFunds`, {
    method: 'PATCH',
    headers: OWNER_HEADERS,
    body: JSON.stringify({ fields: { performanceIncludesPensionFunds: { booleanValue: on } } }),
  });
  if (!response.ok) throw new Error(`PATCH settings failed: ${response.status}`);
}

type FirestoreValue = { doubleValue?: number; integerValue?: string; stringValue?: string; arrayValue?: { values?: FirestoreValue[] }; mapValue?: { fields?: Record<string, FirestoreValue> } };

async function readDoc(path: string): Promise<Record<string, FirestoreValue> | null> {
  const response = await fetch(`${FIRESTORE}/${path}`, { headers: OWNER_HEADERS });
  if (response.status === 404) return null;
  const json = (await response.json()) as { fields?: Record<string, FirestoreValue> };
  return json.fields ?? null;
}

const numberOf = (value: FirestoreValue | undefined): number => Number(value?.doubleValue ?? value?.integerValue ?? NaN);

/** The euro figure as the tiles print it (0 decimals), with either no-break space before €. */
function euro(digits: string): RegExp {
  return new RegExp(`^${digits.replace(/[.]/g, '\\.')}[\\s\\u00a0]*€$`);
}

function attribution(page: Page) {
  return page.getByRole('region', { name: 'Da dove viene il rendimento', exact: true });
}

function contributi(page: Page) {
  return page.getByRole('region', { name: 'Contributi', exact: true });
}

/** The measured base is the verdict's `scope` since 2026-10-14, rendered once per width: the visible copy. */
function baseCaption(page: Page) {
  return page.getByText(/^Base: /).locator('visible=true');
}

async function gotoPerformance(page: Page): Promise<void> {
  await page.goto('/dashboard/performance');
  await expect(baseCaption(page)).toBeVisible({ timeout: 30_000 });
  await expect(attribution(page)).toBeVisible();
}

/** The «Mercato» closing row of the attribution list, i.e. the gain the rows add up to. */
function marketRow(page: Page) {
  return attribution(page).getByRole('listitem').filter({ hasText: /^Mercato/ });
}

test.beforeAll(() => {
  seedPerformanceScenario();
});

test.afterAll(async () => {
  await setPensionToggle(false);
});

test('toggle OFF: the fund stays out, the attribution lists the ETF alone and its rows add up to the market', async ({ page }) => {
  await setPensionToggle(false);
  await gotoPerformance(page);

  await expect(baseCaption(page)).toContainText("Base: portafoglio gestito, al netto dei fondi pensione e degli asset esclusi dall'allocazione.");

  // +2%, +1,5%, +2% on 10.000 € over three measured months: 200 + 153 + 207 — the ETF is the whole market.
  await expect(attribution(page)).toContainText(/Il mercato ha reso \+560[\s\u00a0]*€: ETF Mondo E2E ne ha portati \+560[\s\u00a0]*€\./);
  await expect(marketRow(page).getByText(euro('\\+560'))).toBeVisible();
  // Rows, not text: the footer explains what «Non attribuito» would be, and must not count as one.
  await expect(attribution(page).getByRole('listitem').filter({ hasText: /^Non attribuito/ })).toHaveCount(0);
  await expect(attribution(page).getByRole('listitem').filter({ hasText: /al netto dei versamenti/ })).toHaveCount(0);

  // No pension channel: the Contributi tile shows only the cashflow figure.
  await expect(contributi(page).getByText('Fondi pensione', { exact: true })).toHaveCount(0);

  // The Dettaglio carries the full table with the months attributed.
  // The trigger's name is its visible text now («Dettaglio: Tutte le metriche…»), no longer a one-word `aria-label`.
  await page.getByRole('button', { name: /^Dettaglio/ }).click();
  const detail = page.getByRole('region', { name: 'Contributo per strumento', exact: true });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('1 strumento attribuito su 3 mesi (da giugno a agosto 2026).');
  await expect(detail.getByRole('row').filter({ hasText: 'ETF Mondo E2E' })).toContainText('3');
});

test('toggle ON wins over the fund\'s «escluso» role: the fund enters in June as a flow, its TFR is a flow, its market effect joins the attribution', async ({ page }) => {
  await setPensionToggle(true);
  await gotoPerformance(page);

  // The caption names the entry month — June, the first contribution's accounting month — and what a contribution is from then on.
  await expect(baseCaption(page)).toContainText(
    "Base: portafoglio gestito più i fondi pensione da giugno 2026 (i versamenti sono flussi, non rendimento), al netto degli asset esclusi dall'allocazione."
  );

  // The pension channel apart from the savings: entry 20.100 + TFR 900, the entry named as such.
  const tile = contributi(page);
  await expect(tile.getByText('Fondi pensione', { exact: true })).toBeVisible();
  // 20.100 of entry + 900 of TFR, unsigned like every flow. TWO paragraphs carry it: the tile's one
  // answer and the «Fondi pensione» row under it — on this fixture nothing else crossed the boundary,
  // so the channel IS the total, and the rows add up to the figure above them.
  await expect(tile.getByRole('paragraph').filter({ hasText: euro('21.000') })).toHaveCount(2);
  await expect(tile.getByText(/di cui ingresso nella base/)).toContainText('20.100');

  // DATA CHECK 1 — the entry figure on screen is the fund's value frozen in the June snapshot.
  const juneSnapshot = await readDoc(`monthly-snapshots/${UID}-2026-6`);
  const juneRows = juneSnapshot?.byAsset?.arrayValue?.values ?? [];
  const fundInJune = juneRows.map((row) => row.mapValue?.fields).find((fields) => fields?.assetId?.stringValue === 'e2e-degraded-fund');
  expect(numberOf(fundInJune?.totalValue)).toBe(20_100);
  const printedEntry = ((await tile.getByText(/di cui ingresso nella base/).textContent()) ?? '').replace(/\D/g, '');
  expect(printedEntry).toBe('20100');

  // The attribution: the ETF's +560 plus the fund's own market effect (July +100, August +100), reconciled.
  await expect(attribution(page)).toContainText(/Il mercato ha reso \+760[\s ]*€: ETF Mondo E2E ne ha portati \+560[\s ]*€, .+ \+200[\s ]*€\./);
  await expect(attribution(page).getByRole('listitem').filter({ hasText: /al netto dei versamenti/ })).toHaveCount(1);
  await expect(marketRow(page).getByText(euro('\\+760'))).toBeVisible();

  // DATA CHECK 2 — the service resolved the same base: its cache key carries the entry month.
  await expect
    .poll(async () => (await readDoc(`performance-cache/${UID}`))?.cacheKey?.stringValue ?? '', { timeout: 20_000 })
    .toContain('-pe2026-06-');
  const cache = await readDoc(`performance-cache/${UID}`);
  const ytd = cache?.data?.mapValue?.fields?.ytd?.mapValue?.fields;
  expect(numberOf(ytd?.pensionFlow)).toBe(21_000);
  expect(numberOf(ytd?.pensionEntryFlow)).toBe(20_100);
});

test('the controls answer to keyboard and touch: the axis is a radiogroup, a month is read without a mouse, a dialog returns focus, Contributi gives one answer', async ({ page }) => {
  await setPensionToggle(false);
  await gotoPerformance(page);

  // The period picks a VALUE the whole page reads: a radiogroup, never a tablist with no panel.
  // `visible=true`: the picker is mounted twice (beside the verdict from desktop, under it below).
  const axis = page.getByRole('radiogroup', { name: 'Periodo di misura' }).locator('visible=true');
  await expect(axis).toHaveCount(1);
  await expect(axis.getByRole('radio')).toHaveCount(5);
  await expect(page.locator('main [role="tab"]')).toHaveCount(0);

  // The heatmap: three measured months (June–August), ONE Tab stop, the figure on a line under the grid.
  const consistenza = page.getByRole('region', { name: 'Consistenza', exact: true });
  const months = consistenza.locator('tbody button');
  const reading = consistenza.locator('[data-heatmap-reading]');
  await expect(months).toHaveCount(3);
  await expect(consistenza.locator('tbody button[tabindex="0"]')).toHaveCount(1);
  await expect(reading).toHaveText('Scegli un mese per leggerne il rendimento.');

  // Keyboard only — no pointer near the grid, or the hovered month would win over the focused one.
  await months.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(months.nth(1)).toBeFocused();
  await expect(reading).toContainText('Luglio 2026 ·');
  await page.keyboard.press('Enter');
  await expect(months.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(months.nth(1)).toHaveAttribute('aria-pressed', 'false');

  // The legend states the thresholds the fills are cut on (it said «−5% … 0 … +5%» over steps at 1 and 2,5).
  await expect(consistenza).toContainText('<1%');
  await expect(consistenza).toContainText('≥2,5%');
  // The table fits its container (it was 6px wider at both widths).
  const fit = await consistenza.locator('table').evaluate((table) => table.getBoundingClientRect().width - (table.parentElement as HTMLElement).getBoundingClientRect().width);
  expect(fit).toBeLessThanOrEqual(0.5);

  // A dialog opened from the header hands focus back to the button that opened it (it went to `body`).
  const opener = page.getByRole('button', { name: 'Periodo personalizzato' }).locator('visible=true');
  await opener.click();
  await expect(page.getByRole('dialog', { name: 'Periodo personalizzato' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();

  // Contributi: ONE answer — the capital that entered the base — and the ledger only as a term of
  // comparison. The fixture's ETF is a migration baseline with no trade: «Hai investito» must be gone.
  const tile = contributi(page);
  await expect(tile).toContainText(/^.*Nella base sono entrati /);
  await expect(tile.getByText('entrati nella base misurata', { exact: true })).toBeVisible();
  await expect(tile).not.toContainText('Hai investito');
  await expect(tile.getByRole('button', { name: 'Come si calcola: Contributi' })).toBeVisible();
  // The four «?» became one «Come si calcola» per tile: no 20px help target is left on the grid.
  await expect(page.locator('main section button[aria-label^="Mostra definizione"]')).toHaveCount(0);
});

// ─── One read of everything (2026-10-04) ─────────────────────────────────────
//
// What only a browser knows about the page's READS: how many calls leave for `/api/performance/*`
// when it mounts (it was ten — two routes per period — and is one), and what a reload paints
// before the fresh reads land. Both seen red: the count with a second `fetchPerformanceYields`
// planted in the yields query (two calls counted), the reload with the two `performance` prefixes
// taken off the persisted allowlist (nothing of Rendimenti on disk: red at the anchor that both
// payloads are persisted, before the reload is even taken).

test('the dividend yields of every period leave in ONE call, and nothing else is asked of /api/performance', async ({ page }) => {
  await setPensionToggle(false);
  const performanceCalls: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/performance/')) performanceCalls.push(`${request.method()} ${pathname}`);
  });
  const yieldsAnswer = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/performance/yields');

  await gotoPerformance(page);

  // Positive anchor: the call IS made, it is answered, and it carries the periods the page shows.
  const response = await yieldsAnswer;
  expect(response.status()).toBe(200);
  const asked = (response.request().postDataJSON() as { userId: string; periods: Array<{ key: string }> });
  expect(asked.userId).toBe(UID);
  expect(asked.periods.length).toBeGreaterThan(0);
  expect(Object.keys(await response.json())).toEqual(asked.periods.map((period) => period.key));

  // The figures are on screen (the caption waits for every query, the yields included): a second
  // call would have left by now. An absence has no event to wait for: the page's own idle turn is
  // the anchor (`afterIdle`, e2e/atRest.ts) — whatever the render scheduled has been sent by then.
  await afterIdle(page);
  expect(performanceCalls).toEqual(['POST /api/performance/yields']);
});

test('a reload paints the last known figures — no page skeleton, the header says it is rereading, then falls silent', async ({ page }) => {
  await setPensionToggle(false);
  await recordLoad(page);

  // ── The positive anchor: a first visit, with nothing persisted, DOES show the page skeleton.
  await page.goto('/dashboard/performance', { waitUntil: 'load' });
  await expect(baseCaption(page)).toBeVisible({ timeout: 30_000 });
  const firstVisit = await readRecording(page);
  expect(firstVisit.pageSkeletonSeen, 'the first visit is the anchor: its skeleton must have been seen').toBe(true);
  // The title and the paragraph, not the whole region (since 2026-10-14 it also holds the phone's
  // axis, strip and scope, hidden at 1440 but in the DOM — and the strip's gap cell changes with
  // the benchmark series, which are not persisted). `textContent`, what `toHaveText` compares
  // below (`innerText` would add the line breaks). At 1440 the paragraph is the one `<p>`.
  const region = page.getByRole('region', { name: 'Verdetto sui rendimenti' });
  const headline = (await region.locator('h2').textContent()) ?? '';
  const paragraph = (await region.locator('p').first().textContent()) ?? '';
  expect(paragraph).toContain('%');

  // The metrics and the yields of THIS account are on disk (the persister writes on a throttle).
  await expect
    .poll(
      async () =>
        persistedQueryKeys(await readPersistedRecord(page))
          .filter((queryKey) => queryKey[0] === 'performance' && queryKey[2] === UID)
          .map((queryKey) => queryKey[1])
          .sort(),
      { timeout: 5_000 },
    )
    .toEqual(['data', 'yields']);

  await page.reload({ waitUntil: 'load' });
  await expect(baseCaption(page)).toBeVisible({ timeout: 30_000 });

  const reload = await readRecording(page);
  expect(reload.pageSkeletonSeen, 'the reload must paint the restored figures, not a skeleton').toBe(false);
  expect(reload.freshnessTexts.some((text) => text.includes('Aggiornato alle')), `texts seen: ${JSON.stringify(reload.freshnessTexts)}`).toBe(true);
  // The same verdict, and the header silent once the fresh reads have landed (both copies emptied, never removed).
  await expect(region.locator('h2')).toHaveText(headline);
  await expect(region.locator('p').first()).toHaveText(paragraph);
  await expect(page.locator('[data-freshness]')).toHaveText(['', '']);
});

// ─── «Analizza con AI» when the model declines (2026-10-12) ──────────────────
//
// The route's refusal events are Vitest's (`__tests__/analyzePerformanceRoute.test.ts`); what only
// a browser knows is what the dialog does with them. The route is answered by the browser itself,
// so nothing reaches Anthropic (a probe never opens a control that spends: WORKFLOW.md § 3).

const REFUSAL_EMPTY = 'Il modello ha rifiutato di scrivere questo report. Clicca «Rigenera» per riprovare.';
const REFUSAL_PARTIAL =
  'Il modello ha interrotto il report rifiutandosi di continuare: il testo qui sotto è incompleto. Clicca «Rigenera» per riprovare.';

/** An SSE body as the route writes it: one `data:` line per payload, `[DONE]` as the bare string. */
function sseBody(...payloads: unknown[]): string {
  return payloads.map((payload) => `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`).join('');
}

test('a refused report says so, with «Rigenera» beside it even when no text was written', async ({ page }) => {
  await setPensionToggle(false);
  const answers = [
    sseBody({ error: REFUSAL_EMPTY }, '[DONE]'),
    sseBody({ text: 'Il fenicottero ha reso.' }, { error: REFUSAL_PARTIAL }, '[DONE]'),
  ];
  let calls = 0;
  await page.route('**/api/ai/analyze-performance', (route) => {
    const body = answers[Math.min(calls, answers.length - 1)];
    calls += 1;
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body });
  });
  await gotoPerformance(page);

  await page.getByRole('button', { name: 'Analizza con AI', exact: true }).locator('visible=true').click();
  const dialog = page.getByRole('dialog');

  // Refused before any text: the reading says why the report is empty, and «Rigenera» is there
  // (it stood only beside a written report); «Copia» has nothing to copy.
  await expect(dialog).toContainText(REFUSAL_EMPTY);
  await expect(dialog.getByRole('button', { name: 'Rigenera', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Copia il report' })).toHaveCount(0);

  // Refused halfway: the text stays, the reading says it is incomplete, both actions stand.
  await dialog.getByRole('button', { name: 'Rigenera', exact: true }).click();
  await expect(dialog).toContainText(REFUSAL_PARTIAL);
  await expect(dialog).toContainText('Il fenicottero ha reso.');
  await expect(dialog.getByRole('button', { name: 'Copia il report' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Rigenera', exact: true })).toBeVisible();
  expect(calls).toBe(2);
});

// ─── The two columns end on one line (owner, 2026-11-23) ─────────────
//
// Below the first row Rendimenti is two columns from 1440; the LAST tile of each (Capitale e mercato on the
// left, Plusvalenze — or Consistenza when there is none — on the right) grows, so the columns end on one line
// whichever is the taller. The fixture's heights are not the test's business: a style tag stretches the first
// tile of one column and `forceColumnTaller` proves that column is the taller before anything is measured.
// Each case was seen red alone by taking the class off its cell (the Plusvalenze cell; the Capitale cell;
// Consistenza's condition). The failed-read cell carries the same constant and is proven on the diff: no
// browser test can make the meta read fail.

const SALE_ASSET_ID = 'e2e-columns-ornitorinco';

async function adminDb() {
  pointAdminAtEmulator();
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  return getFirestore(getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT }));
}

/** A closed sale in gain of a decoy instrument, plus the ledger's meta when the fixture has none. Returns what to undo. */
async function plantClosedSale(db: FirebaseFirestore.Firestore): Promise<{ plantedMeta: boolean }> {
  const now = new Date();
  const metaRef = db.collection('assetTransactionsMeta').doc(UID);
  const plantedMeta = !(await metaRef.get()).exists;
  if (plantedMeta) {
    await metaRef.set({ userId: UID, migratedAt: now, baselineDate: new Date(2025, 0, 1), migratedAssetCount: 0, createdAt: now, updatedAt: now });
  }
  await db.collection('assets').doc(SALE_ASSET_ID).set({
    userId: UID, ticker: 'ORNITO', name: 'ETF Ornitorinco', type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 5, averageCost: 100, averageCostEur: 100, currentPrice: 150, isLiquid: true, autoUpdatePrice: false,
    taxRate: 26, allocationRole: 'tradable', createdAt: now, updatedAt: now, lastPriceUpdate: now,
  });
  await db.collection('assetTransactions').doc(`${SALE_ASSET_ID}-buy`).set({
    userId: UID, assetId: SALE_ASSET_ID, type: 'buy', date: new Date(2026, 0, 5, 12), quantity: 10,
    pricePerUnit: 100, priceEur: 100, createdAt: now, updatedAt: now,
  });
  await db.collection('assetTransactions').doc(`${SALE_ASSET_ID}-sell`).set({
    userId: UID, assetId: SALE_ASSET_ID, type: 'sell', date: new Date(2026, 1, 5, 12), quantity: 5,
    pricePerUnit: 150, priceEur: 150, createdAt: now, updatedAt: now,
  });
  return { plantedMeta };
}

async function removeClosedSale(db: FirebaseFirestore.Firestore, plantedMeta: boolean): Promise<void> {
  await db.collection('assetTransactions').doc(`${SALE_ASSET_ID}-buy`).delete();
  await db.collection('assetTransactions').doc(`${SALE_ASSET_ID}-sell`).delete();
  await db.collection('assets').doc(SALE_ASSET_ID).delete();
  if (plantedMeta) await db.collection('assetTransactionsMeta').doc(UID).delete();
}

test('Rendimenti: the two columns end on one line, whichever is taller, with Plusvalenze or without (E1)', async ({ page }) => {
  test.setTimeout(240_000);
  const db = await adminDb();
  await removeClosedSale(db, false);
  await setPensionToggle(false);
  const scope = page.locator('main');
  const plusvalenze = page.getByRole('region', { name: 'Plusvalenze realizzate', exact: true });

  // The bare fixture first: no sale, no Plusvalenze, Consistenza ends the right column.
  await gotoPerformance(page);
  await expect(plusvalenze).toHaveCount(0);
  const undoBare = await forceColumnTaller(page, scope, 0);
  await expectColumnsEndTogether(page, scope, 'senza plusvalenze, sinistra più alta');
  await undoBare();

  const { plantedMeta } = await plantClosedSale(db);
  try {
    await gotoPerformance(page);
    await expect(plusvalenze).toBeVisible({ timeout: 30_000 });

    const undoLeft = await forceColumnTaller(page, scope, 0);
    await expectColumnsEndTogether(page, scope, 'con la vendita, sinistra più alta');
    await expectLastFooterOnEdge(scope, 1, 'Plusvalenze cresciuta');
    await undoLeft();

    const undoRight = await forceColumnTaller(page, scope, 1);
    await expectColumnsEndTogether(page, scope, 'con la vendita, destra più alta');
    await expectLastFooterOnEdge(scope, 0, 'Capitale e mercato cresciuto');
    await undoRight();
  } finally {
    await removeClosedSale(db, plantedMeta);
  }
});
