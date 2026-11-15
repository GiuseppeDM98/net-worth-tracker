/**
 * Centri di Costo, a centre's «Costo» at 390: the twin of `ring-chart.centri.spec.ts`. THE tile of a
 * detail never closes, so the ring sits open in its footer (The Ring Rule, 2026-11-12) and its figure
 * stays INSIDE its hole. Seen red on 2026-11-15 with the figure drawn at three times
 * its font size (`ring-chart.tsx`): it leaves the hole.
 */

import { test, expect } from '@playwright/test';
import { expectRingFiguresInside } from './ringFit';

const isLastDayOfYear = new Date().getMonth() === 11 && new Date().getDate() === 31;

test.use({ contextOptions: { reducedMotion: 'reduce' } });
test.setTimeout(120_000);

test('Ornitorinco: the ring «270 €» stays inside its hole at 390', async ({ page }) => {
  await page.goto('/dashboard/cashflow?tab=cost-centers&center=e2e-cc-ornitorinco');
  const tile = page.getByRole('region', { name: 'Costo di Ornitorinco' });
  await expect(tile).toBeVisible({ timeout: 60_000 });
  await expectRingFiguresInside(tile);
  await expect(tile.locator('[data-ring-center="hole"]')).toHaveText(/^270[\s ]*€$/);
});

test('Fenicottero: no ring at 390, the sentence instead', async ({ page }) => {
  test.skip(isLastDayOfYear, 'On December 31st the instalment is booked: fixed and one-off, a ring.');
  await page.goto('/dashboard/cashflow?tab=cost-centers&center=e2e-cc-fenicottero');
  const tile = page.getByRole('region', { name: 'Costo di Fenicottero' });
  await expect(tile.getByText('Tutto una tantum: nessuna spesa ricorrente o a rate.')).toBeVisible({ timeout: 60_000 });
  await expect(tile.locator('[data-ring]')).toHaveCount(0);
});
