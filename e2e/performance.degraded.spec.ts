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
 */

import { spawnSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';

const UID = 'test-user-degraded';
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
/** Without this header the emulator answers as an anonymous client and every read is silently empty. */
const OWNER_HEADERS = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/** Rewrites the scenario; synchronous because the suite runs with `workers: 1`. */
function seedPerformanceScenario(): void {
  const result = spawnSync('npm', ['run', 'e2e:seed', '--', 'performance'], { stdio: 'pipe', shell: true });
  if (result.status !== 0) {
    throw new Error(`Seed dello scenario «performance» fallito:\n${result.stderr?.toString() ?? ''}`);
  }
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

function baseCaption(page: Page) {
  return page.getByText(/^Base: /);
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
  await expect(attribution(page)).toContainText('Il mercato ha reso +560 €: ETF Mondo E2E ne ha portati +560 €.');
  await expect(marketRow(page).getByText(euro('\\+560'))).toBeVisible();
  // Rows, not text: the footer explains what «Non attribuito» would be, and must not count as one.
  await expect(attribution(page).getByRole('listitem').filter({ hasText: /^Non attribuito/ })).toHaveCount(0);
  await expect(attribution(page).getByRole('listitem').filter({ hasText: /al netto dei versamenti/ })).toHaveCount(0);

  // No pension channel: the Contributi tile shows only the cashflow figure.
  await expect(contributi(page).getByText('Fondi pensione', { exact: true })).toHaveCount(0);

  // The Dettaglio carries the full table with the months attributed.
  await page.getByRole('button', { name: 'Dettaglio', exact: true }).click();
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
  // `exact`: the tile's reading also says «Nei fondi pensione sono entrati …».
  await expect(tile.getByText('Fondi pensione', { exact: true })).toBeVisible();
  // The KPI paragraph (the reading above repeats the figure as a span) carries no plus sign, like «Contributi netti»: 20.100 of entry + 900 of TFR.
  await expect(tile.getByRole('paragraph').filter({ hasText: euro('21.000') })).toBeVisible();
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
