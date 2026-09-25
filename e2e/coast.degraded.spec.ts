/**
 * Coast FIRE — the «nothing recorded» state keeps its three tiles and offers ONE action.
 *
 * WHY THIS SPEC: until 2026-09-23 an account whose projection could not run saw the verdict, the
 * Ipotesi disclosure and NO tile — the verdict said «Servono le spese annue…» and nothing led
 * anywhere. The base fixture has data, so the branch was never rendered by a spec; the degraded
 * account has no cashflow rows, so it lands here on every run whatever else the Previdenza specs
 * left behind. The spec asserts STRUCTURE (three regions, exactly one action on the Traguardo,
 * where it goes), never a figure: which input is the missing one depends on the account's assets
 * and saved settings, so the action is a link to Patrimonio OR a button into the Ipotesi.
 *
 * Falsified 2026-09-23 by rendering the old branch (no tiles): «Traguardo Coast FIRE» not found.
 */

import { test, expect } from '@playwright/test';

test('without a projection the three tiles keep their question and only the Traguardo acts', async ({ page }) => {
  await page.goto('/dashboard/fire-simulations', { waitUntil: 'load' });
  await page.getByRole('tab', { name: 'Coast FIRE' }).click();
  const verdict = page.getByRole('region', { name: 'Verdetto sul Coast FIRE' });
  await expect(verdict.getByRole('heading', { level: 2 })).toHaveText('Coast FIRE non calcolabile.', { timeout: 30_000 });

  // The Absence-Has-Three-Names Rule: the eyebrow stays exactly when the tile cannot answer.
  const traguardo = page.getByRole('region', { name: 'Traguardo Coast FIRE' });
  await expect(traguardo).toBeVisible();
  const afflussi = page.getByRole('region', { name: 'Afflussi già considerati' });
  const scenari = page.getByRole('region', { name: 'Scenari Coast FIRE' });
  await expect(afflussi).toBeVisible();
  await expect(scenari).toBeVisible();

  // ONE action, on the tile that owns the missing thing: a link to the page that records it, or
  // a button that opens the Ipotesi on the field that does.
  const actions = traguardo.getByRole('link').or(traguardo.getByRole('button'));
  await expect(actions).toHaveCount(1);
  await expect(afflussi.getByRole('link').or(afflussi.getByRole('button'))).toHaveCount(0);
  await expect(scenari.getByRole('link').or(scenari.getByRole('button'))).toHaveCount(0);

  // No figure is invented: no euro amount and no year in the three tiles.
  for (const tile of [traguardo, afflussi, scenari]) {
    await expect(tile.getByText(/\d\s?€/)).toHaveCount(0);
    await expect(tile.getByText(/\b\d{4}\b/)).toHaveCount(0);
  }

  const action = actions.first();
  const href = await action.getAttribute('href');
  if (href !== null) {
    expect(href).toBe('/dashboard/assets');
    return;
  }

  // A button into the form: the disclosure opens and the field it names takes the focus, so the
  // reader lands on the input and not on a panel to search.
  const ipotesi = page.getByRole('button', { name: /^Ipotesi/ }).first();
  await expect(ipotesi).toBeVisible();
  await action.click();
  await expect(ipotesi).toHaveAttribute('data-state', 'open');
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toMatch(/^coast(UseCustomExpenses|CurrentAge|RetirementAge)$/);
});
