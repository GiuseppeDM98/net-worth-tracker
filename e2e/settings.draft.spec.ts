/**
 * Impostazioni — the ONE draft behind six views (PERF-13, 2026-10-08), at 1440px on the base account.
 *
 * PERCHÉ ESISTE: the page used to be one component with 70 states; now each tab is a view of a
 * slice of ONE reducer, and two things can silently break that structure:
 *  1. a tab that keeps form state of its own loses it when Radix unmounts its panel — so a value
 *     typed in Preferenze must still be there after a trip to Aspetto and back (nothing saved);
 *  2. a field that one of the six views forgets is written as a default with a green toast — the
 *     bug of 2026-09-25, when «Salva» dropped the allocation sub-targets. So a save from ONE tab is
 *     followed by a hard refresh («only a hard refresh proves a setting was saved»), and the OTHER
 *     tabs' fields are read back from the form and the document.
 *
 * The second test WRITES: the settings document is read in `beforeAll` and `set()` back WHOLE in
 * `afterAll` (a page «Salva» rewrites every field and normalises the seed's sub-targets, which
 * settings.spec.ts and allocation.spec.ts read — doc/guide/e2e-emulatori.md).
 *
 * REGRESSION GUARD, seen red (2026-10-08): the Preferenze view given a `useState` copy of its
 * slice (test 1: the year is back to the saved one after the round trip); `dividendCashAssetId`
 * dropped from `composeSettingsDocument` (test 2: the Dividendi account gone after the save).
 */

import { test, expect, type Page } from '@playwright/test';

const DOCUMENTS = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
const SETTINGS_DOC = `${DOCUMENTS}/assetAllocationTargets/test-user-1`;
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

type FirestoreValue = {
  booleanValue?: boolean;
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  mapValue?: { fields?: Record<string, FirestoreValue> };
  arrayValue?: { values?: FirestoreValue[] };
};
type Fields = Record<string, FirestoreValue>;

async function readFields(): Promise<Fields> {
  const res = await fetch(SETTINGS_DOC, { headers: OWNER });
  expect(res.ok).toBe(true);
  return ((await res.json()) as { fields: Fields }).fields;
}

async function openSettings(page: Page, tab: string) {
  await page.goto(`/dashboard/settings?tab=${tab}`, { waitUntil: 'load' });
  await expect(page.locator('h1:visible')).toContainText('Impostazioni', { timeout: 60_000 });
  await expect(page.locator(`#settings-tab-pill-panel-${tab} section`).first()).toBeVisible({ timeout: 30_000 });
}

const unsavedBar = (page: Page) => page.getByRole('region', { name: 'Modifiche non salvate' });
const visibleTab = (page: Page, name: string | RegExp) =>
  page.locator('[role="tablist"]:visible').getByRole('tab', typeof name === 'string' ? { name, exact: true } : { name });
const yearInput = (page: Page) => page.getByRole('spinbutton', { name: 'Anno inizio storico cashflow' });

/** The names of a class's sub-targets as the document holds them. */
const subTargetNames = (fields: Fields, assetClass: string): string[] =>
  Object.keys(fields.targets?.mapValue?.fields?.[assetClass]?.mapValue?.fields?.subTargets?.mapValue?.fields ?? {}).sort();

let savedSettings: Fields;

test.beforeAll(async () => {
  savedSettings = await readFields();
});

test.afterAll(async () => {
  // No update mask: the whole document is replaced by the one read before the first test.
  const res = await fetch(SETTINGS_DOC, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: savedSettings }) });
  expect(res.ok).toBe(true);
});

test('a value typed in Preferenze survives a trip to Aspetto and back, unsaved', async ({ page }) => {
  await openSettings(page, 'generale');
  const saved = await yearInput(page).inputValue();
  const typed = String(Number(saved) - 3);

  await yearInput(page).fill(typed);
  await expect(unsavedBar(page)).toContainText('Modifiche non salvate in Preferenze');

  // Aspetto has no slice and Radix unmounts the Preferenze panel's content meanwhile.
  await visibleTab(page, 'Aspetto').click();
  await expect(page.locator('section[aria-label="Tema colori"]')).toBeVisible();
  await expect(yearInput(page)).toHaveCount(0);

  await visibleTab(page, /^Preferenze/).click();
  await expect(yearInput(page)).toHaveValue(typed);
  await expect(unsavedBar(page)).toContainText('Modifiche non salvate in Preferenze');

  await unsavedBar(page).getByRole('button', { name: 'Annulla modifiche' }).click();
  await expect(unsavedBar(page)).toHaveCount(0);
  await expect(yearInput(page)).toHaveValue(saved);
});

test('a save from Preferenze keeps every other tab’s fields — read back after a hard refresh', async ({ page }) => {
  // The seed's equity sub-targets (World / Single Stock) are the 2026-09-25 casualty: positive
  // anchor first. The seed keeps them with the subcategories OFF, and a page «Salva» writes the
  // rows of an enabled group only — so the group is switched on in the document first, or the
  // drop would be the page's rule, not a regression.
  const enable = await fetch(`${SETTINGS_DOC}?updateMask.fieldPaths=targets.equity.subCategoryConfig.enabled`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({
      fields: { targets: { mapValue: { fields: { equity: { mapValue: { fields: { subCategoryConfig: { mapValue: { fields: { enabled: { booleanValue: true } } } } } } } } } } },
    }),
  });
  expect(enable.ok).toBe(true);
  const before = await readFields();
  const equitySubTargets = subTargetNames(before, 'equity');
  expect(equitySubTargets.length).toBeGreaterThanOrEqual(2);
  const cryptoTarget = before.targets?.mapValue?.fields?.crypto?.mapValue?.fields?.targetPercentage;
  expect(cryptoTarget).toBeDefined();

  // A Dividendi and a Spese field planted through the emulator, so the save has something of
  // theirs to lose: the seed's first cash account and a flag the base seed leaves off.
  const cashAccountId = await page.evaluate(async () => {
    const res = await fetch(
      'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents:runQuery',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'assets' }],
            where: {
              compositeFilter: {
                op: 'AND',
                filters: [
                  { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: 'test-user-1' } } },
                  { fieldFilter: { field: { fieldPath: 'type' }, op: 'EQUAL', value: { stringValue: 'cash' } } },
                ],
              },
            },
          },
        }),
      }
    );
    const rows = (await res.json()) as Array<{ document?: { name: string } }>;
    return rows.find((row) => row.document)?.document?.name.split('/').pop() ?? null;
  });
  expect(cashAccountId).not.toBeNull();
  const plant = await fetch(`${SETTINGS_DOC}?updateMask.fieldPaths=dividendCashAssetId&updateMask.fieldPaths=spendingRolesEnabled`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({ fields: { dividendCashAssetId: { stringValue: cashAccountId }, spendingRolesEnabled: { booleanValue: true } } }),
  });
  expect(plant.ok).toBe(true);

  await openSettings(page, 'generale');
  const savedYear = await yearInput(page).inputValue();
  const newYear = String(Number(savedYear) - 1);
  await yearInput(page).fill(newYear);
  await expect(unsavedBar(page)).toContainText('Modifiche non salvate in Preferenze');
  await unsavedBar(page).getByRole('button', { name: 'Salva' }).click();
  await expect(unsavedBar(page)).toHaveCount(0);

  // The document: the edited field moved, the other tabs' fields did not.
  await expect.poll(async () => (await readFields()).cashflowHistoryStartYear?.integerValue).toBe(newYear);
  const after = await readFields();
  expect(subTargetNames(after, 'equity')).toEqual(equitySubTargets);
  expect(after.targets?.mapValue?.fields?.crypto?.mapValue?.fields?.targetPercentage).toEqual(cryptoTarget);
  expect(after.dividendCashAssetId?.stringValue).toBe(cashAccountId);
  expect(after.spendingRolesEnabled?.booleanValue).toBe(true);
  expect(after.laborIncomeCategoryIds).toEqual(before.laborIncomeCategoryIds);

  // The form, after a hard refresh: the half of the round trip where the historical bugs live.
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('h1:visible')).toContainText('Impostazioni', { timeout: 60_000 });
  await expect(yearInput(page)).toHaveValue(newYear);
  await visibleTab(page, 'Allocazione').click();
  await page.getByRole('button', { name: /^Apri sottocategorie di Azioni/ }).click();
  const nameInputs = page.locator('input[id^="target-equity-sub-"][id$="-name"]');
  await expect(nameInputs).toHaveCount(equitySubTargets.length);
  expect((await nameInputs.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).sort()).toEqual(equitySubTargets);
  await visibleTab(page, 'Dividendi').click();
  await expect(page.getByRole('combobox', { name: 'Conto di accredito dei dividendi' })).not.toContainText('Nessun conto');
  await visibleTab(page, 'Spese').click();
  await expect(page.getByRole('switch', { name: 'Necessità, desideri, risparmi' })).toHaveAttribute('aria-checked', 'true');
});
