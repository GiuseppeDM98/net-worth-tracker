/**
 * Cashflow › Divisione «Quota» at 390: the twin of `ring-chart.split.spec.ts` — the Quota is a closed
 * row below `desktop:`, so its trigger is pressed first; then the ring's figure stays INSIDE its hole
 * (The Ring Rule, 2026-11-12). Seen red on 2026-11-15 with the figure drawn at three times
 * its font size (`ring-chart.tsx`): it leaves the hole.
 */

import { test, expect } from '@playwright/test';
import { expectRingFiguresInside } from './ringFit';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test('Divisione: the Quota’s ring holds its figure inside its hole at 390', async ({ page }) => {
  await page.goto('/dashboard/cashflow?tab=split');
  await expect(page.getByRole('heading', { name: 'In comune' })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('combobox', { name: /Periodo selezionato/ }).click();
  await page.getByRole('button', { name: "Quest'anno", exact: true }).click();
  const trigger = page.locator('#spl-quota-trigger');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expectRingFiguresInside(page.getByRole('region', { name: 'Quota' }));
});
