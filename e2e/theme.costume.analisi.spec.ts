/**
 * The Analisi flow under a costume (DESIGN.md → The Costume Rule, doc/guide/cashflow-analisi.md, 2026-11-23): in a
 * costume theme the Sankey paints the types with the theme's slots — «Spese Necessarie» in `--chart-1`, as the
 * ring beside it — and in a palette theme with the hexes it always had (`#3b82f6` for the fixed type).
 *
 * The FILENAME picks the project: `…analisi.spec.ts` runs on the Analisi fixture account, whose period holds
 * expenses. The theme is written on THAT account's preferences and put back (`e2e/themeEgeo.ts`).
 *
 * The token you author is not the token the browser returns: the slot is read as a probe's computed colour in the
 * page and converted here with `colorToHex`, the function `ChartColorsProvider` hands Nivo's hexes with. Nivo
 * serialises a node's fill as it likes, so every fill goes through the same function before the comparison.
 *
 * Seen red with `FlussoTile` passing `DEFAULT_SANKEY_TYPE_PALETTE` whatever the theme.
 */
import { expect, test, type Page } from '@playwright/test';
import { colorToHex } from '../lib/utils/cssColorToHex';
import { restoreColorThemeOf, setAccountColorTheme, startWith } from './themeEgeo';
import { tokenColorIn } from './themeCostume';
import { atRest } from './atRest';

const UID = 'test-user-analisi';
/** The fixed type's hex in every palette theme (`TYPE_COLORS.fixed`, lib/utils/cashflowSankey.ts). */
const FIXED_HEX = '#3b82f6';

test.describe.configure({ mode: 'serial', timeout: 120_000 });
test.afterAll(() => restoreColorThemeOf(UID));

/** Opens «Dettaglio», waits for the type flow and returns the fill of every node, as hex. */
async function flowFills(page: Page): Promise<string[]> {
  await page.goto('/dashboard/analisi');
  await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible({ timeout: 30_000 });
  // The Flusso is the first tile of the closed, lazy «Dettaglio».
  const trigger = page.getByRole('button', { name: 'Dettaglio', exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const chart = page.getByRole('region', { name: 'Flusso', exact: true }).getByRole('img');
  await expect(chart.locator('text').filter({ hasText: /^Spese Necessarie$/ })).toHaveCount(1, { timeout: 30_000 });
  // The nodes' colours are animated in.
  await atRest(page);
  const fills = await chart.locator('rect').evaluateAll((rects) => rects.map((rect) => rect.getAttribute('fill') ?? ''));
  return fills.filter(Boolean).map((fill) => (colorToHex(fill) ?? fill).toLowerCase());
}

test('default: the flow keeps its hexes', async ({ page }) => {
  await setAccountColorTheme('default', UID);
  await startWith(page, 'default', 'light');
  const fills = await flowFills(page);
  expect(fills.length).toBeGreaterThan(3);
  expect(fills).toContain(FIXED_HEX);
});

test('egeo: the flow paints the fixed type with --chart-1, never with the palette hex', async ({ page }) => {
  await setAccountColorTheme('egeo', UID);
  await startWith(page, 'egeo', 'light');
  const fills = await flowFills(page);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('egeo');
  const slot = colorToHex(await tokenColorIn(page, '#page-main', '--chart-1'));
  expect(slot, 'the hex of --chart-1').not.toBeNull();
  expect(fills).toContain(slot!.toLowerCase());
  expect(fills).not.toContain(FIXED_HEX);
});
