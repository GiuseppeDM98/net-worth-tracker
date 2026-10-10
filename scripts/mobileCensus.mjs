/**
 * mobile:census — «what does the FIRST SCREEN hold, on a phone and on a tablet?», per surface
 * (a route, or a tab of Cashflow and FIRE) at 390×844, 768×1024 and 1024×768, on the production
 * build `perf:serve` serves on :3200 (the manual: doc/guide/prima-schermata.md). `npm run mobile:budget` then holds the run against doc/mobile/budget.json.
 *
 * Ported on 2026-10-10 from the throwaway that measured the mirror on 2026-09-26
 * (doc/mobile/reference/mobile-census.mjs, the baseline of doc/mobile/README.md § 3). It stays
 * `.mjs`, run by node and not by tsx: both measuring functions below are serialised into the page
 * by `page.evaluate`, and a source transformed by tsx can carry a `__name` helper the browser does
 * not have. Seven corrections to what the throwaway got wrong:
 *   1. the first screen ends at the TOP of the bottom pill, which is `fixed` over `main` — not at
 *      `main.clientHeight` (the pill's 88px are padding at the END of the scroll); at 1024 the
 *      pill is hidden and the first screen is `main` itself, below the 49px landscape bar;
 *   2. the verdict is the `section` with `view-transition-name: page-verdict` that is ON SCREEN —
 *      Cashflow keeps Tracciamento mounted (`forceMount`), so the first one in the DOM is a
 *      hidden verdict of height 0 on every other tab;
 *   3. figures are split: inside the verdict (its scope included, README § 9 decision 13) and
 *      outside it (the strip `ul[aria-label="Le cifre del verdetto"]` counts outside), which is
 *      what The First-Screen Rule limits — and a figure whose unit is a text node of its own
 *      (`NarrativeSegments`, 2026-10-10) is ONE figure, not none;
 *   4. «visible» means ON SCREEN: `[inert]`, `.sr-only`, opacity 0, a `fixed` overlay other than
 *      the pill (the SavingsRateBadge) and every node clipped to nothing by an `overflow` ancestor
 *      (a `grid-rows-[0fr]` panel) are out;
 *   5. a tab is pressed or read by its accessible name, and a tab that is absent or does not
 *      become the selected one is `missing` — never a silent measure of Tracciamento;
 *   6. no text leaves the browser unless `--texts` (no greeting, verdict or eyebrow in the JSON),
 *      the output is gitignored, the password is an option;
 *   7. no fixed 3-second wait: the context asks for reduced motion, so the count-ups land at once
 *      (lib/utils/useCountUp.ts), and the page is settled by what it shows.
 *
 * Prerequisites, in the owner's terminals: `npm run emulators`, `npm run perf:build`,
 * `npm run perf:serve` (:3200). Usage — options ALWAYS after `--`, from Git Bash on Windows
 * (PowerShell 5.1 eats the `--`):
 *   npm run mobile:census -- --email=census@example.com     re-seeds the fixture, then measures
 *   npm run mobile:census -- --email=mirror@example.com     the owner's mirror, for the tour only
 *   npm run mobile:census -- --viewports=390 --surfaces=panoramica,cashflow-budget
 *                                                          (keys of budget.json's `surfaces` and the
 *                                                          three viewports; anything else exits 1)
 *   npm run mobile:census -- --selftest                    the measure on a known fragment, no server
 * Other options: `--password=` (default `test1234`), `--base=` (default http://localhost:3200),
 * `--texts` (adds the h1, the verdict's title and the eyebrows to the JSON — never commit it).
 * Writes `.mobile-census/last-run.json` and two screenshots per surface × viewport.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * A «figure» is a number followed by € or % (decision 7), as the baseline counted it. `\s` covers
 * the no-break spaces Intl writes before the unit (U+00A0, U+202F). A string, because it crosses
 * into `page.evaluate`, where a RegExp object would not survive the serialisation.
 */
export const FIGURE_PATTERN = '\\d[\\d.,]*\\s?(?:€|%)';

const BUDGET_PATH = 'doc/mobile/budget.json';
const OUT = '.mobile-census';
const CENSUS_ACCOUNT = 'census@example.com';
// The password every emulator account shares: MIRROR_PASSWORD of scripts/mirrorProdAccount.mts and
// TEST_PASSWORD of scripts/seedEmulator.ts.
const DEFAULT_PASSWORD = 'test1234';
const VIEWPORTS = {
  390: { width: 390, height: 844 },
  768: { width: 768, height: 1024 },
  1024: { width: 1024, height: 768 },
};
const SETTLE_TIMEOUT_MS = 60_000;
/** A page with no figure at all (FIRE › Obiettivi off) is settled after this long without one. */
const NO_FIGURE_GRACE_MS = 8_000;
/** After the page looks settled: the last commit of a chart, a layout shift of a lazy tile. */
const SETTLE_TAIL_MS = 500;
const PROFILES_ROUTE = '/api/portfolio/instrument-profiles';

// ── In the page ─────────────────────────────────────────────────────────────────────────────────
// Both functions are serialised into the page by `page.evaluate`: self-contained, no imports.

/** What the page shows right now, for the settle loop. */
export function readSettleState(figurePattern) {
  const main = document.querySelector('main');
  return {
    h1: !!document.querySelector('main h1'),
    skeleton: [...document.querySelectorAll('[data-slot="skeleton"]')].some((el) => el.checkVisibility()),
    figure: new RegExp(figurePattern).test(main?.textContent ?? ''),
    // PageHeader's freshness line («sto rileggendo…»): empty once the page's reads have landed.
    freshness: [...document.querySelectorAll('[data-freshness]')].some((el) => el.checkVisibility() && el.textContent.trim() !== ''),
  };
}

/**
 * The census of the first screen, at `main.scrollTop = 0`, in viewport coordinates.
 * Returns `{ metrics, diagnostics }`; texts only when `withTexts`.
 */
export function measureFirstScreen({ figurePattern, withTexts }) {
  const main = document.querySelector('main');
  main.scrollTo(0, 0);
  const mainRect = main.getBoundingClientRect();
  // The baseline's first screen: the scroller's own height (README § 3, kept for comparison).
  const fold = mainRect.top + main.clientHeight;
  // Correction 1: the first screen the eye gets ends at the pill's top edge.
  const nav = document.querySelector('nav[aria-label="Navigazione principale"]');
  const navRect = nav?.getBoundingClientRect();
  const pillVisible = !!nav && nav.checkVisibility() && navRect.height > 0;
  const pillTop = pillVisible ? navRect.top : mainRect.bottom;

  // Correction 4: on screen, not merely in the DOM.
  const hasFixedOverlayAncestor = (el) => {
    for (let node = el; node && node !== main; node = node.parentElement) {
      if (getComputedStyle(node).position === 'fixed' && !(pillVisible && node.contains(nav))) return true;
    }
    return false;
  };
  /** What is left of `rect` inside every clipping box from `el` up to `main` (excluded: it is the scroller). */
  const visibleArea = (el, rect) => {
    let { left, top, right, bottom } = rect;
    for (let node = el; node && node !== main; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
      const box = node.getBoundingClientRect();
      left = Math.max(left, box.left);
      top = Math.max(top, box.top);
      right = Math.min(right, box.right);
      bottom = Math.min(bottom, box.bottom);
    }
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  };
  const isOnScreen = (el, rect) =>
    el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) &&
    !el.closest('[inert], .sr-only') &&
    !hasFixedOverlayAncestor(el) &&
    visibleArea(el, rect) > 0;
  const hasBox = (el) => el.checkVisibility() && el.getBoundingClientRect().height > 0;

  // Correction 2: the verdict ON SCREEN (a hidden tab's verdict and the skeleton's `div` are not it).
  const verdict = [...main.querySelectorAll('section')].find(
    (el) => getComputedStyle(el).viewTransitionName === 'page-verdict' && isOnScreen(el, el.getBoundingClientRect()),
  );
  const strip = verdict?.querySelector('ul[aria-label="Le cifre del verdetto"]') ?? null;

  // Correction 3: every figure counted once per text node (NarrativeText prints one per span) —
  // and since 2026-10-10 `NarrativeSegments` draws the unit in a `[data-figure-unit]` span of its
  // own, so «+11.967» and «€» are TWO text nodes: such a unit node whose previous text node ends in
  // digits is that figure, counted once and measured where the digits are (the unit sits on the
  // same line). ONLY that span: a value and a unit split elsewhere (a KPI block, a hero) stay
  // uncounted as the baseline left them (decision 7, «una cifra come la baseline»), or the budget
  // would move for a definition and not for the app (seen 2026-10-10: Analisi at 768, 20 → 25).
  const figure = new RegExp(figurePattern, 'g');
  const endsInDigits = /\d[\d.,]*[\s\u00a0\u202f]?$/;
  const bareUnit = /^[\s\u00a0\u202f]*[€%][\s\u00a0\u202f]*$/;
  const isUnitNode = (node) => bareUnit.test(node.textContent) && node.parentElement?.hasAttribute('data-figure-unit');
  const range = document.createRange();
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  let figuresAboveFold = 0;
  let figuresOutsideVerdict = 0;
  let figuresInVerdict = 0;
  // The baseline's own definition (a visible parent that STARTS in the first screen, `.sr-only`
  // out, nothing else), kept as a diagnostic: it splits a gap from README § 3 into what the
  // stricter definition removes and what the data or the app changed.
  let baselineFiguresAboveFold = 0;
  let previous = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let count = (node.textContent.match(figure) ?? []).length;
    let anchor = node;
    if (count === 0 && isUnitNode(node) && previous && endsInDigits.test(previous.textContent)) {
      count = 1;
      anchor = previous;
    }
    if (node.textContent.trim() !== '') previous = node;
    const parent = anchor.parentElement;
    if (count === 0 || !parent) continue;
    if (hasBox(parent) && !parent.closest('.sr-only') && parent.getBoundingClientRect().top < fold) baselineFiguresAboveFold += count;
    range.selectNodeContents(anchor);
    const rect = range.getBoundingClientRect();
    if (!isOnScreen(parent, rect)) continue;
    if (rect.top < fold) figuresAboveFold += count;
    if (rect.bottom > pillTop) continue;
    const insideVerdict = !!verdict && verdict.contains(parent) && !(strip && strip.contains(parent));
    if (insideVerdict) figuresInVerdict += count;
    else figuresOutsideVerdict += count;
  }

  // The closed row of MOB-02 § 4.2: `section.rounded-2xl[id]` → `h3 > button[aria-expanded="false"]`
  // whose `aria-controls` is `<id>-panel`. Any other `aria-expanded` button (a Radix «Dettaglio»,
  // an AssetRow) is not a closed tile.
  const isClosedRow = (section) => {
    if (!section.id) return false;
    const trigger = section.querySelector('h3 > button[aria-expanded="false"]');
    return !!trigger && trigger.getAttribute('aria-controls') === `${section.id}-panel`;
  };
  const tiles = [...main.querySelectorAll('section.rounded-2xl')].filter(hasBox).map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      top: Math.round(rect.top - mainRect.top),
      height: Math.round(rect.height),
      bottom: rect.bottom,
      closed: isClosedRow(el),
      ...(withTexts ? { eyebrow: el.querySelector('h3')?.textContent?.trim() ?? '' } : {}),
    };
  });
  const firstClosed = tiles.find((tile) => tile.closed);

  const stickyHeader = [...main.querySelectorAll('div')].find((el) => el.classList.contains('max-desktop:sticky'));
  // The 50/30/20 switch of Analisi's Flusso (`settings.spendingRolesEnabled`): the tile shows the
  // «Raggruppa il flusso» group only with the setting on, and the pressed option says which view
  // was measured — on a phone the Flusso changes shape with it, so a mirror run must say so.
  const flowGroup = [...main.querySelectorAll('[role="group"][aria-label="Raggruppa il flusso"]')].find(hasBox);
  const flowPressed = flowGroup?.querySelector('[aria-pressed="true"]')?.textContent?.trim() ?? null;
  return {
    metrics: {
      screens: Number((main.scrollHeight / main.clientHeight).toFixed(2)),
      tilesAboveFold: tiles.filter((tile) => mainRect.top + tile.top < fold).length,
      tilesFullyAboveFold: tiles.filter((tile) => tile.bottom <= fold).length,
      figuresAboveFold,
      figuresOutsideVerdict,
      firstClosedRowAbovePill: firstClosed ? firstClosed.bottom <= pillTop : null,
      overflowX: main.scrollWidth > main.clientWidth,
    },
    diagnostics: {
      mainTop: Math.round(mainRect.top),
      mainHeight: main.clientHeight,
      pillTop: Math.round(pillTop),
      pillVisible,
      baselineFiguresAboveFold,
      headerHeight: stickyHeader ? Math.round(stickyHeader.getBoundingClientRect().height) : null,
      verdict: verdict ? { top: Math.round(verdict.getBoundingClientRect().top - mainRect.top), height: Math.round(verdict.getBoundingClientRect().height), figures: figuresInVerdict, strip: !!strip } : null,
      charts: [...main.querySelectorAll('svg.recharts-surface, svg[role="img"]')].filter(hasBox).length,
      tiles: tiles.map((tile) => ({ top: tile.top, height: tile.height, closed: tile.closed, ...(withTexts ? { eyebrow: tile.eyebrow } : {}) })),
      savingsRateBadge: [...main.querySelectorAll('.fixed')].some((el) => el.classList.contains('bg-positive/10') && hasBox(el)),
      spendingRoles: flowGroup ? { enabled: true, view: flowPressed === 'Per ruolo' ? 'roles' : 'types' } : null,
      ...(withTexts
        ? { h1: [...main.querySelectorAll('h1')].find(hasBox)?.innerText ?? '', verdictTitle: verdict?.querySelector('h2')?.innerText ?? '' }
        : {}),
    },
  };
}

/** Unclip the scroller so a full-page screenshot shows the whole page. Called AFTER the census. */
function unclipScroller() {
  for (let el = document.querySelector('main'); el && el !== document.body; el = el.parentElement) {
    Object.assign(el.style, { overflow: 'visible', height: 'auto', maxHeight: 'none', minHeight: '0' });
  }
  for (const el of [document.body, document.documentElement]) Object.assign(el.style, { overflow: 'visible', height: 'auto' });
}

// ── In Node ─────────────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((arg) => {
      const [key, ...value] = arg.replace(/^--/, '').split('=');
      return [key, value.length ? value.join('=') : 'true'];
    }),
  );
}

/** Today's day and the month's last day on the Italian calendar, whatever the machine's zone. */
function italianDay(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(now)
      .map((part) => [part.type, Number(part.value)]),
  );
  return { day: parts.day, lastDay: new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate() };
}

function runNpm(script) {
  const result = spawnSync('npm', ['run', script], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`npm run ${script} exited ${result.status}`);
}

/**
 * The Hall of Fame rankings are built only by the server (owner, 2026-10-10): a REST sign-in on
 * the Auth emulator, then the same route «Aggiorna i record» calls.
 */
async function rebuildHallOfFame(base, email, password) {
  const signIn = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!signIn.ok) throw new Error(`Auth emulator sign-in for ${email}: ${signIn.status}`);
  const { idToken, localId } = await signIn.json();
  const response = await fetch(`${base}/api/hall-of-fame/recalculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ userId: localId }),
  });
  if (!response.ok) throw new Error(`POST /api/hall-of-fame/recalculate: ${response.status}`);
}

async function login(page, base, email, password) {
  await page.goto(`${base}/login`, { waitUntil: 'load', timeout: 120_000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 120_000 });
}

/** Settled = h1, no skeleton on screen, a figure (or 8 s without one), no freshness line; then 500 ms. */
async function waitForSettled(page) {
  const start = Date.now();
  while (Date.now() - start < SETTLE_TIMEOUT_MS) {
    const state = await page.evaluate(readSettleState, FIGURE_PATTERN).catch(() => null);
    if (state && state.h1 && !state.skeleton && !state.freshness && (state.figure || Date.now() - start > NO_FIGURE_GRACE_MS)) {
      await page.waitForTimeout(SETTLE_TAIL_MS);
      return true;
    }
    await page.waitForTimeout(150);
  }
  return false;
}

/** The visible tab of `main` with that accessible name, or null. */
async function visibleTab(page, name) {
  const tabs = page.locator(`main [role="tab"][aria-label="${name}"]`);
  for (let i = 0; i < (await tabs.count()); i++) if (await tabs.nth(i).isVisible()) return tabs.nth(i);
  return null;
}

/** Opens one surface; returns its status before the measure. */
async function openSurface(page, base, surface) {
  await page.goto(`${base}${surface.path}`, { waitUntil: 'load', timeout: 120_000 });
  if (!(await waitForSettled(page))) return 'unsettled';
  if (!surface.tab) return 'ok';
  // Correction 5: press the tab only when the URL does not name it, then check it is the selected one.
  if (!surface.path.includes('?tab=')) {
    const tab = await visibleTab(page, surface.tab);
    if (!tab) return 'missing';
    await tab.click();
    if (!(await waitForSettled(page))) return 'unsettled';
  }
  const selected = await page.locator('main [role="tab"][aria-selected="true"]').evaluateAll((els) =>
    els.filter((el) => el.checkVisibility()).map((el) => el.getAttribute('aria-label')),
  );
  return selected.includes(surface.tab) ? 'ok' : 'missing';
}

async function newContext(browser, viewport) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    locale: 'it-IT',
    reducedMotion: 'reduce',
  });
  // The default state of every page: no remembered open sections (MOB-02's `mobile-sections:*`).
  await context.addInitScript(() => {
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith('mobile-sections:')) localStorage.removeItem(key);
    } catch {
      // Storage blocked: nothing remembered either.
    }
  });
  return context;
}

/** The `source` of the instrument-profiles route's Server-Timing (`source;desc=cache|yahoo`). */
function profilesSourceOf(headerValue) {
  return headerValue?.match(/source;desc="?(\w+)/)?.[1] ?? null;
}

/**
 * An option value that is not one of the allowed keys is an error naming it, never a silent drop:
 * on 2026-10-10 `--surfaces=cashflow` (a page, not a key) measured nothing and overwrote
 * last-run.json with an empty run. Exported for its test.
 */
export function validateSelection(requested, allowed, what) {
  if (requested.length === 0) return `nessuna ${what} valida richiesta — valide: ${allowed.join(', ')}`;
  const unknown = requested.filter((value) => !allowed.includes(value));
  if (unknown.length === 0) return null;
  return `${what} sconosciute: ${unknown.join(', ')} — valide: ${allowed.join(', ')}`;
}

async function census(options) {
  const { chromium } = await import('playwright');
  const budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf-8'));
  const allSurfaces = Object.entries(budget.surfaces).map(([key, spec]) => ({ key, ...spec }));
  if (options.surfaces) {
    const error = validateSelection(options.surfaces, allSurfaces.map((s) => s.key), 'superfici');
    if (error) {
      console.error(`[mobile:census] ${error}`);
      process.exit(1);
    }
  }
  const surfaces = options.surfaces ? allSurfaces.filter((s) => options.surfaces.includes(s.key)) : allSurfaces;
  const started = Date.now();
  // Set by ANY instrument-profiles answer from Yahoo, the warm-up lap included: the measured visit
  // reads the cache that answer filled, so only a run-level flag can tell the budget to refuse.
  let yahooCalled = false;

  if (options.email === CENSUS_ACCOUNT) {
    // Owner, 2026-10-10: from the 1st to the 4th the fixture's rows of the 5th are still in the
    // calendar and the Budget makes no forecast; on the last day the calendar row comes due.
    const { day, lastDay } = italianDay();
    if (day <= 4 || day === lastDay) {
      console.error(`[mobile:census] oggi è il ${day} (ora italiana): il fixture conta le stesse cose solo dal 5 al ${lastDay - 1} del mese.`);
      process.exit(1);
    }
    runNpm('e2e:seed:census');
    // A profile seeded yesterday may be stale (an empty answer lives 24 h): re-stamp it, or the
    // Esposizione goes to Yahoo. Only for the fixture — the mirror's tickers have real profiles.
    runNpm('e2e:seed:profiles');
    await rebuildHallOfFame(options.base, options.email, options.password);
  }

  const browser = await chromium.launch();
  const results = [];
  try {
    for (const [index, viewport] of options.viewports.entries()) {
      const dir = join(OUT, viewport);
      mkdirSync(dir, { recursive: true });
      const context = await newContext(browser, viewport);
      const page = await context.newPage();
      let profilesSource = null;
      page.on('response', (response) => {
        if (!response.url().includes(PROFILES_ROUTE)) return;
        const source = profilesSourceOf(response.headers()['server-timing']);
        if (source) profilesSource = source;
        if (source === 'yahoo') yahooCalled = true;
      });
      await login(page, options.base, options.email, options.password);
      // The warm-up lap: the first visit writes migrations (Patrimonio's ledger and loans), so the
      // tiles counted at the first viewport are the same as at the last.
      if (index === 0) {
        for (const path of new Set(allSurfaces.map((s) => s.path.split('?')[0]))) {
          await page.goto(`${options.base}${path}`, { waitUntil: 'load', timeout: 120_000 });
          await waitForSettled(page);
        }
      }
      for (const surface of surfaces) {
        profilesSource = null;
        const status = await openSurface(page, options.base, surface);
        let measure = { metrics: null, diagnostics: null };
        if (status === 'ok') {
          measure = await page.evaluate(measureFirstScreen, { figurePattern: FIGURE_PATTERN, withTexts: options.texts });
          await page.screenshot({ path: join(dir, `${surface.key}-fold.png`) });
          await page.evaluate(unclipScroller);
          await page.waitForTimeout(300);
          await page.screenshot({ path: join(dir, `${surface.key}-full.png`), fullPage: true });
        }
        const row = { surface: surface.key, viewport, status, metrics: measure.metrics, diagnostics: measure.diagnostics && { ...measure.diagnostics, profilesSource } };
        results.push(row);
        printRow(row);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const durationMs = Date.now() - started;
  const run = { email: options.email, base: options.base, at: new Date().toISOString(), durationMs, viewports: options.viewports, yahooCalled, results };
  writeFileSync(join(OUT, 'last-run.json'), `${JSON.stringify(run, null, 2)}\n`);
  console.log(`\n[mobile:census] ${join(OUT, 'last-run.json')} + ${results.filter((r) => r.status === 'ok').length * 2} screenshot · durata ${(durationMs / 60000).toFixed(1)} min`);
  if (yahooCalled && options.email === CENSUS_ACCOUNT) {
    // The run is written (it is still a reading), but it is red: `mobile:budget -- --tighten`
    // refuses it on `yahooCalled`, and the exit code says so here too.
    const where = results.filter((r) => r.diagnostics?.profilesSource === 'yahoo').map((r) => `${r.surface}@${r.viewport}`);
    console.error(`[mobile:census] ROSSO: Yahoo chiamato${where.length ? ` su ${where.join(', ')}` : ' nel giro di riscaldamento'} — un ticker del fixture non ha il suo profilo: si corregge nel seed, il budget non si prende.`);
    process.exitCode = 1;
  }
}

function printRow(row) {
  const m = row.metrics;
  if (!m) return console.log(`[${row.viewport}] ${row.surface.padEnd(22)} ${row.status.toUpperCase()}`);
  const d = row.diagnostics;
  console.log(
    `[${row.viewport}] ${row.surface.padEnd(22)} screens=${m.screens} tiles=${m.tilesAboveFold}/${m.tilesFullyAboveFold} ` +
      `figures=${m.figuresAboveFold} fuori=${m.figuresOutsideVerdict} riga=${m.firstClosedRowAbovePill} overflowX=${m.overflowX} ` +
      `(pill ${d.pillTop}, main ${d.mainTop}, charts ${d.charts}${d.savingsRateBadge ? ', BADGE' : ''}${d.profilesSource ? `, profili ${d.profilesSource}` : ''}${d.spendingRoles ? `, 50/30/20 ${d.spendingRoles.view}` : ''})`,
  );
}

// ── --selftest ──────────────────────────────────────────────────────────────────────────────────

/**
 * A known fragment at 390×844, no server: the pill (top 768), a HIDDEN verdict and a visible one,
 * a figure under `grid-rows-[0fr]` + `overflow-hidden`, a fake SavingsRateBadge, a figure between
 * the pill and `main`'s bottom, and a closed row in MOB-02 § 4.2's shape. It proves corrections 1,
 * 2 and 4 in a real browser and the POSITIVE recognition of a closed row, which MOB-02 creates.
 */
const SELFTEST_HTML = `<!doctype html><html><body style="margin:0">
<main style="position:relative;height:844px;overflow-y:auto">
  <section style="view-transition-name:page-verdict;display:none"><h2>Nascosto</h2><p>1 €</p></section>
  <section style="view-transition-name:page-verdict;height:200px"><h2>Verdetto</h2><p>10 € e 20 % e <span>+5<span data-figure-unit="">%</span></span></p>
    <ul aria-label="Le cifre del verdetto"><li><button>30 €</button></li></ul></section>
  <section class="rounded-2xl" style="position:absolute;top:220px;left:0;width:300px;height:200px"><h3>Tessera</h3><p>40 € e <span>50<span data-figure-unit="">€</span></span> e <span>70<span>€</span></span></p>
    <div style="display:grid;grid-template-rows:0fr"><div style="overflow:hidden;min-height:0"><p>99 €</p></div></div></section>
  <section class="rounded-2xl" id="sel-riga" style="position:absolute;top:600px;left:0;width:300px;height:52px">
    <h3><button aria-expanded="false" aria-controls="sel-riga-panel">Riga chiusa</button></h3><div id="sel-riga-panel"></div></section>
  <p style="position:absolute;top:790px;left:0;margin:0">60 €</p>
  <div class="fixed bg-positive/10" style="position:fixed;top:300px;right:0">77 %</div>
  <div style="height:2000px"></div>
</main>
<div style="position:fixed;left:0;right:0;bottom:0;height:76px"><nav aria-label="Navigazione principale" style="height:76px">pill</nav></div>
</body></html>`;

const SELFTEST_EXPECTED = {
  // 30 € of the strip + 40 € and the split «50»+«€» of the tile. Not: 10 €, 20 % and the split
  // «+5»+«%» (in the verdict: 3), 1 € (hidden verdict), 99 € (clipped), 77 % (fixed overlay),
  // 60 € (ends below the pill's top edge), nor «70»+«€» — split WITHOUT `data-figure-unit`, as the
  // baseline never counted it. The two counted splits are `NarrativeSegments`' shape since
  // 2026-10-10 — seen red at 2 and 2 with the unit node ignored, and at 4 with the attribute ignored.
  figuresOutsideVerdict: 3,
  verdictFigures: 3,
  firstClosedRowAbovePill: true,
};

async function selftest() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORTS[390] });
    await page.setContent(SELFTEST_HTML);
    const { metrics, diagnostics } = await page.evaluate(measureFirstScreen, { figurePattern: FIGURE_PATTERN, withTexts: false });
    const actual = {
      figuresOutsideVerdict: metrics.figuresOutsideVerdict,
      verdictFigures: diagnostics.verdict?.figures ?? null,
      firstClosedRowAbovePill: metrics.firstClosedRowAbovePill,
    };
    const failures = Object.entries(SELFTEST_EXPECTED).filter(([key, value]) => actual[key] !== value);
    for (const [key, value] of Object.entries(SELFTEST_EXPECTED)) {
      console.log(`  ${actual[key] === value ? 'ok   ' : 'ROSSO'} ${key}: atteso ${value}, misurato ${actual[key]}`);
    }
    if (failures.length) {
      console.error('[mobile:census --selftest] ROSSO');
      process.exit(1);
    }
    console.log('[mobile:census --selftest] verde');
  } finally {
    await browser.close();
  }
}

// ── Entry ───────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selftest === 'true') {
    console.log('[mobile:census] --selftest (nessun server, nessun account)');
    return selftest();
  }
  const viewports = (args.viewports ?? '390,768,1024').split(',').filter(Boolean);
  const viewportError = validateSelection(viewports, Object.keys(VIEWPORTS), 'viewport');
  if (viewportError) {
    console.error(`[mobile:census] ${viewportError}`);
    process.exit(1);
  }
  const options = {
    email: args.email ?? CENSUS_ACCOUNT,
    password: args.password ?? DEFAULT_PASSWORD,
    base: args.base ?? 'http://localhost:3200',
    viewports,
    surfaces: args.surfaces ? args.surfaces.split(',').filter(Boolean) : null,
    texts: args.texts === 'true',
  };
  console.log(
    `[mobile:census] email=${options.email} base=${options.base} viewport=${options.viewports.join(',')} ` +
      `superfici=${options.surfaces?.join(',') ?? 'tutte'} budget=${BUDGET_PATH}${options.texts ? ' --texts' : ''}`,
  );
  await census(options);
}

// The test suite imports FIGURE_PATTERN and validateSelection from this file: run only when launched directly.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
