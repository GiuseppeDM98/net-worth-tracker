/**
 * Patrimonio «Intestatari» at 1440: the owners are a ring (The Ring Rule, 2026-11-12) on «Valore» AND on
 * «Carico» (the owner on the mirror tour, 2026-11-15), each with its figure INSIDE its hole. The base
 * account names an owner through its pension fund's member, beside «In comune»
 * (doc/guide/patrimonio.md § Per-page blind spots). «Valore» is pressed back at the end: the memory
 * is per browser and every other spec expects the default. Its 390 twin is
 * `ring-chart.owners.mobile.spec.ts`. Seen red on 2026-11-15 with the figure drawn at three times
 * its font size (`ring-chart.tsx`): it leaves the hole.
 */

import { test, expect } from '@playwright/test';
import { expectRingFiguresInside } from './ringFit';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test('Intestatari: a ring on «Valore» and on «Carico», the figure inside its hole on both', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/dashboard/assets');
  const tile = page.getByRole('region', { name: 'Intestatari' });
  await tile.waitFor({ timeout: 60_000 });
  const basis = tile.getByRole('group', { name: 'Base delle quote' });
  await expect(basis.getByRole('button', { name: 'Valore' })).toHaveAttribute('aria-pressed', 'true');
  await expectRingFiguresInside(tile);

  await basis.getByRole('button', { name: 'Carico' }).click();
  await expect(tile.getByRole('list', { name: 'Prezzo di carico per intestatario' })).toBeVisible();
  await expect(tile.locator('[data-ring] svg')).toHaveAttribute('aria-label', /^Prezzo di carico per intestatario: .*; carico /);
  await expectRingFiguresInside(tile);

  await basis.getByRole('button', { name: 'Valore' }).click();
  await expect(tile.getByRole('list', { name: 'Patrimonio per intestatario' })).toBeVisible();
  await expect(tile.locator('[data-ring]')).toHaveCount(1);
});
