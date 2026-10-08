/**
 * At 1440 — no layout work at mount that nobody sees (2026-10-08).
 *
 * 1. The Panoramica's period switch moves nothing: `layout-shift` 0. The page used to sit in a
 *    `motion.div layout="position"` that Framer measured before and after EVERY commit of the
 *    page; it is a plain `div` now, and the switch must still shift nothing. Positive anchor: the
 *    same observer, in the same test, counts a shift induced by hand — so a 0 is a measured 0.
 * 2. The bottom nav is in the prerendered shell at every width but hidden at 1440; its `layout`
 *    and the active pill's `layoutId` are on only in portrait below 1440. Here a client navigation
 *    must not measure ANY of its nodes (Framer measures through `getBoundingClientRect`, spied).
 *    The positive control is `motion.layout.mobile.spec.ts`, where the same spy counts > 0.
 * 3. The chart palette is read ONCE, by `ChartColorsProvider` in the dashboard layout: a client
 *    navigation to Storico and to FIRE reads no `--chart-*` / `--role-*` token — every host of
 *    `useChartColors` used to read them on mount and render a second time. Anchor: the hard load
 *    before it reads them (the provider), so the spy is live. The spy counts the TOKENS, not
 *    `getComputedStyle(<html>)`: Next's router reads that twice per navigation for its scroll
 *    handling (`getScrollPaddingTop`, measured 2026-10-08).
 * 4. The tile cascade plays the first time the grid renders in a session and not on a later
 *    opening (owner's call, 2026-10-08: ~1 s of semi-transparent figures at every return).
 *
 * Seen red (2026-10-08): (2) with the media query inverted in `BottomNavigation.tsx`; (3) with
 * `ChartColorsProvider` taken out of `app/dashboard/layout.tsx` (the hooks fall back to reading
 * the theme per host: 85 token reads); (4) with the cascade forced on every opening (the second
 * opening's least opaque cell read 0). (1) is a regression guard: the period switch shifted
 * nothing with the old wrapper either.
 */

import { test, expect, type Page } from '@playwright/test';

/** Counters installed before any page script, on every document. */
function installSpies() {
  const spy = { paletteTokenReads: 0, bottomNavMeasures: 0 };
  (window as unknown as { __perf14: typeof spy }).__perf14 = spy;

  const getPropertyValue = CSSStyleDeclaration.prototype.getPropertyValue;
  CSSStyleDeclaration.prototype.getPropertyValue = function (this: CSSStyleDeclaration, property: string) {
    if (property.startsWith('--chart-') || property.startsWith('--role-')) spy.paletteTokenReads++;
    return getPropertyValue.call(this, property);
  };

  const getBoundingClientRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    // The bottom nav is the only <nav> labelled so: the sidebar's twin is a div with the role.
    if (this.closest('nav[aria-label="Navigazione principale"]')) spy.bottomNavMeasures++;
    return getBoundingClientRect.call(this);
  };

  // Layout shifts, counted from the first frame (`buffered` is not supported for this entry type
  // in every engine, so the observer is installed before the page exists).
  (window as unknown as { __shifts: number }).__shifts = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
      (window as unknown as { __shifts: number }).__shifts += entry.value;
    }
  }).observe({ type: 'layout-shift' });
}

const readSpies = (page: Page) =>
  page.evaluate(() => ({ ...(window as unknown as { __perf14: { paletteTokenReads: number; bottomNavMeasures: number } }).__perf14 }));

const resetSpies = (page: Page) =>
  page.evaluate(() => {
    const spy = (window as unknown as { __perf14: { paletteTokenReads: number; bottomNavMeasures: number } }).__perf14;
    spy.paletteTokenReads = 0;
    spy.bottomNavMeasures = 0;
  });

/** The visible heading of the page in `main` (the header mounts its h1 twice). */
const heading = (page: Page) => page.locator('main h1').filter({ visible: true }).first();

/** Wait for a page's own heading and for its skeletons to be gone. */
async function waitForPage(page: Page, title: RegExp) {
  await expect(heading(page)).toHaveText(title, { timeout: 30_000 });
  await expect(page.locator('main [data-slot="skeleton"]')).toHaveCount(0, { timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installSpies);
});

test('the Panoramica period switch shifts nothing — and the observer does count a real shift', async ({ page }) => {
  await page.goto('/dashboard');
  const periods = page.getByRole('radiogroup', { name: 'Periodo del grafico' });
  await expect(periods).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('main [data-slot="skeleton"]')).toHaveCount(0, { timeout: 30_000 });
  // Past the entrance: the tiles' stagger and the hero's count-up settle in about a second.
  await page.waitForTimeout(1_500);

  // Positive anchor: a shift induced by hand is counted by this very observer.
  await page.evaluate(() => ((window as unknown as { __shifts: number }).__shifts = 0));
  await page.evaluate(() => {
    const heroTile = document.querySelector('[aria-label="Periodo del grafico"]')?.closest<HTMLElement>('section');
    if (heroTile) heroTile.style.marginTop = '120px';
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shifts: number }).__shifts)).toBeGreaterThan(0);
  await page.evaluate(() => {
    const heroTile = document.querySelector('[aria-label="Periodo del grafico"]')?.closest<HTMLElement>('section');
    if (heroTile) heroTile.style.marginTop = '';
  });
  await page.waitForTimeout(300);

  // The test: switch to every other period, one after the other — no shift at all.
  await page.evaluate(() => ((window as unknown as { __shifts: number }).__shifts = 0));
  const options = periods.getByRole('radio');
  const count = await options.count();
  expect(count).toBeGreaterThan(1);
  for (let i = 0; i < count; i++) {
    const option = options.nth(i);
    if ((await option.getAttribute('aria-checked')) === 'true') continue;
    await option.click();
    await expect(option).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(600);
  }
  expect(await page.evaluate(() => (window as unknown as { __shifts: number }).__shifts)).toBe(0);
});

test('at 1440 a client navigation measures no node of the hidden bottom nav', async ({ page }) => {
  await page.goto('/dashboard');
  await waitForPage(page, /./);
  // The pill is in the DOM, hidden by CSS: the absence below is about its MEASURE, not its presence.
  await expect(page.locator('nav[aria-label="Navigazione principale"]')).toBeHidden();
  await expect(page.locator('nav[aria-label="Navigazione principale"]')).toHaveCount(1);

  await resetSpies(page);
  await page.getByRole('link', { name: 'Storico', exact: true }).filter({ visible: true }).first().click();
  await page.waitForURL('**/dashboard/history');
  await waitForPage(page, /./);
  await page.getByRole('link', { name: 'Hall of Fame', exact: true }).filter({ visible: true }).first().click();
  await page.waitForURL('**/dashboard/hall-of-fame');
  await waitForPage(page, /./);

  expect((await readSpies(page)).bottomNavMeasures).toBe(0);
});

test('the chart palette is read once per theme: a client navigation to Storico and FIRE reads none', async ({ page }) => {
  await page.goto('/dashboard');
  await waitForPage(page, /./);
  // Anchor: the provider has read the palette's tokens on this hard load.
  expect((await readSpies(page)).paletteTokenReads).toBeGreaterThan(0);

  await resetSpies(page);
  await page.getByRole('link', { name: 'Storico', exact: true }).filter({ visible: true }).first().click();
  await page.waitForURL('**/dashboard/history');
  await waitForPage(page, /./);
  // Storico draws its charts with the palette (Composizione at least): give the old per-host
  // rAF a frame to happen if it were still there.
  await expect(page.locator('main svg.recharts-surface').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);

  await page.getByRole('link', { name: 'FIRE e Simulazioni', exact: true }).filter({ visible: true }).first().click();
  await page.waitForURL('**/dashboard/fire-simulations');
  await waitForPage(page, /./);
  await page.waitForTimeout(500);

  expect((await readSpies(page)).paletteTokenReads).toBe(0);
});

test('the tile cascade plays on the first opening of the session only', async ({ page }) => {
  // Every frame, the LEAST opaque grid cell (its own opacity, not its ancestors': the page scene
  // and the template's fade are not the cascade).
  await page.addInitScript(() => {
    const probe = { minOpacity: null as number | null };
    (window as unknown as { __cascade: typeof probe }).__cascade = probe;
    const tick = () => {
      const grid = document.querySelector('[aria-label="Periodo del grafico"]')?.closest('section')?.parentElement?.parentElement;
      if (grid) {
        const least = Math.min(...Array.from(grid.children).map((cell) => Number(getComputedStyle(cell).opacity)));
        probe.minOpacity = probe.minOpacity === null ? least : Math.min(probe.minOpacity, least);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const minOpacity = () => page.evaluate(() => (window as unknown as { __cascade: { minOpacity: number | null } }).__cascade.minOpacity);
  const periods = page.getByRole('radiogroup', { name: 'Periodo del grafico' });

  // First opening: the cells start transparent and cascade in.
  await page.goto('/dashboard');
  await expect(periods).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_500);
  expect(await minOpacity()).toBeLessThan(0.5);

  // Away and back through the sidebar: the same JS session, the cells opaque from their first frame.
  await page.getByRole('link', { name: 'Storico', exact: true }).filter({ visible: true }).first().click();
  await page.waitForURL('**/dashboard/history');
  await expect(page.locator('main h1').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => ((window as unknown as { __cascade: { minOpacity: number | null } }).__cascade.minOpacity = null));
  await page.getByRole('link', { name: 'Panoramica', exact: true }).filter({ visible: true }).first().click();
  await expect(periods).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_500);
  expect(await minOpacity()).toBe(1);
});

test('the light/dark circle covers the whole page: no named region during a theme change', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('radiogroup', { name: 'Periodo del grafico' })).toBeVisible({ timeout: 30_000 });
  // Every frame, the pseudo-elements animated while the theme scene runs.
  await page.evaluate(() => {
    const seen = new Set<string>();
    (window as unknown as { __vtGroups: Set<string> }).__vtGroups = seen;
    const tick = () => {
      if (document.documentElement.dataset.vt === 'theme') {
        for (const animation of document.getAnimations()) {
          const pseudo = (animation.effect as KeyframeEffect | null)?.pseudoElement;
          if (pseudo) seen.add(pseudo);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // The picker sits in the profile menu of the sidebar's footer.
  await page.locator('[data-sidebar="footer"] button').filter({ visible: true }).first().click();
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  await page.locator(`button[title="${isDark ? 'Chiaro' : 'Scuro'}"]`).filter({ visible: true }).first().click();
  await page.waitForTimeout(1_000);
  const groups = await page.evaluate(() => [...(window as unknown as { __vtGroups: Set<string> }).__vtGroups]);
  // Anchor: the circle itself ran.
  expect(groups).toContain('::view-transition-new(root)');
  expect(groups.filter((pseudo) => /page-(main|header|verdict)/.test(pseudo))).toEqual([]);
});
