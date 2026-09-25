/**
 * Panoramica › «Crea snapshot» at 1440 — the press and the confirm it opens.
 *
 * Two animations used to overlap on that click (measured frame by frame on 2026-09-18, after
 * the owner called it «strana»): the button sat in the app's only `whileTap` wrapper, on the
 * soft spring kept for whole regions, and the confirm received its `transform-origin` one frame
 * AFTER mounting — which the dialog's `duration-200` (with `transition-property` left at `all`)
 * turned into a pivot GLIDING from the centre to the button across the whole zoom. This pins
 * the fix: the button does not change size under a press, and the confirm wears ONE origin,
 * the trigger's, from its first frame to its last — the CLOSE included, because clearing the
 * origin on close makes the exit glide the other way (`e2e/modal.origin.spec.ts` pins the same
 * on a page that used to resolve the wrong point).
 *
 * Writes nothing: the «a snapshot already exists» flag is forced on the overview RESPONSE, so
 * the spec does not depend on which month the base fixture was seeded in (without the flag the
 * click would CREATE a snapshot), and «Sovrascrivi» is never pressed.
 */

import { test, expect } from '@playwright/test';

test('«Crea snapshot» does not squish, and its confirm grows from ONE origin — the button', async ({ page }) => {
  await page.route('**/api/dashboard/overview*', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, flags: { ...body.flags, currentMonthSnapshotExists: true } } });
  });
  await page.goto('/dashboard');
  // The header mounts its actions twice (desktop row, phone navbar): the visible copy is the one.
  const button = page.getByRole('button', { name: 'Crea snapshot' }).filter({ visible: true }).first();
  await expect(button).toBeEnabled({ timeout: 30_000 });

  // Sample every frame from before the press: the first frames of the dialog are the ones that lied.
  await page.evaluate(() => {
    const frames: { width: number; origin: string | null }[] = [];
    (window as unknown as { __frames: typeof frames }).__frames = frames;
    const pressed = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label="Crea snapshot"]')).find((b) => b.offsetWidth > 0)!;
    const start = performance.now();
    const tick = () => {
      const dialog = document.querySelector('[role="dialog"]');
      frames.push({
        width: Math.round(pressed.getBoundingClientRect().width * 100) / 100,
        origin: dialog ? getComputedStyle(dialog).transformOrigin : null,
      });
      if (performance.now() - start < 2600) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /^Sovrascrivi lo snapshot di \p{Ll}+$/u })).toBeVisible();
  // Read the geometry while the panel is open and settled, then close INSIDE the sampling window.
  await page.waitForTimeout(900);
  const dialogBox = (await dialog.boundingBox())!;
  await dialog.getByRole('button', { name: 'Annulla' }).click();
  await expect(dialog).toBeHidden();
  const frames = await page.evaluate(() => (window as unknown as { __frames: { width: number; origin: string | null }[] }).__frames);

  // ONE origin over the dialog's whole life, and not the default centre of its own box.
  const origins = [...new Set(frames.map((frame) => frame.origin).filter((origin): origin is string => origin !== null))];
  expect(origins, origins.join(' | ')).toHaveLength(1);
  const [originX, originY] = origins[0].split(' ').map(parseFloat);
  expect(Math.abs(dialogBox.x + originX - (box.x + box.width / 2))).toBeLessThan(2);
  expect(Math.abs(dialogBox.y + originY - (box.y + box.height / 2))).toBeLessThan(2);

  // The button never changed size under the press.
  expect([...new Set(frames.map((frame) => frame.width))]).toHaveLength(1);

  // «Annulla» gave the focus back to the copy that was pressed.
  await expect(button).toBeFocused();
});
