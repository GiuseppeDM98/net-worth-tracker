/**
 * The Egeo costume specs' shared setup (a helper, not a spec: the FILENAME chooses the project —
 * `theme.egeo.spec.ts` runs at 1440, `theme.egeo.mobile.spec.ts` at 390).
 *
 * THE TRAP (doc/guide/temi.md § Il costume, `e2e/motion.layout.spec.ts`): the account's `colorTheme`
 * overrides `localStorage` once signed in, so a spec that needs Egeo writes the preference on the
 * emulator's account and puts back what it read. `addInitScript` alone holds only the first frame.
 * The account is the base one, shared by the whole suite: `restoreColorTheme` runs in `afterAll`.
 */
import { expect, type Page } from '@playwright/test';

const PREFERENCES_DOC =
  'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents/userPreferences/test-user-1';
const HEADERS = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
/** `COLOR_THEME_STORAGE_KEY` in lib/constants/colorTheme.ts (a spec cannot import `lib/`). */
const COLOR_THEME_STORAGE_KEY = 'color-theme';
/** next-themes' own storage key: the mode before the first paint. */
const MODE_STORAGE_KEY = 'theme';

/** What the account kept before the spec: a theme name, or `null` for «no field» (the default theme). */
let original: string | null | undefined;

async function patchColorTheme(value: string | null): Promise<void> {
  const res = await fetch(`${PREFERENCES_DOC}?updateMask.fieldPaths=colorTheme`, {
    method: 'PATCH',
    headers: HEADERS,
    // An empty `fields` with the mask removes the field.
    body: JSON.stringify({ fields: value === null ? {} : { colorTheme: { stringValue: value } } }),
  });
  if (!res.ok) throw new Error(`userPreferences/test-user-1 PATCH answered ${res.status}`);
}

/** Reads the account's theme once (the first call of the file), then writes `theme`. */
export async function setAccountColorTheme(theme: string): Promise<void> {
  if (original === undefined) {
    const res = await fetch(PREFERENCES_DOC, { headers: HEADERS });
    // A 404 is an account with no preferences: the default theme, which the sync never writes.
    const doc = res.ok ? ((await res.json()) as { fields?: { colorTheme?: { stringValue?: string } } }) : null;
    original = doc?.fields?.colorTheme?.stringValue ?? null;
  }
  await patchColorTheme(theme);
}

/** Puts back what `setAccountColorTheme` read: the value, or no field. */
export async function restoreColorTheme(): Promise<void> {
  if (original === undefined) return;
  await patchColorTheme(original);
  original = undefined;
}

/** The theme and the mode on `<html>` before the first frame, for the signed-in and the signed-out pages alike. */
export async function startWith(page: Page, theme: string, mode: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(
    ({ themeKey, modeKey, theme, mode }) => {
      localStorage.setItem(themeKey, theme);
      localStorage.setItem(modeKey, mode);
    },
    { themeKey: COLOR_THEME_STORAGE_KEY, modeKey: MODE_STORAGE_KEY, theme, mode },
  );
}

/** The page's own heading is in and its skeletons are gone. */
export async function settle(page: Page): Promise<void> {
  await expect(page.locator('main h1').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('main [data-slot="skeleton"]')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(600);
}

/** The computed style of the first element matching `selector`, as plain strings. */
export function styleOf(page: Page, selector: string, properties: readonly string[]): Promise<Record<string, string> | null> {
  return page.evaluate(
    ({ selector, properties }) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
    },
    { selector, properties: [...properties] },
  );
}
