/**
 * A modal that grows from its trigger wears ONE `transform-origin`, the trigger's centre, from
 * its first frame to its last — open AND close (doc/guide/dialog.md §
 * `triggerOrigin` is resolved AT THE CLICK, from the trigger alone).
 *
 * Until 2026-09-18 the app had three recipes. Hall of Fame and Dividendi set the origin in a
 * `requestAnimationFrame` after mount, so the dialog's own `duration-200` tweened it across the
 * zoom; Rendimenti and Impostazioni resolved it at the click but as the trigger's VIEWPORT
 * percentage applied to the dialog's BOX — no glide, the wrong point (the header button at 75%
 * of the screen became a pivot at 75% of a 420px panel); and every one of them cleared the
 * origin on close, which made the exit glide back. They all read `resolveCenteredModalOrigin`
 * now. This pins the recipe on Rendimenti's «Periodo personalizzato», which needs no planted
 * data on the base account; Panoramica has its own spec (`panoramica.snapshot.spec.ts`).
 */

import { test, expect } from '@playwright/test';

test('Rendimenti: the custom-period modal keeps ONE origin, the button’s centre, through open and close', async ({ page }) => {
  await page.goto('/dashboard/performance');
  const button = page.getByRole('button', { name: /personalizzat/i }).filter({ visible: true }).first();
  await expect(button).toBeEnabled({ timeout: 30_000 });
  // The button is enabled from the page's first frame, and for ~250 ms after it the header is still
  // on its entrance glide (4px, measured frame by frame on 2026-10-04: y 26 → 22): a box read then
  // is up to 4px off the centre the click will see — the 3,3–3,5px this spec failed by in two full
  // runs that day. So the page's verdict first (the data, or its absence, has landed: no later
  // reflow), then a box that two reads 100 ms apart agree on.
  await expect(page.getByRole('region', { name: 'Verdetto sui rendimenti' })).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => {
      const first = await button.boundingBox();
      await page.waitForTimeout(100);
      const second = await button.boundingBox();
      return first && second ? Math.abs(first.x - second.x) + Math.abs(first.y - second.y) : Number.NaN;
    })
    .toBe(0);
  const box = (await button.boundingBox())!;

  await page.evaluate(() => {
    const frames: { origin: string; state: string | null }[] = [];
    (window as unknown as { __frames: typeof frames }).__frames = frames;
    const start = performance.now();
    const tick = () => {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) frames.push({ origin: getComputedStyle(dialog).transformOrigin, state: dialog.getAttribute('data-state') });
      if (performance.now() - start < 2600) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await button.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(900);
  // The geometry is read while the panel is open and settled: a closing panel is at scale 0.95
  // and its painted box is displaced by 0.05 × its distance from the pivot.
  const dialogBox = (await dialog.boundingBox())!;
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const frames = await page.evaluate(() => (window as unknown as { __frames: { origin: string; state: string | null }[] }).__frames);
  // The close was sampled too, or the «through the close» half of the claim was never looked at.
  expect(frames.some((frame) => frame.state === 'closed')).toBe(true);
  const origins = [...new Set(frames.map((frame) => frame.origin))];
  expect(origins, origins.join(' | ')).toHaveLength(1);

  const [originX, originY] = origins[0].split(' ').map(parseFloat);
  expect(Math.abs(dialogBox.x + originX - (box.x + box.width / 2))).toBeLessThan(2);
  expect(Math.abs(dialogBox.y + originY - (box.y + box.height / 2))).toBeLessThan(2);
});
