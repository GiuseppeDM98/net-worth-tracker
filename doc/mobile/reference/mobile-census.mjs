/**
 * Small-screen census, session 2026-09-26 (the throwaway that measured the baseline in doc/mobile/README.md § 3;
 * MOB-01 ports it into scripts/ as `npm run mobile:census`). Kept here as the reference until then.
 *
 * For every dashboard surface (route or tab) at three small viewports — 390×844 phone, 768×1024
 * tablet portrait, 1024×768 tablet landscape — after a real login on the emulator dev server:
 *   - how long the page is (screens of scroll in `main`, the app's scroll container)
 *   - how many tiles, which of them start above the fold, how tall each is
 *   - how many figures (euro / percent) the page prints, and how many sit above the fold
 *   - words, controls, charts, tabs; whether `main` overflows sideways
 *   - two screenshots: the first screen, and the whole page (main unclipped)
 * Structure only: timings are not measured here (dev server, doc/perf has the baseline).
 *
 * Usage: node .tmp-mobile-measure.mjs [--email=mirror@example.com] [--base=http://localhost:3000]
 *        [--out=<dir>] [--viewports=390,768,1024] [--surfaces=panoramica,storico]
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true']; }));
const EMAIL = args.email ?? 'mirror@example.com';
const PASSWORD = 'test1234';
const BASE = args.base ?? 'http://localhost:3000';
const OUT = args.out ?? '.tmp-mobile-measure';
const VIEWPORTS = {
  390: { width: 390, height: 844, label: 'phone' },
  768: { width: 768, height: 1024, label: 'tablet-portrait' },
  1024: { width: 1024, height: 768, label: 'tablet-landscape' },
};
const VP_KEYS = (args.viewports ?? '390,768,1024').split(',').map(Number);

const ALL_SURFACES = [
  { key: 'panoramica', path: '/dashboard' },
  { key: 'patrimonio', path: '/dashboard/assets' },
  { key: 'cashflow-tracciamento', path: '/dashboard/cashflow?tab=tracking' },
  { key: 'cashflow-budget', path: '/dashboard/cashflow?tab=budget' },
  { key: 'cashflow-centri', path: '/dashboard/cashflow?tab=cost-centers' },
  { key: 'cashflow-divisione', path: '/dashboard/cashflow?tab=split' },
  { key: 'cashflow-dividendi', path: '/dashboard/cashflow?tab=dividends' },
  { key: 'analisi', path: '/dashboard/analisi' },
  { key: 'rendimenti', path: '/dashboard/performance' },
  { key: 'storico', path: '/dashboard/history' },
  { key: 'allocazione', path: '/dashboard/allocation' },
  { key: 'previdenza', path: '/dashboard/pension' },
  // FIRE keeps its tab in state, not in the URL: the tab is pressed after the page settles.
  { key: 'fire-calcolatore', path: '/dashboard/fire-simulations' },
  { key: 'fire-coast', path: '/dashboard/fire-simulations', tab: 'Coast FIRE' },
  { key: 'fire-what-if', path: '/dashboard/fire-simulations', tab: 'What If' },
  { key: 'fire-monte-carlo', path: '/dashboard/fire-simulations', tab: 'Monte Carlo' },
  { key: 'fire-obiettivi', path: '/dashboard/fire-simulations', tab: 'Obiettivi' },
  { key: 'hall-of-fame', path: '/dashboard/hall-of-fame' },
  { key: 'impostazioni', path: '/dashboard/settings' },
];
const SURFACES = args.surfaces ? ALL_SURFACES.filter((s) => args.surfaces.split(',').includes(s.key)) : ALL_SURFACES;

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 120_000 });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 120_000 });
  await page.locator('main').waitFor({ timeout: 120_000 });
}

/** Settled = heading present, no skeleton left, and the count-ups had time to land. */
async function waitForSettled(page, timeoutMs) {
  const t0 = Date.now();
  let sawFigure = false;
  while (Date.now() - t0 < timeoutMs) {
    const s = await page.evaluate(() => {
      const main = document.querySelector('main');
      const skeleton = [...document.querySelectorAll('[data-slot="skeleton"]')].some((el) => el.checkVisibility());
      return { h1: !!document.querySelector('main h1, h1'), skeleton, euro: /\d\s?€/.test(main?.textContent ?? '') };
    });
    if (s.euro) sawFigure = true;
    if (s.h1 && !s.skeleton && (s.euro || Date.now() - t0 > 8000)) {
      await page.waitForTimeout(3000); // count-ups (~1 s) and chart scheduling
      return { settled: true, sawFigure };
    }
    await page.waitForTimeout(150);
  }
  return { settled: false, sawFigure };
}

/** Runs in the page: the census of `main`, everything relative to main's scroll box. */
const CENSUS = () => {
  const main = document.querySelector('main');
  const mainRect = main.getBoundingClientRect();
  const fold = main.clientHeight; // the first screen of the scroller
  const top = (el) => el.getBoundingClientRect().top - mainRect.top + main.scrollTop;
  const visible = (el) => el.checkVisibility() && el.getBoundingClientRect().height > 0;
  const FIGURE = /\d[\d.,]*\s?(?:€|%)/g;

  const tiles = [...main.querySelectorAll('section.rounded-2xl')].filter(visible).map((el) => {
    const r = el.getBoundingClientRect();
    const eyebrow = el.querySelector('h3')?.textContent?.trim() ?? '';
    const figures = ((el.innerText || '').match(FIGURE) || []).length;
    return { eyebrow, top: Math.round(top(el)), height: Math.round(r.height), figures, words: (el.innerText || '').split(/\s+/).filter(Boolean).length };
  });
  const verdictEl = [...main.querySelectorAll('section')].find((el) => el.style.viewTransitionName === 'page-verdict');
  const verdict = verdictEl ? { text: verdictEl.querySelector('h2')?.innerText ?? '', top: Math.round(top(verdictEl)), height: Math.round(verdictEl.getBoundingClientRect().height) } : null;
  const stickyHeader = [...main.querySelectorAll('div')].find((el) => (el.className || '').includes('max-desktop:sticky'));
  const headerHeight = stickyHeader ? Math.round(stickyHeader.getBoundingClientRect().height) : null;

  // Figures and words above the fold: text nodes whose parent starts inside the first screen.
  let figuresTotal = 0, figuresAbove = 0, wordsTotal = 0, wordsAbove = 0;
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || !visible(parent)) continue;
    if (parent.closest('.sr-only')) continue;
    const text = node.textContent || '';
    const f = (text.match(FIGURE) || []).length;
    const w = text.split(/\s+/).filter(Boolean).length;
    const above = top(parent) < fold;
    figuresTotal += f; wordsTotal += w;
    if (above) { figuresAbove += f; wordsAbove += w; }
  }
  const controls = [...main.querySelectorAll('button, a[href], [role="tab"], [role="button"], input, select, textarea')].filter(visible);
  const charts = [...main.querySelectorAll('svg.recharts-surface, svg[role="img"]')].filter(visible).length;
  const tablists = [...main.querySelectorAll('[role="tablist"]')].filter(visible).map((t) => t.querySelectorAll('[role="tab"]').length);

  return {
    h1: document.querySelector('main h1, h1')?.innerText ?? '',
    scroller: { scrollHeight: main.scrollHeight, clientHeight: fold, scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
    screens: Number((main.scrollHeight / fold).toFixed(2)),
    overflowsX: main.scrollWidth > main.clientWidth,
    headerHeight,
    verdict,
    tiles,
    tilesAboveFold: tiles.filter((t) => t.top < fold).length,
    tilesFullyAboveFold: tiles.filter((t) => t.top + t.height <= fold).length,
    figures: { total: figuresTotal, aboveFold: figuresAbove },
    words: { total: wordsTotal, aboveFold: wordsAbove },
    controls: { total: controls.length, aboveFold: controls.filter((c) => top(c) < fold).length },
    charts,
    tablists,
  };
};

/** Unclip the scroller so a full-page screenshot shows the whole page. Called AFTER the census. */
const UNCLIP = () => {
  let el = document.querySelector('main');
  while (el && el !== document.body) {
    el.style.overflow = 'visible';
    el.style.height = 'auto';
    el.style.maxHeight = 'none';
    el.style.minHeight = '0';
    el = el.parentElement;
  }
  document.body.style.overflow = 'visible';
  document.body.style.height = 'auto';
  document.documentElement.style.overflow = 'visible';
  document.documentElement.style.height = 'auto';
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const vpKey of VP_KEYS) {
  const vp = VIEWPORTS[vpKey];
  const dir = join(OUT, `${vpKey}`);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'it-IT' });
  const page = await context.newPage();
  await login(page);
  for (const surface of SURFACES) {
    await page.goto(`${BASE}${surface.path}`, { waitUntil: 'load', timeout: 120_000 });
    let settle = await waitForSettled(page, 60_000);
    if (surface.tab) {
      await page.locator(`main [role="tab"][aria-label="${surface.tab}"]`).first().click();
      settle = await waitForSettled(page, 60_000);
    }
    const census = await page.evaluate(CENSUS);
    await page.screenshot({ path: join(dir, `${surface.key}-fold.png`) });
    await page.evaluate(UNCLIP);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(dir, `${surface.key}-full.png`), fullPage: true });
    const row = { viewport: vpKey, label: vp.label, ...surface, ...settle, ...census };
    results.push(row);
    console.log(`[${vpKey}] ${surface.key.padEnd(22)} screens=${census.screens} tiles=${census.tiles.length} (above fold ${census.tilesAboveFold}, fully ${census.tilesFullyAboveFold}) figures=${census.figures.total}/${census.figures.aboveFold} words=${census.words.total}/${census.words.aboveFold} controls=${census.controls.total}/${census.controls.aboveFold} charts=${census.charts} tabs=${census.tablists.join('+') || '-'} overflowX=${census.overflowsX} settled=${settle.settled}`);
  }
  await context.close();
}
await browser.close();
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ email: EMAIL, base: BASE, at: new Date().toISOString(), results }, null, 2));
console.log(`\nwritten ${join(OUT, 'results.json')} (+ ${results.length * 2} screenshots)`);
