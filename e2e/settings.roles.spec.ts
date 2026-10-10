/**
 * Impostazioni › Spese › Ruoli 50/30/20 — the opt-in switch and the category dialog's role picker,
 * at 1440px on the base account (`test@example.com`).
 *
 * Unlike settings.spec.ts these tests WRITE: the switch is saved and a category's role is set and
 * cleared, each outcome read back from the emulator (never from the look of the page). Everything
 * they touch is restored in `afterAll`: the settings document exactly as it was (a page «Salva»
 * rewrites the whole document, normalising the seed's sub-targets, which settings.spec.ts reads),
 * and no role on «Alimentari» (`seed-cat-food`).
 *
 * The base account is SHARED by every desktop spec, and some of them plant spending categories of
 * their own (cashflow.mortgage, cashflow.transfer-fee) that a crashed cleanup would leave behind:
 * the tile's counts are therefore read from the emulator at the moment of the assertion, never
 * pinned (AGENTS.md § Emulator Exercise Scripts, «On a shared account never pin ABSOLUTE values»).
 *
 * What only a browser can prove here: the switch lives in Spese and its dirty state belongs to that
 * tab; the dialog shows the picker only with the switch on; «Da classificare» DELETES the stored
 * field (deleteField — a plain update would keep the old role); a dialog opened with the switch off
 * neither shows nor rewrites a stored role; and a role saved in the dialog reaches Analisi's Flusso
 * at once, through the React Query invalidation the dialog does — not five minutes later.
 */

import { test, expect, type Page } from '@playwright/test';

const DOCUMENTS = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
const SETTINGS_DOC = `${DOCUMENTS}/assetAllocationTargets/test-user-1`;
const FOOD_DOC = `${DOCUMENTS}/expenseCategories/seed-cat-food`;
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

type Fields = Record<string, { booleanValue?: boolean; stringValue?: string }>;

async function readFields(url: string): Promise<Fields> {
  const res = await fetch(url, { headers: OWNER });
  return ((await res.json()) as { fields: Fields }).fields;
}

/** PATCH one field; `undefined` deletes it (a field in the mask but not in the body). */
async function patchField(url: string, field: string, value: Fields[string] | undefined): Promise<void> {
  const res = await fetch(`${url}?updateMask.fieldPaths=${field}`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({ fields: value ? { [field]: value } : {} }),
  });
  expect(res.ok).toBe(true);
}

const setFlag = (enabled: boolean) => patchField(SETTINGS_DOC, 'spendingRolesEnabled', { booleanValue: enabled });
const setFoodRole = (role: string | undefined) => patchField(FOOD_DOC, 'spendingRole', role ? { stringValue: role } : undefined);

interface Classification {
  /** The account's spending categories (fixed, variable, debt). */
  spending: number;
  /** Of those, the ones carrying a role of their own. */
  classified: number;
}

/** The base account's categories as the emulator holds them NOW — the tile's two numbers, read a second way. */
async function readClassification(): Promise<Classification> {
  const res = await fetch(`${DOCUMENTS}:runQuery`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'expenseCategories' }],
        where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: 'test-user-1' } } },
      },
    }),
  });
  expect(res.ok).toBe(true);
  const rows = (await res.json()) as Array<{ document?: { fields: Fields } }>;
  const counts: Classification = { spending: 0, classified: 0 };
  for (const row of rows) {
    const type = row.document?.fields.type?.stringValue;
    if (type !== 'fixed' && type !== 'variable' && type !== 'debt') continue;
    counts.spending += 1;
    if (row.document?.fields.spendingRole?.stringValue) counts.classified += 1;
  }
  return counts;
}

/**
 * The sentence the tile must print for those counts, written out here as a reader would say it
 * (the spec cannot import lib/: settingsNarrative's describeSpendingRolesSetting is the other path).
 */
function expectedReading({ spending, classified }: Classification): string {
  if (spending === 0) return "Attivi, ma non c’è ancora nessuna categoria di spesa da classificare.";
  if (classified === spending) {
    return spending === 1 ? "Attivi: l’unica categoria di spesa ha un ruolo." : `Attivi: tutte le ${spending} categorie di spesa hanno un ruolo.`;
  }
  const missing = spending - classified;
  const have = classified === 1 ? `1 categoria di spesa su ${spending} ha un ruolo` : `${classified} categorie di spesa su ${spending} hanno un ruolo`;
  return `Attivi: ${have}; ${missing} ${missing === 1 ? 'finisce' : 'finiscono'} in «Da classificare».`;
}

async function openSpese(page: Page) {
  await page.goto('/dashboard/settings?tab=spese', { waitUntil: 'load' });
  await expect(page.locator('h1:visible')).toContainText('Impostazioni', { timeout: 60_000 });
  await expect(rolesTile(page)).toBeVisible({ timeout: 30_000 });
}

const rolesTile = (page: Page) => page.getByRole('region', { name: 'Ruoli 50/30/20' });
const unsavedBar = (page: Page) => page.getByRole('region', { name: 'Modifiche non salvate' });
const dialog = (page: Page) => page.getByRole('dialog');

async function editFood(page: Page) {
  await page.getByRole('button', { name: 'Modifica Alimentari' }).click();
  await expect(dialog(page)).toBeVisible();
}

async function saveDialog(page: Page) {
  await dialog(page).getByRole('button', { name: 'Salva Modifiche' }).click();
  await expect(dialog(page)).toHaveCount(0);
}

async function pickFoodRole(page: Page, option: RegExp) {
  await editFood(page);
  await dialog(page).getByRole('combobox', { name: 'Ruolo 50/30/20' }).click();
  await page.getByRole('option', { name: option }).click();
  await saveDialog(page);
}

let savedSettings: Fields;

test.beforeAll(async () => {
  savedSettings = await readFields(SETTINGS_DOC);
  await setFlag(false);
  await setFoodRole(undefined);
});

test.afterAll(async () => {
  // No update mask: the whole document is replaced by the one read before the first test.
  const res = await fetch(SETTINGS_DOC, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: savedSettings }) });
  expect(res.ok).toBe(true);
  await setFoodRole(undefined);
});

test('the switch lives in Spese, off by default; switched on and saved, it writes the flag', async ({ page }) => {
  await openSpese(page);
  const tile = rolesTile(page);
  await expect(tile).toContainText('Spenti: il flusso di Analisi si legge solo per tipo di spesa.');
  const toggle = tile.getByRole('switch', { name: 'Necessità, desideri, risparmi' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await toggle.click();
  await expect(unsavedBar(page)).toContainText('Modifiche non salvate in Spese');
  await unsavedBar(page).getByRole('button', { name: 'Salva' }).click();
  await expect(unsavedBar(page)).toHaveCount(0);

  await expect.poll(async () => (await readFields(SETTINGS_DOC)).spendingRolesEnabled?.booleanValue).toBe(true);
  // Positive anchor for the counts below: the seed's two spending categories are among them.
  const counts = await readClassification();
  expect(counts.spending).toBeGreaterThanOrEqual(2);
  await expect(tile).toContainText(expectedReading(counts));
});

test('the dialog sets a role, and «Da classificare» deletes the stored field', async ({ page }) => {
  await setFlag(true);
  await openSpese(page);
  const before = await readClassification();

  await pickFoodRole(page, /^Necessità/);
  await expect.poll(async () => (await readFields(FOOD_DOC)).spendingRole?.stringValue).toBe('need');
  // One more classified than before the dialog, whatever else the account holds.
  const after = await readClassification();
  expect(after).toEqual({ spending: before.spending, classified: before.classified + 1 });
  await expect(rolesTile(page)).toContainText(expectedReading(after));

  await pickFoodRole(page, /^Da classificare/);
  await expect.poll(async () => 'spendingRole' in (await readFields(FOOD_DOC))).toBe(false);
});

test('with the switch off the dialog neither shows nor rewrites a stored role', async ({ page }) => {
  await setFlag(false);
  await setFoodRole('want');
  await openSpese(page);

  await editFood(page);
  await expect(dialog(page).getByRole('combobox', { name: 'Ruolo 50/30/20' })).toHaveCount(0);
  await saveDialog(page);

  // The role the dialog never showed is still there.
  await expect.poll(async () => (await readFields(FOOD_DOC)).spendingRole?.stringValue).toBe('want');
});

test('a role saved in the dialog reaches Analisi\'s Flusso without a reload', async ({ page }) => {
  await setFlag(true);
  await setFoodRole(undefined);
  await openSpese(page);

  // Analisi reached client-side, so the categories land in the React Query cache the page keeps —
  // the global staleTime is 5 minutes, and that copy is what a missing invalidation would serve back.
  await page.locator('a[href="/dashboard/analisi"]:visible').first().click();
  await expect(page).toHaveURL(/\/dashboard\/analisi/);
  const chart = page.getByRole('region', { name: 'Flusso', exact: true }).getByRole('img', { name: /^Flusso del periodo/ });
  const roleNode = (label: string) => chart.locator('text').filter({ hasText: new RegExp(`^${label}$`) });
  // The base seed's Alimentari and Casa carry no role: both flow into «Da classificare».
  await expect(roleNode('Da classificare')).toHaveCount(1, { timeout: 30_000 });
  await expect(roleNode('Necessità')).toHaveCount(0);

  // Back to Impostazioni through the history — still client-side — and classify Alimentari.
  await page.goBack();
  await expect(rolesTile(page)).toBeVisible({ timeout: 30_000 });
  await pickFoodRole(page, /^Necessità/);
  await expect.poll(async () => (await readFields(FOOD_DOC)).spendingRole?.stringValue).toBe('need');

  // Forward to the same Analisi: its categories were invalidated by the write, so the role is there.
  await page.goForward();
  await expect(roleNode('Necessità')).toHaveCount(1, { timeout: 30_000 });
});
