/**
 * perf:census — «how much of the page does ONE keystroke re-render?», on a production build served
 * against the emulators (the manual: perf/README.md § Il census). Written to measure the React
 * Compiler (2026-10-05); a change that claims fewer re-renders runs a before/after of the same
 * scenario, same machine, same session, and adds its own scenario when none of these fits.
 *
 * Two measures per scenario, over the same window (the keys typed, plus a settle):
 *   (a) The browser's work, from CDP `Performance.getMetrics` read before and after: LayoutCount,
 *       RecalcStyleCount, and the Script/Layout/RecalcStyle/Task durations; long tasks from a
 *       `PerformanceObserver`. These are the counters of «How we made claude.ai faster».
 *   (b) React's work, from a stand-in for the React DevTools hook (`__REACT_DEVTOOLS_GLOBAL_HOOK__`)
 *       installed before the bundle by `addInitScript`. React DOM — production builds included —
 *       hands it every committed root (`onCommitFiberRoot`); the census walks the committed tree the
 *       way the DevTools do and counts the component fibers that RAN in that commit: a fiber whose
 *       parent bailed out keeps `child === alternate.child` (the subtree was not even visited, so it
 *       is skipped), and a visited fiber ran only if it carries the `PerformedWork` flag (bit 0,
 *       set by `beginWork` when the component function was called). That is what the compiler
 *       changes: a memoized JSX element reaches its child with the SAME props object, React bails
 *       out, and the flag stays off. On a `--profile` build the root's `actualDuration` adds the
 *       render time of the commit; on a plain build it is absent and printed as «-».
 *
 * Scenarios (`--scenario=`, comma-separated, default all five):
 *   settings   Impostazioni › Preferenze: 10 keys in «Anno inizio storico cashflow» — a controlled
 *              input of the settings page. Until 2026-10-08 every key was a `setState` on a
 *              4000-line page root (286 components per key on the laptop with the compiler, 318 on
 *              the Mac); since then the page holds ONE draft and the tab is a view of its slice.
 *   allocation Impostazioni › Allocazione: 10 keys in «Target Criptovalute», a class target of
 *              the biggest tab (added 2026-10-08 to measure that view on its own — the class list
 *              used to render every collapsed sub-target editor too).
 *   expense    Cashflow › «Nuova Spesa» › Spesa variabile: 10 keys in «Importo», watched by
 *              `useWatch` at the dialog's root.
 *   tabs       Cashflow: Tracciamento ⇄ Budget, both already mounted (`forceMount`), four switches —
 *              does the hidden tab re-render?
 *   asset      Patrimonio › «Aggiungi asset» › ETF: 10 keys in «Quantità» of the opening position,
 *              watched by a leaf of `AssetDialog` since 2026-10-07 — at the dialog's root it
 *              re-rendered the whole form, 562 components per key (doc/guide/patrimonio.md
 *              § Two-Step). Not an edit: an ETF is a ledger type, and editing one shows quantity
 *              and PMC read-only.
 * Never saves anything: the typed values are dropped with the context.
 *
 * Prerequisites, in the owner's terminals: `npm run emulators`, the mirror
 * (`npm run mirror:seed -- <production email>`), `npm run perf:build -- --profile`, `npm run perf:serve` (:3200).
 * Usage — options ALWAYS after `--` (perf/README.md):
 *   npm run perf:census -- --runs=3 --scenario=settings,expense --label=prima
 * Writes perf/last-census.json (gitignored): every run and the medians, with the label.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const RUNS = Number(args.runs ?? 3);
const EMAIL = args.email ?? 'mirror@example.com';
const PASSWORD = 'test1234';
const LABEL = args.label ?? '';
const MOBILE = args.mobile === 'true';
const VIEWPORT = MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const SCENARIOS = (args.scenario ?? 'settings,allocation,expense,tabs,asset').split(',');
// :3000 is the tour server, :3100 the Playwright one, :3200 the benchmark's (perf/README.md).
const BASE = args.base ?? 'http://localhost:3200';
const OUT = 'perf/last-census.json';
const KEYS = '1234567890'; // each key yields a DIFFERENT value, so each one is a real state change
const KEY_GAP_MS = 150;    // a brisk typist; every commit of a key lands before the next one
const SETTLE_MS = 600;     // after the last key: effects, deferred work, a debounced reader

/**
 * Injected before any page script. Runs IN THE PAGE, so it is self-contained. React DOM looks for
 * the hook when it is first evaluated, so it must exist before the bundle — which is why this is
 * an init script and not an `evaluate`.
 */
function installRenderProbe() {
  const COMPONENT_TAGS = new Set([0, 1, 11, 15]); // Function, Class, ForwardRef, SimpleMemo
  const PERFORMED_WORK = 1;
  const census = { recording: false, commits: 0, rendered: 0, renderMs: 0, hasDuration: false, byName: {} };
  window.__census = census;

  const nameOf = (fiber) => {
    const type = fiber.type;
    if (!type) return '?';
    if (fiber.tag === 11) return type.displayName || type.render?.displayName || type.render?.name || 'ForwardRef';
    return type.displayName || type.name || '?';
  };

  // DevTools' own traversal (`updateFiberRecursively`): `prev` is the fiber's previous version,
  // null for a mount. An untouched subtree is shared between the two trees — stop there.
  const walk = (fiber, prev) => {
    let child = fiber.child;
    let prevChild = prev ? prev.child : null;
    if (prev && child === prevChild) return;
    while (child) {
      const childPrev = child.alternate && prev ? child.alternate : null;
      if (COMPONENT_TAGS.has(child.tag) && (childPrev === null || (child.flags & PERFORMED_WORK) === PERFORMED_WORK)) {
        census.rendered++;
        const name = nameOf(child);
        census.byName[name] = (census.byName[name] || 0) + 1;
      }
      walk(child, childPrev);
      child = child.sibling;
    }
  };

  let nextId = 1;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer) {
      const id = nextId++;
      this.renderers.set(id, renderer);
      return id;
    },
    onCommitFiberRoot(_id, root) {
      if (!census.recording) return;
      census.commits++;
      const current = root.current;
      if (typeof current.actualDuration === 'number') {
        census.hasDuration = true;
        census.renderMs += current.actualDuration;
      }
      walk(current, current.alternate);
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onScheduleFiberRoot() {},
    setStrictMode() {},
    checkDCE() {},
  };

  window.__census_long = { count: 0, ms: 0 };
  try {
    new PerformanceObserver((list) => {
      if (!census.recording) return;
      for (const entry of list.getEntries()) { window.__census_long.count++; window.__census_long.ms += entry.duration; }
    }).observe({ type: 'longtask' });
  } catch {
    // No longtask entry type: the CDP counters still say the rest.
  }
}

/** The real form, as the owner logs in (the same as perf:bench). */
async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

const CDP_METRICS = ['LayoutCount', 'RecalcStyleCount', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'];

async function readMetrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.filter((m) => CDP_METRICS.includes(m.name)).map((m) => [m.name, m.value]));
}

/**
 * Record what `act` costs: React's commits and rendered components (b), the browser's counters (a).
 * `units` divides the totals into «per key» / «per switch».
 */
async function record(page, cdp, units, act) {
  await page.evaluate(() => {
    Object.assign(window.__census, { recording: true, commits: 0, rendered: 0, renderMs: 0, byName: {} });
    Object.assign(window.__census_long, { count: 0, ms: 0 });
  });
  const before = await readMetrics(cdp);
  await act();
  await page.waitForTimeout(SETTLE_MS);
  const after = await readMetrics(cdp);
  const react = await page.evaluate(() => {
    window.__census.recording = false;
    return { ...window.__census, long: { ...window.__census_long } };
  });
  const delta = (name) => after[name] - before[name];
  const per = (value, digits = 1) => Number((value / units).toFixed(digits));
  const topNames = Object.entries(react.byName).sort((a, b) => b[1] - a[1]).slice(0, 12);
  return {
    units,
    commitsPerUnit: per(react.commits),
    renderedPerUnit: per(react.rendered),
    renderMsPerUnit: react.hasDuration ? per(react.renderMs, 2) : null,
    layoutPerUnit: per(delta('LayoutCount')),
    recalcStylePerUnit: per(delta('RecalcStyleCount')),
    scriptMs: Math.round(delta('ScriptDuration') * 1000),
    layoutMs: Math.round(delta('LayoutDuration') * 1000),
    recalcStyleMs: Math.round(delta('RecalcStyleDuration') * 1000),
    taskMs: Math.round(delta('TaskDuration') * 1000),
    longTasks: react.long.count,
    longTaskMs: Math.round(react.long.ms),
    topNames,
  };
}

async function typeKeys(page, input) {
  await input.click();
  await page.keyboard.press('ControlOrMeta+A');
  for (const key of KEYS) {
    await page.keyboard.type(key);
    await page.waitForTimeout(KEY_GAP_MS);
  }
}

const scenarioRunners = {
  async settings(page, cdp) {
    await page.goto(`${BASE}/dashboard/settings?tab=generale`, { waitUntil: 'load' });
    const input = page.locator('#cashflowHistoryStartYear');
    await input.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1_000); // the settings document and the count-ups land first
    return record(page, cdp, KEYS.length, () => typeKeys(page, input));
  },
  async allocation(page, cdp) {
    await page.goto(`${BASE}/dashboard/settings?tab=allocazione`, { waitUntil: 'load' });
    // Crypto: never owned by the auto-calculated formula, so the field is enabled on any account.
    const input = page.getByRole('spinbutton', { name: 'Target Criptovalute' });
    await input.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1_000); // the settings document lands first
    return record(page, cdp, KEYS.length, () => typeKeys(page, input));
  },
  async expense(page, cdp) {
    await page.goto(`${BASE}/dashboard/cashflow`, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Nuova Spesa' }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /^Spesa variabile/ }).click();
    const input = dialog.locator('#amount');
    await input.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1_000); // the drawer's entrance and the categories
    return record(page, cdp, KEYS.length, () => typeKeys(page, input));
  },
  async tabs(page, cdp) {
    await page.goto(`${BASE}/dashboard/cashflow`, { waitUntil: 'load' });
    const tab = (name) => page.getByRole('tab', { name, exact: true }).filter({ visible: true }).first();
    await tab('Tracciamento').waitFor({ state: 'visible', timeout: 30_000 });
    // Mount Budget once, come back: from here on both panels stay mounted and hidden in turn.
    await tab('Budget').click();
    await page.waitForTimeout(1_500);
    await tab('Tracciamento').click();
    await page.waitForTimeout(1_500);
    const switches = ['Budget', 'Tracciamento', 'Budget', 'Tracciamento'];
    return record(page, cdp, switches.length, async () => {
      for (const name of switches) {
        await tab(name).click();
        await page.waitForTimeout(400);
      }
    });
  },
  async asset(page, cdp) {
    await page.goto(`${BASE}/dashboard/assets`, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Aggiungi asset' }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /^ETF/ }).click();
    const input = dialog.locator('#quantity');
    await input.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1_000); // the dialog's entrance and the settings read it starts on open
    return record(page, cdp, KEYS.length, () => typeKeys(page, input));
  },
};

async function runScenario(browser, name) {
  const context = await browser.newContext({ viewport: VIEWPORT, isMobile: MOBILE, hasTouch: MOBILE });
  const page = await context.newPage();
  await page.addInitScript(installRenderProbe);
  try {
    await login(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    return { scenario: name, ok: true, ...(await scenarioRunners[name](page, cdp)) };
  } catch (error) {
    return { scenario: name, ok: false, error: String(error?.message ?? error) };
  } finally {
    await context.close();
  }
}

function median(values) {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

async function assertReachable(url, hint) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5_000) });
  } catch {
    console.error(`[perf:census] ${url} does not answer: ${hint}`);
    process.exit(1);
  }
}

for (const name of SCENARIOS) {
  if (!scenarioRunners[name]) throw new Error(`--scenario: «${name}» is not one of ${Object.keys(scenarioRunners).join(', ')}`);
}
await assertReachable(`${BASE}/login`, 'start `npm run perf:serve` (after `npm run perf:build -- --profile`).');
await assertReachable('http://127.0.0.1:9099', 'start `npm run emulators` and seed the account (`npm run mirror:seed -- <email>`).');

const browser = await chromium.launch();
const runs = [];
for (const name of SCENARIOS) {
  for (let i = 0; i < RUNS; i++) {
    const r = await runScenario(browser, name);
    runs.push(r);
    console.log(r.ok
      ? `[${name} ${i + 1}/${RUNS}] commits=${r.commitsPerUnit} rendered=${r.renderedPerUnit} renderMs=${r.renderMsPerUnit ?? '-'} layout=${r.layoutPerUnit} style=${r.recalcStylePerUnit} script=${r.scriptMs}ms task=${r.taskMs}ms long=${r.longTasks}/${r.longTaskMs}ms`
      : `[${name} ${i + 1}/${RUNS}] FAILED ${r.error}`);
  }
}
await browser.close();

// Medians per scenario; «per unit» = per key (settings, expense) or per switch (tabs).
const FIELDS = ['commitsPerUnit', 'renderedPerUnit', 'renderMsPerUnit', 'layoutPerUnit', 'recalcStylePerUnit', 'scriptMs', 'layoutMs', 'recalcStyleMs', 'taskMs', 'longTasks', 'longTaskMs'];
const table = SCENARIOS.map((name) => {
  const ok = runs.filter((r) => r.scenario === name && r.ok);
  return { scenario: name, runs: ok.length, ...Object.fromEntries(FIELDS.map((f) => [f, median(ok.map((r) => r[f]))])), topNames: ok.at(-1)?.topNames ?? [] };
});
console.log(`\nperf:census${LABEL ? ` «${LABEL}»` : ''} — medians of ${RUNS} (per key; per switch for tabs)`);
console.table(table.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'topNames'))));
for (const row of table) console.log(`${row.scenario}: ${row.topNames.map(([n, c]) => `${n}×${c}`).join(', ')}`);
writeFileSync(OUT, JSON.stringify({ label: LABEL, at: new Date().toISOString(), base: BASE, viewport: VIEWPORT, runs, table }, null, 2));
console.log(`\n→ ${OUT}`);
