/**
 * Cashflow › Divisione «Quota» at 1440: the incomes the shares are measured on are a ring (The Ring
 * Rule, 2026-11-12) whose figure stays INSIDE its hole (`expectRingFiguresInside`). The words and the
 * parts are Vitest's (`expenseSplitSummary.test.ts` D1, `splitQuotaBody.test.tsx` D2). The account is
 * `scripts/seedSplitE2E.mts`, on «Quest'anno» as `cashflow.split.spec.ts` picks it; its 390 twin is
 * `ring-chart.split.mobile.spec.ts`. Seen red on 2026-11-15 with the figure drawn at three times
 * its font size (`ring-chart.tsx`): it leaves the hole.
 */

import { test, expect } from '@playwright/test';
import { expectRingFiguresInside } from './ringFit';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test('Divisione: the Quota’s ring holds its figure inside its hole', async ({ page }) => {
  await page.goto('/dashboard/cashflow?tab=split');
  await expect(page.getByRole('heading', { name: 'In comune' })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('combobox', { name: /Periodo selezionato/ }).click();
  await page.getByRole('button', { name: "Quest'anno", exact: true }).click();
  await expectRingFiguresInside(page.getByRole('region', { name: 'Quota' }));
});
