/**
 * At 390 portrait — where the bottom nav IS visible, its layout animation stays (2026-10-08).
 *
 * `BottomNavigation` turns `layout` and the active pill's `layoutId` on only in portrait below 1440
 * (`useMediaQuery`, `false` on the server and during hydration). Here it must be on:
 *   1. the «+» of Cashflow › Tracciamento appears beside the pill and the pill GLIDES to make room —
 *      sampled every frame: several intermediate positions, not a jump from one place to the other;
 *   2. a client navigation measures the nav's nodes (Framer reads them through
 *      `getBoundingClientRect`, spied) — the positive control of the «0 at 1440» in
 *      `motion.layout.spec.ts`, which proves that spy counts what it claims to.
 *
 * Test 1 caught a real defect on its first run (2026-10-08): with `layout={isPillVisible}` alone the
 * pill JUMPED — the media query answers `true` only after hydration, and Framer sets up its layout
 * measuring when the element mounts — so the nav is remounted when the gate flips (its `key`).
 * Seen red (2026-10-08) with the media query inverted in `BottomNavigation.tsx`: the pill jumped
 * (two positions) and the spy counted 0.
 */

import { test, expect, type Page } from '@playwright/test';

const bottomNav = (page: Page) => page.locator('nav[aria-label="Navigazione principale"]');

async function openPanoramica(page: Page) {
  await page.goto('/dashboard');
  await expect(page.locator('main h1').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('main [data-slot="skeleton"]')).toHaveCount(0, { timeout: 30_000 });
  await expect(bottomNav(page)).toBeVisible();
  // Past hydration (the media query's real value) and the page's entrance.
  await page.waitForTimeout(1_000);
}

test('the pill glides aside when the «+» of Tracciamento appears', async ({ page }) => {
  // The browser-without-view-transitions path (Firefox's; `runViewTransition` feature-detects the
  // API): on a dev server the page scene freezes rendering while the route compiles, and the
  // spring settles inside that frozen window — the frames would read a jump whatever the code did.
  await page.addInitScript(() => {
    delete (Document.prototype as unknown as Record<string, unknown>).startViewTransition;
  });
  await openPanoramica(page);
  await expect(page.getByRole('button', { name: 'Aggiungi nuova voce' })).toHaveCount(0);

  // Every frame from before the click: the nav's left edge.
  await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Navigazione principale"]')!;
    const lefts: number[] = [];
    (window as unknown as { __lefts: number[] }).__lefts = lefts;
    const start = performance.now();
    const tick = () => {
      lefts.push(Math.round(nav.getBoundingClientRect().left * 10) / 10);
      if (performance.now() - start < 2_500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await bottomNav(page).getByRole('link', { name: 'Cashflow' }).click();
  await page.waitForURL('**/dashboard/cashflow');
  await expect(page.getByRole('button', { name: 'Aggiungi nuova voce' })).toBeVisible();
  await page.waitForTimeout(2_600);

  const lefts = await page.evaluate(() => (window as unknown as { __lefts: number[] }).__lefts);
  const first = lefts[0];
  const last = lefts[lefts.length - 1];
  // The pill moved left to make room for the 56px «+» and its 8px gap…
  expect(last).toBeLessThan(first - 20);
  // …through positions in between: a layout animation, not a re-centring in one frame.
  const between = new Set(lefts.filter((left) => left < first - 0.5 && left > last + 0.5));
  expect(between.size).toBeGreaterThanOrEqual(3);
});

test('a client navigation measures the visible nav — the control of the 0 at 1440', async ({ page }) => {
  await page.addInitScript(() => {
    const spy = { bottomNavMeasures: 0 };
    (window as unknown as { __perf14: typeof spy }).__perf14 = spy;
    const getBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.closest('nav[aria-label="Navigazione principale"]')) spy.bottomNavMeasures++;
      return getBoundingClientRect.call(this);
    };
  });
  await openPanoramica(page);
  await page.evaluate(() => ((window as unknown as { __perf14: { bottomNavMeasures: number } }).__perf14.bottomNavMeasures = 0));

  await bottomNav(page).getByRole('link', { name: 'Patrimonio' }).click();
  await page.waitForURL('**/dashboard/assets');
  await expect(page.locator('main h1').filter({ visible: true }).first()).toHaveText(/./, { timeout: 30_000 });
  await page.waitForTimeout(800);

  const { bottomNavMeasures } = await page.evaluate(() => ({ ...(window as unknown as { __perf14: { bottomNavMeasures: number } }).__perf14 }));
  expect(bottomNavMeasures).toBeGreaterThan(0);
});

test('a page scene keeps the pill above the page: its own view-transition group, not root', async ({ page }) => {
  await openPanoramica(page);
  // Every frame of the scene: the groups the browser animates, and the name the pill's container wears.
  await page.evaluate(() => {
    const seen = { groups: new Set<string>(), containerNames: new Set<string>() };
    (window as unknown as { __scene: typeof seen }).__scene = seen;
    const container = document.querySelector('nav[aria-label="Navigazione principale"]')!.parentElement!.parentElement!;
    const tick = () => {
      if (document.documentElement.dataset.vt === 'page') {
        seen.containerNames.add(getComputedStyle(container).viewTransitionName);
        for (const animation of document.getAnimations()) {
          const pseudo = (animation.effect as KeyframeEffect | null)?.pseudoElement;
          if (pseudo) seen.groups.add(pseudo);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await bottomNav(page).getByRole('link', { name: 'Patrimonio' }).click();
  await page.waitForURL('**/dashboard/assets');
  await expect(page.locator('main h1').filter({ visible: true }).first()).toHaveText(/./, { timeout: 30_000 });
  await page.waitForTimeout(800);
  const scene = await page.evaluate(() => {
    const seen = (window as unknown as { __scene: { groups: Set<string>; containerNames: Set<string> } }).__scene;
    return { groups: [...seen.groups], containerNames: [...seen.containerNames] };
  });
  // Anchor: the scene ran, and page-main — the layer that used to cover the pill — was in it.
  expect(scene.groups).toContain('::view-transition-new(page-main)');
  // The pill's container is captured as its own group, painted after page-main.
  expect(scene.containerNames).toEqual(['bottom-nav']);
});
