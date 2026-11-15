/**
 * Patrimonio «Intestatari» at 390: the twin of `ring-chart.owners.spec.ts`. The tile is a closed row
 * below `desktop:`, so its trigger is pressed first and the «Valore | Carico» switch is read inside the
 * open panel; on «Valore» and on «Carico» (the owner on the mirror tour, 2026-11-15) the ring's figure
 * stays INSIDE its hole (The Ring Rule, 2026-11-12); «Valore» is pressed back for the next spec. Seen
 * red on 2026-11-15 with the figure drawn at three times its font size (`ring-chart.tsx`): it leaves the hole.
 */

import { test, expect } from '@playwright/test';
import { expectRingFiguresInside } from './ringFit';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test('Intestatari at 390: a ring on «Valore» and on «Carico», inside its hole', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/dashboard/assets');
  const trigger = page.locator('#patrimonio-intestatari-trigger');
  await trigger.waitFor({ timeout: 60_000 });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  const tile = page.getByRole('region', { name: 'Intestatari' });
  const basis = tile.getByRole('group', { name: 'Base delle quote' });
  await expect(basis.getByRole('button', { name: 'Valore' })).toHaveAttribute('aria-pressed', 'true');
  await expectRingFiguresInside(tile);

  await basis.getByRole('button', { name: 'Carico' }).click();
  await expect(tile.getByRole('list', { name: 'Prezzo di carico per intestatario' })).toBeVisible();
  await expect(tile.locator('[data-ring] svg')).toHaveAttribute('aria-label', /^Prezzo di carico per intestatario: .*; carico /);
  await expectRingFiguresInside(tile);

  await basis.getByRole('button', { name: 'Valore' }).click();
  await expect(tile.locator('[data-ring]')).toHaveCount(1);
});
