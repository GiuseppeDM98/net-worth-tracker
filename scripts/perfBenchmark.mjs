/**
 * perf:bench — «how long until the app shows a number?», per dashboard route, on a production
 * build served against the emulators (the manual: perf/README.md).
 *
 * Two scenarios, each N runs, medians:
 *   - COLD: a fresh browser context, the real login form, then a full load of the route. Times are
 *     ms from `navigationStart`: `auth` (the auth wait left `main`: Firebase Auth resolved), `h1`,
 *     `data` (the first euro figure inside `main`), LCP, long tasks, CLS.
 *   - WARM: one context, one login, then the routes one after the other by clicking the shell's own
 *     links (the page scene). Times are ms from the click: `url` (the pathname changed), `skeleton`
 *     (the new page showed a wait at all — a React Query hit shows none), `data` (a euro figure with
 *     no skeleton left on the NEW page), long tasks meanwhile.
 * Network per navigation, by kind: Firestore, Auth, /api/* (with duration and `Server-Timing`), JS,
 * CSS, fonts, and anything external the BROWSER calls. Yahoo is called by the server, so here it is
 * only the time of an `api` row — a run 1 of Allocazione much slower than the others is a ticker the
 * profile cache had not seen (the mirror has its own), not a regression.
 *
 * Why not Lighthouse: it measures a public page; here everything is behind the login and the useful
 * figure arrives after three round trips. Why never `networkidle`: Firestore keeps its sockets open.
 *
 * Prerequisites, in the owner's terminals: `npm run emulators`, the mirror
 * (`npm run mirror:seed -- <production email>`), `npm run perf:build`, `npm run perf:serve` (:3200).
 * Usage — options ALWAYS after `--`, or npm keeps them as npm_config_* and this script never sees them:
 *   npm run perf:bench -- --runs=3 --email=mirror@example.com
 *   --routes=assets,history      names of perf/routes.json, with or without /dashboard/ (or the page name)
 *   --warm-only | --cold-only    one scenario
 *   --mobile                     390×844 and a 4× CPU throttle (AGENTS.md § Motion: the phone's budget)
 *   --cpu=N                      CPU throttle rate via CDP (default 1, or 4 with --mobile)
 *   --revisit                    cold = the SECOND load of the route after a first visit (PERF-03)
 * Writes perf/last-run.json (gitignored) with every run and the medians.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const MOBILE = args.mobile === 'true';
const RUNS = Number(args.runs ?? 3);
const CPU = Number(args.cpu ?? (MOBILE ? 4 : 1));
const EMAIL = args.email ?? 'mirror@example.com';
const PASSWORD = 'test1234';
const REVISIT = args.revisit === 'true';
const WARM_ONLY = args['warm-only'] === 'true';
const COLD_ONLY = args['cold-only'] === 'true';
const VIEWPORT = MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 };
// :3000 is the tour server, :3100 the Playwright one: the benchmark has its own port.
const BASE = 'http://localhost:3200';
const OUT = 'perf/last-run.json';
const SETTLE_TIMEOUT_MS = 20_000;

const ROUTES = selectRoutes(JSON.parse(readFileSync('perf/routes.json', 'utf-8')).routes, args.routes);

/**
 * The routes to visit: perf/routes.json minus `bench: false`, or the ones named by `--routes`
 * («assets», «/dashboard/assets» and «Patrimonio» are the same route).
 */
function selectRoutes(all, requested) {
  const benchable = all.filter((route) => route.bench !== false);
  if (!requested) return benchable;
  return requested.split(',').map((token) => {
    const href = token.startsWith('/') ? token : token === 'dashboard' ? '/dashboard' : `/dashboard/${token}`;
    const route = all.find((r) => r.href === href || r.name.toLowerCase() === token.toLowerCase());
    if (!route) throw new Error(`--routes: «${token}» is not in perf/routes.json (${all.map((r) => r.href).join(', ')})`);
    return route;
  });
}

/**
 * Injected before any page script, on every document. Runs IN THE PAGE (serialised by Playwright),
 * so it must be self-contained. It keeps the observers and the milestone detector for the whole
 * life of the document; a warm navigation only swaps `window.__perf.marks` and `window.__perf.nav`.
 */
function installPerfProbe() {
  window.__perf = { lcp: 0, cls: 0, longTasks: 0, longTaskCount: 0, fcp: 0, marks: {}, nav: null };
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__perf.lcp = e.startTime; })
      .observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; })
      .observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) { window.__perf.longTasks += e.duration; window.__perf.longTaskCount++; }
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime; })
      .observe({ type: 'paint', buffered: true });
  } catch {
    // A browser without one of the entry types: the milestones below still work.
  }

  // THE AUTH MARKER — the one place that says when Firebase Auth has resolved. Since PERF-02 the
  // shell is in the HTML and `ProtectedRoute` shows the generic tile skeleton labelled «Verifica
  // dell'accesso» inside `main` until `onAuthStateChanged` answers; it leaves in the SAME commit
  // that puts the profile name in the sidebar footer (AuthContext sets user and loading together).
  // The wait in `main`, not the footer: on `--mobile` the sidebar is a closed Sheet and the footer
  // is not in the DOM at all. A page's own skeleton is labelled «Caricamento», so it never matches.
  const AUTH_WAIT_SELECTOR = `main [role="status"][aria-label="Verifica dell'accesso"]`;
  const isAuthPending = () => !!document.querySelector(AUTH_WAIT_SELECTOR);

  const hasEuro = () => /\d\s?€/.test((document.querySelector('main') || document.body)?.textContent || '');
  const hasSkeleton = () => !!document.querySelector('[data-slot="skeleton"]');
  const heading = () => (document.querySelector('main h1') || document.querySelector('h1'))?.textContent ?? '';

  const checkCold = (marks, now) => {
    if (!marks.spinnerSeen && isAuthPending()) marks.spinnerSeen = now;
    if (marks.spinnerSeen && !marks.auth && !isAuthPending()) marks.auth = now;
    if (!marks.h1 && heading()) marks.h1 = now;
    if (!marks.data && hasEuro()) marks.data = now;
    if (!marks.skeleton && hasSkeleton()) marks.skeleton = now;
    if (marks.skeleton && !marks.skeletonGone && !hasSkeleton()) marks.skeletonGone = now;
  };

  // Warm: the old page stays on screen for a moment after the click, euro figures included, so
  // nothing counts until its heading is gone — the new page (or its skeleton) has replaced it.
  const checkWarm = (marks, nav, now) => {
    if (!marks.url && location.pathname === nav.target) marks.url = now;
    if (!marks.url) return;
    if (!marks.swapped && heading() !== nav.fromHeading) marks.swapped = now;
    if (!marks.swapped) return;
    const skeleton = hasSkeleton();
    if (!marks.skeleton && skeleton) marks.skeleton = now;
    if (!marks.data && !skeleton && hasEuro()) marks.data = now;
  };

  const check = () => {
    // Read `marks` and `nav` from window.__perf on EVERY call, never once in a closure: a warm
    // navigation replaces them, and a captured reference would keep writing on a dead object
    // (the trap of the 2026-09-26 session).
    const { marks, nav } = window.__perf;
    const now = performance.now();
    if (nav) checkWarm(marks, nav, now);
    else checkCold(marks, now);
  };
  // `addInitScript` runs before `document.documentElement` exists: observe `document` itself.
  new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  check();
}

function median(values) {
  const sorted = values.filter((v) => typeof v === 'number' && !Number.isNaN(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(mid)] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function classify(url) {
  if (url.includes(':8080') || url.includes('firestore')) return 'firestore';
  if (url.includes(':9099') || url.includes('identitytoolkit') || url.includes('securetoken')) return 'auth';
  if (url.includes('/api/')) return 'api';
  if (url.includes('yahoo') || url.includes('borsaitaliana') || url.includes('frankfurter')) return 'external';
  const path = url.split('?')[0];
  if (path.endsWith('.js')) return 'js';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.woff2')) return 'font';
  return 'other';
}

/** Request accounting for one page; `entries` is emptied by the caller before each navigation. */
function attachNetwork(page) {
  const state = { entries: [] };
  page.on('requestfinished', async (request) => {
    const url = request.url();
    // Pushed BEFORE the awaits below, so a request that finishes just as the navigation is read
    // is still counted; its bytes and headers land on the same object a moment later.
    const entry = {
      url,
      kind: classify(url),
      bytes: 0,
      status: null,
      // Playwright's timing fields are relative to startTime: responseEnd IS the duration.
      ms: Math.round(request.timing().responseEnd),
      serverTiming: null,
    };
    state.entries.push(entry);
    const response = await request.response().catch(() => null);
    const sizes = await request.sizes().catch(() => null);
    entry.bytes = sizes ? sizes.responseBodySize + sizes.responseHeadersSize : 0;
    entry.status = response?.status() ?? null;
    entry.serverTiming = response?.headers()['server-timing'] ?? null;
  });
  return state;
}

function summariseNetwork(entries) {
  const byKind = {};
  for (const entry of entries) {
    byKind[entry.kind] ??= { count: 0, bytes: 0 };
    byKind[entry.kind].count++;
    byKind[entry.kind].bytes += entry.bytes;
  }
  const api = entries
    .filter((entry) => entry.kind === 'api')
    .map((entry) => ({ path: entry.url.replace(BASE, '').split('?')[0], ms: entry.ms, status: entry.status, serverTiming: entry.serverTiming }));
  return { byKind, api };
}

async function newMeasuredPage(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, isMobile: MOBILE, hasTouch: MOBILE });
  const page = await context.newPage();
  if (CPU > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  }
  await page.addInitScript(installPerfProbe);
  return { context, page };
}

/** The real form, as the owner logs in. */
async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

/** True once the page's milestones named in `keys` are all set, false after the timeout. */
async function waitForMarks(page, keys) {
  try {
    await page.waitForFunction((names) => names.every((name) => !!window.__perf?.marks?.[name]), keys, {
      timeout: SETTLE_TIMEOUT_MS,
      polling: 50,
    });
    return true;
  } catch {
    return false;
  }
}

async function readPerf(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const round = (entries) => Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, Math.round(v)]));
    return {
      ttfb: nav ? Math.round(nav.responseStart) : null,
      fcp: Math.round(window.__perf.fcp),
      lcp: Math.round(window.__perf.lcp),
      cls: Number(window.__perf.cls.toFixed(3)),
      longTasksMs: Math.round(window.__perf.longTasks),
      marks: round(window.__perf.marks),
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    };
  });
}

async function measureCold(browser, route) {
  const { context, page } = await newMeasuredPage(browser);
  try {
    await login(page);
    if (REVISIT) {
      await page.goto(`${BASE}${route.href}`, { waitUntil: 'load' });
      await waitForMarks(page, ['h1', 'data']);
    }
    const net = attachNetwork(page);
    await page.goto(`${BASE}${route.href}`, { waitUntil: 'load' });
    const settled = await waitForMarks(page, ['h1', 'data']);
    await page.waitForTimeout(1500); // let the LCP and CLS observers settle
    return { route: route.href, scenario: REVISIT ? 'revisit' : 'cold', settled, ...(await readPerf(page)), ...summariseNetwork(net.entries) };
  } catch (error) {
    return { route: route.href, scenario: REVISIT ? 'revisit' : 'cold', settled: false, error: String(error?.message ?? error), marks: {}, byKind: {}, api: [] };
  } finally {
    await context.close();
  }
}

/**
 * What the shell keeps closed over a link, in the order a person opens it: on desktop Impostazioni
 * sits in the sidebar footer's profile menu; on a phone the secondary routes sit behind «Altro»,
 * and Impostazioni behind that drawer's own profile menu («Opzioni account»).
 */
const LINK_OPENERS = [
  (page) => page.locator('[data-sidebar="footer"] [aria-haspopup="menu"]'),
  (page) => page.locator('button[aria-haspopup="dialog"]').filter({ hasText: 'Altro' }),
  (page) => page.getByRole('button', { name: 'Opzioni account' }),
];

/** A visible shell link to `href`, opening the menus above it when it is not on screen. */
async function findNavLink(page, href) {
  const link = page.locator(`a[href="${href}"]`).filter({ visible: true }).first();
  if (await link.count()) return link;
  for (const opener of LINK_OPENERS) {
    const trigger = opener(page).filter({ visible: true }).first();
    if (!(await trigger.count())) continue;
    await trigger.click();
    try {
      await link.waitFor({ state: 'visible', timeout: 2_000 });
      return link;
    } catch {
      // Not behind this one: the next opener may be inside what just opened.
    }
  }
  throw new Error(`no visible shell link to ${href}`);
}

async function navigateWarm(page, net, href) {
  const link = await findNavLink(page, href);
  net.entries.length = 0;
  const longBefore = await page.evaluate((target) => {
    window.__perf.nav = {
      target,
      t0: performance.now(),
      fromHeading: (document.querySelector('main h1') || document.querySelector('h1'))?.textContent ?? '',
    };
    window.__perf.marks = {};
    return window.__perf.longTasks;
  }, href);
  await link.click();
  const settled = await waitForMarks(page, ['data']);
  await page.waitForTimeout(600); // long tasks right after the figure lands belong to this page
  const { marks, longAfter } = await page.evaluate(() => {
    const { t0 } = window.__perf.nav;
    const since = (v) => (typeof v === 'number' ? Math.round(v - t0) : null);
    const m = window.__perf.marks;
    return { marks: { url: since(m.url), skeleton: since(m.skeleton), data: since(m.data) }, longAfter: window.__perf.longTasks };
  });
  return { route: href, scenario: 'warm', settled, marks, longTasksMs: Math.round(longAfter - longBefore), ...summariseNetwork(net.entries) };
}

async function measureWarmSequence(browser) {
  const { context, page } = await newMeasuredPage(browser);
  const results = [];
  try {
    await login(page);
    await waitForMarks(page, ['h1', 'data']);
    const net = attachNetwork(page);
    for (const route of ROUTES) {
      try {
        if (new URL(page.url()).pathname === route.href) {
          // Already there (the login lands on the Panoramica): leave, so it is measured as a navigation too.
          const away = ROUTES.find((r) => r.href !== route.href)?.href ?? '/dashboard/settings';
          await navigateWarm(page, net, away);
        }
        results.push(await navigateWarm(page, net, route.href));
      } catch (error) {
        results.push({ route: route.href, scenario: 'warm', settled: false, error: String(error?.message ?? error), marks: {}, byKind: {}, api: [] });
      }
    }
  } finally {
    await context.close();
  }
  return results;
}

async function assertReachable(url, hint) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5_000) });
  } catch {
    console.error(`[perf:bench] ${url} does not answer: ${hint}`);
    process.exit(1);
  }
}

// Preconditions: the server and the emulators, before a browser is spent on them.
await assertReachable(`${BASE}/login`, 'start `npm run perf:serve` (after `npm run perf:build`).');
await assertReachable('http://127.0.0.1:9099', 'start `npm run emulators` and seed the account (`npm run mirror:seed -- <email>`).');

const browser = await chromium.launch();
const startedAt = new Date();
const cold = [];
const warm = [];
const fmt = (v) => (v === null || v === undefined ? '-' : v);

if (!WARM_ONLY) {
  for (const route of ROUTES) {
    for (let i = 0; i < RUNS; i++) {
      const r = await measureCold(browser, route);
      cold.push(r);
      console.log(`[cold ${i + 1}/${RUNS}] ${route.href} auth=${fmt(r.marks.auth)} h1=${fmt(r.marks.h1)} data=${fmt(r.marks.data)} lcp=${fmt(r.lcp)} long=${fmt(r.longTasksMs)} fs=${r.byKind.firestore?.count ?? 0} api=${r.api.length} settled=${r.settled}${r.error ? ` error=${r.error}` : ''}`);
    }
  }
}
if (!COLD_ONLY) {
  for (let i = 0; i < RUNS; i++) {
    const sequence = await measureWarmSequence(browser);
    warm.push(...sequence);
    for (const r of sequence) {
      console.log(`[warm ${i + 1}/${RUNS}] ${r.route} url=${fmt(r.marks.url)} skeleton=${fmt(r.marks.skeleton)} data=${fmt(r.marks.data)} long=${fmt(r.longTasksMs)} fs=${r.byKind.firestore?.count ?? 0} api=${r.api.length} settled=${r.settled}${r.error ? ` error=${r.error}` : ''}`);
    }
  }
}
await browser.close();

// Medians per route
const kbOf = (runs, kind) => median(runs.map((r) => Math.round((r.byKind[kind]?.bytes ?? 0) / 1024)));
const table = ROUTES.map((route) => {
  const c = cold.filter((r) => r.route === route.href);
  const w = warm.filter((r) => r.route === route.href);
  return {
    route: route.href,
    name: route.name,
    cold: {
      auth: median(c.map((r) => r.marks.auth)),
      h1: median(c.map((r) => r.marks.h1)),
      data: median(c.map((r) => r.marks.data)),
      dataRun1: c[0]?.marks.data ?? null,
      lcp: median(c.map((r) => r.lcp)),
      longTasksMs: median(c.map((r) => r.longTasksMs)),
      cls: median(c.map((r) => r.cls)),
      // Bytes of JS responses, lazy chunks and HTTP-cache hits included: a trace, not the size budget (perf:budget).
      jsKB: kbOf(c, 'js'),
      firestoreReqs: median(c.map((r) => r.byKind.firestore?.count ?? 0)),
      apiCalls: median(c.map((r) => r.api.length)),
      settled: `${c.filter((r) => r.settled).length}/${c.length}`,
      api: c[0]?.api ?? [],
    },
    warm: {
      url: median(w.map((r) => r.marks.url)),
      skeleton: w.length ? `${w.filter((r) => r.marks.skeleton !== null && r.marks.skeleton !== undefined).length}/${w.length}` : null,
      data: median(w.map((r) => r.marks.data)),
      longTasksMs: median(w.map((r) => r.longTasksMs)),
      firestoreReqs: median(w.map((r) => r.byKind.firestore?.count ?? 0)),
      apiCalls: median(w.map((r) => r.api.length)),
      settled: `${w.filter((r) => r.settled).length}/${w.length}`,
    },
  };
});

const meta = { startedAt: startedAt.toISOString(), email: EMAIL, runs: RUNS, cpu: CPU, viewport: VIEWPORT, mobile: MOBILE, revisit: REVISIT, base: BASE };
writeFileSync(OUT, `${JSON.stringify({ meta, table, cold, warm }, null, 2)}\n`);

if (!WARM_ONLY) {
  console.log(`\n${REVISIT ? 'REVISIT' : 'COLD'} — ms da navigationStart, mediane di ${RUNS}`);
  console.log('pagina | auth | h1 | primo numero (run 1) | LCP | long task | CLS | Firestore | API | a regime');
  for (const t of table) {
    const c = t.cold;
    console.log(`${t.name} | ${fmt(c.auth)} | ${fmt(c.h1)} | ${fmt(c.data)} (${fmt(c.dataRun1)}) | ${fmt(c.lcp)} | ${fmt(c.longTasksMs)} | ${fmt(c.cls)} | ${fmt(c.firestoreReqs)} | ${fmt(c.apiCalls)} | ${c.settled}`);
  }
}
if (!COLD_ONLY) {
  console.log(`\nWARM — ms dal click sul link della shell, mediane di ${RUNS}`);
  console.log('pagina | url | skeleton mostrato | primo numero | long task | Firestore | API | a regime');
  for (const t of table) {
    const w = t.warm;
    console.log(`${t.name} | ${fmt(w.url)} | ${fmt(w.skeleton)} | ${fmt(w.data)} | ${fmt(w.longTasksMs)} | ${fmt(w.firestoreReqs)} | ${fmt(w.apiCalls)} | ${w.settled}`);
  }
}

const all = [...cold, ...warm];
const settledCount = all.filter((r) => r.settled).length;
const minutes = ((Date.now() - startedAt.getTime()) / 60_000).toFixed(1);
console.log(
  `\n[perf:bench] ${EMAIL} · ${ROUTES.length} route × ${RUNS} run · ${VIEWPORT.width}×${VIEWPORT.height} · CPU ${CPU}× · ` +
    `${settledCount}/${all.length} a regime · ${minutes} min · ${OUT}`,
);
if (settledCount < all.length) {
  console.log('[perf:bench] Una run che non arriva a regime non ha visto la cifra in euro entro 20 s: leggi «error» in perf/last-run.json.');
}
