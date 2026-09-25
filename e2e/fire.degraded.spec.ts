/**
 * Calcolatore FIRE — the «nothing recorded» state keeps its four tiles and offers ONE action.
 *
 * WHY THIS SPEC: until 2026-09-22 an account without expenses (or without a positive net worth)
 * saw the verdict, the two disclosures and NO tile — the verdict said «Servono spese registrate
 * nel Cashflow» and nothing led there. The base fixture has data, so the branch was never
 * rendered by a spec; the degraded account has no cashflow rows at all, so it lands here on every
 * run whatever pension scenario the Previdenza specs left behind. The spec asserts STRUCTURE
 * (which of the two empty headlines, four regions, exactly one link and where it goes), never a
 * figure: which branch it is depends on whether the last pension scenario left a fund.
 *
 * Falsified 2026-09-22 by rendering the old branch (no tiles): «Traguardo FIRE» not found.
 */

import { test, expect } from '@playwright/test';

/** The two headlines `buildFireVerdict` produces when it has nothing to measure. */
const EMPTY_HEADLINE = /^(Nessun patrimonio FIRE|Numero FIRE non calcolabile)\.$/;

test('without cashflow the four tiles keep their question and only the Traguardo links out', async ({ page }) => {
  await page.goto('/dashboard/fire-simulations');
  const verdict = page.getByRole('region', { name: 'Verdetto sul FIRE' });
  await expect(verdict.getByRole('heading', { level: 2 })).toHaveText(EMPTY_HEADLINE, { timeout: 30_000 });

  // The Absence-Has-Three-Names Rule: the eyebrow stays exactly when the tile cannot answer.
  const traguardo = page.getByRole('region', { name: 'Traguardo FIRE' });
  await expect(traguardo).toBeVisible();
  for (const name of ['Base di calcolo del FIRE', 'Reddito passivo sostenibile', 'Scenari di mercato']) {
    await expect(page.getByRole('region', { name })).toBeVisible();
  }

  // ONE action, on the tile that owns the missing thing, pointing at the page that records it.
  const links = traguardo.getByRole('link');
  await expect(links).toHaveCount(1);
  const headline = await verdict.getByRole('heading', { level: 2 }).textContent();
  const expectedHref = headline?.startsWith('Nessun patrimonio') ? '/dashboard/assets' : '/dashboard/cashflow';
  await expect(links.first()).toHaveAttribute('href', expectedHref);
  await expect(page.getByRole('region', { name: 'Base di calcolo del FIRE' }).getByRole('link')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Scenari di mercato' }).getByRole('link')).toHaveCount(0);

  // The settings stay reachable from the empty state.
  await expect(page.getByRole('button', { name: /^Parametri/ })).toBeVisible();

  // No figure is invented: no euro amount in the Traguardo or the Scenari tile.
  await expect(traguardo.getByText(/\d\s?€/)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Scenari di mercato' }).getByText(/\d{4}/)).toHaveCount(0);
});
